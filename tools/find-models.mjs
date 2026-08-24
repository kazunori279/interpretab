/**
 * Ask Gemini what the current Live models are, then check its answer and write
 * `docs/config.json`.
 *
 *     node tools/find-models.mjs <key-file>        # writes docs/config.json if changed
 *     node tools/find-models.mjs <key-file> --dry  # prints, writes nothing
 *
 * `tests/model-check.mjs` says *that* a model is gone. This is the other half:
 * what replaced it. The names are on Google's own documentation pages hours
 * before anything else knows about them, so the job is reading those pages —
 * which is a job for a model with a browser attached, not for a scraper this
 * repository would then have to maintain against someone else's HTML.
 *
 * **Nothing it says is trusted.** A language model reading release notes is a
 * plausible-name generator, and this file rewrites something every installed
 * copy of the extension reads within hours. So its output is a list of
 * *candidates*, and a candidate reaches `docs/config.json` only after
 * `checkModel` has opened a real Live session with it and got `setupComplete`
 * back. An invented name never verifies, so an invented name never ships.
 *
 * **It may only widen, and only forwards.** `mergeConfig` below can add a
 * verified name and correct a price. It cannot touch `blockBelowVersion` — the
 * one field that can stop every installation — and it cannot empty a list,
 * because a config with no names in it is a config that has given up on the one
 * job it has. Nor can it reach for an older generation: the point of the list is
 * somewhere to go when a preview is switched off, and a model nobody here has
 * ever measured on a translation is only worth falling back to if it is the
 * *successor*. It reorders a working list in one case only, below: a name with a
 * published shutdown date less than a week away gives up its place to a
 * successor that answered this morning, so that the move is made by a config
 * file rather than by everyone's session failing at once.
 *
 * **A price it could not read is said out loud.** Keeping the old number when no
 * new one arrives is the safe thing to do and leaves the file byte-identical to
 * a morning when nothing changed, so the run reports which models it got a price
 * for, stamps `ratesReadAt` only when that covers every name a session starts on,
 * and the workflow opens an issue once the date is three days behind. A quiet run
 * is not a clean bill of health here either.
 *
 * Two calls to the model rather than one. Grounding and a response schema fight
 * each other: the tools want to write prose with citations, the schema wants
 * nothing but JSON. So the first call reads the pages and answers in prose, and
 * the second turns that prose into JSON with no tools attached and nothing to
 * read but the first answer.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseConfig } from "../lib/remote-config.js";
import { MODEL, SIMUL_MODEL } from "../lib/languages.js";
import { apiKeyFrom, checkModel, listModels } from "../tests/model-check.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const CONFIG = path.join(ROOT, "docs", "config.json");

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "gcp-samples-ic0";
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "global";
const AGENT_MODEL = process.env.AGENT_MODEL || "gemini-3.5-flash";

/** The pages that carry a model name before anything else does. */
const SOURCES = [
  "https://ai.google.dev/gemini-api/docs/models",
  "https://ai.google.dev/gemini-api/docs/live",
  "https://ai.google.dev/gemini-api/docs/live-guide",
  "https://ai.google.dev/gemini-api/docs/changelog",
  "https://ai.google.dev/pricing",
];

/** Same cap as `parseConfig`, applied here so a long answer is cut before it is written. */
const MAX_MODELS = 8;

/**
 * Tool sets for the research call, tried in order.
 *
 * Both together answer best: measured on the same prompt, `url_context` alone
 * found two of the three current ids and `google_search` alone came back with
 * no text at all, while the pair found all three. But the pair is also what
 * returns `MALFORMED_FUNCTION_CALL` after thirty-five thousand tokens of
 * thinking, often enough to matter for something that runs unattended. So when
 * two goes with both have produced nothing, the run drops to the one tool that
 * has never malformed and takes the smaller answer.
 */
