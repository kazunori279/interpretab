/**
 * The translated voice, offered to a meeting as a microphone (#9, prototype).
 *
 * `micOutput` already plays that voice into whatever audio device the user
 * names, which reaches a call only if they have installed a virtual cable and
 * pointed Meet at it. This is the other approach: an extension cannot register
 * a system microphone, but it can lie to one page about what microphones exist.
 * So `enumerateDevices` grows an "Interpretab (translated)" entry, and a
 * `getUserMedia` that asks for that entry by id is answered with a stream this
 * file synthesises instead of one from the hardware.
 *
 * Injected into the page's own world — `world: "MAIN"` — because a content
 * script's `navigator.mediaDevices` is a different object from the page's, and
 * wrapping ours would be invisible to Meet. That is the expensive part of this
 * approach and the reason it is behind a flag: page-world injection into a
 * Google property is a thing a store reviewer will look at twice.
 *
 * What it deliberately does not do:
 *
 * - Substitute for a bare `{ audio: true }`. Meet asks that on the way in,
 *   before anyone has chosen anything, and answering it with the translation
 *   would take the microphone away from a user who never asked. The device has
 *   to be picked in Meet's own settings, so there is one place to choose and
 *   the picker keeps telling the truth.
 * - Use an AudioWorklet, which the rest of the extension does. A worklet module
 *   is a URL, and a page-world worklet would need the file in
 *   `web_accessible_resources` — which hands every site the extension's id, to
 *   save scheduling that `AudioBufferSourceNode` already does.
 *
 * The audio arrives as base64 Int16 PCM at 24 kHz, relayed by
 * `content/mic-bridge.js`, which is the only thing in the page that can still
 * talk to the extension.
 */

/*
 * Everything is inside this closure, and it matters more here than it does in a
 * content script. A file injected into the MAIN world is evaluated in the
 * page's own global scope, so a top-level `const` joins the page's global
 * lexical declarations — and the second injection into the same page throws
 * `Identifier has already been declared` before a line of it runs. Stop, Start
 * is enough to do it, and the failure looks exactly like a device that never
 * appeared.
 */
