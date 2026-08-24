/**
 * Do the prices this build ships with still match the published file?
 *
 *     node tools/check-rates.mjs        # prints the difference, exits 1 if there is one
 *
 * `docs/config.json` is corrected by a workflow within a day of Google changing
 * a price, and every installed copy picks that up within six hours. The table in
 * `lib/usage.js` is not corrected by anything: it is what a fresh install prices
 * with before its first fetch, what a user who turned **Model updates** off in
 * Options prices with for good, and what an offline run falls back to. Those are
 * not hypothetical users, so the two tables drifting apart is a real wrong number
 * on somebody's screen — and until this script, nothing looked.
 *
 * **It is deliberately not a unit test.** `.github/workflows/model-discovery.yml`
 * runs `npm test` against the file the agent just wrote, *before* committing it.
 * A `npm test` assertion that the two tables agree would turn every price
 * correction the agent found into a red run that commits nothing, which is the
 * mechanism this is meant to protect. So the comparison runs as its own step,
 * after the commit, and the answer is an issue for a human rather than a failure.
 *
 * The fix for a difference is always the same and always a human's: copy the new
 * numbers into `lib/usage.js`, update the date in the comment above them, and
 * ship it in the next version. The agent does not get to edit shipped code — the
 * whole argument for letting it commit unattended is that it writes data and
 * never logic.
 */

import fs from "node:fs";
import path from "node:path";
import { RATES } from "../lib/usage.js";

const ROOT = path.join(import.meta.dirname, "..");
const CONFIG = path.join(ROOT, "docs", "config.json");

/**
 * Where *bundled* and *published* disagree, one entry per model.
 *
 * Only the models `lib/usage.js` hardcodes are compared. The file lists
 * fallbacks the build has never heard of and prices them too, which is the point
 * of the file; a name in one table and not the other is only a difference when
 * the build is the one missing it.
 *
 * `kind` is `"missing"` when the published file has no price for a model this
 * build ships — which is not drift so much as a hole, since `costOf` then falls
 * back to the bundled number anyway, but it is still somebody's mistake.
 */
export function rateDiff(bundled, published) {
  const out = [];
  for (const [model, ours] of Object.entries(bundled || {})) {
    const theirs = published?.[model];
    if (!theirs) {
      out.push({ model, kind: "missing", bundled: ours, published: null });
      continue;
    }
    if (theirs.audioIn !== ours.audioIn || theirs.audioOut !== ours.audioOut) {
      out.push({ model, kind: "differs", bundled: ours, published: theirs });
    }
  }
  return out;
}

/** One line per difference, in the form the issue body and the log both use. */
export function describeDiff(diff) {
  const rate = (r) => (r ? `in ${r.audioIn} / out ${r.audioOut}` : "no price");
  return diff.map((d) => `${d.model}: build says ${rate(d.bundled)}, config says ${rate(d.published)}`);
}

if (import.meta.filename === process.argv[1]) {
  const config = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  const diff = rateDiff(RATES, config.rates);
  const lines = describeDiff(diff);

  console.log(
    diff.length
      ? `lib/usage.js is behind docs/config.json:\n${lines.map((line) => `  ${line}`).join("\n")}`
      : "lib/usage.js and docs/config.json agree on every price this build ships",
  );

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `drift=${diff.length > 0}\nsummary=${lines.join("; ")}\n`,
    );
  }
  if (diff.length) process.exitCode = 1;
}
