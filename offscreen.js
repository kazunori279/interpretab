/**
 * The engine: every MediaStream, AudioContext and WebSocket lives here.
 *
 * Nothing else in the extension has a long enough life to hold them. A service
 * worker is torn down after ~30s idle; a side panel or popup dies when it is
 * closed. An offscreen document created with USER_MEDIA and AUDIO_PLAYBACK
 * outlives both, which is why the capture keeps running when the panel is shut.
 *
 * Audio graph — three AudioContexts, shared by sample rate rather than by
 * direction, because Chrome caps contexts per document at around six and the
 * per-direction layout needs five:
 *
 *   tabStream ─┬─► ctxPass (native) ─► duckGain ─► speakers
 *              └─► ctxUp (16 kHz) ─► recorder worklet ─► tab session
 *   micStream ───► ctxUp (16 kHz) ─► recorder worklet ─► mic session
 *   both sessions' audio ─► ctxDown (24 kHz) ─► one player worklet each ─► speakers
 *
 * A fourth appears only when the microphone's translated voice is sent to a
 * chosen output device — the meeting case, where it goes to a virtual cable the
 * call is listening to. It cannot share ctxDown, because a sink is a property of
 * the context and the tab direction's translation has to stay on the speakers:
 *
 *   mic session's audio ─► ctxMicOut (24 kHz, sinkId) ─► player worklet ─► cable
 *
 * The two directions are two entirely independent Gemini Live sessions: two
 * WebSockets, no shared state, and the API cost of both — running two different
 * models, unless the microphone is left on its default simultaneous mode, in
 * which case both sessions are the same model aimed at different languages.
 *
 * ctxPass is not optional: capturing a tab mutes it for the user, and this is
 * the graph that gives the sound back. It runs at the stream's native rate
 * because pushing 48 kHz tab audio through the 24 kHz player context would
 * resample it down and audibly dull anything musical.
 */

import { buildSetup, isSimul, usesDuplexGate, UPLINK_RATE } from "./lib/live-session.js";
import { SessionLoop } from "./lib/session-loop.js";
import { applyDisplayMap, buildDisplayMap, cleanCJKSpaces } from "./lib/glossary.js";

const DOWNLINK_RATE = 24000; // what Gemini returns

// Ducking. The ramp is short enough to be under the first syllable and long
// enough not to click; the release keeps the original down through the gaps
// between phrases instead of pumping on every pause.
const DUCK_RAMP_SEC = 0.12;
const VOICE_RELEASE_SEC = 0.4;

// Simultaneous translation never sends `turnComplete` — there are no turns in a
// continuous feed. Without a second signal the transcript accumulator would run
// for the whole session and the on-page caption would be one line that grows
// until it covers the video. A gap in the increments is the only turn boundary
// on offer, so it is the one used. Same 2s as `app/static/js/app.js`.
const SIMUL_IDLE_MS = 2000;

const state = {
  settings: null,
  // Held only for the life of a run, and only so a reconnect can reopen the
  // socket without waking the service worker for the key again.
  apiKey: null,
  displayMap: [],
  ctxPass: null,
  ctxUp: null,
  ctxDown: null,
  // Built per run, and only when `micOutput` names a device. Unlike the three
  // above it is closed on stop rather than kept: those hold no device or the
  // system default, this one holds a device the user chose, and leaving it open
  // between runs would keep a virtual cable busy for a session that has ended.
  ctxMicOut: null,
  duckGain: null,
  tabStream: null,
  micStream: null,
  tab: null, // {session, player, node, source}
  mic: null,
  // Wall-clock second at which each direction's last enqueued translated audio
  // finishes playing. Audio arrives from the model far faster than realtime, so
  // "are we speaking right now" cannot be answered by "did a frame just arrive"
  // — it has to be tracked as a play-out deadline.
  //
  // Per direction, not one shared deadline. Ducking wants either voice; the
  // microphone gate wants only the microphone's own. Sharing one number made
  // the gate read the tab translation as well, and simultaneous translation of
  // a video speaks almost without pause — so with both directions on, the mic
  // was held shut for the whole session and produced nothing at all.
  playoutEndsAt: { tab: 0, mic: 0 },
  duckTimer: null,
  ducked: false,
  active: false,
};

