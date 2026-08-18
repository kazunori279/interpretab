/**
 * The microphone the page can pick (#9).
 *
 * `content/mic-shim.js` runs in a meeting's own JavaScript world and rewrites
 * two of its methods, which is as invasive as this extension gets, so what it
 * must not do is worth as many tests here as what it must. The measurements the
 * issue asks for need a real call and cannot be made here; the decisions can,
 * and every one of them fails quietly if it is wrong — a page that keeps the
 * real microphone, a device that appears twice, a stopped track that silences
 * the next one, a restore that leaves the page wrapped forever.
 *
 * The shim takes its window as an argument for exactly this reason. Everything
 * below is a fake: an audio graph that records what was scheduled and when, and
 * a `mediaDevices` that counts what it was asked for.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(ROOT, "content", "mic-shim.js"), "utf8");

const DEVICE = "interpretab-translated";
const CHANNEL = "interpretab-mic";

/**
 * The file as the page gets it: a classic script that installs itself on the
 * window it finds. Handing it a fake one is the whole seam.
 */
function load(win) {
  return new Function("window", `${source}\nreturn window.__interpretabMicShim;`)(win);
}

/** Just enough Web Audio to say what was scheduled, and onto which clock. */
function fakeContext(clock) {
  const scheduled = [];
  const node = () => ({ connect() {}, disconnect() {} });
  return {
    scheduled,
    state: "running",
    get currentTime() {
      return clock.now;
    },
    resume: async () => {},
    createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
    createMediaStreamSource: () => node(),
    createBuffer: (_channels, length, sampleRate) => ({
      duration: length / sampleRate,
      sampleRate,
      length,
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => ({
      buffer: null,
      connect() {},
      start(when) {
        scheduled.push({ at: when, duration: this.buffer.duration });
      },
    }),
    createMediaStreamDestination() {
      const tracks = [];
      return {
        stream: {
          id: `stream-${scheduled.length}-${Math.random()}`,
          getAudioTracks: () => [{ kind: "audio", stop() {} }],
          getTracks: () => tracks,
          addTrack: (t) => tracks.push(t),
        },
      };
    },
    disconnect() {},
    close() {},
  };
}

function fakeWindow({ devices = [], gum } = {}) {
  const clock = { now: 0 };
  const calls = { gum: [], enumerate: 0, posted: [], devicechange: 0 };
  const listeners = new Map();
  const context = fakeContext(clock);

  const realGum =
    gum ||
    (async (constraints) => ({
      constraints,
      getTracks: () => [{ stop() {} }],
      getVideoTracks: () => (constraints.video ? [{ kind: "video" }] : []),
    }));

  const win = {
    calls,
    clock,
    context,
    navigator: {
      mediaDevices: {
        async getUserMedia(constraints) {
          calls.gum.push(constraints);
          return realGum(constraints);
        },
        async enumerateDevices() {
          calls.enumerate++;
          return devices;
        },
        dispatchEvent(event) {
          if (event.type === "devicechange") calls.devicechange++;
          return true;
        },
      },
    },
    Event: class {
      constructor(type) {
        this.type = type;
      }
    },
    AudioContext: function () {
      return context;
    },
    atob: (b64) => Buffer.from(b64, "base64").toString("binary"),
    addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) || []), fn]),
    removeEventListener: (type, fn) =>
      listeners.set(type, (listeners.get(type) || []).filter((f) => f !== fn)),
    postMessage: (data) => calls.posted.push(data),
  };

  /** What `window.postMessage` from the bridge looks like from in here. */
  win.deliver = (data, source = win) => {
    for (const fn of listeners.get("message") || []) fn({ source, data });
  };
  win.fromBridge = (data) => win.deliver({ channel: CHANNEL, from: "bridge", ...data });
  return win;
}

/** A frame of speech: `samples` 16-bit samples, base64, as the relay sends it. */
function frame(samples) {
  return Buffer.from(new Int16Array(samples).buffer).toString("base64");
}

test("the page is offered one extra microphone, and it is ours", async () => {
  const real = [{ deviceId: "default", kind: "audioinput", label: "MacBook Pro Microphone" }];
  const win = fakeWindow({ devices: real });
  load(win);

  const listed = await win.navigator.mediaDevices.enumerateDevices();
  assert.equal(listed.length, 2);
  assert.deepEqual(listed[0], real[0], "the page's own devices come first and unaltered");
  assert.equal(listed[1].deviceId, DEVICE);
  assert.equal(listed[1].kind, "audioinput");
  assert.match(listed[1].label, /Interpretab/);
  // A page that serialises its device list — every bug report Meet collects —
  // would otherwise be handed `{}` for the one device that is unusual.
  assert.equal(JSON.parse(JSON.stringify(listed[1])).deviceId, DEVICE);
});

