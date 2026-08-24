/**
 * A small JSON file on the project's own site, read a few times a day.
 *
 * Two things in this extension are facts about Google's service rather than
 * decisions of its own — which Live models exist, and what they cost — and both
 * are currently frozen into a shipped build. Google gives a preview model two
 * weeks' notice before it is shut down. A Chrome Web Store review takes, in
 * Google's own words on the submission dialog, "up to several weeks". So the
 * mechanism for correcting a model name cannot be a new version: the notice
 * period is shorter than the fix.
 *
 * Hence a file the extension reads at runtime:
 *
 *     https://kazunori279.github.io/interpretab/config.json
 *
 * **It is data and never logic.** Chrome's MV3 rules forbid remotely hosted
 * *code* and explicitly sanction the opposite of it — "your extension loads and
 * caches a remote configuration (for example a JSON file) at runtime". The line
 * that gets crossed is interpreting the file: a JSON document describing steps
 * to execute is an interpreter whatever its MIME type. Nothing here is executed,
 * evaluated, or rendered as markup. Every field is a model name, a number, a
 * version string or a URL, and every one of them is validated against a shape
 * this file declares before it reaches anything.
 *
 * **A missing answer changes nothing.** Every value has a bundled counterpart
 * that is correct on the day the build ships, and the remote copy only ever
 * replaces one. An offline user, a 404, a truncated body and a file whose
 * `schemaVersion` this build does not know all land in the same place as never
 * having asked. The one direction this must not fail in is stopping a run that
 * would have worked, so `isBlocked` is false for all of them.
 *
 * **The site, not the repository.** `raw.githubusercontent.com` serves the same
 * file with the same `access-control-allow-origin: *`, which is what lets either
 * be fetched without a host permission — an extension service worker's `fetch`
 * is subject to CORS, and a server answering `*` satisfies it, so this costs no
 * new permission warning and cannot disable the extension on update. GitHub
 * Pages wins on being the host already named in the store listing and in the
 * guide: a connection to somewhere the user has been told about is a smaller
 * claim than a new one.
 *
 * The request carries no query string, no key, no version and no identifier. It
 * is a plain GET of a static file, which is the least that can be sent while
 * still receiving the file, and it is disclosed in PRIVACY.md and switchable off
 * in Options.
 */

/** Where the file lives. No query string, ever — see the note above. */
export const CONFIG_URL = "https://kazunori279.github.io/interpretab/config.json";

/**
 * The format this build understands.
 *
 * A file declaring anything else is ignored whole rather than read for the parts
 * that still parse. That is what makes the format changeable at all: the day a
 * field has to mean something different, the version goes up and every build
 * that predates the change falls back to what it shipped with, instead of
 * reading the new file through the old rules.
 */
export const SCHEMA_VERSION = 1;

/** How long a cached copy is used before another fetch is attempted. */
export const TTL_MS = 6 * 60 * 60 * 1000;

/**
 * The same, for a build the last answer said is blocked.
 *
 * A block is the one verdict a mistake in this file could inflict on every user
 * at once, so the recovery path is the one that has to be quick: a corrected
 * file reaches a blocked user on their next panel open rather than six hours
 * later.
 */
export const BLOCKED_TTL_MS = 15 * 60 * 1000;

/** Long enough for a static file on a CDN, short enough not to hold up Start. */
export const FETCH_TIMEOUT_MS = 4000;

/**
 * The most this file may be.
 *
 * It is a few hundred bytes of model names. The cap is not about disk — it is
 * that `JSON.parse` on an unbounded body is the one way a static file can cost
 * something, and the body is read as text before it is parsed so that the length
 * can be checked at all.
 */
export const MAX_BYTES = 64 * 1024;

/** Where the last good answer is kept, with when it arrived. */
const STORAGE_KEY = "remoteConfig";

/**
 * Where `learnMoreUrl` is allowed to point.
 *
 * The field exists so the update dialog can offer "what happened?" against a
 * page written after the build shipped. Left unconstrained it is also a way to
 * send every user of this extension to an arbitrary site, which is a much larger
 * thing than the feature needs. Two prefixes, both the project's own.
 */
const LINK_PREFIXES = ["https://kazunori279.github.io/interpretab/", "https://github.com/kazunori279/interpretab"];

/** A Live model id: lowercase, digits, dots and dashes. */
const MODEL_NAME = /^[a-z0-9][a-z0-9.-]{0,63}$/;