// Declared here, above the message listener, and deliberately not as a
// `const` initialised at the end of the module: the service worker retries
// `sendMessage` every 50ms until the listener below exists, so a `start` can
// arrive in the window between that listener being registered and the last
// statement of this module running. A trailing `const` would still be in its
// temporal dead zone at that point, and `start` would throw reading it.
let contextsReady = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target !== "offscreen") return false;
  const done = (result) => sendResponse({ ok: true, ...result });
  const fail = (err) => sendResponse({ ok: false, error: String(err?.message || err) });
  if (msg.type === "start") start(msg).then(done).catch(fail);
  else if (msg.type === "stop") stop().then(done).catch(fail);
  else if (msg.type === "live") {
    try {
      applyLive(msg.patch);
      done({});
    } catch (err) {
      fail(err);
    }
  } else return false;
  return true;
});

/**
 * The settings that take effect without reopening the sessions.
 *
 * The duck level is a knob people reach for while listening, and the two
 * subtitle switches are a filter on the fan-out at the bottom of this file —
 * reconnecting to apply either would cut the audio the user is adjusting.
 *
 * They are pushed in over `chrome.runtime` rather than read out of storage,
 * which is not a style choice. **An offscreen document is granted the messaging
 * API and nothing else: `chrome.storage` is undefined here.** This used to be a
 * `chrome.storage.onChanged` listener at module scope, and it threw on every
 * evaluation of this file — after the message listener above was registered and
 * with every function below it hoisted, so start/stop and all the audio worked
 * and the only casualty was the listener itself. The symptom was that ticking
 * *Subtitles on the page* mid-session did nothing at all, for the rest of the
 * session, in silence. `tests/assets.test.js` now fails the build if anything
 * in this file reaches past `chrome.runtime` again.
 */
function applyLive(patch = {}) {
  if (!state.settings) return;
  for (const key of ["duckLevel", "tabCaptions", "micCaptions"]) {
    if (key in patch) state.settings[key] = patch[key];
  }
  if ("duckLevel" in patch) applyDuck(state.ducked, true);
}

async function start({ apiKey, streamId, settings, glossary }) {
  await ensureContexts();
  await stop();
  state.settings = settings;
  state.apiKey = apiKey;
  state.displayMap = buildDisplayMap(glossary);

  // Half a run is worse than none. The microphone is the half that fails —
  // a refused permission is the common one — and it fails *after* the tab
  // direction is capturing, speaking and holding a socket. Without this the
  // side panel reports the error and goes back to Idle while the tab keeps
  // translating out loud, with no button that admits it is running.
  try {
    await openDirections(settings, streamId, glossary);
  } catch (err) {
    await stop();
    throw err;
  }

  startDuckLoop();
  state.active = true;
  post({ type: "state", running: true });
}

/** Whichever of the two directions is switched on, each with its own session. */
async function openDirections(settings, streamId, glossary) {
  if (settings.tabEnabled) {
    if (!streamId) throw new Error("No tab stream id.");
    state.tabStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId },
      },
    });
    startPassthrough(state.tabStream);
    // Always simultaneous translation, which never sends turnComplete.
    state.tab = openDirection("tab", state.tabStream, glossary, true, state.ctxDown);
  }

  if (settings.micEnabled) {
    state.micStream = await getMicStream();
    // Simultaneous or conversation, whichever the user picked. Conversation
    // mode is the agent model, which does send turnComplete.
    const out = await micOutputContext();
    state.mic = openDirection("mic", state.micStream, glossary, isSimul("mic", settings), out);
  }
}