test("a picker that was built before we arrived is told to build itself again", () => {
  // The shim is injected when a run starts, which is minutes after Meet
  // enumerated. Without the event the device exists and nobody can choose it.
  const win = fakeWindow();
  load(win);
  assert.equal(win.calls.devicechange, 1);
});

test("a page that has not chosen us keeps its own microphone", async () => {
  const win = fakeWindow();
  load(win);
  const media = win.navigator.mediaDevices;

  // Meet's opening request, before anyone has chosen anything. Answering this
  // with the translation would take the microphone from a user who never asked.
  const plain = await media.getUserMedia({ audio: true });
  assert.equal(plain.constraints.audio, true, "passed through untouched");

  await media.getUserMedia({ audio: { deviceId: { exact: "some-headset" } } });
  await media.getUserMedia({ video: true });
  assert.equal(win.calls.gum.length, 3, "every one of them reached the real device");
});

test("a page that names our device gets the translation, however it names it", async () => {
  for (const audio of [
    { deviceId: DEVICE },
    { deviceId: { exact: DEVICE } },
    { deviceId: { ideal: DEVICE } },
    { deviceId: { exact: [DEVICE] } },
  ]) {
    const win = fakeWindow();
    load(win);
    const stream = await win.navigator.mediaDevices.getUserMedia({ audio });
    assert.equal(stream.getAudioTracks().length, 1, `not synthetic for ${JSON.stringify(audio)}`);
    // The only real request is for the voice mixed under the translation.
    assert.deepEqual(win.calls.gum, [{ audio: true }]);
  }
});

test("asking for the camera in the same breath still gets the camera", async () => {
  // Meet does exactly this, and an audio-only answer turns the video off — a
  // failure nobody would think to blame on a microphone.
  const win = fakeWindow();
  load(win);
  const stream = await win.navigator.mediaDevices.getUserMedia({
    audio: { deviceId: { exact: DEVICE } },
    video: { width: 1280 },
  });
  assert.deepEqual(stream.getTracks(), [{ kind: "video" }]);
  assert.deepEqual(win.calls.gum[1], { video: { width: 1280 } });
});

test("your own voice goes under the translation, at the level asked for", async () => {
  const win = fakeWindow();
  const shim = load(win);
  win.fromBridge({ type: "config", ownVoice: 0 });
  await win.navigator.mediaDevices.getUserMedia({ audio: { deviceId: DEVICE } });
  assert.deepEqual(win.calls.gum, [], "0 means the translation alone, and no second recorder");

  const other = fakeWindow();
  load(other);
  other.fromBridge({ type: "config", ownVoice: 0.4 });
  await other.navigator.mediaDevices.getUserMedia({ audio: { deviceId: DEVICE } });
  assert.deepEqual(other.calls.gum, [{ audio: true }]);
  // And the microphone is opened once however many times the stream is taken.
  await other.navigator.mediaDevices.getUserMedia({ audio: { deviceId: DEVICE } });
  assert.equal(other.calls.gum.length, 1);
  assert.ok(shim, "installed");
});

test("no microphone of your own is not a reason to stop translating", async () => {
  const win = fakeWindow({
    gum: async () => {
      throw new Error("NotAllowedError");
    },
  });
  load(win);
  const stream = await win.navigator.mediaDevices.getUserMedia({ audio: { deviceId: DEVICE } });
  assert.equal(stream.getAudioTracks().length, 1);
  assert.ok(
    win.calls.posted.some((m) => m.state === "ownVoiceUnavailable"),
    "and the relay is told why the call cannot hear you underneath it",
  );
});

test("re-acquisition hands back a live stream, not the one Meet already stopped", async () => {
  // Meet re-acquires on a device change, on a reconnection, and on some mutes.
  // One shared destination would mean the second call getting a track the page
  // had already stopped, and a call that goes silent for good.
  const win = fakeWindow();
  load(win);
  const media = win.navigator.mediaDevices;
  const first = await media.getUserMedia({ audio: { deviceId: DEVICE } });
  const second = await media.getUserMedia({ audio: { deviceId: DEVICE } });
  assert.notEqual(first, second);
  assert.notEqual(first.id, second.id);
});