/** One to four dot-separated integers, which is what a Chrome version is. */
const VERSION = /^\d{1,5}(\.\d{1,5}){0,3}$/;

/** A day, as this file writes one: `2026-08-24`. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** At most this many candidates per direction, so a bad file cannot make a loop long. */
const MAX_MODELS = 8;

/** Dollars per million tokens. Above this, the file is wrong rather than expensive. */
const MAX_RATE = 1000;

/**
 * Read *text* as a config, or return null.
 *
 * Null means "no opinion" everywhere it is used, so every rejection below is a
 * fallback to the bundled values rather than a failure. Pure, and separate from
 * the fetch, because every branch in here is worth a test and none of them needs
 * a network.
 */
export function parseConfig(text) {
  if (typeof text !== "string" || text.length > MAX_BYTES) return null;
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (raw.schemaVersion !== SCHEMA_VERSION) return null;

  return {
    models: {
      simul: modelList(raw.models?.simul),
      conversation: modelList(raw.models?.conversation),
    },
    rates: rateTable(raw.rates),
    modelInfo: modelDates(raw.modelInfo),
    blockBelowVersion: threshold(raw.blockBelowVersion),
    learnMoreUrl: link(raw.learnMoreUrl),
  };
}

/** A candidate list, or null for "the file did not say". */
function modelList(value) {
  if (!Array.isArray(value)) return null;
  const names = value.filter((name) => typeof name === "string" && MODEL_NAME.test(name));
  // A list that lost entries to validation is a list this build does not
  // understand, and guessing which half was meant is worse than using none of
  // it. An empty list in the file means the same thing.
  if (!names.length || names.length !== value.length || names.length > MAX_MODELS) return null;
  return names;
}

/** `{ model: { audioIn, audioOut } }`, keeping only entries that are wholly valid. */
function rateTable(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const table = {};
  for (const [model, rate] of Object.entries(value)) {
    if (!MODEL_NAME.test(model)) continue;
    const audioIn = price(rate?.audioIn);
    const audioOut = price(rate?.audioOut);
    if (audioIn === null || audioOut === null) continue;
    table[model] = { audioIn, audioOut };
  }
  return Object.keys(table).length ? table : null;
}

/**
 * What is known about a model beyond its name: `{ model: { since, retiring } }`.
 *
 * Two dates, and only dates. `since` is the day this project first got a session
 * out of the name, which is what lets Options mark one as new; `retiring` is the
 * day Google says it stops answering, which is what lets a migration happen
 * while the old model still works instead of at the moment it stops.
 *
 * Deliberately a sibling of `models` rather than a richer entry inside it. The
 * lists are arrays of strings in every build that has shipped, and a build that
 * met an array of objects there would read no models at all — where an unknown
 * field is simply not looked at. So this arrives without a `schemaVersion` bump,
 * and an old build ignores it and behaves exactly as it did.
 *
 * A name with neither date is dropped: the entry would say nothing, and the
 * callers all ask "what does the file know about this name" rather than "is this
 * name in the table".
 */
function modelDates(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const table = {};
  for (const [model, info] of Object.entries(value)) {
    if (!MODEL_NAME.test(model)) continue;
    const since = day(info?.since);
    const retiring = day(info?.retiring);
    if (!since && !retiring) continue;
    table[model] = {};
    if (since) table[model].since = since;
    if (retiring) table[model].retiring = retiring;
  }
  return Object.keys(table).length ? table : null;
}

/**
 * A calendar day, or "".
 *
 * The pattern is not enough on its own: `2026-02-31` is four digits, two and
 * two, and not a day. Round-tripping through `Date` is what says so — an
 * overflowing day comes back as the first of the next month and stops matching
 * the string it came from.
 */
function day(value) {
  if (typeof value !== "string" || !DAY.test(value)) return "";
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(value) ? value : "";
}

function price(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > MAX_RATE) return null;
  return value;
}

/**
 * A version string, or "" for "the file did not say".
 *
 * The type check is not redundant with the pattern: `RegExp.test` coerces, so a
 * bare `1` in the JSON would pass as a version and then travel on as a number
 * through everything downstream that expects a string.
 */
function threshold(value) {
  return typeof value === "string" && VERSION.test(value) ? value : "";
}

function link(value) {
  if (typeof value !== "string") return "";
  return LINK_PREFIXES.some((prefix) => value.startsWith(prefix)) ? value : "";
}