/**
 * The microphone.
 *
 * An offscreen document has no UI to show a permission prompt in, and there is
 * no manifest permission that waives one: `audioCapture` is a packaged-app
 * permission and Chrome warns if an extension declares it. What makes this
 * call succeed silently is that the grant is per extension origin, so the
 * "Grant microphone" button on the Options page — a page that *can* prompt —
 * has already obtained it. Echo cancellation is asked
 * for explicitly rather than left to the spec default, for the same reason
 * `app/static/js/audio-recorder.js` does: it is the only thing between the
 * translated speech coming out of the speakers and the mic hearing it again.
 * AGC stays off so the speaker's dynamics survive into the translation.
 */
async function getMicStream() {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      },
    });
  } catch (err) {
    if (err.name === "NotAllowedError") {
      throw new Error(
        "Microphone access was refused. Open the extension's Options page and " +
          "grant the microphone once, then try again."
      );
    }
    throw err;
  }
}

/**
 * The context the microphone's translated voice plays into.
 *
 * `ctxDown` — the speakers — unless a device has been chosen, which in practice
 * means a virtual cable with a meeting listening to the other end of it. A sink
 * belongs to the context, not to the node, so this cannot be a second output of
 * the shared one: the tab direction's translation is playing there and has to
 * keep playing there.
 *
 * A device unplugged since it was picked rejects here. That falls back to the
 * speakers rather than failing the run — the interpretation is still worth
 * something to whoever is in the room — and the panel is told, in as many words,
 * that the call cannot hear it. Silently falling back would be the bad version:
 * the symptom is at the far end, where the user cannot see it.
 */
async function micOutputContext() {
  const wanted = (state.settings.micOutput || "").trim();
  if (!wanted) return state.ctxDown;
  const ctx = new AudioContext({ sampleRate: DOWNLINK_RATE });
  try {
    await ctx.setSinkId(wanted);
    await ctx.audioWorklet.addModule("audio/pcm-player-processor.js");
  } catch (err) {
    await ctx.close().catch(() => {});
    post({
      type: "output",
      detail:
        `The audio output chosen in Options is not available ` +
        `(${err?.name || err}), so your translated voice is coming out of the ` +
        `speakers — a meeting cannot hear it. Pick another one in Options.`,
    });
    return state.ctxDown;
  }
  resume(ctx);
  state.ctxMicOut = ctx;
  return ctx;
}

/** Restore the captured tab's audibility, through the gain node that ducks it. */
function startPassthrough(stream) {
  state.ctxPass = new AudioContext();
  resume(state.ctxPass);
  state.duckGain = state.ctxPass.createGain();
  state.duckGain.gain.value = 1;
  state.ctxPass.createMediaStreamSource(stream).connect(state.duckGain);
  state.duckGain.connect(state.ctxPass.destination);
}

/** Wire one capture stream to its own Live session, and the replies to a speaker. */
function openDirection(name, stream, glossary, simul, outputCtx) {
  const player = makePlayer(outputCtx);
  const acc = { input: "", output: "", simul, idle: null };
  const session = new SessionLoop({
    apiKey: state.apiKey,
    setup: buildSetup(name, state.settings, glossary || []),
    onStatus: (status, detail) => post({ type: "status", direction: name, status, detail }),
    onEvent: (ev) => onEvent(name, ev, player, acc),
  });
  session.start();
  // Conversation mode's microphone only — see `usesDuplexGate`. Two directions
  // are deliberately left ungated: the tab feed, which is a digital tap and
  // never hears the speakers, and the simultaneous microphone, which is
  // supposed to be answered while it is still talking.
  const gated = usesDuplexGate(name, state.settings);
  const node = makeRecorder(stream, (pcm) => {
    // The mic must not hear itself being interpreted. While this direction's
    // own translated voice is playing its frames are dropped rather than sent,
    // which is only possible because this document owns both ends of that loop.
    // Its own, and not the tab direction's as well: that one speaks
    // continuously, so reading it here would close the microphone for the whole
    // session.
    if (gated && speaking("mic")) return;
    session.send(pcm);
  });
  return { session, player, node, acc };
}

