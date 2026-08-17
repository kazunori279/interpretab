/**
 * The token tally and what it is priced at.
 *
 * The arithmetic here is the only thing standing between the side panel and a
 * wrong number about somebody's money, and none of it is visible in a manual
 * test: a session that reports 84,000 tokens looks exactly like one that
 * reports 84,000 tokens counted twice. The last case ties the whole table back
 * to the rate Google publishes per minute, which is the outside check — if the
 * pricing page moves and `RATES` does not, that is the test that says so.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { MODEL, SIMUL_MODEL } from "../lib/languages.js";
import {
  addUsage,
  costOf,
  emptyUsage,
  formatCost,
  formatTokens,
  mergeUsage,
} from "../lib/usage.js";

test("a frame's modality details land in their own buckets", () => {
  const totals = addUsage(emptyUsage(), {
    promptTokenCount: 1000,
    responseTokenCount: 600,
    totalTokenCount: 1600,
    promptTokensDetails: [
      { modality: "AUDIO", tokenCount: 900 },
      { modality: "TEXT", tokenCount: 100 },
    ],
    responseTokensDetails: [
      { modality: "AUDIO", tokenCount: 550 },
      { modality: "TEXT", tokenCount: 50 },
    ],
  });

  assert.deepEqual(totals.input, { audio: 900, text: 100, other: 0 });
  assert.deepEqual(totals.output, { audio: 550, text: 50, other: 0 });
  assert.equal(totals.total, 1600);
  assert.equal(totals.frames, 1);
});

test("frames add up: each one is a turn, not a running total", () => {
  const totals = emptyUsage();
  addUsage(totals, { promptTokenCount: 100, responseTokenCount: 200, totalTokenCount: 300 });
  addUsage(totals, { promptTokenCount: 150, responseTokenCount: 250, totalTokenCount: 400 });

  assert.equal(totals.total, 700);
  assert.equal(totals.input.audio, 250);
  assert.equal(totals.output.audio, 450);
  assert.equal(totals.frames, 2);
});

test("a count with no modality behind it is priced as audio, not as free", () => {
  // No details at all, and details that do not add up to the count beside them.
  const bare = addUsage(emptyUsage(), { promptTokenCount: 500, responseTokenCount: 100 });
  assert.deepEqual(bare.input, { audio: 500, text: 0, other: 0 });
  assert.deepEqual(bare.output, { audio: 100, text: 0, other: 0 });

  const partial = addUsage(emptyUsage(), {
    promptTokenCount: 500,
    promptTokensDetails: [{ modality: "TEXT", tokenCount: 200 }],
  });
  assert.deepEqual(partial.input, { audio: 300, text: 200, other: 0 });
});

test("an unknown modality is counted rather than dropped", () => {
  const totals = addUsage(emptyUsage(), {
    promptTokenCount: 300,
    promptTokensDetails: [{ modality: "VIDEO", tokenCount: 300 }],
  });
  assert.deepEqual(totals.input, { audio: 0, text: 0, other: 300 });
  // And priced: `other` goes at the audio rate, the pessimistic reading.
  assert.equal(costOf(totals, SIMUL_MODEL), (300 * 3.5) / 1e6);
});

test("a missing totalTokenCount falls back to prompt plus response", () => {
  const totals = addUsage(emptyUsage(), { promptTokenCount: 40, responseTokenCount: 60 });
  assert.equal(totals.total, 100);
});

test("an empty frame changes nothing", () => {
  const totals = addUsage(emptyUsage(), null);
  assert.deepEqual(totals, emptyUsage());
});

test("the two directions merge into one run total", () => {
  const tab = addUsage(emptyUsage(), { promptTokenCount: 100, responseTokenCount: 100 });
  const mic = addUsage(emptyUsage(), { promptTokenCount: 30, responseTokenCount: 70 });
  const both = mergeUsage(mergeUsage(emptyUsage(), tab), mic);

  assert.equal(both.total, 300);
  assert.equal(both.frames, 2);
  assert.equal(both.input.audio, 130);
  assert.equal(both.output.audio, 170);
  assert.equal(tab.total, 200, "the operands are left alone");
});

test("text is priced apart from audio on the model that publishes a text rate", () => {
  const totals = emptyUsage();
  totals.output.text = 1e6;
  // Flash Live: $4.50 per million text out, against $12.00 for audio.
  assert.equal(costOf(totals, MODEL).toFixed(2), "4.50");
  // Live Translate publishes audio rates only and bills everything as audio.
  assert.equal(costOf(totals, SIMUL_MODEL).toFixed(2), "21.00");
});

test("an unknown model is priced as the more expensive of the two", () => {
  const totals = emptyUsage();
  totals.output.audio = 1e6;
  assert.equal(costOf(totals, "models/whatever-comes-next"), costOf(totals, SIMUL_MODEL));
});

test("an hour of continuous audio costs what the pricing page says per minute", () => {
  // The Live API bills audio at 25 tokens a second, so an hour each way is
  // 90,000 tokens in and 90,000 out. Google's other column gives the same hour
  // as a per-minute price, and the two have to agree — this is the check that
  // the per-token rates in RATES were not transcribed from the wrong row.
  const hour = emptyUsage();
  hour.input.audio = 25 * 3600;
  hour.output.audio = 25 * 3600;

  const simul = costOf(hour, SIMUL_MODEL); // $0.0053 + $0.0315 a minute
  const flash = costOf(hour, MODEL); // $0.005 + $0.018 a minute
  assert.ok(Math.abs(simul - 60 * (0.0053 + 0.0315)) < 0.05, `${simul} is not ≈ $2.21`);
  assert.ok(Math.abs(flash - 60 * (0.005 + 0.018)) < 0.05, `${flash} is not ≈ $1.38`);
});

test("tokens read at a glance and a cost never rounds to free", () => {
  assert.equal(formatTokens(0), "0");
  assert.equal(formatTokens(930), "930");
  assert.equal(formatTokens(84_120), "84k");
  assert.equal(formatTokens(1_240_000), "1.2M");

  assert.equal(formatCost(0), "$0.00");
  assert.equal(formatCost(0.0004), "<$0.01");
  assert.equal(formatCost(0.31), "$0.31");
  assert.equal(formatCost(12.5), "$12.50");
});
