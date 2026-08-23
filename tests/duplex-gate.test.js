/**
 * The duplex gate is the one thing in the audio path that deliberately throws
 * away what the user said, so a mistake in it is indistinguishable from the
 * model ignoring somebody — which is exactly the report `tests/conversation.mjs`
 * exists to chase down. That script can only attribute a lost utterance to the
 * gate if its reproduction of the gate is right, and a live run cannot check
 * that: the numbers it would be checked against are the numbers it produced.
 *
 * So the arithmetic is pinned here instead, on a settable clock, against the two
 * constants `offscreen.js` uses. `usesDuplexGate` — *whether* a direction is
 * gated at all — is a different question and lives in `setup-frame.test.js`.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { UPLINK_RATE } from "../lib/live-session.js";
import { DOWNLINK_RATE, VOICE_RELEASE_SEC, duplexGate } from "./live-harness.mjs";

/** One 32 ms microphone frame, the size the recorder sends. */
const FRAME = new ArrayBuffer(1024);
const FRAME_MS = (1024 / 2 / UPLINK_RATE) * 1000;

/** Translated audio worth *ms* of speech, at the rate the downlink runs. */
const voiceOf = (ms) => Math.round((ms / 1000) * DOWNLINK_RATE * 2);

function harness({ enabled = true } = {}) {
  let clock = 1000;
  const sent = [];
  const gate = duplexGate({ send: (buf) => sent.push(buf) }, { enabled, now: () => clock });
  return { gate, sent, tick: (ms) => (clock += ms), at: () => clock };
}

test("a frame goes out when the interpreter has said nothing", () => {
  const { gate, sent } = harness();
  assert.equal(gate.send(FRAME), true);
  assert.equal(sent.length, 1);
  assert.equal(gate.sentMs, FRAME_MS);
  assert.equal(gate.droppedMs, 0);
});

test("frames are dropped, not delayed, while the interpreter's voice plays", () => {
  const { gate, sent, tick } = harness();
  // Two seconds of speech, which arrives in a fraction of that — the whole
  // reason the gate follows a play-out deadline and not the last frame.
  gate.note(voiceOf(2000));
  const frames = Math.ceil(2000 / FRAME_MS);
  for (let i = 0; i < frames; i++) {
    assert.equal(gate.send(FRAME), false);
    tick(FRAME_MS);
  }
  assert.equal(sent.length, 0, "nothing reached the session");
  assert.equal(gate.droppedMs, frames * FRAME_MS);
  // The point of the test: the frames are gone. Nobody is holding them, and the
  // session will never be told that two seconds of speech happened.
  assert.equal(gate.sentMs, 0);
});

test("the microphone opens again once the voice and its release have passed", () => {
  const { gate, sent, tick } = harness();
  gate.note(voiceOf(1000));
  assert.equal(gate.send(FRAME), false);
  tick(1000);
  assert.equal(gate.send(FRAME), false, "still shut through the release window");
  tick(VOICE_RELEASE_SEC * 1000);
  assert.equal(gate.send(FRAME), true);
  assert.equal(sent.length, 1);
});

test("audio arriving mid-sentence extends the deadline instead of restarting it", () => {
  const { gate, tick, at } = harness();
  gate.note(voiceOf(1000));
  const afterFirst = gate.endsAt();
  tick(200);
  gate.note(voiceOf(1000)); // the second half of the same sentence
  assert.equal(gate.endsAt(), afterFirst + 1000, "queued behind the first, not on top of it");
  // And a frame that arrives after everything has played is not gated by a
  // deadline left over from before.
  tick(2000 + VOICE_RELEASE_SEC * 1000);
  assert.ok(at() > gate.endsAt());
  assert.equal(gate.send(FRAME), true);
});

test("what the gate ate off the front is counted apart from the total", () => {
  const { gate, tick } = harness();
  gate.note(voiceOf(500));
  for (let ms = 0; ms < 900; ms += FRAME_MS) {
    gate.send(FRAME);
    tick(FRAME_MS);
  }
  // 500 ms of voice plus a 400 ms release, so the first 900 ms never went out
  // and the sentence the model hears starts partway in.
  assert.ok(gate.leadingDroppedMs >= 850 && gate.leadingDroppedMs <= 950, `${gate.leadingDroppedMs}`);
  assert.equal(gate.leadingDroppedMs, gate.droppedMs);
  gate.send(FRAME);
  const leading = gate.leadingDroppedMs;
  // Anything dropped later in the same utterance is a hole in the middle, not a
  // late start, and must not be added to the leading figure.
  gate.note(voiceOf(500));
  gate.send(FRAME);
  assert.equal(gate.leadingDroppedMs, leading);
  assert.equal(Math.round(gate.droppedMs), Math.round(leading + FRAME_MS));
});

test("reset clears the counters but not the deadline", () => {
  const { gate } = harness();
  gate.note(voiceOf(1000));
  gate.send(FRAME);
  gate.reset();
  assert.equal(gate.droppedMs, 0);
  assert.equal(gate.leadingDroppedMs, 0);
  assert.equal(gate.sentMs, 0);
  // The counters are per utterance; the interpreter's voice is not, and a gate
  // that forgot it was still talking would open in the middle of a sentence.
  assert.equal(gate.speaking(), true);
});

test("with the gate off every frame goes out, deadline or no deadline", () => {
  const { gate, sent } = harness({ enabled: false });
  gate.note(voiceOf(5000));
  assert.equal(gate.send(FRAME), true);
  assert.equal(sent.length, 1);
  assert.equal(gate.droppedMs, 0);
  // Still tracking, because `--gate off` runs still wait for the interpreter to
  // finish before the next person speaks — they just do not cut anyone off.
  assert.equal(gate.speaking(), true);
});