const TOOL_SETS = [
  [{ url_context: {} }, { google_search: {} }],
  [{ url_context: {} }],
];

const dry = process.argv.includes("--dry");

/**
 * A Vertex access token.
 *
 * In CI it arrives as an environment variable from `google-github-actions/auth`,
 * which mints it through Workload Identity Federation and never puts a
 * long-lived key in the repository. Locally it comes from whatever `gcloud` is
 * already signed in as.
 */
function accessToken() {
  const fromEnv = (process.env.VERTEX_ACCESS_TOKEN || "").trim();
  if (fromEnv) return fromEnv;
  return execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();
}

/**
 * The grounded call reads five pages before it answers and has taken four
 * minutes to do it, which is long enough to sit on the wrong side of every
 * default in the stack, and it fails in two ways that both look like success.
 *
 * One is `fetch failed`, whose message says nothing without its cause. The
 * other is stranger: HTTP 200, no `finishReason`, and `content.parts` empty,
 * with the usage record showing ten thousand tokens of thinking against a
 * hundred of answer. Returning "" from that is how a run that learned nothing
 * came to print "no change", which reads exactly like a clean bill of health.
 *
 * So both are retried, and if the last attempt still has nothing to show, this
 * throws. A red workflow is the honest result; a quiet one is not. The pause
 * between attempts is for the third failure seen in one run of this: a 429,
 * which retrying immediately only makes worse.
 */
const CALL_TIMEOUT_MS = 300_000;
const CALL_ATTEMPTS = 2;
const CALL_BACKOFF_MS = 20_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function generate(token, body) {
  const url =
    `https://aiplatform.googleapis.com/v1beta1/projects/${PROJECT}/locations/${LOCATION}` +
    `/publishers/google/models/${AGENT_MODEL}:generateContent`;
  const post = () =>
    fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });

  let last = "no attempt was made";
  for (let attempt = 1; attempt <= CALL_ATTEMPTS; attempt++) {
    if (attempt > 1) await sleep(CALL_BACKOFF_MS);
    let res;
    try {
      res = await post();
    } catch (err) {
      last = err.cause ? `${err.message}: ${err.cause.message || err.cause}` : err.message;
      console.warn(`Vertex ${AGENT_MODEL}: attempt ${attempt} — ${last}`);
      continue;
    }
    if (!res.ok) {
      const detail = `HTTP ${res.status} ${(await res.text()).slice(0, 400)}`;
      // A bad request will be bad every time; a 429 or a 503 will not.
      if (res.status < 500 && res.status !== 429) throw new Error(`Vertex ${AGENT_MODEL}: ${detail}`);
      last = detail;
      console.warn(`Vertex ${AGENT_MODEL}: attempt ${attempt} — ${last}`);
      continue;
    }
    const reply = await res.json();
    const candidate = reply.candidates?.[0];
    const text = (candidate?.content?.parts || []).map((p) => p.text || "").join("").trim();
    if (text) return text;
    const usage = reply.usageMetadata || {};
    last =
      `empty answer (finishReason ${candidate?.finishReason || "none"}, ` +
      `${usage.thoughtsTokenCount || 0} thinking tokens, ${usage.candidatesTokenCount || 0} answer tokens)`;
    console.warn(`Vertex ${AGENT_MODEL}: attempt ${attempt} — ${last}`);
  }
  throw new Error(`Vertex ${AGENT_MODEL}: ${last} — gave up after ${CALL_ATTEMPTS} attempts`);
}

