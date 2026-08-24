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

// Real prose behind every message key, so the assertions below can be about it.
import "./messages.mjs";

import {
  GOAWAY_DEADLINE_MARGIN_MS,
  GOAWAY_IDLE_GRACE_MS,
  RETRY_BACKOFF_INIT_MS,
  RETRY_HEALTHY_MS,
  RETRY_MAX_ATTEMPTS,
  SessionLoop,
} from "../lib/session-loop.js";

/** Stands in for LiveSession: records what it was sent, emits what it is told. */
class FakeSession {
  static opened = [];
  static failNext = 0;
  static failWith = "connect refused";

  constructor({ setup, onEvent, onStatus, closeHint }) {
    this.setup = setup;
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.closeHint = closeHint;
    this.sent = [];
    this.closed = false;
    FakeSession.opened.push(this);
  }

  async open() {
    if (FakeSession.failNext > 0) {
      FakeSession.failNext--;
      throw new Error(FakeSession.failWith);
    }
    this.onStatus("connected");
    return this;
  }

  /** The model this session was asked for, without the `models/` prefix. */
  get model() {
    return String(this.setup.setup.model || "").replace(/^models\//, "");
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
function harness({ models, refreshModels } = {}) {
  FakeSession.opened = [];
  FakeSession.failNext = 0;
  FakeSession.failWith = "connect refused";
  let clock = 1000;
  const events = [];
  const statuses = [];
  const chosen = [];
  const loop = new SessionLoop({
    apiKey: "k",
    setup: { setup: { model: "models/bundled-model" } },
    closeHint: "the preflight said so",
    models,
    refreshModels,
    SessionClass: FakeSession,
    now: () => clock,
    onModel: (model) => chosen.push(model),
    onEvent: (ev) => events.push(ev),
    onStatus: (status, detail) => statuses.push({ status, detail }),
  });
  return {
    loop,
    events,
    statuses,
    chosen,
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

/** A real quota close, verbatim — see the copy in `live-session.test.js`. */
const QUOTA_CLOSE_REASON =
  "You exceeded your current quota, please check your plan and billing details. " +
  "For more information on this error, head to: h";

/** A real retired-model close, verbatim — see `live-session.test.js`. */
const MODEL_GONE_REASON =
  "Publisher Model `models/gemini-3.5-live-translate-preview` was not found " +
  "or is not supported for bidiGenerateContent";

test("every session the loop opens carries the preflight's verdict", async () => {
  // Including the replacements. A loop that runs for an hour opens six of them,
  // and the sixth failing is exactly when a user wants to be told that the key
  // was fine when the run started.
  const h = harness();
  h.loop.start();
  await settle();
  h.sessions[0].onEvent({ type: "goAway", timeLeft: 30000 });
  await settle();

  assert.equal(h.sessions.length, 2);
  for (const s of h.sessions) assert.equal(s.closeHint, "the preflight said so");
  h.loop.close();
});

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

test("a usage report passes through without counting as the session still talking", async () => {
  // The tally arrives on its own frames as well as on spoken ones. Treating it
  // as a relay would keep a dying session's drain open to its deadline and cut
  // the preroll owed to the replacement down to the audio since the last
  // bookkeeping message.
  const h = harness();
  h.loop.start();
  await settle();

  h.loop.send(frame(1));
  h.sessions[0].onEvent({ type: "goAway", timeLeft: 30000 });
  await settle();

  h.advance(100);
  h.loop.send(frame(2));
  h.advance(GOAWAY_IDLE_GRACE_MS - 100);
  h.sessions[0].onEvent({ type: "usage", usage: { totalTokenCount: 200 } });
  h.loop._checkDrain();
  await settle();

  assert.equal(h.sessions[0].closed, true, "the silence clock kept running");
  assert.equal(h.sessions[1].bytes, 8, "and both unanswered frames were still owed");
  assert.deepEqual(
    h.events.filter((e) => e.type === "usage"),
    [{ type: "usage", usage: { totalTokenCount: 200 } }],
    "forwarded once, to whoever is counting",
  );
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

test("the swap comes in ahead of the deadline, not level with it", async () => {
  // The server closes when it said it would — measured at 50.4 s against a
  // `"50s"` warning. Swapping on the same tick is a race with a close already
  // on the wire, so the drain ends GOAWAY_DEADLINE_MARGIN_MS early.
  const h = harness();
  h.loop.start();
  await settle();
  h.sessions[0].onEvent({ type: "goAway", timeLeft: 5000 });
  await settle();

  h.advance(5000 - GOAWAY_DEADLINE_MARGIN_MS - 250);
  h.loop._checkDrain();
  await settle();
  assert.equal(h.sessions[0].closed, false, "swapped before the margin was reached");

  h.advance(250);
  h.loop._checkDrain();
  await settle();
  assert.equal(h.sessions[0].closed, true, "the margin, not the deadline, ends the drain");
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

test("a quota close stops the run instead of retrying ten times", async () => {
  // The server takes the handshake whether or not there is quota left, so every
  // retry gets as far as `setupComplete` and dies a second later. Ten of those
  // is two minutes of the panel saying the connection keeps dropping, about a
  // limit that is not going to reset inside them.
  const h = harness();
  h.loop.start();
  await settle();

  h.sessions[0].onEvent({ type: "closed", code: 1011, reason: QUOTA_CLOSE_REASON });
  await settle();

  assert.equal(h.sessions.length, 1, "no retry");
  assert.equal(h.statuses.at(-1).status, "failed");
  assert.match(h.statuses.at(-1).detail, /used up what Google allows/);
  assert.ok(h.loop._closed);
});

test("a quota close mid-drain gives up rather than handing over", async () => {
  // The replacement is on the same key, so it has nothing to swap to.
  const h = harness();
  h.loop.start();
  await settle();
  h.sessions[0].onEvent({ type: "goAway", timeLeft: 30000 });
  await settle();

  h.sessions[0].onEvent({ type: "closed", code: 1011, reason: QUOTA_CLOSE_REASON });
  await settle();

  assert.equal(h.statuses.at(-1).status, "failed");
  assert.ok(h.sessions.every((s) => s.closed));
});

test("a loop given no list translates with the model its setup names", async () => {
  const h = harness();
  h.loop.start();
  await settle();

  assert.deepEqual(h.loop._models, ["bundled-model"]);
  assert.equal(h.sessions[0].model, "bundled-model");
  assert.deepEqual(h.loop._setup.setup, { model: "models/bundled-model" }, "the frame is not mutated");
  h.loop.close();
});

test("a name rejected at the handshake is replaced by the next candidate", async () => {
  // Which is how a retired preview usually announces itself: the name is turned
  // down during `setup`, so it arrives as an `open()` that never completed
  // rather than as a session that died.
  const h = harness({ models: ["dead-model", "live-model"] });
  FakeSession.failNext = 1;
  FakeSession.failWith = MODEL_GONE_REASON;
  h.loop.start();
  await settle();

  assert.deepEqual(
    h.sessions.map((s) => s.model),
    ["dead-model", "live-model"],
  );
  assert.deepEqual(h.chosen, ["live-model"], "whoever is pricing the run is told");
  assert.equal(h.loop._retryTimer, null, "and it went straight there, off the backoff curve");
  assert.notEqual(h.statuses.at(-1).status, "failed");
  h.loop.close();
});

test("a model retired underneath a working session is swapped mid-run", async () => {
  const h = harness({ models: ["dead-model", "live-model"] });
  h.loop.start();
  await settle();

  h.sessions[0].onEvent({ type: "closed", code: 1008, reason: MODEL_GONE_REASON });
  await settle();

  assert.equal(h.sessions[0].closed, true);
  assert.equal(h.sessions[1].model, "live-model");
  assert.equal(h.loop._retryTimer, null);
  h.loop.close();
});

test("the routine expiry that closes on the same code does not spend the list", async () => {
  // 1008 is both "that model is gone" and "your ten minutes are up", and the
  // second of those happens 31 times an hour. Keying on the code would have the
  // loop working its way down the candidates during a healthy run.
  const h = harness({ models: ["first-model", "second-model"] });
  h.loop.start();
  await settle();

  h.sessions[0].onEvent({ type: "closed", code: 1008 });
  await settle();

  assert.equal(h.loop._model, 0, "still on the first candidate");
  assert.deepEqual(h.chosen, []);
  assert.equal(h.statuses.at(-1).status, "disconnected", "an ordinary drop, handled the ordinary way");
  h.loop.close();
});

test("a drain mid-flight is abandoned rather than handed over to a dead name", async () => {
  // The replacement is being opened on the same model, so there is nothing for
  // it to hand over to — same reasoning as the quota close above.
  const h = harness({ models: ["dead-model", "live-model"] });
  h.loop.start();
  await settle();
  h.sessions[0].onEvent({ type: "goAway", timeLeft: 30000 });
  await settle();
  assert.equal(h.sessions.length, 2, "a replacement was on its way");

  h.sessions[0].onEvent({ type: "closed", code: 1008, reason: MODEL_GONE_REASON });
  await settle();

  assert.equal(h.sessions[1].closed, true, "the replacement went with it");
  assert.equal(h.sessions[2].model, "live-model");
  assert.equal(h.loop._drainTimer, null, "and the drain clock is not still running");
  h.loop.close();
});

test("running out of candidates asks the config file for a fresher one", async () => {
  // The list was read at Start and may be hours old by now, which is the point:
  // this is the exact moment the file is most likely to have been corrected.
  let asked = 0;
  const h = harness({
    models: ["dead-model"],
    refreshModels: async () => {
      asked += 1;
      return ["dead-model", "successor-model"];
    },
  });
  FakeSession.failNext = 1;
  FakeSession.failWith = MODEL_GONE_REASON;
  h.loop.start();
  await settle();
  await settle();

  assert.equal(asked, 1);
  assert.equal(h.sessions[1].model, "successor-model", "only the name it did not already have");
  assert.deepEqual(h.chosen, ["successor-model"]);
  assert.notEqual(h.statuses.at(-1).status, "failed");
  h.loop.close();
});

test("the file is asked once per run, however many names it gives", async () => {
  let asked = 0;
  const h = harness({
    models: ["dead-model"],
    refreshModels: async () => {
      asked += 1;
      return ["successor-model"];
    },
  });
  FakeSession.failNext = 100;
  FakeSession.failWith = MODEL_GONE_REASON;
  h.loop.start();
  for (let i = 0; i < 4; i++) await settle();

  assert.equal(asked, 1, "a second fetch would be one per failed reconnect");
  assert.deepEqual(
    h.sessions.map((s) => s.model),
    ["dead-model", "successor-model"],
  );
  assert.equal(h.statuses.at(-1).status, "failed");
  assert.match(h.statuses.at(-1).detail, /Update Interpretab/);
  assert.ok(h.loop._closed);
});

test("a run with nowhere left to go stops and says why", async () => {
  // No refresh hook at all — the soak harness and every pre-config caller. The
  // one thing that must not happen is ten backoff attempts against a name that
  // is never coming back.
  const h = harness({ models: ["dead-model"] });
  FakeSession.failNext = 1;
  FakeSession.failWith = MODEL_GONE_REASON;
  h.loop.start();
  await settle();

  assert.equal(h.sessions.length, 1, "no retry");
  assert.equal(h.statuses.at(-1).status, "failed");
  assert.match(h.statuses.at(-1).detail, /withdrawn/);
  assert.ok(h.loop._closed);
});

test("a refresh that fails leaves the run stopped rather than hanging", async () => {
  const h = harness({
    models: ["dead-model"],
    refreshModels: async () => {
      throw new Error("the service worker was asleep");
    },
  });
  FakeSession.failNext = 1;
  FakeSession.failWith = MODEL_GONE_REASON;
  h.loop.start();
  await settle();
  await settle();

  assert.equal(h.statuses.at(-1).status, "failed");
  assert.ok(h.loop._closed);
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

test("a rejection that is never going to clear is given up on (#13)", async () => {
  // The backoff tops out at four seconds and used to run for ever, so a key out
  // of free-tier quota — which does not come back until midnight Pacific — had
  // the extension knocking on a rate-limited endpoint until the user noticed.
  const h = harness();
  FakeSession.failNext = 100;
  h.loop.start();
  await settle();
  for (let i = 1; i < RETRY_MAX_ATTEMPTS; i++) await h.loop._connect();

  assert.equal(h.sessions.length, RETRY_MAX_ATTEMPTS, "one attempt per failure, and no more");
  const last = h.statuses.at(-1);
  assert.equal(last.status, "failed");
  assert.match(last.detail, /Google AI Studio/, "the message says where quota is checked");
  assert.equal(h.loop._retryTimer, null, "nothing is left scheduled");
  assert.ok(h.loop._closed);

  // And it stays given up rather than being restarted by a stray callback.
  await h.loop._connect();
  assert.equal(h.sessions.length, RETRY_MAX_ATTEMPTS);
});

test("a session that relays anything clears the failures behind it", async () => {
  const h = harness();
  FakeSession.failNext = 3;
  h.loop.start();
  await settle();
  await h.loop._connect();
  await h.loop._connect();
  assert.equal(h.loop._attempts, 3);

  await h.loop._connect(); // this one connects
  assert.equal(h.loop._attempts, 3, "connecting on its own proves nothing");
  h.sessions.at(-1).onEvent({ type: "output", text: "hi" });
  assert.equal(h.loop._attempts, 0, "an answer does");
  h.loop.close();
});

test("connecting and dropping straight back is not a fresh start", async () => {
  // Why adoption does not clear the tally: a key can be rejected *after* the
  // handshake, and a loop that took `open()` as evidence would cycle for ever
  // with a clean counter at every turn.
  const h = harness();
  h.loop.start();
  await settle();
  for (let i = 1; i < RETRY_MAX_ATTEMPTS; i++) {
    h.sessions.at(-1).onEvent({ type: "closed" });
    await h.loop._connect();
  }
  h.sessions.at(-1).onEvent({ type: "closed" });

  assert.equal(h.statuses.at(-1).status, "failed");
  assert.ok(h.loop._closed);
});

test("a session that stayed up for a minute clears the tally on its way out", async () => {
  // Otherwise an hour on bad Wi-Fi accumulates ten unrelated drops during
  // silences and gives up on the eleventh, which is not what the count means.
  const h = harness();
  h.loop.start();
  await settle();
  h.loop._attempts = RETRY_MAX_ATTEMPTS - 1;

  h.advance(RETRY_HEALTHY_MS);
  h.sessions[0].onEvent({ type: "closed" });

  assert.equal(h.loop._attempts, 1, "the minute cleared it, and this drop is the first");
  assert.notEqual(h.statuses.at(-1).status, "failed");
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
