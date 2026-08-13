/**
 * One WebSocket to the Gemini Live API. No relay in between.
 *
 * This replaces the relay client this extension started life as: instead of
 * talking to a server that held the API key and reshaped the frames, the
 * offscreen document now opens `BidiGenerateContent` itself with the user's own
 * key. Two consequences shape everything below.
 *
 * 1. **Uplink is JSON, not binary.** The relay accepted raw PCM frames. The Live
 *    API wants base64 inside a `realtimeInput` envelope, so audio is encoded and
 *    coalesced here rather than sent a worklet block at a time.
 * 2. **Downlink is nested.** The relay flattened everything onto the top level;
 *    the real API wraps transcripts, audio and turn boundaries in
 *    `serverContent`.
 *
 * A `LiveSession` is exactly one connection and never reconnects itself. Live
 * sessions expire on a timer and say so with `goAway`, and reacting to that well
 * takes more than a retry — see `session-loop.js`, which owns the succession.
 */

import { MODEL, SIMUL_MODEL, resolveVoice, simulLanguageCode } from "./languages.js";
import { buildSystemInstruction } from "./instructions.js";

const ENDPOINT =
  "wss://generativelanguage.googleapis.com/ws/" +
  "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export const UPLINK_RATE = 16000;

/**
 * How much audio to gather before sending a frame.
 *
 * The recorder worklet emits 128 samples at a time — 8 ms, 125 times a second.
 * Wrapping each of those in JSON and base64 would spend more bytes on the
 * envelope than on the audio. Coalescing to 32 ms cuts that to 31 frames a
 * second and costs at most 32 ms of added latency, which is far below anything
 * audible next to the model's own response time.
 */
const UPLINK_CHUNK_MS = 32;
const UPLINK_CHUNK_BYTES = Math.round((UPLINK_RATE * 2 * UPLINK_CHUNK_MS) / 1000);

