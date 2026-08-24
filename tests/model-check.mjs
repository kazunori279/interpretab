/**
 * Are the models in `docs/config.json` still there?
 *
 *     node tests/model-check.mjs <key-file>
 *     GEMINI_API_KEY=... node tests/model-check.mjs --json
 *
 * `docs/config.json` is read by every installed copy of this extension within a
 * few hours of it changing, and the names in it are previews with about two
 * weeks to live. Nothing in the repository notices when one of them is switched
 * off — the extension notices, one user at a time, in the middle of a sentence.
 * So this asks the API directly, and `.github/workflows/model-health.yml` asks
 * it every hour.
 *
 * Two questions per model, because they fail separately:
 *
 * 1. **Is it listed, and does it do `bidiGenerateContent`?** One REST call for
 *    the whole list. A name that has been withdrawn disappears from it, and a
 *    name that is present but has lost the bidi method is a model this extension
 *    cannot use even though it exists.
 * 2. **Does a session actually open?** The list is a catalogue, not a promise.
 *    This opens the real socket with the real `setup` frame the extension sends
 *    — including `translationConfig`, which is the field a general-purpose model
 *    rejects — waits for `setupComplete`, and closes. No audio is sent, so a run
 *    costs two sessions and no tokens.
 *
 * Failures are separated into "the model is gone" and "something else went
 * wrong", using the same `isModelUnavailableClose` the extension's own fallback
 * keys on. That distinction is the point: a network blip at 03:00 must not be
 * reported as Google retiring a preview, and it must not be what sends an agent
 * off to rewrite the config file.
 *
 * The key is read from a file or the environment, never an argument, and is
 * never printed. The Live API takes it as a query parameter, so anything that
 * logged a handshake URL would leak it — see the note at the top of
 * `live-harness.mjs`.
 */

import fs from "node:fs";
import path from "node:path";
import { DEFAULTS } from "../lib/settings.js";
import { MODEL, SIMUL_MODEL } from "../lib/languages.js";
import { buildSetup, isModelUnavailableClose, LiveSession } from "../lib/live-session.js";
// `readKey` for the same reason as every other live script: the key comes from
// a file rather than an argument, and nothing here logs it.
import { readKey } from "./live-harness.mjs";
// `lib/live-session.js` writes its close reasons through `chrome.i18n`, which
// Node does not have. Without this every reason below is a bare message key,
// and `isModelUnavailableClose` then has no sentence to read.
import "./messages.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const CONFIG = path.join(ROOT, "docs", "config.json");

const REST = "https://generativelanguage.googleapis.com/v1beta/models";

/** How long a handshake may take before it is called a failure. */
const HANDSHAKE_MS = 30000;

const asJson = process.argv.includes("--json");

/**
 * The key, from a file or the environment. Callers must not log the result.
 *
 * A file for a local run, the same positional argument every other live script
 * here takes, so it stays out of the shell history and the process list. The
 * environment for CI, where the runner has no filesystem worth putting it on
 * and GitHub masks the value in the log.
 */
export function apiKeyFrom(argv) {
  const file = argv.find((arg) => !arg.startsWith("-"));
  if (file) return readKey(file);
  const env = (process.env.GEMINI_API_KEY || "").trim();
  if (!env) throw new Error("no key: pass a key file or set GEMINI_API_KEY");
  return env;
}

/**
 * Every model name this extension might ask for, and which mode asks for it.
 *
 * The config file's lists *and* the two names compiled into the build, because
 * `modelCandidates` always keeps the bundled name as the last resort — so a
 * bundled model quietly going away is a real outage that the config file, by
 * itself, says nothing about.
 */
export function modelsUnderTest(config) {
  const wanted = new Map();
  const add = (name, mode) => {
    if (typeof name === "string" && name) wanted.set(`${mode}:${name}`, { model: name, mode });
  };
  for (const name of config?.models?.simul || []) add(name, "simul");
  for (const name of config?.models?.conversation || []) add(name, "conversation");
  add(SIMUL_MODEL, "simul");
  add(MODEL, "conversation");
  return [...wanted.values()];
}

/**
 * The `setup` frame the extension would send for *mode*, with *model* in it.
 *
 * Built by `buildSetup` rather than hand-written, so that a change to what this
 * extension asks for is a change to what this checks. The two modes differ in
 * more than the name: simultaneous carries `translationConfig` and no system
 * instruction, conversation the other way round.
 */
