/**
 * What a run has spent, from the audio it actually moved.
 *
 * Interpretab bills the user's own key and, until now, gave them no number for
 * it: the side panel's only cost signalling was a static sentence warning that
 * two directions cost roughly double.
 *
 * The first version of this module priced the `usageMetadata` the Live API
 * attaches to its server messages, summing every frame on the documented
 * reading that each one describes a single turn. In use the figure climbed
 * three to five times faster than Google's own per-minute prices allow (#16),
 * which means the frames are not what that reading assumes — either the same
 * turn-cumulative counts ride on every chunk of a turn, or each turn re-reports
 * the context it retained. Both make a sum wrong, and nothing in a frame says
 * which is happening, so a heuristic over the frames is a guess about somebody
 * else's money.
 *
 * There is no need to guess. Google states the billing basis in as many words —
 * "billing is based on total input and output audio token consumption,
 * calculated at a rate of 25 tokens per second of audio" — and this extension
 * owns both ends of that audio. Every PCM frame put on the wire and every one
 * played back is counted here, at 25 tokens a second, against the same rate
 * table. The result is arithmetic rather than an estimate of an estimate: it
 * cannot drift from the published per-hour price, because it is derived from
 * it.
 *
 * What is given up is the server's own opinion. `usageMetadata` still arrives
 * and `SessionLoop` still forwards it, but nothing in the extension reads it:
 * `tests/live-smoke.mjs` is where the two readings get compared against a real
 * session, and a number nobody can see is not worth carrying through three
 * layers to reach a panel that will not print it.
 *
 * The price table below goes stale silently, so it is in one place with the
 * date it was read, and everything printed from it is marked as an estimate.
 */

import { MODEL, SIMUL_MODEL } from "./languages.js";

/** What the Live API charges a second of audio as, in either direction. */
export const AUDIO_TOKENS_PER_SECOND = 25;

/**
 * US dollars per million tokens, from ai.google.dev/gemini-api/docs/pricing,
 * read on 17 August 2026. Paid-tier rates: the free tier bills nothing, so a
 * user inside it sees an estimate of what they are not being charged, which is
 * the right way round for a number meant to prevent a surprise.
 *
 * Only the audio rates are used. Live Translate publishes nothing else and
 * bills everything as audio; Flash Live prices its transcript text separately
 * and far lower, and leaving it out understates a conversation-mode run by a
 * few percent — the direction to be wrong in is not the one that invents a
 * charge.
 */
export const RATES = {
  [SIMUL_MODEL]: { audioIn: 3.5, audioOut: 21.0 },
  [MODEL]: { audioIn: 3.0, audioOut: 12.0 },
};

/** A run's tally for one direction: seconds of audio, each way. */
export function emptyUsage() {
  return { inSeconds: 0, outSeconds: 0 };
}

/** Count audio sent to the model, in seconds. */
export function noteAudioIn(totals, seconds) {
  totals.inSeconds += Math.max(0, seconds) || 0;
  return totals;
}

/** Count audio the model sent back, in seconds. */
export function noteAudioOut(totals, seconds) {
  totals.outSeconds += Math.max(0, seconds) || 0;
  return totals;
}

/** Add *from* into *into*, in place — two directions into one run total. */
export function mergeUsage(into, from) {
  if (!from) return into;
  into.inSeconds += from.inSeconds;
  into.outSeconds += from.outSeconds;
  return into;
}

/** What *totals* cost on *model*, in US dollars. Unknown models price as audio. */
export function costOf(totals, model) {
  const rate = RATES[model] || RATES[SIMUL_MODEL];
  return (
    ((totals.inSeconds * rate.audioIn + totals.outSeconds * rate.audioOut) *
      AUDIO_TOKENS_PER_SECOND) /
    1e6
  );
}

/**
 * A duration, as the side panel says it: seconds under a minute, then minutes.
 * Nothing here is to the second — it is there to make the price legible, not
 * to be a stopwatch.
 */
export function formatDuration(seconds) {
  const whole = Math.max(0, Math.round(seconds));
  if (whole < 60) return `${whole}s`;
  return `${Math.round(whole / 60)} min`;
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
