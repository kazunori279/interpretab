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

import {
  buildSetup,
  isSimul,
  LIVE_KEYS,
  modelFor,
  usesDuplexGate,
  UPLINK_RATE,
} from "./lib/live-session.js";
import { SessionLoop } from "./lib/session-loop.js";
import { applyDisplayMap, buildDisplayMap, cleanCJKSpaces } from "./lib/glossary.js";
import { costOf, emptyUsage, mergeUsage, noteAudioIn, noteAudioOut } from "./lib/usage.js";
import { t } from "./lib/i18n.js";

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

// How many transcript lines are kept for a side panel that is not currently
// open. Enough to scroll back through a meeting, short enough that an hour of
// continuous subtitling cannot grow this document without bound.
const HISTORY_LIMIT = 200;

// How often the running token tally is pushed to the panel. Usage frames can
// arrive with every turn, and a figure that moves faster than it can be read is
// a distraction rather than information — a second is slow enough to read and
// fast enough to answer "is this counting?".
const USAGE_POST_MS = 1000;

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
  // Since when the microphone has carried nothing above the noise floor, the
  // interval watching for it never having carried anything at all, and whether
  // that watch has already put a warning on screen. All three are dropped for
  // the rest of the run at the first sound — see `watchMicSilence`.
  micSilentSince: 0,
  micSilenceTimer: null,
  micNoted: false,
  micListening: false,
  // The transcript, kept here because this is the only context that outlives
  // both the side panel and the service worker — see `noteLine`.
  lines: [],
  openLines: new Map(),
  // The trailing-edge timer behind USAGE_POST_MS. The tallies themselves live
  // on each direction's accumulator, which is where the events arrive.
  usageTimer: null,
  // When Start was pressed, for the clock beside the cost. Kept here and not in
  // the panel: the panel can be closed and reopened mid-run, and a timer that
  // restarted with it would say the run began when the user last looked at it.
  startedAt: 0,
  // Set once a session loop has given up and the run is being taken down, so
  // the other direction failing behind it stays quiet — see `failRun`.
  failed: false,
  // What the service worker's preflight learned about the key, phrased for a
  // socket that then closes on 1006 with no reason of its own. Empty unless the
  // preflight had an opinion — see `lib/preflight.js`.
  closeHint: "",
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
  } else if (msg.type === "history") done({ lines: history(), usage: usageSnapshot() });
  else return false;
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
  for (const key of LIVE_KEYS) {
    if (key in patch) state.settings[key] = patch[key];
  }
  if ("duckLevel" in patch) applyDuck(state.ducked, true);
  if (patch.soundMuted) dropQueuedVoice();
}

/**
 * Throw away the translated audio already queued, not only the audio still to
 * come.
 *
 * The model returns a sentence far faster than it takes to say it, so at any
 * moment the player holds seconds of speech nobody has heard yet. Muting the
 * incoming frames alone would leave all of it to play out, and the button would
 * look broken for as long as the sentence lasted. Clearing the play-out deadline
 * with it lets the duck release on the next tick instead of holding the tab
 * audio down for a translation that is no longer coming.
 */
function dropQueuedVoice() {
  for (const name of ["tab", "mic"]) {
    if (!state[name]) continue;
    state[name].player.port.postMessage({ command: "endOfAudio" });
    state.playoutEndsAt[name] = 0;
  }
}

async function start({ apiKey, streamId, settings, glossary, closeHint }) {
  await ensureContexts();
  await stop();
  state.settings = settings;
  state.apiKey = apiKey;
  state.displayMap = buildDisplayMap(glossary);
  // Before the sessions open rather than after: opening them is where a slow
  // microphone permission goes, and the clock beside the cost has to cover the
  // whole run, including the part the user spent waiting for it.
  state.startedAt = performance.now();
  state.failed = false;

  // What the service worker's preflight learned about this key, if anything —
  // it runs there rather than here because it has to happen before the tab is
  // captured, and by the time a `start` reaches this document it already has
  // been. Empty unless the API had an opinion.
  state.closeHint = closeHint || "";

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
    if (!streamId) throw new Error(t("errNoStreamId"));
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
    watchMicSilence(state.micStream);
  }
}

