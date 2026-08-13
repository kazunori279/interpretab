/**
 * The socket half, against a stub WebSocket.
 *
 * The cases here are the ones a manual test cannot reach reliably: a key that
 * is rejected after the upgrade succeeds, and a stop pressed during the
 * handshake. Both used to be able to leave `open()` pending for ever, which
 * strands `SessionLoop._connect` mid-await with no session and no retry.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { LiveSession, UPLINK_RATE } from "../lib/live-session.js";

/** Enough of the WebSocket surface for LiveSession, driven by hand. */
class FakeWebSocket {
  static OPEN = 1;
  static last = null;

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.OPEN;
    this.sent = [];
    this.closeCalls = 0;
    FakeWebSocket.last = this;
  }

  send(data) {
    this.sent.push(data);
  }

  close() {
    this.closeCalls++;
  }

  /** The server's side of the conversation. */
  accept() {
    this.onopen?.();
  }

  deliver(obj) {
    return this.onmessage?.({ data: JSON.stringify(obj) });
  }

  drop(code = 1006, reason = "") {
    this.onclose?.({ code, reason });
  }
}

function session(overrides = {}) {
  FakeWebSocket.last = null;
  globalThis.WebSocket = FakeWebSocket;
  const events = [];
  const statuses = [];
  const live = new LiveSession({
    apiKey: "AIzaTEST",
    setup: { setup: { model: "models/x" } },
    onEvent: (ev) => events.push(ev),
    onStatus: (s) => statuses.push(s),
    ...overrides,
  });
  return { live, events, statuses, ws: () => FakeWebSocket.last };
}

/** Let the async onmessage handler run to completion. */
const settle = () => new Promise((r) => setImmediate(r));

test("open resolves on setupComplete, not on the upgrade", async () => {
  const h = session();
  const opening = h.live.open();
  h.ws().accept();
  assert.deepEqual(JSON.parse(h.ws().sent[0]), { setup: { model: "models/x" } });

  await settle();
  assert.equal(h.live.ready, false, "an open socket is not yet a usable session");

  h.ws().deliver({ setupComplete: {} });
  assert.equal(await opening, h.live);
  assert.equal(h.live.ready, true);
  assert.deepEqual(h.statuses, ["connecting", "connected"]);
});

test("a close before setupComplete rejects with the key as the likely cause", async () => {
  const h = session();
  const opening = h.live.open();
  h.ws().accept();
  h.ws().drop(1006);
  await assert.rejects(opening, /API key/);
});

test("close during the handshake rejects rather than stranding the caller", async () => {
  const h = session();
  const opening = h.live.open();
  h.ws().accept();

  // No setupComplete has arrived, and close() detaches onclose — so nothing
  // else can settle this promise.
  h.live.close();
  await assert.rejects(opening, /closed before it was ready/);
  assert.equal(h.ws().closeCalls, 1);
});

test("a close after setupComplete is an event, not a rejection", async () => {
  const h = session();
  const opening = h.live.open();
  h.ws().accept();
  h.ws().deliver({ setupComplete: {} });
  await opening;

  h.ws().drop(1011, "");
  assert.deepEqual(h.events, [{ type: "closed", code: 1011 }]);
  assert.equal(h.live.ready, false);
});

test("close suppresses the closed event so the loop does not reconnect", async () => {
  const h = session();
  const opening = h.live.open();
  h.ws().accept();
  h.ws().deliver({ setupComplete: {} });
  await opening;

  h.live.close();
  assert.deepEqual(h.events, []);
});

test("server frames unwrap from serverContent", async () => {
  const h = session();
  const opening = h.live.open();
  h.ws().accept();
  h.ws().deliver({ setupComplete: {} });
  await opening;

  await h.ws().deliver({ serverContent: { inputTranscription: { text: "hola" } } });
  await h.ws().deliver({
    serverContent: {
      outputTranscription: { text: "hello", finished: true },
      modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: "AAE=" } }] },
      turnComplete: true,
    },
  });

  assert.deepEqual(h.events[0], { type: "input", text: "hola", finished: false });
  assert.deepEqual(h.events[1], { type: "output", text: "hello", finished: true });
  assert.equal(h.events[2].type, "audio");
  assert.deepEqual([...new Uint8Array(h.events[2].buffer)], [0, 1]);
  assert.deepEqual(h.events[3], { type: "turnComplete" });
});

test("an interrupted turn closes the caption the same way a finished one does", async () => {
  const h = session();
  const opening = h.live.open();
  h.ws().accept();
  h.ws().deliver({ setupComplete: {} });
  await opening;

  await h.ws().deliver({ serverContent: { interrupted: true } });
  assert.deepEqual(h.events, [{ type: "turnComplete" }]);
});

test("goAway comes through with its Duration in milliseconds", async () => {
  const h = session();
  const opening = h.live.open();
  h.ws().accept();
  h.ws().deliver({ setupComplete: {} });
  await opening;

  await h.ws().deliver({ goAway: { timeLeft: "30s" } });
  assert.deepEqual(h.events, [{ type: "goAway", timeLeft: 30000 }]);
});

test("audio is coalesced into 32 ms frames rather than sent a block at a time", async () => {
  const h = session();
  const opening = h.live.open();
  h.ws().accept();
  h.ws().deliver({ setupComplete: {} });
  await opening;
  const before = h.ws().sent.length;

  // The worklet's 128-sample blocks are 8 ms each, so four make one frame.
  const block = new Int16Array(128).buffer;
  for (let i = 0; i < 3; i++) h.live.send(block);
  assert.equal(h.ws().sent.length, before, "nothing goes out until a chunk has gathered");

  h.live.send(block);
  assert.equal(h.ws().sent.length, before + 1);
  const frame = JSON.parse(h.ws().sent.at(-1)).realtimeInput.audio;
  assert.equal(frame.mimeType, `audio/pcm;rate=${UPLINK_RATE}`);
  assert.equal(Buffer.from(frame.data, "base64").length, 1024, "32 ms of PCM16 at 16 kHz");
});

test("audio sent before setupComplete is dropped, not queued for ever", async () => {
  const h = session();
  const opening = h.live.open();
  h.ws().accept();
  h.live.send(new Int16Array(4096).buffer);
  assert.equal(h.ws().sent.length, 1, "only the setup frame");

  h.ws().deliver({ setupComplete: {} });
  await opening;
  assert.equal(h.ws().sent.length, 1, "and the dropped audio does not turn up later");
});