/** Step one: read the pages and say, in prose, what is current and what is gone. */
function researchPrompt(broken) {
  return `You are checking which Google Gemini Live API models a Chrome extension should use today.

Read these pages: ${SOURCES.join(", ")}

The extension opens a BidiGenerateContent WebSocket and needs two kinds of model:

- "simul": a live *translation* model. It is given generationConfig.translationConfig
  with a target language, detects the source language itself, takes no system
  instruction, and speaks over the speaker rather than waiting for a turn. The
  extension currently asks for ${SIMUL_MODEL}.
- "conversation": a general native-audio Live model. It takes a system instruction,
  handles turns, and interprets between two declared languages. The extension
  currently asks for ${MODEL}.
${broken.length ? `\nThese names have stopped working and need successors: ${broken.join(", ")}.\n` : ""}
Report, with the page you got each fact from:

1. Every model id currently offered for each of those two kinds, newest first.
   Use exact ids as they appear in the API — for example gemini-3.1-flash-live-preview,
   not "Gemini 3.1 Flash Live". Only models that support bidiGenerateContent.
   Only ids at or above the generation the extension already asks for: a
   successor, the GA id of the same model, or a newer dated preview of it. An
   earlier generation is not a fallback, so do not list one.
2. For each id, the audio input and audio output price in US dollars per one
   million tokens, from the pricing page.
3. Whether any of the ids the extension currently asks for is marked deprecated,
   retired, or given a shutdown date. Where a page gives a date, quote it as it
   is written and say which page it is on.

If a page does not say, say that it does not say. Do not infer an id from a
product name, do not extrapolate a version number that no page shows, and do
not work out a shutdown date from how old a preview is.`;
}

const ANSWER_SCHEMA = {
  type: "OBJECT",
  properties: {
    simul: { type: "ARRAY", items: { type: "STRING" } },
    conversation: { type: "ARRAY", items: { type: "STRING" } },
    rates: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          model: { type: "STRING" },
          audioIn: { type: "NUMBER" },
          audioOut: { type: "NUMBER" },
        },
        required: ["model", "audioIn", "audioOut"],
      },
    },
    retired: { type: "ARRAY", items: { type: "STRING" } },
    // Only where a page prints one. This is the field that moves the default
    // off a working model, so a guessed date is a migration nobody asked for.
    retiring: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { model: { type: "STRING" }, date: { type: "STRING" } },
        required: ["model", "date"],
      },
    },
    notes: { type: "STRING" },
  },
  required: ["simul", "conversation", "rates", "retired", "notes"],
};