/** Below this, a sample is the noise floor of a live input rather than speech. */
const MIC_SILENCE_FLOOR = 0.002;

/** How long the microphone may carry nothing at all before that is reported. */
const MIC_SILENCE_MS = 8000;

/**
 * Say when the microphone is open and delivering silence.
 *
 * This failure is indistinguishable from a broken extension. The permission is
 * granted, `getUserMedia` resolves, the session reaches Connected, the status
 * dot is green — and no transcript ever appears, because the device being
 * captured is not the one being spoken into. **Options → Audio input** is the
 * fix and this is what points at it: left on the system default, Chrome resolves
 * that itself and names the result nowhere the user can see, so a machine
 * pointing at a virtual cable, a disconnected headset or an HDMI display looks
 * exactly like a bug in here.
 *
 * Asked once per run and only about the opening stretch of it: the question is
 * whether this device ever carries anything, so the first sound answers it for
 * good. It used to be a rolling eight seconds instead, which said "no sound has
 * reached the microphone since Start" to someone who had been translated a
 * moment earlier and then stopped talking — a warning that the wrong device was
 * selected, raised by the right one being quiet.
 *
 * The samples go on being read after the warning has been raised, though, and
 * that is the point of `micNoted`: eight seconds of quiet at the start is a
 * guess, not a verdict, and someone who was slow to speak — or who fixed the
 * device the warning pointed at — must not be left reading "no sound has
 * reached the microphone" while their words are being translated underneath it.
 * The first sound retracts it. Only then does the scan stop.
 *
 * It cannot be an error either way: silence is also what a microphone waiting
 * to be spoken into sounds like.
 */
function watchMicSilence(stream) {
  const label = stream.getAudioTracks()[0]?.label;
  state.micSilentSince = performance.now();
  state.micListening = true;
  state.micNoted = false;
  clearInterval(state.micSilenceTimer);
  state.micSilenceTimer = setInterval(() => {
    // A muted microphone is silent on purpose, and being told that the device
    // might be the wrong one is no help while the user is the one holding it
    // shut. The clock is pushed forward rather than paused, so the count starts
    // again from the unmute.
    if (state.settings?.micMuted) {
      state.micSilentSince = performance.now();
      return;
    }
    if (performance.now() - state.micSilentSince < MIC_SILENCE_MS) return;
    // The clock is done; the scan is not, so only the interval is cleared here.
    clearInterval(state.micSilenceTimer);
    state.micSilenceTimer = null;
    state.micNoted = true;
    // Named device and default device are two whole sentences: the clause the
    // name sits in is not in the same place in every language.
    post({
      type: "micNote",
      detail: label ? t("micNoSoundNamed", [label]) : t("micNoSoundDefault"),
    });
  }, 1000);
}

/**
 * Note that the microphone carried something, for `watchMicSilence`.
 *
 * One sound is the whole answer, so this stops looking at the samples for the
 * rest of the run — which also takes a per-frame loop out of the hot path. If
 * the warning had already gone out by then, the same sound takes it back down:
 * an empty note is what clears one in the side panel.
 */
function noteMicLevel(samples) {
  if (!state.micListening) return;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) < MIC_SILENCE_FLOOR) continue;
    const noted = state.micNoted;
    stopMicSilenceWatch();
    if (noted) post({ type: "micNote", detail: "" });
    return;
  }
}

function stopMicSilenceWatch() {
  state.micListening = false;
  state.micNoted = false;
  clearInterval(state.micSilenceTimer);
  state.micSilenceTimer = null;
}

/**
 * The microphone.
 *
 * An offscreen document has no UI to show a permission prompt in, and there is
 * no manifest permission that waives one: `audioCapture` is a packaged-app
 * permission and Chrome warns if an extension declares it. What makes this
 * call succeed silently is that the grant is per extension origin, so the
 * "Grant microphone" button on the Options page — a page that *can* prompt —
 * has already obtained it.
 *
 * Which device that grant is spent on is `micInput`, or the system default when
 * it is unset; the processing asked of it is in `micConstraints`.
 */
