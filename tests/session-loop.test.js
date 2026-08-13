/**
 * The cutover, driven by a fake session and a fake clock.
 *
 * Everything interesting about `SessionLoop` happens on a timescale of seconds
 * and only when the Live API decides to expire a session, which makes it
 * exactly the code that never gets exercised by hand. `now` and `SessionClass`
 * are constructor seams for that reason.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { GOAWAY_IDLE_GRACE_MS, RETRY_BACKOFF_INIT_MS, SessionLoop } from "../lib/session-loop.js";

/** Stands in for LiveSession: records what it was sent, emits what it is told. */
class FakeSession {
  static opened = [];
  static failNext = 0;

  constructor({ setup, onEvent, onStatus }) {
    this.setup = setup;
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.sent = [];
    this.closed = false;
    FakeSession.opened.push(this);
  }

  async open() {
    if (FakeSession.failNext > 0) {
      FakeSession.failNext--;
      throw new Error("connect refused");
    }
    this.onStatus("connected");
    return this;
  }

  send(buffer) {
    this.sent.push(new Uint8Array(buffer));
  }

  flush() {}

  close() {
    this.closed = true;
  }

  /** Total bytes this session was handed, preroll included. */
  get bytes() {
    return this.sent.reduce((n, b) => n + b.length, 0);
  }
}

/** A settable clock, so a five-second drain does not take five seconds. */
function harness() {
  FakeSession.opened = [];
  FakeSession.failNext = 0;
  let clock = 1000;
  const events = [];
  const loop = new SessionLoop({
    apiKey: "k",
    setup: { setup: {} },
    SessionClass: FakeSession,
    now: () => clock,
    onEvent: (ev) => events.push(ev),
  });
  return {
    loop,
    events,
    sessions: FakeSession.opened,
    advance: (ms) => {
      clock += ms;
    },
    at: () => clock,
  };
}

/** Let the microtask queue drain, so an awaited open() has settled. */
const settle = () => new Promise((r) => setImmediate(r));

/** Frames of PCM, distinguishable by their first byte. */
const frame = (n) => new Int16Array([n, n]).buffer;

test("audio goes to the session that is current", async () => {
  const h = harness();
  h.loop.start();
  await settle();
  h.loop.send(frame(1));
  assert.equal(h.sessions.length, 1);
  assert.equal(h.sessions[0].bytes, 4);
  h.loop.close();
});

test("goAway opens the replacement without cutting the current session off", async () => {
  const h = harness();
  h.loop.start();
  await settle();

  h.sessions[0].onEvent({ type: "goAway", timeLeft: 30000 });
  await settle();

  assert.equal(h.sessions.length, 2, "a replacement is opened straight away");
  assert.equal(h.sessions[0].closed, false, "the dying session keeps speaking");

  // It also keeps receiving audio until the swap.
  h.loop.send(frame(1));
  assert.equal(h.sessions[0].bytes, 4);
  assert.equal(h.sessions[1].bytes, 0);
  h.loop.close();
});

test("a turn that completes after goAway swaps cleanly and owes nothing", async () => {
  const h = harness();
  h.loop.start();
  await settle();
  h.sessions[0].onEvent({ type: "goAway", timeLeft: 30000 });
  await settle();

  h.loop.send(frame(1));
  h.sessions[0].onEvent({ type: "turnComplete" });
  await settle();

  assert.equal(h.sessions[0].closed, true);
  assert.equal(h.sessions[1].bytes, 0, "nothing is replayed: the turn was answered");
  // Exactly one turnComplete reached the UI — the real one, not a synthetic
  // one on top of it.
  assert.equal(h.events.filter((e) => e.type === "turnComplete").length, 1);

  // And the replacement is the one now being fed.
  h.loop.send(frame(2));
  assert.equal(h.sessions[1].bytes, 4);
  h.loop.close();
});

