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
import { buildConversationInstruction } from "./instructions.js";
import { modelCandidates } from "./remote-config.js";
import { t } from "./i18n.js";

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
 * Is this direction going to run the simultaneous-translation model?
 *
 * Always, for tab audio. For the microphone it is the mode the user picked, and
 * the answer decides more than the model name: a simultaneous session never
 * sends `turnComplete`, so whoever is accumulating its transcripts has to close
 * a sentence on a silence gap instead. Exported so `offscreen.js` and the soak
 * harness ask this question in one place rather than each spelling out the same
 * comparison.
 */
export function isSimul(direction, settings) {
  return direction === "tab" || settings.micMode !== "conversation";
}

/**
 * Does this direction drop its own uplink while its own translation plays?
 *
 * Conversation mode only, and there it is not a preference but what stops a
 * loop: that mode declares both languages, so its own output coming back off
 * the speakers is a well-formed utterance in a language the session interprets
 * — A becomes B, B becomes A, without end. The gate is the hard stop and the
 * instruction's echo guard is the soft one.
 *
 * Simultaneous mode must not be gated, which is the whole reason this is a
 * function rather than one flag read at the recorder. Simultaneous translation
 * speaks *while* the source speaks — that is what makes it simultaneous — so a
 * gate keyed on "is my own translation playing" closes the moment the first
 * phrase is answered and stays closed for as long as the user keeps talking.
 * The symptom is exact: the first word is translated and nothing after it is.
 * The tab direction has never had a gate for precisely the same reason; what
 * stands in its place there, and now here, is browser echo cancellation and
 * headphones.
 */
export function usesDuplexGate(direction, settings) {
  return direction === "mic" && !isSimul(direction, settings) && settings.duplexGate !== false;
}

/**
 * The settings that are *not* in the setup frame, and so take effect on a
 * running session without reopening it.
 *
 * Everything else — languages, mode, voice, the glossary — is baked into
 * `buildSetup` below and can only change on reconnect. These five are all
 * downstream of it: the duck level is a gain node, the subtitle switches are a
 * filter on what the offscreen document forwards, and the two mutes are a filter
 * on the audio going each way.
 *
 * Shared by the side panel, which decides between patching and restarting, and
 * the offscreen document, which applies the patch. They used to be two copies of
 * the same array in two files, and a key in the panel's copy that the offscreen
 * document did not know about is a switch that silently does nothing until the
 * next reconnect.
 */
export const LIVE_KEYS = ["duckLevel", "tabCaptions", "micCaptions", "micMuted", "soundMuted"];

/**
 * Which model a direction will run.
 *
 * The two are priced differently — see `lib/usage.js` — so this is not only a
 * `setup` field: whoever is counting a direction's tokens has to know which
 * rate card applies to them.
 */
export function modelFor(direction, settings) {
  return isSimul(direction, settings) ? SIMUL_MODEL : MODEL;
}

/**
 * Which models a direction may run, best first.
 *
 * The Live models this extension uses are previews, and a preview gets two
 * weeks' notice before it is switched off. That is shorter than a Chrome Web
 * Store review, so the successor's name cannot arrive in a new build — it
 * arrives in the config file `remote-config.js` fetches, and this is where the
 * two meet. `modelCandidates` guarantees the bundled name is in the list
 * whatever the file says, so the worst a wrong config can do is add a name that
 * fails and costs one reconnect.
 */