(() => {
/** The synthetic device, as Meet sees it. */
const INTERPRETAB_DEVICE_ID = "interpretab-translated";

/**
 * The window the extension's half of the relay posts on, and the page might
 * too — `message` is a public event and a page is free to fire its own.
 */
const INTERPRETAB_CHANNEL = "interpretab-mic";

function installMicShim(win) {
  const media = win.navigator?.mediaDevices;
  if (!media?.getUserMedia) return null;

  const MARK = "__interpretabMicShim";
  // Same rule as `content/captions.js`: reloading the extension orphans the
  // bridge and leaves this half of the relay in the page listening to nobody.
  // The fresh injection replaces it rather than standing down in front of it.
  try {
    win[MARK]?.teardown?.();
  } catch {
    // An orphan can throw partway through its own teardown. Its listeners went
    // with the context that registered them; the wrappers below are what
    // matters, and they are about to be replaced anyway.
  }

  const RATE = 24000;
  // How far ahead of the clock the first buffer of a run of speech is
  // scheduled. Every frame after it is butted onto the end of the last, so this
  // is the whole of the added latency, and it is the budget for a relay that
  // crosses three contexts: a frame that arrives late by less than this is
  // still on time.
  const LEAD_S = 0.12;
  // There is deliberately no ceiling on that lead, and the first draft of this
  // file had one — 0.6 s, on the reasoning that a playhead running further and
  // further ahead of the clock is latency nobody asked for.
  //
  // Measured in Chrome 151, that is wrong, and wrong in the worst way: the Live
  // API does not deliver a sentence in real time, it delivers it in a burst as
  // fast as the socket allows, so the lead is *supposed* to reach the length of
  // whatever is being said. Rewinding the playhead to the ceiling does not shed
  // latency, it schedules the rest of the sentence on top of the part already
  // queued. Twenty 100 ms frames handed over at once came out as 600 ms of
  // overlapping, clipping audio followed by silence, every time.
  //
  // The lead cannot grow without bound anyway: the speech is generated from
  // speech, so over any stretch longer than a sentence it arrives at the rate
  // it is spoken. `audio/pcm-player-processor.js` makes exactly the same
  // assumption, with three minutes of ring buffer behind it.

  const settings = { ownVoice: 0.15 };

  // Kept unbound, and called with `.call`, so that teardown can put back the
  // very function the page started with. A bound copy behaves identically and
  // compares unequal, and a page that saved a reference to its own
  // `getUserMedia` — a common enough defence — would see it stay replaced.
  const realGetUserMedia = media.getUserMedia;
  const realEnumerateDevices = media.enumerateDevices;
  const passThrough = (constraints) => realGetUserMedia.call(media, constraints);

  let ctx = null;
  let mix = null;
  let ownStream = null;
  let ownGain = null;
  let playhead = 0;
  const sinks = new Set();

  function context() {
    if (ctx) return ctx;
    ctx = new (win.AudioContext || win.webkitAudioContext)();
    mix = ctx.createGain();
    return ctx;
  }

  /**
   * Your own voice, under the translation.
   *
   * Taken from the real default microphone rather than from the extension's
   * copy of it, because the extension's copy is in the offscreen document and
   * getting it here would mean relaying a second live stream to save opening a
   * device that is already open. The cost is that the tab shows its own
   * recording indicator, which is arguably the honest outcome.
   *
   * Note what this does *not* buy: echo cancellation covers the microphone
   * against the speakers, and the translation in this graph never goes near
   * either. If the room hears itself, that is why.
   */
  async function attachOwnVoice() {
    if (ownGain || !settings.ownVoice) return;
    try {
      ownStream = await passThrough({ audio: true });
    } catch (err) {
      // No microphone, or the page's permission was withdrawn. The translation
      // is the part that matters and it still works.
      report("ownVoiceUnavailable", String(err?.name || err));
      return;
    }
    ownGain = context().createGain();
    ownGain.gain.value = settings.ownVoice;
    context().createMediaStreamSource(ownStream).connect(ownGain);
    ownGain.connect(mix);
  }

  /** A frame of translated speech, scheduled onto the end of the last one. */
  function enqueue(samples) {
    if (!samples.length) return;
    const c = context();
    const buffer = c.createBuffer(1, samples.length, RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768;
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.connect(mix);
    // Behind the clock is a gap in the speech — the previous sentence ended, or
    // the relay stalled — and anything scheduled in the past is played at once,
    // on top of whatever else was. Start a fresh run instead.
    const floor = c.currentTime + LEAD_S;
    if (playhead < floor) playhead = floor;
    source.start(playhead);
    playhead += buffer.duration;
  }

  /**
   * A fresh stream every time, from the same graph.
   *
   * Meet re-acquires — on a device change, on a mute that goes far enough, on a
   * reconnection — and hands back a stream whose tracks it has already stopped.
   * Each call gets its own destination node so that stopping one does not
   * silence the others, and they all sum the same translation.
   */
  async function synthesise(constraints) {
    const c = context();
    // A page-world context is created inside a user gesture — the click on
    // Meet's device picker — so this resolves; it is here for the case where it
    // was not.
    if (c.state === "suspended") await c.resume();
    await attachOwnVoice();
    const dest = c.createMediaStreamDestination();
    mix.connect(dest);
    sinks.add(dest);
    const stream = dest.stream;
    // Meet asks for the camera in the same call it asks for the microphone, and
    // answering with an audio-only stream would turn the camera off.
    if (constraints?.video) {
      const video = await passThrough({ video: constraints.video });
      for (const track of video.getVideoTracks()) stream.addTrack(track);
    }
    report("attached");
    return stream;
  }

  /**
   * Whether an audio constraint names our device.
   *
   * `deviceId` is any of four shapes by the time a page has finished with it: a
   * bare string, `{ exact }`, `{ ideal }`, and either of those holding a list.
   * An `ideal` that names us is still a choice, so it counts.
   */
  function wantsUs(audio) {
    if (!audio || audio === true) return false;
    const wanted = audio.deviceId;
    if (!wanted) return false;
    const values = [wanted, wanted.exact, wanted.ideal].flat();
    return values.some((value) => value === INTERPRETAB_DEVICE_ID);
  }

  media.getUserMedia = function (constraints) {
    if (!wantsUs(constraints?.audio)) return passThrough(constraints);
    return synthesise(constraints);
  };

  if (realEnumerateDevices) {
    media.enumerateDevices = async function () {
      const devices = await realEnumerateDevices.call(media);
      return [...devices, describeDevice()];
    };
  }

  /**
   * `MediaDeviceInfo` is not constructible, so this is a plain object shaped
   * like one, `toJSON` included — a page that serialises its device list would
   * otherwise get `{}` for this entry and nothing for its own bug report.
   */
  function describeDevice() {
    const device = {
      deviceId: INTERPRETAB_DEVICE_ID,
      kind: "audioinput",
      label: "Interpretab (translated)",
      groupId: "interpretab",
    };
    device.toJSON = () => ({ ...device, toJSON: undefined });
    return device;
  }

  function report(state, detail) {
    win.postMessage({ channel: INTERPRETAB_CHANNEL, from: "shim", type: "status", state, detail }, "*");
  }

  function decode(base64) {
    const binary = win.atob(base64);
    // An odd byte count cannot be Int16 PCM; the last byte is half a sample and
    // `new Int16Array` on it throws rather than dropping it.
    const length = binary.length - (binary.length % 2);
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) bytes[i] = binary.charCodeAt(i);
    return new Int16Array(bytes.buffer);
  }

  function onMessage(event) {
    // Only this window, and only the relay's own messages: `message` is a
    // public event, and every frame and script in the page can fire one.
    if (event.source !== win) return;
    const data = event.data;
    if (data?.channel !== INTERPRETAB_CHANNEL || data.from !== "bridge") return;
    if (data.type === "voice") enqueue(decode(data.pcm));
    else if (data.type === "config" && typeof data.ownVoice === "number") {
      settings.ownVoice = data.ownVoice;
      if (ownGain) ownGain.gain.value = data.ownVoice;
    } else if (data.type === "teardown") teardown();
  }

  function teardown() {
    win.removeEventListener("message", onMessage);
    media.getUserMedia = realGetUserMedia;
    if (realEnumerateDevices) media.enumerateDevices = realEnumerateDevices;
    for (const track of ownStream?.getTracks?.() || []) track.stop();
    ownStream = null;
    ownGain = null;
    for (const dest of sinks) mix?.disconnect(dest);
    sinks.clear();
    // Left running rather than closed. A page holding a track from this graph
    // survives the teardown, and closing the context under it would replace the
    // translation with a dead track instead of a silent one — the difference
    // between a call that hears nothing and a call that drops the participant.
    playhead = 0;
    if (win[MARK] === handle) delete win[MARK];
    // The device is gone; say so, so the picker stops offering it.
    media.dispatchEvent?.(new win.Event("devicechange"));
  }

  win.addEventListener("message", onMessage);
  const handle = { teardown, deviceId: INTERPRETAB_DEVICE_ID };
  win[MARK] = handle;
  // Meet enumerates once, on the way in, and this arrives long after that: the
  // injection happens when the run starts, which is minutes into the call. The
  // event is what makes the new device appear in a picker that has already been
  // built.
  media.dispatchEvent?.(new win.Event("devicechange"));
  return handle;
}

if (typeof window !== "undefined") installMicShim(window);
})();