export function setupFor(mode, model) {
  const settings =
    mode === "simul"
      ? { ...DEFAULTS, micMode: "simul" }
      : { ...DEFAULTS, micMode: "conversation" };
  const frame = buildSetup(mode === "simul" ? "tab" : "mic", settings, []);
  return { setup: { ...frame.setup, model: `models/${model}` } };
}

/** `ListModels`, as a name → supported-methods map. Throws on an HTTP failure. */
export async function listModels(apiKey) {
  const found = new Map();
  let pageToken = "";
  do {
    const url = `${REST}?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ""}`;
    // The key goes in a header, not the query string, so that a thrown error
    // carrying the URL cannot carry the key with it.
    const res = await fetch(url, { headers: { "x-goog-api-key": apiKey } });
    if (!res.ok) throw new Error(`ListModels: HTTP ${res.status}`);
    const body = await res.json();
    for (const model of body.models || []) {
      found.set(String(model.name || "").replace(/^models\//, ""), model.supportedGenerationMethods || []);
    }
    pageToken = body.nextPageToken || "";
  } while (pageToken);
  return found;
}

/**
 * Open a real session for *model* in *mode*, and close it.
 *
 * Resolves either way — a failed handshake is a result, not an exception — with
 * the server's own sentence when there was one. `gone` is the classification the
 * extension's fallback makes, reached through the same function, so a change to
 * that judgement changes both at once.
 */
export async function handshake(apiKey, mode, model) {
  const session = new LiveSession({ apiKey, setup: setupFor(mode, model), onEvent: () => {} });
  const timeout = new Promise((resolve) =>
    setTimeout(() => resolve({ ok: false, reason: `no answer in ${HANDSHAKE_MS / 1000}s` }), HANDSHAKE_MS)
  );
  try {
    const result = await Promise.race([
      session.open().then(() => ({ ok: true, reason: "" })),
      timeout,
    ]);
    return { ...result, gone: !result.ok && isModelUnavailableClose(result.reason) };
  } catch (err) {
    return { ok: false, reason: err.message, gone: isModelUnavailableClose(err.message) };
  } finally {
    session.close();
  }
}

/** Both questions, for one model in one mode. */
export async function checkModel(apiKey, listed, { model, mode }) {
  const methods = listed.get(model);
  const result = { model, mode, listed: methods !== undefined, bidi: !!methods?.includes("bidiGenerateContent") };
  const shake = await handshake(apiKey, mode, model);
  result.connected = shake.ok;
  result.reason = shake.reason;
  // "Gone" is the verdict a config rewrite may act on. A model absent from the
  // catalogue is gone whatever the socket then says, because the socket cannot
  // distinguish a withdrawn name from a bad minute on the network.
  result.gone = shake.gone || (!result.listed && !shake.ok);
  result.healthy = result.listed && result.bidi && result.connected;
  return result;
}

if (import.meta.filename === process.argv[1]) {
  const config = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
  const apiKey = apiKeyFrom(process.argv.slice(2));
  const listed = await listModels(apiKey);

  const results = [];
  // One at a time. Two concurrent Live sessions on a free-tier key is a
  // per-project concurrency limit away from reporting a retired model.
  for (const target of modelsUnderTest(config)) {
    results.push(await checkModel(apiKey, listed, target));
  }

  const healthy = results.every((r) => r.healthy);
  // Only a model the API says is missing may set this. A run that failed
  // because the network was down leaves it false, so nothing downstream starts
  // rewriting the config file over a bad minute.
  const gone = results.filter((r) => r.gone).map((r) => `${r.model} (${r.mode})`);
  const summary = { healthy, gone, results, checkedAt: new Date().toISOString() };

  if (asJson) console.log(JSON.stringify(summary, null, 2));
  else {
    for (const r of results) {
      const mark = r.healthy ? "ok  " : r.gone ? "GONE" : "FAIL";
      console.log(`${mark} ${r.model} (${r.mode})`);
      if (!r.listed) console.log(`     not in ListModels`);
      else if (!r.bidi) console.log(`     listed, but no bidiGenerateContent`);
      if (!r.connected) console.log(`     ${r.reason}`);
    }
    console.log(healthy ? "\nall models reachable" : `\n${results.filter((r) => !r.healthy).length} unhealthy`);
  }

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `healthy=${healthy}\ngone=${gone.join(", ")}\nsummary<<EOF\n${JSON.stringify(summary)}\nEOF\n`
    );
  }
  process.exit(healthy ? 0 : 1);
}