test("a drain that falls silent replays only the unanswered audio", async () => {
  const h = harness();
  h.loop.start();
  await settle();

  // Answered: the session spoke after hearing this.
  h.loop.send(frame(1));
  h.advance(100);
  h.sessions[0].onEvent({ type: "output", text: "hello", finished: false });

  h.sessions[0].onEvent({ type: "goAway", timeLeft: 30000 });
  await settle();

  // Unanswered: said after the session's last word, and never responded to.
  h.advance(100);
  h.loop.send(frame(2));
  h.loop.send(frame(3));

  h.advance(GOAWAY_IDLE_GRACE_MS);
  h.loop._checkDrain();
  await settle();

  assert.equal(h.sessions[0].closed, true);
  assert.equal(h.sessions[1].bytes, 8, "the two unanswered frames, not the answered one");
  const replayed = new Int16Array(h.sessions[1].sent[0].buffer.slice(0));
  assert.deepEqual([...replayed], [2, 2, 3, 3], "in order, without duplicates");

  // The abandoned turn is closed for the caption that is still open on screen.
  assert.deepEqual(h.events.at(-1), { type: "turnComplete" });
  h.loop.close();
});

test("the goAway deadline forces the swap even while the session is talking", async () => {
  const h = harness();
  h.loop.start();
  await settle();
  h.sessions[0].onEvent({ type: "goAway", timeLeft: 2000 });
  await settle();

  // Still relaying, so the silence rule never fires — only the deadline can.
  for (let i = 0; i < 8; i++) {
    h.advance(250);
    h.sessions[0].onEvent({ type: "output", text: "…", finished: false });
    h.loop._checkDrain();
  }
  await settle();

  assert.equal(h.sessions[0].closed, true);
  assert.equal(h.sessions.length, 2);
  h.loop.close();
});

test("a socket that closes mid-drain hands over to the waiting replacement", async () => {
  const h = harness();
  h.loop.start();
  await settle();
  h.sessions[0].onEvent({ type: "goAway", timeLeft: 30000 });
  await settle();

  h.sessions[0].onEvent({ type: "closed", code: 1011 });
  await settle();

  assert.equal(h.sessions.length, 2, "no third session: the replacement was adopted");
  h.loop.send(frame(9));
  assert.equal(h.sessions[1].bytes, 4);
  h.loop.close();
});

test("a failed connect backs off instead of spinning", async () => {
  const h = harness();
  FakeSession.failNext = 3;
  h.loop.start();
  await settle();

  // One attempt, then a timer — not three attempts in the same tick.
  assert.equal(h.sessions.length, 1);
  assert.ok(h.loop._retryTimer, "a retry is scheduled");
  assert.equal(h.loop._backoff, RETRY_BACKOFF_INIT_MS * 2);
  h.loop.close();
});

test("the backoff doubles per failure and resets once a session is adopted", async () => {
  const h = harness();
  FakeSession.failNext = 2;
  h.loop.start();
  await settle();
  assert.equal(h.loop._backoff, 400);

  await h.loop._connect(); // second failure
  assert.equal(h.loop._backoff, 800);

  await h.loop._connect(); // succeeds
  assert.equal(h.loop._backoff, RETRY_BACKOFF_INIT_MS);
  h.loop.close();
});

test("a replacement that fails to open leaves the swap to open a fresh one", async () => {
  const h = harness();
  h.loop.start();
  await settle();

  FakeSession.failNext = 1;
  h.sessions[0].onEvent({ type: "goAway", timeLeft: 30000 });
  await settle();

  h.advance(GOAWAY_IDLE_GRACE_MS);
  h.loop._checkDrain();
  await settle();

  // The failed one, plus the fresh one the swap fell back to.
  assert.equal(h.sessions.length, 3);
  assert.equal(h.sessions[2].closed, false);
  h.loop.close();
});

test("the preroll ring is bounded", async () => {
  const h = harness();
  h.loop.start();
  await settle();
  for (let i = 0; i < 2000; i++) h.loop.send(frame(i));
  assert.equal(h.loop._recent.length, 1250);
  h.loop.close();
});

test("close stops everything and drops the buffered audio", async () => {
  const h = harness();
  h.loop.start();
  await settle();
  h.loop.send(frame(1));
  h.sessions[0].onEvent({ type: "goAway", timeLeft: 30000 });
  await settle();

  h.loop.close();
  assert.ok(h.sessions.every((s) => s.closed));
  assert.equal(h.loop._recent.length, 0);
  assert.equal(h.loop._drainTimer, null);

  // Events arriving after close are ignored rather than reopening anything.
  const before = h.sessions.length;
  h.sessions[0].onEvent({ type: "closed", code: 1000 });
  await settle();
  assert.equal(h.sessions.length, before);
});