/** Step two: the same answer as JSON, with no tools and nothing new to read. */
async function extract(token, prose) {
  const text = await generate(token, {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Turn this report into JSON. Include only ids the report states outright; leave a list empty rather than guessing at one. Omit a price the report did not give. Put a shutdown date in "retiring" only if the report gives one for that id, as YYYY-MM-DD.\n\n---\n${prose}`,
          },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json", responseSchema: ANSWER_SCHEMA, temperature: 0 },
  });
  return JSON.parse(text);
}

/**
 * The generation in a model id: `gemini-3.1-flash-live-preview` is 3.1. Null
 * when there is no number to read, which is the answer to "is this newer?" that
 * this file is honest enough to give.
 */
function familyVersion(name) {
  const match = /^gemini-(\d+)\.(\d+)-/.exec(String(name || ""));
  return match ? Number(match[1]) * 1000 + Number(match[2]) : null;
}

/**
 * The id without its preview marker or date stamp, so that
 * `gemini-3.1-flash-live-preview`, `gemini-3.1-flash-live-preview-02-2026` and
 * the eventual `gemini-3.1-flash-live` all come out the same. A preview is
 * usually withdrawn the day one of those three publishes, and none of them
 * raises the generation number.
 */
function stem(name) {
  return String(name || "").replace(/-(preview|latest|exp)(-\d{2}-\d{4})?$/, "");
}

/**
 * What the file should say, given what it says now and what verified.
 *
 * Pure, and the only thing in this file that decides what gets committed —
 * `tests/model-tools.test.js` is about this function. The rules, in the order
 * they matter:
 *
 * - `schemaVersion`, `blockBelowVersion` and `learnMoreUrl` are copied across
 *   untouched. The emergency brake is not an agent's to pull.
 * - A list keeps the names it has that still work, in the order it has them: a
 *   working config is not improved by being reordered, and the first name is the
 *   one every session starts on.
 * - Verified newcomers go on the end, so a discovery is a fallback before it is
 *   a default, and the name that has been serving users stays in front until a
 *   human moves it — or until the one exception below.
 * - The exception: when the name in front has a shutdown date within
 *   `PROMOTE_WITHIN_DAYS`, the newest name behind it that verified today takes
 *   its place. This is the whole reason the dates are collected. Without it the
 *   default moves on the day the old model stops answering, which is a
 *   reconnection in the middle of somebody's sentence, for everyone at once;
 *   with it the move happens while the old name still works and is still in the
 *   list to fall back to.
 * - A name that verified *gone* is dropped — but never the last one. An empty
 *   list means "the file has no opinion", which is the opposite of what an
 *   outage should say.
 * - A price is corrected only when a finite, positive number arrived for a model
 *   that is in the merged lists. Rates for names nobody asks for are dropped.
 * - `ratesReadAt` moves to *today* only when a price arrived for every model a
 *   session actually starts on — the head of each list and the two in the build.
 *   A partial answer leaves the date where it was, so the field is a floor
 *   rather than a note of when the script last ran.
 * - `modelInfo` gains `since` for a name the file did not have yesterday, and
 *   `retiring` for a date a page printed. Neither is ever cleared by a run that
 *   failed to read one: an agent that could not open the changelog would
 *   otherwise erase a shutdown date that is still coming.
 *
 * @param {object} current   the parsed contents of docs/config.json
 * @param {Map<string, boolean>} verdict  `mode:model` → did a real session open
 * @param {{simul: string[], conversation: string[], rates: object[]}} found
 * @param {string} [today]   ISO date this run happened on; "" leaves the date alone
 */
export function mergeConfig(current, verdict, found, today = "") {
  // Keyed by mode as well as name, because the answer differs by mode: the
  // simultaneous frame carries `translationConfig` and the conversation frame a
  // system instruction, and a model that takes one may refuse the other.
  const keep = (mode, existing, candidates) => {
    const ruling = (name) => verdict.get(`${mode}:${name}`);
    const alive = (existing || []).filter((name) => ruling(name) !== false);

    // A newcomer has to be a step forward. Nobody here has measured any of these
    // on a translation, so the only reason to fall back to one is that it is
    // what replaced the name that went away — and an older generation never is.
    // Level with the newest name in hand counts only for the same model under
    // another label: the GA id, or a dated respin of the same preview.
    const known = [...alive, mode === "simul" ? SIMUL_MODEL : MODEL];
    const floor = Math.max(0, ...known.map(familyVersion).filter((v) => v !== null));
    const stems = new Set(known.map(stem));
    const forward = (name) => {
      const version = familyVersion(name);
      // Unreadable version, no opinion, no promotion. If that leaves the list
      // with nothing to fall back to, the outage issue is the right outcome:
      // a human reads the notes and decides, which is what naming this file
      // could not rank should cost.
      if (version === null) return false;
      return version > floor || (version === floor && stems.has(stem(name)));
    };

    const added = (candidates || []).filter(
      (name) => ruling(name) === true && !alive.includes(name) && forward(name),
    );
    const merged = [...alive, ...added].slice(0, MAX_MODELS);
    // Everything failed. Say nothing rather than nothing at all: the old list is
    // still the best guess, and `blockBelowVersion` is how a human says stop.
    return merged.length ? merged : existing;
  };

  const listed = {
    simul: keep("simul", current.models?.simul, found.simul),
    conversation: keep("conversation", current.models?.conversation, found.conversation),
  };
  const modelInfo = mergedInfo(current, listed, found, today);
  const models = {
    simul: promote("simul", listed.simul, verdict, modelInfo, today),
    conversation: promote("conversation", listed.conversation, verdict, modelInfo, today),
  };

  const named = namedModels(models);
  const rates = {};
  for (const [model, rate] of Object.entries(current.rates || {})) {
    if (named.has(model)) rates[model] = rate;
  }
  const reported = reportedRates(found);
  for (const [model, rate] of Object.entries(reported)) {
    if (named.has(model)) rates[model] = rate;
  }

  const everyPrice = [...frontlineModels(models)].every((name) => reported[name]);
  return {
    schemaVersion: current.schemaVersion,
    models,
    modelInfo,
    rates: Object.keys(rates).length ? rates : current.rates,
    ratesReadAt: everyPrice && today ? today : current.ratesReadAt || "",
    blockBelowVersion: current.blockBelowVersion,
    learnMoreUrl: current.learnMoreUrl,
  };
}

/**
 * A date a page printed, or "" — the same test `parseConfig` will apply, since
 * writing a date the extension's own parser drops is writing nothing.
 *
 * The pattern is not enough: `2026-02-31` is four digits, two and two, and not a
 * day. `Date` rolls it into March and stops matching the string it came from,
 * and `2026-13-45` does not parse at all.
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;
function day(value) {
  const text = String(value || "").trim();
  if (!DAY.test(text)) return "";
  const parsed = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(text) ? text : "";
}

/** The shutdown dates in an answer that are dates at all, keyed by model. */
export function reportedRetirements(found) {
  const table = {};
  for (const entry of found?.retiring || []) {
    const when = day(entry?.date);
    if (entry?.model && when) table[entry.model] = when;
  }
  return table;
}

/**
 * What the file should say about the lifetimes of the names in it.
 *
 * Two dates, and neither is load-bearing for a translation: `since` is how the
 * Options menu knows which candidate is the newer one, and `retiring` is the
 * deadline it shows and the trigger for the promotion below. Both are additive.
 * A run that reads nothing changes nothing here, and an entry for a name that
 * has left the file goes with it.
 *
 * `since` is the day the name first reached this file, not the day Google
 * published it — nobody here can know the second, and the first is the one the
 * menu is actually about: how long this project has had the name to look at.
 */
function mergedInfo(current, models, found, today) {
  const named = namedModels(models);
  const before = new Set([...(current.models?.simul || []), ...(current.models?.conversation || [])]);
  const table = {};
  for (const [model, dates] of Object.entries(current.modelInfo || {})) {
    if (!named.has(model)) continue;
    const since = day(dates?.since);
    const retiring = day(dates?.retiring);
    table[model] = {};
    if (since) table[model].since = since;
    if (retiring) table[model].retiring = retiring;
  }
  if (today) {
    for (const name of [...models.simul, ...models.conversation]) {
      if (before.has(name) || table[name]?.since) continue;
      table[name] = { since: today, ...table[name] };
    }
  }
  for (const [model, when] of Object.entries(reportedRetirements(found))) {
    if (named.has(model)) table[model] = { ...table[model], retiring: when };
  }
  for (const [model, dates] of Object.entries(table)) {
    if (!Object.keys(dates).length) delete table[model];
  }
  return table;
}

/**
 * How close a shutdown date has to be before the successor is moved in front.
 *
 * A week: long enough that the move is made by a config file rather than by a
 * failed connection, short enough that the model everybody is on is the one this
 * project has had the longest. Google's own notice period for a preview is two
 * weeks, so this is the second half of it.
 */
export const PROMOTE_WITHIN_DAYS = 7;

/**
 * The one place a working list is reordered.
 *
 * Only when the name in front is about to be switched off, only in favour of a
 * name that opened a real session today, and the old name stays in the list
 * behind it — so the worst case is the same reconnection that would have
 * happened anyway, a week earlier and with somewhere to fall back to.
 */
function promote(mode, list, verdict, info, today) {
  const [incumbent, ...rest] = list || [];
  if (!incumbent || !rest.length || !today) return list;
  const left = daysBetween(today, info[incumbent]?.retiring);
  if (left === null || left > PROMOTE_WITHIN_DAYS) return list;
  const successor = rest
    .filter((name) => verdict.get(`${mode}:${name}`) === true)
    .sort((a, b) => (familyVersion(b) ?? -1) - (familyVersion(a) ?? -1))[0];
  if (!successor) return list;
  return [successor, ...list.filter((name) => name !== successor)];
}

/**
 * The names the *build* is behind on: a list whose first entry is not the
 * constant compiled into `lib/languages.js`.
 *
 * Everything keeps working — the file is read within six hours of a change and
 * that first name is what a session starts on. What does not keep working is
 * anyone with model updates switched off, and any install made after the file
 * moves on: both run the bundled name until a new build ships. So this is the
 * standing reminder to move the constants and cut a release.
 */
export function modelDrift(models) {
  const behind = [];
  const [simul] = models?.simul || [];
  const [conversation] = models?.conversation || [];
  if (simul && simul !== SIMUL_MODEL) behind.push(`simul: ${SIMUL_MODEL} → ${simul}`);
  if (conversation && conversation !== MODEL) behind.push(`conversation: ${MODEL} → ${conversation}`);
  return behind;
}

/**
 * Every name the file may carry a price for: what it lists, plus the two
 * compiled into the build, which `modelCandidates` keeps as the last resort.
 */
function namedModels(models) {
  return new Set([...(models?.simul || []), ...(models?.conversation || []), SIMUL_MODEL, MODEL]);
}

/**
 * The names a price has to be found for: the head of each list, plus the two in
 * the build.
 *
 * Not the whole file. The rest are fallbacks nobody is on until a model is
 * withdrawn, and Google's pricing page stops listing a preview about when it
 * stops serving it — so requiring a price for every name would leave the date
 * pinned to the oldest entry and an issue nobody can close. A fallback with no
 * price anywhere is priced as simultaneous translation, the dearer of the two,
 * which is the direction to be wrong in.
 */
function frontlineModels(models) {
  return new Set([(models?.simul || [])[0], (models?.conversation || [])[0], SIMUL_MODEL, MODEL].filter(Boolean));
}

/**
 * The prices in an answer that are usable at all, keyed by model.
 *
 * A rate is taken only as a pair of finite positive numbers. Zero is rejected
 * along with the rest: the free tier is a property of the key, not of the model,
 * and a model that costs nothing per token is a page that was misread.
 */
export function reportedRates(found) {
  const table = {};
  for (const rate of found?.rates || []) {
    const audioIn = Number(rate?.audioIn);
    const audioOut = Number(rate?.audioOut);
    if (!Number.isFinite(audioIn) || !Number.isFinite(audioOut) || audioIn <= 0 || audioOut <= 0) continue;
    table[rate.model] = { audioIn, audioOut };
  }
  return table;
}

/**
 * The models in *config* this run came back with no price for.
 *
 * `mergeConfig` keeps the old number when no new one arrives, which is the right
 * thing to do and, from outside, identical to a price that has not changed.
 * Google raising a price and the agent failing to read the page leave the same
 * bytes behind; this list is the only thing that tells the two apart.
 */
export function unpricedModels(config, found) {
  const reported = reportedRates(found);
  return [...frontlineModels(config?.models)].filter((name) => !reported[name]);
}

/**
 * Whole days from one ISO date to another, or null if either is not one.
 *
 * Null means "never confirmed", which counts as stale: a file that has never
 * had its prices read is not fresher than one that had them read a week ago.
 */
export function daysBetween(from, to) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86_400_000);
}

/**
 * How long a run may fail to confirm a price before somebody is told.
 *
 * One quiet morning is the grounded call having a bad day, and this repository
 * has seen plenty of those. Three in a row is the pricing page having moved,
 * the prompt having rotted, or a price that is now wrong in the panel.
 */
export const STALE_AFTER_DAYS = 3;

/** Is the price table old enough to be worth an issue? */
export function pricesAreStale(unpriced, ratesReadAt, today) {
  if (!unpriced.length) return false;
  const age = daysBetween(ratesReadAt, today);
  return age === null || age >= STALE_AFTER_DAYS;
}

/** The file, formatted the way the committed one is: two spaces, lists on one line. */
export function formatConfig(config) {
  const list = (names) => `[${names.map((name) => JSON.stringify(name)).join(", ")}]`;
  const rates = Object.entries(config.rates || {})
    .map(([model, r]) => `    ${JSON.stringify(model)}: { "audioIn": ${r.audioIn}, "audioOut": ${r.audioOut} }`)
    .join(",\n");
  // Left out entirely until there is something to say, so the day the file first
  // learns a date is a diff about that date and not about a block of braces.
  const info = Object.entries(config.modelInfo || {})
    .map(([model, dates]) => {
      const pairs = Object.entries(dates).map(([key, value]) => `"${key}": ${JSON.stringify(value)}`);
      return `    ${JSON.stringify(model)}: { ${pairs.join(", ")} }`;
    })
    .join(",\n");
  return `{
  "schemaVersion": ${config.schemaVersion},
  "models": {
    "simul": ${list(config.models.simul)},
    "conversation": ${list(config.models.conversation)}
  },
${info ? `  "modelInfo": {\n${info}\n  },\n` : ""}  "rates": {
${rates}
  },
  "ratesReadAt": ${JSON.stringify(config.ratesReadAt || "")},
  "blockBelowVersion": ${JSON.stringify(config.blockBelowVersion)},
  "learnMoreUrl": ${JSON.stringify(config.learnMoreUrl)}
}
`;
}

if (import.meta.filename === process.argv[1]) {
  const before = fs.readFileSync(CONFIG, "utf8");
  const current = JSON.parse(before);

  // What is already broken, so the research prompt can ask about it by name.
  const apiKey = apiKeyFrom(process.argv.slice(2));
  const listed = await listModels(apiKey);
  const existing = [
    ...(current.models?.simul || []).map((model) => ({ model, mode: "simul" })),
    ...(current.models?.conversation || []).map((model) => ({ model, mode: "conversation" })),
  ];
  const verdict = new Map();
  const broken = [];
  for (const target of existing) {
    const result = await checkModel(apiKey, listed, target);
    verdict.set(`${target.mode}:${target.model}`, result.healthy);
    if (!result.healthy) broken.push(target.model);
    console.log(`${result.healthy ? "ok  " : "gone"} ${target.model} (${target.mode})`);
  }

  const token = accessToken();
  console.log(`\nasking ${AGENT_MODEL} on ${PROJECT}/${LOCATION}...`);
  let prose = "";
  for (const tools of TOOL_SETS) {
    const named = tools.map((tool) => Object.keys(tool)[0]).join(" + ");
    try {
      prose = await generate(token, {
        contents: [{ role: "user", parts: [{ text: researchPrompt(broken) }] }],
        tools,
        generationConfig: { temperature: 0 },
      });
      console.log(`answered with ${named}`);
      break;
    } catch (err) {
      console.warn(`${named} got nowhere: ${err.message}`);
    }
  }
  if (!prose) throw new Error("no tool set produced an answer; nothing written");
  console.log(`\n--- what it read ---\n${prose}\n`);

  const found = await extract(token, prose);
  console.log(`--- candidates ---\n${JSON.stringify(found, null, 2)}\n`);

  // Every name it offered that we have not already ruled on, checked for real.
  // The catalogue is read again first: a name published while this run was
  // reading the docs would still be absent from the copy fetched at the top,
  // and `checkModel` calls an unlisted model gone whatever the socket says.
  const fresh = await listModels(apiKey);
  for (const [mode, names] of [["simul", found.simul], ["conversation", found.conversation]]) {
    for (const model of names || []) {
      if (verdict.has(`${mode}:${model}`)) continue;
      const result = await checkModel(apiKey, fresh, { model, mode });
      verdict.set(`${mode}:${model}`, result.healthy);
      console.log(`${result.healthy ? "verified" : "rejected"} ${model} (${mode})${result.healthy ? "" : ` — ${result.reason || "not listed"}`}`);
    }
  }

  // UTC, because the workflow runs at 03:17 UTC and a date that depends on the
  // runner's zone is a date that jumps a day for nobody's benefit.
  const today = new Date().toISOString().slice(0, 10);
  const merged = mergeConfig(current, verdict, found, today);
  const after = formatConfig(merged);

  // The file has to survive the extension's own parser, or a run of this script
  // is how every installed copy stops getting a config at all.
  const reparsed = parseConfig(after);
  if (!reparsed) throw new Error("the merged config does not survive parseConfig; nothing written");
  if (!reparsed.models.simul?.length || !reparsed.models.conversation?.length) {
    throw new Error("the merged config has an empty model list; nothing written");
  }
  if (reparsed.blockBelowVersion !== parseConfig(before)?.blockBelowVersion) {
    throw new Error("the merged config changed blockBelowVersion; nothing written");
  }

  const changed = after !== before;
  console.log(changed ? `\nchanged:\n${after}` : "\nno change");
  if (changed && !dry) fs.writeFileSync(CONFIG, after);

  // What the run did and did not learn about money. A price the agent failed to
  // read leaves the file byte-identical to a price that did not change, so the
  // difference between the two is only ever visible here.
  const unpriced = unpricedModels(merged, found);
  const stale = pricesAreStale(unpriced, merged.ratesReadAt, today);
  console.log(
    unpriced.length
      ? `\nno price reported for: ${unpriced.join(", ")} (last confirmed ${merged.ratesReadAt || "never"})`
      : `\nprices confirmed for every model a session starts on, as of ${today}`,
  );

  // The config has moved ahead of the build. Nothing is broken by that, so it is
  // a line of output and an issue rather than a red run.
  const drift = modelDrift(merged.models);
  if (drift.length) console.log(`\nthe build is behind the config — ${drift.join("; ")}`);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `changed=${changed}\nunpriced=${unpriced.join(" ")}\nratesReadAt=${merged.ratesReadAt}\n` +
        `pricesStale=${stale}\nmodelDrift=${drift.join("; ")}\n`,
    );
  }
  // The commit message is written here rather than assembled in the workflow:
  // the notes are several paragraphs of someone else's prose, and interpolating
  // that into a shell heredoc is a quoting bug waiting for the day it matters.
  if (changed && process.env.COMMIT_MESSAGE_FILE) {
    fs.writeFileSync(process.env.COMMIT_MESSAGE_FILE, commitMessage(verdict, found, merged));
  }
}

/** What the workflow commits, from what actually verified. */
export function commitMessage(verdict, found, merged) {
  const verified = [...verdict].filter(([, ok]) => ok).map(([key]) => key);
  const rejected = [...verdict].filter(([, ok]) => !ok).map(([key]) => key);
  const unpriced = unpricedModels(merged, found);
  return [
    "Point the config at the models that answered today",
    "",
    "Written by .github/workflows/model-discovery.yml. Every name committed here",
    "was verified by opening a real BidiGenerateContent session with it and",
    "getting setupComplete back, so a name the agent invented could not reach",
    "this file.",
    "",
    `Answered: ${verified.join(", ") || "none"}`,
    `Did not: ${rejected.join(", ") || "none"}`,
    `No price reported: ${unpriced.join(", ") || "none"}`,
    `Prices last confirmed: ${merged?.ratesReadAt || "never"}`,
    "",
    (found.notes || "").trim(),
    "",
  ].join("\n");
}