test("speech is scheduled end to end, ahead of the clock, never in the past", () => {
  const win = fakeWindow();
  load(win);
  // 2400 samples at 24 kHz is 100 ms.
  win.fromBridge({ type: "voice", pcm: frame(2400) });
  win.fromBridge({ type: "voice", pcm: frame(2400) });
  const [a, b] = win.context.scheduled;
  assert.ok(a.at > 0, "the first frame leaves room for the relay to be late");
  assert.equal(a.duration, 0.1, "24 kHz, whatever rate the page's context runs at");
  assert.equal(b.at, a.at + a.duration, "butted onto the end, not overlapped");
});

test("a gap in the speech starts a new run instead of replaying the old one", () => {
  const win = fakeWindow();
  load(win);
  win.fromBridge({ type: "voice", pcm: frame(2400) });
  // The sentence ends and the next begins ten seconds later. Scheduling that at
  // the old playhead would put it in the past, which Web Audio plays instantly
  // — on top of anything else that was late.
  win.clock.now = 10;
  win.fromBridge({ type: "voice", pcm: frame(2400) });
  const [, second] = win.context.scheduled;
  assert.ok(second.at > 10, `${second.at} is in the past`);
});

test("a sentence delivered all at once is queued whole, not folded over itself", () => {
  // The Live API sends a sentence as fast as the socket takes it rather than at
  // the rate it will be spoken, so the playhead is meant to run seconds ahead
  // of the clock. Capping that lead — which this file did until Chrome 151 was
  // asked — does not shed the latency, it schedules the rest of the sentence on
  // top of the part already queued: 600 ms of clipping, then silence.
  const win = fakeWindow();
  load(win);
  for (let i = 0; i < 40; i++) win.fromBridge({ type: "voice", pcm: frame(2400) });
  const { scheduled } = win.context;
  assert.equal(scheduled.length, 40);
  for (let i = 1; i < scheduled.length; i++) {
    assert.equal(scheduled[i].at, scheduled[i - 1].at + 0.1, `frame ${i} overlaps frame ${i - 1}`);
  }
  // Four seconds of speech, still four seconds long when it comes out.
  assert.equal(+(scheduled.at(-1).at + 0.1 - scheduled[0].at).toFixed(6), 4);
});

test("the shim only listens to its own half of the relay", () => {
  const win = fakeWindow();
  load(win);
  const pcm = frame(2400);
  // A page is free to post whatever it likes on its own window, and the shim's
  // own status reports come back through the same listener.
  win.deliver({ channel: CHANNEL, from: "bridge", type: "voice", pcm }, { other: "frame" });
  win.deliver({ channel: "something-else", from: "bridge", type: "voice", pcm });
  win.deliver({ channel: CHANNEL, from: "shim", type: "voice", pcm });
  win.deliver("hello");
  win.deliver(null);
  assert.deepEqual(win.context.scheduled, []);
});

test("a torn-down shim leaves the page exactly as it found it", async () => {
  const win = fakeWindow({ devices: [{ deviceId: "default", kind: "audioinput" }] });
  const media = win.navigator.mediaDevices;
  const before = { gum: media.getUserMedia, enumerate: media.enumerateDevices };
  const shim = load(win);

  shim.teardown();
  assert.equal(media.getUserMedia, before.gum);
  assert.equal(media.enumerateDevices, before.enumerate);
  assert.equal((await media.enumerateDevices()).length, 1, "the device is withdrawn");
  assert.equal(win.calls.devicechange, 2, "and the picker is told, or it goes on offering it");
  assert.equal(win.__interpretabMicShim, undefined);

  // Deaf afterwards: a frame arriving after the run ends must not restart it.
  win.fromBridge({ type: "voice", pcm: frame(2400) });
  assert.deepEqual(win.context.scheduled, []);
});

test("injecting twice replaces the first shim rather than stacking on it", async () => {
  // Reloading the extension orphans the bridge and re-injects both halves. Two
  // live shims would mean two entries in the picker and two wrapped
  // `getUserMedia`s, the outer one calling the inner one forever.
  const win = fakeWindow({ devices: [{ deviceId: "default", kind: "audioinput" }] });
  load(win);
  load(win);
  assert.equal((await win.navigator.mediaDevices.enumerateDevices()).length, 2);
});