/**
 * Transcripts arrive as increments and are accumulated here, not downstream.
 *
 * A `finished` frame carries the whole sentence rather than the next piece of
 * it, so it replaces the accumulator instead of extending it — the same rule
 * `app/static/js/app.js` follows. Doing it here means the side panel and the
 * page captions both receive whole sentences and neither has to keep its own
 * copy of the state.
 */
function onEvent(direction, ev, player, acc) {
  if (ev.type === "audio") {
    player.port.postMessage(ev.buffer);
    noteVoiceAudio(direction, ev.buffer.byteLength);
    return;
  }
  if (ev.type === "turnComplete") {
    endTurn(direction, acc);
    return;
  }
  acc[ev.type] = ev.finished ? ev.text : acc[ev.type] + ev.text;
  const text = applyDisplayMap(acc[ev.type], state.displayMap);
  if (ev.finished) acc[ev.type] = "";
  if (acc.simul) {
    clearTimeout(acc.idle);
    acc.idle = setTimeout(() => endTurn(direction, acc), SIMUL_IDLE_MS);
  }
  post({
    type: "transcript",
    direction,
    side: ev.type, // "input" (what was heard) or "output" (the translation)
    text: ev.type === "input" ? cleanCJKSpaces(text) : text,
    finished: ev.finished,
  });
}

/** Close the open sentence: drop the accumulator and let both surfaces know. */
function endTurn(direction, acc) {
  clearTimeout(acc.idle);
  acc.idle = null;
  acc.input = "";
  acc.output = "";
  post({ type: "turnComplete", direction });
}

/** 16 kHz uplink: mono-downmixed PCM16, the format the Live API takes. */
function makeRecorder(stream, onPcm) {
  const ctx = state.ctxUp;
  const node = new AudioWorkletNode(ctx, "pcm-recorder-processor", {
    // Tab audio is usually stereo. Explicit mono makes the graph downmix it
    // properly instead of the worklet silently reading the left channel only.
    channelCount: 1,
    channelCountMode: "explicit",
    channelInterpretation: "speakers",
  });
  node.port.onmessage = (event) => onPcm(floatToPcm16(event.data));
  ctx.createMediaStreamSource(stream).connect(node);
  return node;
}

function makePlayer(ctx) {
  const node = new AudioWorkletNode(ctx, "pcm-player-processor");
  node.connect(ctx.destination);
  return node;
}

function floatToPcm16(input) {
  const pcm16 = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) pcm16[i] = input[i] * 0x7fff;
  return pcm16.buffer;
}

/** Extend a direction's play-out deadline by the audio just enqueued. */
function noteVoiceAudio(direction, byteLength) {
  const seconds = byteLength / 2 / DOWNLINK_RATE;
  const now = performance.now() / 1000;
  const ends = state.playoutEndsAt;
  ends[direction] = Math.max(ends[direction] || 0, now) + seconds;
}

/** Is *direction* speaking — or, with no direction, is either of them? */
function speaking(direction) {
  const ends = state.playoutEndsAt;
  const deadline = direction ? ends[direction] || 0 : Math.max(ends.tab, ends.mic);
  return performance.now() / 1000 < deadline + VOICE_RELEASE_SEC;
}

/**
 * Duck the original while a translation is speaking, not for the whole session.
 *
 * A constant duck would hold a film's score at 15% through every silence
 * between lines. Following the play-out deadline instead means the original is
 * at full volume whenever the interpreter has nothing to say.
 */
function startDuckLoop() {
  clearInterval(state.duckTimer);
  // Either voice: whichever direction is speaking, it is speaking over the tab.
  state.duckTimer = setInterval(() => applyDuck(speaking()), 100);
}