/**
 * Compare two dotted version strings: -1, 0 or 1.
 *
 * Missing components count as zero, so `1.0` and `1.0.0` are the same version.
 * Anything that is not a version compares as lower than everything, which is the
 * safe direction only because the one caller checks the *other* operand first.
 */
export function compareVersions(a, b) {
  const left = String(a || "").split(".");
  const right = String(b || "").split(".");
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const x = Number(left[i] || 0);
    const y = Number(right[i] || 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Must this build stop until it is updated?
 *
 * True only when a valid config names a valid threshold this build is below.
 * Every other state — no config, no threshold, an unparseable version on either
 * side — is false, because the cost of being wrong runs one way: refusing to
 * translate for someone whose extension works is worse than translating with one
 * that is about to fail on its own and say why.
 */
export function isBlocked(config, version) {
  const floor = config?.blockBelowVersion;
  if (!floor || !VERSION.test(floor)) return false;
  if (!VERSION.test(String(version || ""))) return false;
  return compareVersions(version, floor) < 0;
}

/**
 * The models to try for one direction, best first.
 *
 * *bundled* is the model this build shipped with, and it is always in the list —
 * appended when the file does not mention it, kept where it is when it does. A
 * config listing only names that turn out to be unreachable would otherwise be a
 * way to brick every installation from a text file, and the shipped model is the
 * one candidate known to have worked at some point.
 *
 * *preferred* is the name the user picked in Options, and it is a *reordering*
 * and never a filter: it moves to the front, everything else keeps its order
 * behind it, and nothing is dropped. Two things follow from that, both of them
 * the point. A choice cannot strand anyone — every other candidate is still
 * there to fall back to — and a choice expires by itself, because a name the
 * file has stopped listing is not in the list to be moved and the run goes back
 * to the recommended order without asking anybody. Options says so when it
 * happens; nothing here needs to.
 */
export function modelCandidates(bundled, listed, preferred = "") {
  const names = Array.isArray(listed) && listed.length ? [...listed] : [];
  if (!names.includes(bundled)) names.push(bundled);
  const wanted = names.indexOf(preferred);
  if (wanted > 0) names.splice(0, 0, ...names.splice(wanted, 1));
  return names;
}

/**
 * Fetch and validate, or null.
 *
 * Never rejects. `fetchImpl` and `timeoutMs` are seams for the tests, which is
 * also why nothing in here reads storage.
 */
export async function fetchConfig({ fetchImpl = fetch, timeoutMs = FETCH_TIMEOUT_MS } = {}) {
  let res;
  try {
    res = await fetchImpl(CONFIG_URL, {
      method: "GET",
      // No credentials, no referrer, no cookies. There is nothing to send and
      // no reason for GitHub to be told which page asked.
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return null;
  }
  if (!res || !res.ok) return null;
  try {
    return parseConfig(await res.text());
  } catch {
    return null;
  }
}

/** The cached answer and when it arrived, or an empty envelope. */
export async function readCached() {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const envelope = stored?.[STORAGE_KEY];
  if (!envelope || typeof envelope !== "object") return { at: 0, data: null };
  return { at: Number(envelope.at) || 0, data: envelope.data || null };
}

/**
 * The config to use now, fetching a fresh one when the cached copy is old.
 *
 * The cached copy is kept when a fetch fails, so a user who goes offline holds
 * whatever they last learned rather than reverting — including a block, which
 * would otherwise be liftable by pulling out the network cable.
 *
 * @param {object} [opts]
 * @param {string} [opts.version]   this build, for deciding which TTL applies
 * @param {boolean} [opts.force]    fetch regardless of the TTL
 * @param {() => number} [opts.now] seam for the tests
 */
export async function ensureConfig({ version = "", force = false, now = Date.now, ...rest } = {}) {
  const cached = await readCached();
  const ttl = isBlocked(cached.data, version) ? BLOCKED_TTL_MS : TTL_MS;
  if (!force && cached.at && now() - cached.at < ttl) return cached.data;

  const fetched = await fetchConfig(rest);
  if (!fetched) return cached.data;
  await chrome.storage.local.set({ [STORAGE_KEY]: { at: now(), data: fetched } });
  return fetched;
}

/** Forget the cached copy, for the Options switch that turns this off. */
export async function clearCached() {
  await chrome.storage.local.remove(STORAGE_KEY);
}