export function modelsFor(direction, settings, config) {
  const listed = isSimul(direction, settings) ? config?.models?.simul : config?.models?.conversation;
  return modelCandidates(modelFor(direction, settings), listed);
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
  };

  // Transcription is configured on `setup`, not on `generationConfig`. The
  // live-translate guide shows it nested and the WebSockets API reference shows
  // it flat; the server settles it, rejecting the nested form outright with
  // `Unknown name "inputAudioTranscription" at 'setup.generation_config'`.
  // `tests/live-smoke.mjs` is what catches a regression here — no fake socket
  // can, because the shape is only wrong at the far end.
  const transcription = {
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };

  if (isSimul(direction, settings)) {
    // Simultaneous translation. The source language is detected rather than
    // declared — a tab plays whoever it plays, and someone being interpreted as
    // they speak is not waiting to declare it either — and the target is
    // configuration rather than instruction: this model takes no system
    // instruction and therefore no glossary.
    generationConfig.translationConfig = {
      targetLanguageCode: simulLanguageCode(
        direction === "tab" ? settings.tabTarget : settings.micTarget
      ),
      // The translation goes out of the same speakers the original is playing
      // through. Echoing the source language back as well would put two voices
      // over one video.
      echoTargetLanguage: false,
    };
    return {
      setup: { model: `models/${modelFor(direction, settings)}`, generationConfig, ...transcription },
    };
  }

  // Conversation mode. Both languages are declared, which is what lets the
  // instruction route each utterance to the other one — and what makes a
  // glossary meaningful here and impossible above.
  return {
    setup: {
      model: `models/${modelFor(direction, settings)}`,
      generationConfig,
      ...transcription,
      systemInstruction: {
        parts: [
          { text: buildConversationInstruction(settings.micSource, settings.micTarget, glossary) },
        ],
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
   * @param {string} [opts.closeHint] what the preflight learned, for a 1006
   */
  constructor({ apiKey, setup, onEvent, onStatus, closeHint }) {
    this._apiKey = apiKey;
    this._setup = setup;
    this._onEvent = onEvent || (() => {});
    this._onStatus = onStatus || (() => {});
    this._closeHint = closeHint || "";
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
        if (this._settleOpen) this._settleOpen(new Error(closeReason(event, this._closeHint)));
        // The reason travels with the code. A close after `setupComplete` used
        // to report the code alone, which threw away the only sentence the
        // server ever writes about why — see `isQuotaClose` below.
        else if (!this._closed) {
          this._onEvent({ type: "closed", code: event.code, reason: event.reason || "" });
        }
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

    // What the turn cost. A sibling of `serverContent` rather than a frame of
    // its own — the same message usually carries a transcript — so this reports
    // and falls through rather than returning.
    if (msg.usageMetadata) this._onEvent({ type: "usage", usage: msg.usageMetadata });

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
    // Three different frames mean "that turn is over" downstream, and which one
    // arrives is not a detail worth guessing at. `gemini-3.1-flash-live-preview`
    // was observed sending `generationComplete` and never `turnComplete` at all
    // (tests/live-smoke.mjs), so keying only on the documented `turnComplete`
    // leaves the caption open for ever and the session swap waiting on a signal
    // that never comes. `interrupted` means the model abandoned the turn it was
    // speaking, which for every surface downstream is the same event as
    // finishing one: close the caption, drop the accumulator.
    if (content.turnComplete || content.generationComplete || content.interrupted) {
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
    this._settleOpen?.(new Error(t("closeBeforeReady")));
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
 * A browser cannot see the HTTP status behind a failed WebSocket upgrade — by
 * design, there is no API for it — so a rejected key, an exhausted quota, a
 * captive portal and a dropped network all arrive here as a bare 1006 with no
 * reason. This used to pick the first of those and state it as fact, which sent
 * a user whose free-tier quota had run out off to check the one thing that was
 * fine (#13). It now names both causes without choosing between them, because
 * the code cannot tell them apart and should not pretend to. Two sentences and
 * no advice: this lands in the status line beside the dot, and where to go
 * about each cause is in the message `SessionLoop` writes when it gives up,
 * which lands in a banner with room for it.
 *
 * `hint` is the one way to do better, and it comes from outside: `preflight`
 * asked the REST API about the same key over a protocol that answers, moments
 * before this socket opened. Its verdict narrows the list rather than replacing
 * it — a key that checked out clean makes the whole "usually the API key"
 * sentence wrong, and saying so is most of what #13 was about.
 */
function closeReason(event, hint = "") {
  if (event.reason) return t("closeReasonGiven", [event.reason]);
  if (event.code === 1006) {
    if (hint) return t("closeReasonOpaqueHint", [hint]);
    return t("closeReasonOpaque");
  }
  return t("closeReasonCode", [event.code]);
}

/**
 * Does this close say the quota ran out?
 *
 * Measured rather than assumed. `tests/quota-close.mjs` overrides the project's
 * per-minute free-tier token limit down to a hundred and streams speech until
 * the server gives up, and what it does is close with code **1011**,
 * `wasClean` true, a tenth of a second after the last frame, carrying
 *
 *   You exceeded your current quota, please check your plan and billing
 *   details. For more information on this error, head to: h
 *
 * — 123 bytes, which is the whole of what a close frame allows, so it stops
 * mid-URL. That is why this matches a substring from the front rather than the
 * message: the end is the part that gets cut. The code is no help on its own,
 * 1011 being the generic server-side failure.
 *
 * The same run showed that a session opened with the quota *already* spent gets
 * `setupComplete` first and the 1011 a second later, so this never arrives as a
 * failed `open()` — it is always a close on a session that looked healthy, and
 * `preflight` is the only thing that catches the exhausted-at-Start case.
 */
export function isQuotaClose(reason = "") {
  return /exceeded your current quota|RESOURCE_EXHAUSTED/i.test(reason);
}

/**
 * Does this close say the model is gone?
 *
 * Asking for a retired model name gets the handshake accepted and then closed
 * with
 *
 *   Publisher Model `models/gemini-3.5-live-translate-preview` was not found or
 *   is not supported for bidiGenerateContent
 *
 * — which is the failure every user of a shipped build sees on the day Google
 * switches a preview off, all at once, and the one this extension can actually
 * do something about: try the next name on the list.
 *
 * **Not the close code.** That is 1008, and so is a routine session expiry:
 * `goAway` hands over every ten minutes and closes 1008 behind itself. A
 * fallback keyed on the code would swap models 31 times an hour on a healthy
 * connection. It has to be the sentence, the same way `isQuotaClose` reads the
 * sentence rather than trusting 1011.
 *
 * Both halves are required — the word "model" and a phrase saying it is not
 * there — so that some unrelated "not found" cannot spend the candidate list.
 */
export function isModelUnavailableClose(reason = "") {
  return (
    /\bmodels?\b/i.test(reason) &&
    /not found|not supported|is deprecated|has been (?:retired|discontinued|turned off)/i.test(reason)
  );
}

/** protobuf Duration as JSON: "30s", "1.5s". Milliseconds out, 0 if absent. */
export function parseDuration(value) {
  if (typeof value === "number") return value * 1000;
  const seconds = parseFloat(String(value || "").replace(/s$/, ""));
  return Number.isFinite(seconds) ? seconds * 1000 : 0;
}