async function getMicStream() {
  const wanted = (state.settings.micInput || "").trim();
  try {
    return await navigator.mediaDevices.getUserMedia(micConstraints(wanted));
  } catch (err) {
    if (err.name === "NotAllowedError") {
      throw new Error(t("errMicRefused"));
    }
    // The device named in Options has gone: unplugged, or renamed by an OS
    // update. Falling back to the default keeps the run alive, but silently
    // doing so is how this setting comes to exist in the first place.
    if (!wanted) throw err;
    post({ type: "micNote", detail: t("micDeviceMissing", [err?.name || err]) });
    return await navigator.mediaDevices.getUserMedia(micConstraints(""));
  }
}

/**
 * `exact`, not a preference: a device id that no longer resolves has to fail
 * loudly here rather than quietly hand back the default input, which is the
 * exact silence this setting exists to end.
 *
 * Echo cancellation is asked for explicitly rather than left to the spec
 * default, for the same reason `app/static/js/audio-recorder.js` does: it is the
 * only thing between the translated speech coming out of the speakers and the
 * mic hearing it again. AGC stays off so the speaker's dynamics survive into the
 * translation.
 */
function micConstraints(deviceId) {
  const audio = {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: false,
  };
  if (deviceId) audio.deviceId = { exact: deviceId };
  return { audio };
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
    post({ type: "output", detail: t("outputDeviceMissing", [err?.name || err]) });
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
  // `usage` and `model` ride along with the transcript accumulator because the
  // events they are fed by arrive through the same handler. The tally has to
  // live out here rather than in the session: `SessionLoop` retires a session
  // roughly every ten minutes, and a counter inside one would restart from zero
  // with each of them.
  const acc = {
    input: "",
    output: "",
    simul,
    idle: null,
    usage: emptyUsage(),
    model: modelFor(name, state.settings),
  };
  const session = new SessionLoop({
    apiKey: state.apiKey,
    setup: buildSetup(name, state.settings, glossary || []),
    closeHint: state.closeHint,
    onStatus: (status, detail) => {
      post({ type: "status", direction: name, status, detail });
      // The loop has stopped trying and will not restart itself. Both
      // directions hold the same key, so whatever rejected this one is about to
      // reject the other; and `start` already refuses to leave half a run
      // going, with no button on screen that admits it.
      if (status === "failed") failRun(detail);
    },
    onEvent: (ev) => onEvent(name, ev, player, acc),
  });
  session.start();
  // Conversation mode's microphone only — see `usesDuplexGate`. Two directions
  // are deliberately left ungated: the tab feed, which is a digital tap and
  // never hears the speakers, and the simultaneous microphone, which is
  // supposed to be answered while it is still talking.
  const gated = usesDuplexGate(name, state.settings);
  const node = makeRecorder(stream, (pcm, samples) => {
    // Before the gate, deliberately: what is being watched for is a device that
    // never carries anything, and a gate that dropped the frame still heard it.
    if (name === "mic") noteMicLevel(samples);
    // The mic must not hear itself being interpreted. While this direction's
    // own translated voice is playing its frames are dropped rather than sent,
    // which is only possible because this document owns both ends of that loop.
    // Its own, and not the tab direction's as well: that one speaks
    // continuously, so reading it here would close the microphone for the whole
    // session.
    if (gated && speaking("mic")) return;
    // Muted at the last possible moment, and by dropping frames rather than by
    // closing anything: the session stays open, so unmuting is the next frame
    // rather than a reconnect — and nothing said while it is on is sent, which
    // means nothing said while it is on is transcribed, spoken or charged for.
    if (name === "mic" && state.settings?.micMuted) return;
    session.send(pcm);
    // After the gate and the mute, so a dropped frame is not charged for: this
    // counts what went on the wire and nothing else, which is what the Live API
    // prices. Posting from a path that runs every 32 ms is free — the schedule
    // coalesces to one post a second and returns on a single comparison.
    noteAudioIn(acc.usage, pcm.byteLength / 2 / UPLINK_RATE);
    scheduleUsagePost();
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
    // Counted before the mute below, and before anything else can drop it: the
    // server sent this audio and is charging for it whether or not it reaches a
    // speaker. Muting silences the translation, not the bill.
    noteAudioOut(acc.usage, ev.buffer.byteLength / 2 / DOWNLINK_RATE);
    scheduleUsagePost();
    // The call first, because the call is not a speaker (#9).
    //
    // `soundMuted` below means "not out of this machine", and on a call that is
    // the setting you want on: the alternative is the interpreter coming out of
    // the room's speakers, into the microphone, and back through the
    // translation. Someone who mutes for that reason has said nothing about
    // what the other end should hear, and taking the relay off after the gate
    // made the two inseparable — which is how this shipped, and why the first
    // real two-party call was silent at the far end while the panel showed the
    // translation arriving. `micMuted` is the switch that means "the call hears
    // nothing", and it stops the audio going up rather than coming down.
    if (direction === "mic") sendToCall(ev.buffer);
    // Only the audio is dropped. The transcript of the same sentence goes on
    // arriving, so the sound can be switched off and the translation still read
    // — in the panel and, if they are on, in the subtitles on the page.
    //
    // Both directions, including a microphone playing into the device named by
    // `micOutput`: that device is a speaker like any other, and a virtual cable
    // pointed at a call is still this machine putting sound somewhere.
    if (state.settings?.soundMuted) return;
    player.port.postMessage(ev.buffer);
    noteVoiceAudio(direction, ev.buffer.byteLength);
    return;
  }
  if (ev.type === "turnComplete") {
    endTurn(direction, acc);
    return;
  }
  // What the server says it used. Swallowed rather than read: the price comes
  // from the audio clock instead, for the reasons in `lib/usage.js`, and
  // `tests/live-smoke.mjs` is where these frames still get looked at. It has to
  // be caught here all the same, or it falls through to the transcript
  // accumulator below as if it were text.
  if (ev.type === "usage") return;
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

/**
 * End the run because a session loop gave up (#13).
 *
 * The stop is asked for rather than done here. The service worker owns the run
 * — it holds the `running` flag a reopened panel reads, the caption overlay,
 * the tab marker and this document's own lifetime — so a document that quietly
 * shut its own sessions down would leave every one of those saying the run is
 * still going. What is done here is the message: it goes out first, and
 * directly, because the stop that follows closes this document.
 *
 * Once per run. The second direction is about to fail for the same reason and
 * would otherwise say so over the top of the first.
 */
function failRun(detail) {
  if (!state.active || state.failed) return;
  state.failed = true;
  post({ type: "error", detail });
  chrome.runtime.sendMessage({ target: "sw", type: "failed", detail }).catch(() => {});
}

/** Close the open sentence: drop the accumulator and let both surfaces know. */
function endTurn(direction, acc) {
  clearTimeout(acc.idle);
  acc.idle = null;
  acc.input = "";
  acc.output = "";
  post({ type: "turnComplete", direction });
}

/**
 * What the run has cost so far, per direction and in total.
 *
 * Priced here rather than in the panel because the rate depends on the model,
 * and the model is a consequence of the mode the direction was started in — the
 * panel would have to reconstruct that, and would get it wrong for a session
 * still running under settings the user has since changed.
 *
 * A direction that has moved no audio yet is left out rather than shown as
 * zero: a session still opening is quiet, not free.
 */
function usageSnapshot() {
  const snapshot = { tab: null, mic: null, total: null };
  const combined = emptyUsage();
  let cost = 0;
  for (const name of ["tab", "mic"]) {
    const acc = state[name]?.acc;
    if (!acc?.usage.inSeconds && !acc?.usage.outSeconds) continue;
    snapshot[name] = { cost: costOf(acc.usage, acc.model) };
    mergeUsage(combined, acc.usage);
    // Summed per direction rather than priced from the combined tally: with the
    // microphone in conversation mode the two directions are two models on two
    // rate cards, and one total priced as either would be wrong.
    cost += snapshot[name].cost;
  }
  if (!combined.inSeconds && !combined.outSeconds) return null;
  // The two audio times go with the figure: the tooltip shows what it was
  // worked out from, which is the part a wrong meter would have made obvious.
  // The elapsed time is not part of that arithmetic — it is the panel's
  // headline for anyone the dollars mean nothing to, which on the free tier is
  // everyone (#17) — so it is a wall clock and not a sum of audio.
  snapshot.total = {
    cost,
    inSeconds: combined.inSeconds,
    outSeconds: combined.outSeconds,
    elapsedSeconds: (performance.now() - state.startedAt) / 1000,
  };
  return snapshot;
}

/** Trailing edge only: the first tally lands a second in, and none is skipped. */
function scheduleUsagePost() {
  if (state.usageTimer) return;
  state.usageTimer = setTimeout(() => {
    state.usageTimer = null;
    const usage = usageSnapshot();
    if (usage) post({ type: "usage", usage });
  }, USAGE_POST_MS);
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
  // The floats go through as well as the PCM16: the level watch wants the
  // samples as captured, and converting back to measure them would be silly.
  node.port.onmessage = (event) => onPcm(floatToPcm16(event.data), event.data);
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
  // The tallies go with the directions below, and the panel keeps the last
  // figure it was sent: what a run cost is worth reading after it has ended,
  // and it is cleared by the next Start rather than by this Stop.
  clearTimeout(state.usageTimer);
  state.usageTimer = null;
  stopMicSilenceWatch();
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
  // The verdict was about the key this run held, at the moment it was asked.
  state.closeHint = "";
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
/**
 * The microphone's translated voice, on its way to a meeting's microphone (#9).
 *
 * The same frames that go to the player, sent again to the shim in the page.
 * They cannot go there directly: an offscreen document has no `chrome.tabs`, so
 * the service worker addresses the tab and this only hands it the bytes.
 *
 * Base64 because extension messages are JSON, and an `ArrayBuffer` serialises
 * to `{}` — silently, which is the kind of bug that takes an afternoon. The
 * third of a byte that costs puts the relay at about 64 kB/s while someone is
 * speaking, and at nothing at all while they are not.
 *
 * Above the sound mute, and below `micMuted`, for the reasons at the call site:
 * muting the speakers is the normal state of a call and must not mute the call,
 * while muting the microphone means the other end hears nothing and already
 * stops the audio being sent up.
 */
function sendToCall(buffer) {
  if (!state.settings?.micToCall) return;
  const bytes = new Uint8Array(buffer);
  let binary = "";
  // In chunks: `String.fromCharCode` takes its bytes as arguments, and a frame
  // long enough to overflow the argument list is a stack overflow rather than a
  // slow path.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  chrome.runtime
    .sendMessage({ target: "sw", type: "voice", pcm: btoa(binary) })
    .catch(() => {});
}

function post(payload) {
  noteLine(payload);
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

/**
 * Keep a copy of the transcript, for a side panel that is not there to hear it.
 *
 * The panel is scoped to one tab, so its document is torn down every time the
 * user looks at another one and the lines that arrive meanwhile have nobody to
 * arrive at. This mirrors what the panel would have drawn — the same open-line
 * bookkeeping, keyed by direction and side, so a streamed increment extends a
 * line instead of appending a new one — and hands the result over on `history`
 * when a panel comes back.
 *
 * Only the current run: this document is created at Start and closed at Stop,
 * which is exactly the span the transcript belongs to.
 */
function noteLine(payload) {
  if (payload.type === "turnComplete") {
    for (const key of [...state.openLines.keys()]) {
      if (key.startsWith(payload.direction)) state.openLines.delete(key);
    }
    return;
  }
  if (payload.type !== "transcript") return;
  const { direction, side, text, finished } = payload;
  const key = `${direction}:${side}`;
  let line = state.openLines.get(key);
  if (!line) {
    line = { direction, side, text };
    state.lines.push(line);
    if (state.lines.length > HISTORY_LIMIT) state.lines.shift();
    state.openLines.set(key, line);
  }
  line.text = text;
  if (finished) state.openLines.delete(key);
}

/**
 * The transcript so far, with the lines still being streamed into marked.
 *
 * A panel that redraws an unfinished line has to know it is unfinished:
 * otherwise the next increment of it — the same sentence, one word longer —
 * arrives as a line of its own and the text is on screen twice.
 */
function history() {
  const open = new Set(state.openLines.values());
  return state.lines.map((line) => ({ ...line, open: open.has(line) }));
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