function applyDuck(shouldDuck, force = false) {
  if (!state.duckGain) return;
  if (shouldDuck === state.ducked && !force) return;
  state.ducked = shouldDuck;
  const level = shouldDuck ? Number(state.settings?.duckLevel ?? 0.15) : 1;
  const gain = state.duckGain.gain;
  gain.cancelScheduledValues(state.ctxPass.currentTime);
  gain.setTargetAtTime(level, state.ctxPass.currentTime, DUCK_RAMP_SEC / 3);
}

async function stop() {
  clearInterval(state.duckTimer);
  state.duckTimer = null;
  for (const dir of [state.tab, state.mic]) {
    if (!dir) continue;
    clearTimeout(dir.acc.idle);
    dir.session.close();
    dir.node.port.onmessage = null;
    dir.node.disconnect();
    dir.player.disconnect();
  }
  state.tab = null;
  state.mic = null;
  for (const stream of [state.tabStream, state.micStream]) {
    stream?.getTracks().forEach((t) => t.stop());
  }
  state.tabStream = null;
  state.micStream = null;
  if (state.ctxPass) {
    await state.ctxPass.close().catch(() => {});
    state.ctxPass = null;
    state.duckGain = null;
  }
  if (state.ctxMicOut) {
    await state.ctxMicOut.close().catch(() => {});
    state.ctxMicOut = null;
  }
  state.playoutEndsAt = { tab: 0, mic: 0 };
  state.ducked = false;
  state.apiKey = null;
  // `start` calls this first to clear any previous run. Announcing a stop that
  // never followed a start would flip the side panel's button to Start for the
  // instant between the two.
  if (state.active) post({ type: "state", running: false });
  state.active = false;
}

function resume(ctx) {
  // Extension pages are exempt from the autoplay gesture requirement, but a
  // context can still come up suspended; without this nothing is ever audible.
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
}

/**
 * Fan out to the side panel and, via the service worker, to the page captions.
 *
 * Both are optional listeners — the panel may be closed and the page may have
 * refused injection — and `sendMessage` rejects when nobody is listening, so
 * every send here is fire-and-forget.
 *
 * The side panel always gets everything: it is the full transcript, and it can
 * label each line with its direction. The page overlay is filtered per
 * direction, because both directions share one page and subtitling your own
 * speech over a video is a separate decision from subtitling the video.
 */
function post(payload) {
  chrome.runtime.sendMessage({ target: "ui", ...payload }).catch(() => {});
  const perDirection =
    (payload.type === "transcript" && payload.side === "output") ||
    payload.type === "turnComplete";
  if (perDirection && !captionsOn(payload.direction)) return;
  // `state` carries no direction: it is the stop signal that tears the overlay
  // down, and it has to arrive whatever the switches say.
  if (perDirection || payload.type === "state") {
    chrome.runtime.sendMessage({ target: "sw", type: "caption", payload }).catch(() => {});
  }
}

function captionsOn(direction) {
  if (!state.settings) return false;
  return direction === "tab" ? !!state.settings.tabCaptions : !!state.settings.micCaptions;
}

/**
 * The two rate-fixed contexts, built once and reused across start/stop cycles.
 *
 * Registering an AudioWorklet module is asynchronous, and doing it per start
 * would race the first arriving audio frame — so this is done once and `start`
 * awaits it. Lazily, on the first start rather than at load, so that the order
 * of statements in this module cannot matter to a message that arrives mid-
 * evaluation. A failure is not cached: a worklet that failed to register once
 * leaves the extension unusable until reload if the next Start cannot retry.
 */
function ensureContexts() {
  if (!contextsReady) {
    contextsReady = initContexts().catch((err) => {
      contextsReady = null;
      throw err;
    });
  }
  return contextsReady;
}

async function initContexts() {
  state.ctxUp = new AudioContext({ sampleRate: UPLINK_RATE });
  state.ctxDown = new AudioContext({ sampleRate: DOWNLINK_RATE });
  resume(state.ctxUp);
  resume(state.ctxDown);
  await state.ctxUp.audioWorklet.addModule("audio/pcm-recorder-processor.js");
  await state.ctxDown.audioWorklet.addModule("audio/pcm-player-processor.js");
}