/** Base64 for a PCM buffer, chunked so a large one cannot blow the arg limit. */
export function arrayToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToArray(base64) {
  let standard = base64.replace(/-/g, "+").replace(/_/g, "/");
  while (standard.length % 4) standard += "=";
  const binary = atob(standard);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function endpointUrl(apiKey) {
  return `${ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
}

/**
 * The `setup` frame for one direction.
 *
 * Worth noting against the Python SDK, which is what most examples show: the
 * SDK flattens `inputAudioTranscription`, `outputAudioTranscription` and
 * `translationConfig` onto its `LiveConnectConfig`. On the wire they are all
 * fields of `generationConfig`. `systemInstruction` really is a sibling of it.
 *
 * @param {"tab"|"mic"} direction
 * @param {object} settings
 * @param {Array<{source: string, target: string}>} glossary
 */
export function buildSetup(direction, settings, glossary) {
  const voiceName = resolveVoice(settings.voice);
  const generationConfig = {
    responseModalities: ["AUDIO"],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };

  if (direction === "tab") {
    // Simultaneous translation. The source language is whatever the tab is
    // playing, so it is detected rather than declared, and the target is
    // configuration rather than instruction — this model takes no system
    // instruction and no glossary.
    generationConfig.translationConfig = {
      targetLanguageCode: simulLanguageCode(settings.tabTarget),
      // The translation goes out of the same speakers the tab is playing
      // through. Echoing the source language back as well would put two voices
      // over one video.
      echoTargetLanguage: false,
    };
    return { setup: { model: `models/${SIMUL_MODEL}`, generationConfig } };
  }

  // Agent mode. The source is known — it is the person holding the microphone —
  // which is what makes a glossary meaningful here and impossible above.
  return {
    setup: {
      model: `models/${MODEL}`,
      generationConfig,
      systemInstruction: {
        parts: [{ text: buildSystemInstruction(settings.micSource, settings.micTarget, glossary) }],
      },
    },
  };
}

export class LiveSession {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey
   * @param {object} opts.setup      the frame from buildSetup()
   * @param {(ev: object) => void} opts.onEvent
   * @param {(state: string, detail?: string) => void} [opts.onStatus]
   */
  constructor({ apiKey, setup, onEvent, onStatus }) {
    this._apiKey = apiKey;
    this._setup = setup;
    this._onEvent = onEvent || (() => {});
    this._onStatus = onStatus || (() => {});
    this._ws = null;
    this._closed = false;
    this._live = false; // setupComplete seen
    this._pending = []; // PCM buffers waiting for UPLINK_CHUNK_BYTES
    this._pendingBytes = 0;
    this._settleOpen = null; // resolves/rejects the promise open() handed out
  }

  /**
   * Open the socket and resolve once the server has acknowledged `setup`.
   *
   * Resolving on `setupComplete` rather than on `onopen` matters: a rejected key
   * or an unknown voice name closes the socket *after* a successful upgrade, so
   * an open socket is not yet evidence of a usable session.
   */
  open() {
    this._closed = false;
    this._onStatus("connecting");
    return new Promise((resolve, reject) => {
      // Held on the instance so `close()` can settle a handshake still in
      // flight; otherwise whoever is awaiting this waits for ever.
      this._settleOpen = (err) => {
        this._settleOpen = null;
        if (err) reject(err);
        else resolve(this);
      };

      const ws = new WebSocket(endpointUrl(this._apiKey));
      ws.binaryType = "arraybuffer";
      this._ws = ws;

      ws.onopen = () => ws.send(JSON.stringify(this._setup));

      ws.onmessage = async (event) => {
        const msg = await parseFrame(event.data);
        if (!msg) return;
        if (msg.setupComplete) {
          this._live = true;
          this._onStatus("connected");
          this._settleOpen?.(null);
          return;
        }
        this._dispatch(msg);
      };

      // A WebSocket error carries no detail by design, so there is nothing here
      // worth reporting that onclose will not report better.
      ws.onerror = () => {};

      ws.onclose = (event) => {
        this._ws = null;
        this._live = false;
        if (this._settleOpen) this._settleOpen(new Error(closeReason(event)));
        else if (!this._closed) this._onEvent({ type: "closed", code: event.code });
      };
    });
  }

  _dispatch(msg) {
    // The session is expiring. The loop above needs this early enough to have
    // a replacement ready before the socket actually goes.
    if (msg.goAway) {
      this._onEvent({ type: "goAway", timeLeft: parseDuration(msg.goAway.timeLeft) });
      return;
    }

    const content = msg.serverContent;
    if (!content) return;

    if (content.inputTranscription?.text) {
      this._onEvent({
        type: "input",
        text: content.inputTranscription.text,
        finished: !!content.inputTranscription.finished,
      });
    }
    if (content.outputTranscription?.text) {
      this._onEvent({
        type: "output",
        text: content.outputTranscription.text,
        finished: !!content.outputTranscription.finished,
      });
    }
    for (const part of content.modelTurn?.parts || []) {
      const inline = part.inlineData;
      if (inline && (inline.mimeType || "").startsWith("audio/pcm")) {
        this._onEvent({ type: "audio", buffer: base64ToArray(inline.data) });
      }
    }
    // `interrupted` means the model abandoned the turn it was speaking; for the
    // surfaces downstream that is the same event as finishing one — close the
    // open caption and drop the accumulator.
    if (content.turnComplete || content.interrupted) {
      this._onEvent({ type: "turnComplete" });
    }
  }

  /** True once `setupComplete` has arrived; callers drop audio until then. */
  get ready() {
    return this._live && !!this._ws && this._ws.readyState === WebSocket.OPEN;
  }

  /** Queue one PCM16 buffer, flushing whenever a chunk's worth has gathered. */
  send(pcmBuffer) {
    if (!this.ready) return;
    this._pending.push(new Uint8Array(pcmBuffer));
    this._pendingBytes += pcmBuffer.byteLength;
    if (this._pendingBytes >= UPLINK_CHUNK_BYTES) this.flush();
  }

  flush() {
    if (!this._pendingBytes || !this.ready) return;
    const merged = new Uint8Array(this._pendingBytes);
    let offset = 0;
    for (const part of this._pending) {
      merged.set(part, offset);
      offset += part.length;
    }
    this._pending = [];
    this._pendingBytes = 0;
    this._ws.send(
      JSON.stringify({
        realtimeInput: {
          audio: { data: arrayToBase64(merged.buffer), mimeType: `audio/pcm;rate=${UPLINK_RATE}` },
        },
      })
    );
  }

  close() {
    this._closed = true;
    this._live = false;
    this._pending = [];
    this._pendingBytes = 0;
    // Detaching onclose below means a handshake still in flight would never
    // hear about the socket going away, so settle it here instead.
    this._settleOpen?.(new Error("The session was closed before it was ready."));
    if (this._ws) {
      this._ws.onclose = null;
      this._ws.onmessage = null;
      this._ws.close();
      this._ws = null;
    }
  }
}

/**
 * The API answers with text frames, but a Blob turns up in some Chrome versions
 * for the same payload, so both are handled rather than guessed at.
 */
async function parseFrame(data) {
  let text = data;
  if (data instanceof Blob) text = await data.text();
  else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(data);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Name the likely cause of a close that happened before the session was ready.
 *
 * A browser cannot see the HTTP status behind a failed WebSocket upgrade — a
 * rejected key arrives as a bare 1006 with no reason — so this cannot be
 * certain. It can at least point at the setting that is wrong far more often
 * than the network is.
 */
function closeReason(event) {
  if (event.reason) return `Gemini closed the connection: ${event.reason}`;
  if (event.code === 1006) {
    return (
      "Could not reach the Gemini Live API. The usual cause is a missing or " +
      "rejected API key — check it on the Options page."
    );
  }
  return `Gemini closed the connection (code ${event.code}).`;
}

/** protobuf Duration as JSON: "30s", "1.5s". Milliseconds out, 0 if absent. */
export function parseDuration(value) {
  if (typeof value === "number") return value * 1000;
  const seconds = parseFloat(String(value || "").replace(/s$/, ""));
  return Number.isFinite(seconds) ? seconds * 1000 : 0;
}
