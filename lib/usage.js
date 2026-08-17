/**
 * What a run has spent, from what the server says it used.
 *
 * Interpretab bills the user's own key and, until now, gave them no number for
 * it: the side panel's only cost signalling was a static sentence warning that
 * two directions cost roughly double. The Live API attaches `usageMetadata` to
 * its server messages and the extension was dropping every one of them, so this
 * is a matter of reading a field already arriving rather than of asking for
 * anything new.
 *
 * Two decisions are baked in here.
 *
 * **Frames are summed, not read as a running total.** `UsageMetadata` documents
 * `promptTokenCount` as the tokens of *the* request and `responseTokenCount` as
 * those of *the* response, and every SDK that surfaces it in a live session
 * accumulates across events rather than reading the last one. So each frame is
 * a turn's worth and they add up. The risk this carries is on the input side: if
 * the server re-reports retained context with each turn, summing counts it more
 * than once and the input estimate drifts high. Output, which is five to six
 * times the price of input on both models here, is unambiguous either way.
 * `tests/live-smoke.mjs` prints both readings of a real run and says which
 * shape the per-frame totals had, which is the cheapest way to check this
 * against the API rather than against the docs.
 *
 * **Money is shown as well as tokens.** Tokens are always right and mean nothing
 * to the person paying; the price table below goes stale silently. Both are
 * printed, the money is marked as an estimate, and the rates live in one place
 * with the date they were read.
 */

import { MODEL, SIMUL_MODEL } from "./languages.js";

/**
 * US dollars per million tokens, from ai.google.dev/gemini-api/docs/pricing,
 * read on 17 August 2026. Paid-tier rates: the free tier bills nothing, so a
 * user inside it sees an estimate of what they are not being charged, which is
 * the right way round for a number meant to prevent a surprise.
 *
 * Live Translate publishes audio rates only, and says so in as many words —
 * "billing is based on total input and output audio token consumption,
 * calculated at a rate of 25 tokens per second of audio" — so everything it
 * reports is priced as audio. Flash Live prices text separately and much lower,
 * which matters because it is the mode that transcribes as well as speaks.
 */
export const RATES = {
  [SIMUL_MODEL]: { audioIn: 3.5, textIn: 3.5, audioOut: 21.0, textOut: 21.0 },
  [MODEL]: { audioIn: 3.0, textIn: 0.75, audioOut: 12.0, textOut: 4.5 },
};

/** A run's tally for one direction. Tokens split the way the rates are. */
export function emptyUsage() {
  return {
    input: { audio: 0, text: 0, other: 0 },
    output: { audio: 0, text: 0, other: 0 },
    total: 0,
    frames: 0,
  };
}

/**
 * Fold one `usageMetadata` frame into *totals*, in place.
 *
 * The modality breakdown is a list of `{modality, tokenCount}` and is not
 * promised: a model that sends none, or that sends details adding up to less
 * than the count beside them, leaves a remainder. That remainder is priced as
 * audio rather than as text — audio is four to six times the price, and a cost
 * estimate that errs should err upwards.
 */
export function addUsage(totals, meta) {
  if (!meta) return totals;
  const prompt = Number(meta.promptTokenCount) || 0;
  const response = Number(meta.responseTokenCount) || 0;
  split(totals.input, prompt, meta.promptTokensDetails);
  split(totals.output, response, meta.responseTokensDetails);
  totals.total += Number(meta.totalTokenCount) || prompt + response;
  totals.frames += 1;
  return totals;
}

function split(bucket, count, details) {
  let named = 0;
  for (const detail of details || []) {
    const tokens = Number(detail?.tokenCount) || 0;
    const modality = String(detail?.modality || "").toUpperCase();
    if (modality === "TEXT") bucket.text += tokens;
    else if (modality === "AUDIO") bucket.audio += tokens;
    else bucket.other += tokens;
    named += tokens;
  }
  // Whatever the details did not account for, including the whole count when
  // there were none.
  if (count > named) bucket.audio += count - named;
}

/** Add *from* into *into*, in place — two directions into one run total. */
export function mergeUsage(into, from) {
  if (!from) return into;
  for (const side of ["input", "output"]) {
    for (const kind of ["audio", "text", "other"]) into[side][kind] += from[side][kind];
  }
  into.total += from.total;
  into.frames += from.frames;
  return into;
}

/** What *totals* cost on *model*, in US dollars. Unknown models price as audio. */
export function costOf(totals, model) {
  const rate = RATES[model] || RATES[SIMUL_MODEL];
  const { input, output } = totals;
  return (
    ((input.audio + input.other) * rate.audioIn +
      input.text * rate.textIn +
      (output.audio + output.other) * rate.audioOut +
      output.text * rate.textOut) /
    1e6
  );
}

/** 930, 84k, 1.2M — a token count at a glance rather than to the digit. */
export function formatTokens(n) {
  if (n < 1000) return String(Math.round(n));
  if (n < 1e6) return `${Math.round(n / 1000)}k`;
  return `${(n / 1e6).toFixed(1)}M`;
}

/**
 * A cost, in dollars, at two decimal places — with a floor rather than
 * `$0.00`, which reads as "this is free" when it means "this is less than a
 * cent so far".
 */
export function formatCost(dollars) {
  if (dollars <= 0) return "$0.00";
  if (dollars < 0.005) return "<$0.01";
  return `$${dollars.toFixed(2)}`;
}
