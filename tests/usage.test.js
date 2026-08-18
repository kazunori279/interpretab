/**
 * The audio clock the side panel prices, and what it is priced at.
 *
 * The arithmetic here is the only thing standing between the side panel and a
 * wrong number about somebody's money, and none of it is visible in a manual
 * test: a run that has moved 18 minutes of audio looks exactly like one that
 * has moved 18 minutes counted twice. The hour case ties the whole table back
 * to the rate Google publishes per minute, which is the outside check — if the
 * pricing page moves and `RATES` does not, that is the test that says so. It is
 * also the test that would have caught #16, where the panel ran three to five
 * times faster than that same published rate allows.
 */

import test from "node:test";
import assert from "node:assert/strict";

// Real prose behind every message key, so the assertions below can be about it.
import "./messages.mjs";

import { MODEL, SIMUL_MODEL } from "../lib/languages.js";
import {
  costOf,
  emptyUsage,
  formatCost,
  formatDuration,
  mergeUsage,
  noteAudioIn,
  noteAudioOut,
} from "../lib/usage.js";

test("audio is counted in each direction, and nowhere else", () => {
  const totals = emptyUsage();
  noteAudioIn(totals, 30);
  noteAudioIn(totals, 30);
  noteAudioOut(totals, 12);

  assert.equal(totals.inSeconds, 60);
  assert.equal(totals.outSeconds, 12);
});

test("a run that has moved no audio costs nothing", () => {
  assert.equal(costOf(emptyUsage(), SIMUL_MODEL), 0);
});

test("an hour of continuous audio costs what the pricing page says per minute", () => {
  // The Live API bills audio at 25 tokens a second, so an hour each way is
  // 90,000 tokens in and 90,000 out. Google's other column gives the same hour
  // as a per-minute price, and the two have to agree — this is the check that
  // the per-token rates in RATES were not transcribed from the wrong row, and
  // the ceiling the panel cannot now climb past.
  const hour = emptyUsage();
  noteAudioIn(hour, 3600);
  noteAudioOut(hour, 3600);

  const simul = costOf(hour, SIMUL_MODEL); // $0.0053 + $0.0315 a minute
  const flash = costOf(hour, MODEL); // $0.005 + $0.018 a minute
  assert.ok(Math.abs(simul - 60 * (0.0053 + 0.0315)) < 0.05, `${simul} is not ≈ $2.21`);
  assert.ok(Math.abs(flash - 60 * (0.005 + 0.018)) < 0.05, `${flash} is not ≈ $1.38`);
});

test("a cent takes 16 seconds of continuous audio, not three", () => {
  // #16 in one line. The report was a cent every few seconds in Simultaneous
  // mode; the published rate cannot produce one faster than this even with both
  // directions saturated, so anything quicker is the meter and not the model.
  const second = emptyUsage();
  noteAudioIn(second, 1);
  noteAudioOut(second, 1);
  const secondsPerCent = 0.01 / costOf(second, SIMUL_MODEL);

  assert.ok(secondsPerCent > 15, `a cent every ${secondsPerCent.toFixed(1)}s is too fast`);
  assert.ok(secondsPerCent < 18, `a cent every ${secondsPerCent.toFixed(1)}s is too slow`);
});

test("output is the expensive side, by six to one", () => {
  const spoken = noteAudioOut(emptyUsage(), 60);
  const heard = noteAudioIn(emptyUsage(), 60);
  assert.equal(costOf(spoken, SIMUL_MODEL) / costOf(heard, SIMUL_MODEL), 21.0 / 3.5);
});

test("an unknown model is priced as the more expensive of the two", () => {
  const totals = noteAudioOut(emptyUsage(), 600);
  assert.equal(costOf(totals, "models/whatever-comes-next"), costOf(totals, SIMUL_MODEL));
});

test("the two directions merge into one run total", () => {
  const tab = noteAudioOut(noteAudioIn(emptyUsage(), 100), 40);
  const mic = noteAudioOut(noteAudioIn(emptyUsage(), 30), 10);
  const both = mergeUsage(mergeUsage(emptyUsage(), tab), mic);

  assert.equal(both.inSeconds, 130);
  assert.equal(both.outSeconds, 50);
  assert.equal(tab.inSeconds, 100, "the operands are left alone");
});

test("durations read at a glance and a cost never rounds to free", () => {
  assert.equal(formatDuration(0), "0s");
  assert.equal(formatDuration(43.2), "43s");
  assert.equal(formatDuration(60), "1 min");
  assert.equal(formatDuration(1100), "18 min");

  assert.equal(formatCost(0), "$0.00");
  assert.equal(formatCost(0.0004), "<$0.01");
  assert.equal(formatCost(0.31), "$0.31");
  assert.equal(formatCost(12.5), "$12.50");
});
