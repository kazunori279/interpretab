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

// Real prose behind every message key, so the assertions below can be about it.
import "./messages.mjs";

import { isModelUnavailableClose, isQuotaClose, LiveSession, UPLINK_RATE } from "../lib/live-session.js";

/**
 * A real quota close, verbatim, from `tests/quota-close.mjs`. Copied rather
 * than shortened: the point of it is that the server's sentence is cut off at
 * the 123 bytes a close frame allows, and a tidied-up copy would let a matcher
 * pass here that fails against the wire.
 */
const QUOTA_CLOSE_REASON =
  "You exceeded your current quota, please check your plan and billing details. " +
  "For more information on this error, head to: h";

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
  await assert.rejects(opening, /usually the key/);
});

test("what the preflight learned replaces the guess a 1006 would otherwise get", async () => {
  // The browser will not say why an upgrade was refused, so the default message
  // has to list every cause. `preflight` asked the REST API about the same key
  // over a protocol that answers, and if the key came back fine then "usually
  // the API key" is the one thing this cannot be — which is the half of #13
  // that no amount of rewording the guess would have fixed.
  const h = session({ closeHint: "The key itself was accepted a moment ago." });
  const opening = h.live.open();
  h.ws().accept();
  h.ws().drop(1006);
  await assert.rejects(opening, /accepted a moment ago/);
  await assert.rejects(opening, (err) => !/API key/.test(err.message));
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
  assert.deepEqual(h.events, [{ type: "closed", code: 1011, reason: "" }]);
  assert.equal(h.live.ready, false);
});

test("the close carries the server's reason, not just its code", async () => {
  // The quota close is the reason this exists: 1011 says nothing, and the
  // sentence beside it is the only thing that names the cause.
  const h = session();
  const opening = h.live.open();
  h.ws().accept();
  h.ws().deliver({ setupComplete: {} });
  await opening;

  h.ws().drop(1011, QUOTA_CLOSE_REASON);
  assert.deepEqual(h.events, [{ type: "closed", code: 1011, reason: QUOTA_CLOSE_REASON }]);
});

test("a quota close is recognised from what survives the 123-byte limit", () => {
  // The real one is cut mid-URL, which is why nothing may match on the tail.
  assert.equal(QUOTA_CLOSE_REASON.length, 123, "the observed reason, at the frame's limit");
  assert.ok(isQuotaClose(QUOTA_CLOSE_REASON));
  assert.ok(isQuotaClose("RESOURCE_EXHAUSTED"));
  assert.ok(!isQuotaClose(""));
  assert.ok(!isQuotaClose("Deadline exceeded"));
});

test("a retired model is recognised from the sentence, never from the code", () => {
  // The observed close, verbatim. It arrives on 1008 — and so does the routine
  // expiry that follows every `goAway`, 31 times an hour, which is why nothing
  // here may key on the code.
  assert.ok(
    isModelUnavailableClose(
      "Publisher Model `models/gemini-3.5-live-translate-preview` was not found " +
        "or is not supported for bidiGenerateContent",
    ),
  );
  assert.ok(isModelUnavailableClose("model gemini-x has been retired"));
  assert.ok(isModelUnavailableClose("This model is deprecated"));

  assert.ok(!isModelUnavailableClose(""));
  assert.ok(!isModelUnavailableClose("Request contains an invalid argument"));
  assert.ok(!isModelUnavailableClose(QUOTA_CLOSE_REASON));
  // Both halves are required, so an unrelated absence cannot spend the list.
  assert.ok(!isModelUnavailableClose("The requested voice was not found"));
  assert.ok(!isModelUnavailableClose("the model returned nothing"));
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

test("usageMetadata reports alongside the frame it arrives with", async () => {
  // It is a sibling of `serverContent`, not part of it, and the message that
  // carries it usually carries a transcript too — so reporting the tally must
  // not consume the frame.
  const h = session();
  const opening = h.live.open();
  h.ws().accept();
  h.ws().deliver({ setupComplete: {} });
  await opening;

  await h.ws().deliver({
    usageMetadata: { promptTokenCount: 120, responseTokenCount: 80, totalTokenCount: 200 },
    serverContent: { outputTranscription: { text: "hello", finished: true } },
  });

  assert.deepEqual(h.events[0], {
    type: "usage",
    usage: { promptTokenCount: 120, responseTokenCount: 80, totalTokenCount: 200 },
  });
  assert.deepEqual(h.events[1], { type: "output", text: "hello", finished: true });
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

test("generationComplete ends a turn, because some models send nothing else", async () => {
  // Observed against gemini-3.1-flash-live-preview: a whole spoken answer, then
  // `generationComplete`, and no `turnComplete` ever. Waiting for the
  // documented frame alone leaves the caption open and the swap stalled.
  const h = session();
  const opening = h.live.open();
  h.ws().accept();
  h.ws().deliver({ setupComplete: {} });
  await opening;

  await h.ws().deliver({ serverContent: { generationComplete: true } });
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
