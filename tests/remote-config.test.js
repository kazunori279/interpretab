/**
 * The one file this extension reads that Google did not write.
 *
 * `lib/remote-config.js` is the only place where something outside the build
 * gets a say in what the extension does, so the interesting tests are not the
 * ones where the file is right. They are the ones where it is truncated, stale,
 * hostile, or from a future this build has never heard of — every one of which
 * has to land on the bundled values rather than on a broken run. The two
 * verdicts that could do real damage if they went the wrong way are `isBlocked`,
 * which can refuse to translate for someone whose extension works, and
 * `modelCandidates`, which decides whether a bad file can take the shipped model
 * away.
 *
 * Nothing here touches the network or `chrome.storage`: `fetchImpl`, `now` and
 * the stub below are the seams that let all of it run in a millisecond.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  BLOCKED_TTL_MS,
  clearCached,
  compareVersions,
  CONFIG_URL,
  ensureConfig,
  fetchConfig,
  isBlocked,
  modelCandidates,
  MAX_BYTES,
  parseConfig,
  readCached,
  SCHEMA_VERSION,
  TTL_MS,
} from "../lib/remote-config.js";

/** A well-formed file, as a starting point for the malformed ones. */
const GOOD = {
  schemaVersion: SCHEMA_VERSION,
  models: {
    simul: ["gemini-3.5-live-translate-preview"],
    conversation: ["gemini-3.1-flash-live-preview"],
  },
  rates: { "gemini-3.5-live-translate-preview": { audioIn: 3.5, audioOut: 21.0 } },
  blockBelowVersion: "",
  learnMoreUrl: "https://kazunori279.github.io/interpretab/",
};

/** `GOOD` with *patch* applied, as the text a fetch would return. */
const withText = (patch) => JSON.stringify({ ...GOOD, ...patch });
const parsed = (patch) => parseConfig(withText(patch));

/**
 * The extension's whole use of `chrome.storage.local`, in memory.
 *
 * The service worker is the only caller — an offscreen document has no
 * `chrome.storage` at all — so three methods on one area is the entire surface.
 */
function fakeStorage(initial = {}) {
  const store = { ...initial };
  globalThis.chrome = {
    storage: {
      local: {
        get: async (key) => (key in store ? { [key]: store[key] } : {}),
        set: async (items) => void Object.assign(store, items),
        remove: async (key) => void delete store[key],
      },
    },
  };
  return store;
}

/** A fetch that answers with *body*, and counts how often it was asked. */
function fakeFetch(body, { ok = true } = {}) {
  const impl = async (url) => {
    impl.calls.push(url);
    return { ok, text: async () => body };
  };
  impl.calls = [];
  return impl;
}

// ------------------------------------------------------------------ parsing

test("a well-formed file is read whole", () => {
  const config = parseConfig(JSON.stringify(GOOD));
  assert.deepEqual(config.models.simul, ["gemini-3.5-live-translate-preview"]);
  assert.deepEqual(config.models.conversation, ["gemini-3.1-flash-live-preview"]);
  assert.equal(config.rates["gemini-3.5-live-translate-preview"].audioOut, 21.0);
  assert.equal(config.learnMoreUrl, "https://kazunori279.github.io/interpretab/");
  assert.equal(config.blockBelowVersion, "");
});

test("a file from a format this build does not know is ignored whole", () => {
  // Not read for the parts that still parse. This is what makes the format
  // changeable at all: raising the version retires every older reader at once,
  // instead of leaving them to interpret new fields under the old rules.
  assert.equal(parsed({ schemaVersion: SCHEMA_VERSION + 1 }), null);
  assert.equal(parsed({ schemaVersion: "1" }), null);
  assert.equal(parsed({ schemaVersion: undefined }), null);
});

test("a field this build has no use for is skipped, not choked on", () => {
  // The other half of the version rule. Raising `schemaVersion` retires every
  // older reader, so a field that shipped builds can ignore must not need one —
  // `ratesReadAt` is written by the discovery workflow for humans reading the
  // file, and this is the assertion that adding it broke nothing in the wild.
  const config = parsed({ ratesReadAt: "2026-08-17", somethingNewer: { deeply: ["nested"] } });
  assert.ok(config);
  assert.deepEqual(config.rates, GOOD.rates);
  assert.equal(config.ratesReadAt, undefined);
});

test("nothing that is not a JSON object gets through", () => {
  for (const text of ["", "null", "[]", '"a string"', "42", "{", "{}", undefined, null, {}]) {
    assert.equal(parseConfig(text), null, `${JSON.stringify(text)} was accepted`);
  }
});

test("a body too large to be this file is not parsed at all", () => {
  const padded = JSON.stringify({ ...GOOD, pad: "x".repeat(MAX_BYTES) });
  assert.ok(padded.length > MAX_BYTES);
  assert.equal(parseConfig(padded), null);
});

test("a model list that lost an entry to validation is not used in part", () => {
  // Guessing which half of a list was meant is worse than using none of it: the
  // half that validated could be the deprecated names.
  assert.equal(parsed({ models: { simul: ["fine-model", "Not A Model!"] } }).models.simul, null);
  assert.equal(parsed({ models: { simul: ["fine-model", 7] } }).models.simul, null);
  assert.equal(parsed({ models: { simul: [] } }).models.simul, null);
  assert.equal(parsed({ models: { simul: "one-model" } }).models.simul, null);
  assert.equal(parsed({ models: {} }).models.simul, null);
  assert.equal(parsed({ models: undefined }).models.conversation, null);
});

test("a candidate list cannot be made long enough to be a loop", () => {
  const eight = Array.from({ length: 8 }, (_, i) => `model-${i}`);
  assert.equal(parsed({ models: { simul: eight } }).models.simul.length, 8);
  assert.equal(parsed({ models: { simul: [...eight, "model-8"] } }).models.simul, null);
});

test("rates keep the entries that are wholly valid and drop the rest", () => {
  const config = parsed({
    rates: {
      "good-model": { audioIn: 1, audioOut: 2 },
      "half-model": { audioIn: 1 },
      "free-model": { audioIn: 0, audioOut: 0 },
      "negative-model": { audioIn: -1, audioOut: 2 },
      "absurd-model": { audioIn: 1, audioOut: 1e9 },
      "nan-model": { audioIn: "1.0", audioOut: 2 },
      "Bad Name": { audioIn: 1, audioOut: 2 },
    },
  });
  assert.deepEqual(Object.keys(config.rates).sort(), ["free-model", "good-model"]);
});

test("dates are kept per model, and only when they are dates", () => {
  const config = parsed({
    modelInfo: {
      "gemini-3.5-live-translate-preview": { since: "2026-05-01", retiring: "2026-11-30" },
      "gemini-4-live-preview": { since: "2026-08-20" },
      "gemini-old-live": { retiring: "soon" },
      "not a model name": { since: "2026-01-01" },
      "gemini-3.1-flash-live-preview": { since: "2026-02-30" },
    },
  });
  assert.deepEqual(config.modelInfo["gemini-3.5-live-translate-preview"], {
    since: "2026-05-01",
    retiring: "2026-11-30",
  });
  assert.deepEqual(config.modelInfo["gemini-4-live-preview"], { since: "2026-08-20" });
  // A retirement date nobody can read is worse than none: it is the one field
  // the menu turns into a deadline, and "soon" would be shown as one.
  assert.equal("gemini-old-live" in config.modelInfo, false);
  assert.equal("not a model name" in config.modelInfo, false);
  // February has 28 days in 2026, and `Date` would roll this to March 2nd.
  assert.equal("gemini-3.1-flash-live-preview" in config.modelInfo, false);
});

test("a file with no dates in it says nothing about dates", () => {
  // `null` rather than `{}`, because the menu asks this object about a name and
  // an empty table would be a table that has been read and is silent — which is
  // the same answer, and one fewer shape for the caller to handle.
  assert.equal(parsed({}).modelInfo, null);
  assert.equal(parsed({ modelInfo: {} }).modelInfo, null);
  assert.equal(parsed({ modelInfo: [] }).modelInfo, null);
  assert.equal(parsed({ modelInfo: "2026-08-20" }).modelInfo, null);
  assert.equal(parsed({ modelInfo: { "gemini-x-live": {} } }).modelInfo, null);
});

test("a rate table with nothing valid in it is no opinion, not an empty one", () => {
  // `costOf` falls back to the built-in table on a null, and to nothing at all
  // on an empty object, which would price every model as the expensive one.
  assert.equal(parsed({ rates: { "x-model": { audioIn: -1, audioOut: -1 } } }).rates, null);
  assert.equal(parsed({ rates: [] }).rates, null);
  assert.equal(parsed({ rates: "free" }).rates, null);
});

test("learnMoreUrl can only point back at this project", () => {
  // The field is a way to send every user of the extension somewhere with one
  // clicked link, which is a much larger thing than the update notice needs.
  const ok = (url) => parsed({ learnMoreUrl: url }).learnMoreUrl;
  assert.equal(ok("https://github.com/kazunori279/interpretab/releases"), "https://github.com/kazunori279/interpretab/releases");
  assert.equal(ok("https://example.com/free-money"), "");
  assert.equal(ok("http://kazunori279.github.io/interpretab/"), "");
  assert.equal(ok("javascript:alert(1)"), "");
  assert.equal(ok("https://kazunori279.github.io.evil.test/interpretab/"), "");
  assert.equal(ok(42), "");
});

test("a threshold that is not a version is no threshold", () => {
  assert.equal(parsed({ blockBelowVersion: "1.2.3" }).blockBelowVersion, "1.2.3");
  assert.equal(parsed({ blockBelowVersion: "next" }).blockBelowVersion, "");
  assert.equal(parsed({ blockBelowVersion: "1.2.3.4.5" }).blockBelowVersion, "");
  assert.equal(parsed({ blockBelowVersion: 1 }).blockBelowVersion, "");
});

// ------------------------------------------------------------------ versions

test("versions compare component by component, with the gaps as zeroes", () => {
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
  assert.equal(compareVersions("1.2.0", "1.10.0"), -1, "not a string comparison");
  assert.equal(compareVersions("1.3", "1.2.9"), 1);
  assert.equal(compareVersions("0.9.1", "1"), -1);
  assert.equal(compareVersions("2.0.1", "2.0"), 1);
});

test("a build is blocked only when a valid file names a threshold it is below", () => {
  const at = (floor) => ({ ...GOOD, blockBelowVersion: floor });
  assert.equal(isBlocked(at("1.2.0"), "1.1.9"), true);
  assert.equal(isBlocked(at("1.2.0"), "1.2.0"), false, "the threshold itself is allowed");
  assert.equal(isBlocked(at("1.2.0"), "1.3.0"), false);
});

test("every uncertain state answers no, because the cost runs one way", () => {
  // Refusing to translate for someone whose extension works is worse than
  // translating with one that is about to fail on its own and say why.
  assert.equal(isBlocked(null, "1.0.0"), false);
  assert.equal(isBlocked(undefined, "1.0.0"), false);
  assert.equal(isBlocked({ ...GOOD, blockBelowVersion: "" }, "1.0.0"), false);
  assert.equal(isBlocked({ ...GOOD, blockBelowVersion: "tomorrow" }, "1.0.0"), false);
  assert.equal(isBlocked({ ...GOOD, blockBelowVersion: "9.9.9" }, ""), false);
  assert.equal(isBlocked({ ...GOOD, blockBelowVersion: "9.9.9" }, "beta"), false);
});

// ---------------------------------------------------------------- candidates

test("the shipped model is always a candidate, whatever the file says", () => {
  // Otherwise a text file is a way to brick every installation at once. The
  // bundled name is the one candidate known to have worked at some point.
  assert.deepEqual(modelCandidates("shipped", null), ["shipped"]);
  assert.deepEqual(modelCandidates("shipped", []), ["shipped"]);
  assert.deepEqual(modelCandidates("shipped", ["newer"]), ["newer", "shipped"]);
  assert.deepEqual(modelCandidates("shipped", "newer"), ["shipped"]);
});

test("a file that already names the shipped model does not name it twice", () => {
  assert.deepEqual(modelCandidates("shipped", ["shipped", "newer"]), ["shipped", "newer"]);
  assert.deepEqual(modelCandidates("shipped", ["newer", "shipped"]), ["newer", "shipped"]);
});

test("a preferred model is moved to the front, and never made the only one", () => {
  // The whole safety of the setting is that it reorders. Every other candidate
  // is still behind it, so a model that has been chosen and then withdrawn
  // costs a reconnection, not a session.
  assert.deepEqual(modelCandidates("shipped", ["newer", "shipped"], "shipped"), [
    "shipped",
    "newer",
  ]);
  assert.deepEqual(modelCandidates("shipped", ["newer", "shipped"], "newer"), [
    "newer",
    "shipped",
  ]);
});

test("a preference for a name that is gone is ignored, not obeyed", () => {
  // How the setting expires: Google withdraws the name, the file stops listing
  // it, and the choice stops applying without anybody being told to go and
  // change it.
  assert.deepEqual(modelCandidates("shipped", ["newer", "shipped"], "retired"), [
    "newer",
    "shipped",
  ]);
  assert.deepEqual(modelCandidates("shipped", ["newer", "shipped"], ""), ["newer", "shipped"]);
  assert.deepEqual(modelCandidates("shipped", null, "newer"), ["shipped"]);
});

// --------------------------------------------------------------------- fetch

test("the file is fetched from the published address, with nothing attached", async () => {
  const fetchImpl = fakeFetch(JSON.stringify(GOOD));
  const config = await fetchConfig({ fetchImpl });
  assert.deepEqual(fetchImpl.calls, [CONFIG_URL]);
  assert.ok(!CONFIG_URL.includes("?"), "no query string, ever");
  assert.equal(config.models.simul.length, 1);
});

test("every way the fetch can fail comes back as no opinion", async () => {
  assert.equal(await fetchConfig({ fetchImpl: fakeFetch("", { ok: false }) }), null, "404");
  assert.equal(await fetchConfig({ fetchImpl: fakeFetch("<html>") }), null, "a captive portal");
  assert.equal(
    await fetchConfig({
      fetchImpl: async () => {
        throw new Error("offline");
      },
    }),
    null,
    "no network",
  );
  assert.equal(
    await fetchConfig({
      fetchImpl: async () => ({
        ok: true,
        text: async () => {
          throw new Error("connection reset");
        },
      }),
    }),
    null,
    "a body that stops mid-transfer",
  );
});

// --------------------------------------------------------------------- cache

const KEY = "remoteConfig";
const NOW = 1_700_000_000_000;

test("a cached copy inside the TTL is used without asking again", async () => {
  fakeStorage({ [KEY]: { at: NOW - TTL_MS + 1000, data: GOOD } });
  const fetchImpl = fakeFetch(JSON.stringify(GOOD));

  const config = await ensureConfig({ version: "1.0.0", now: () => NOW, fetchImpl });
  assert.equal(config, GOOD);
  assert.equal(fetchImpl.calls.length, 0);
});

test("a copy past the TTL is replaced, and the new one is kept with its time", async () => {
  const store = fakeStorage({ [KEY]: { at: NOW - TTL_MS - 1, data: GOOD } });
  const fetchImpl = fakeFetch(withText({ models: { simul: ["fresher-model"] } }));

  const config = await ensureConfig({ version: "1.0.0", now: () => NOW, fetchImpl });
  assert.deepEqual(config.models.simul, ["fresher-model"]);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(store[KEY].at, NOW);
  assert.deepEqual(store[KEY].data.models.simul, ["fresher-model"]);
});

test("a build that is blocked asks again four times as often", async () => {
  // A block is the one verdict a mistake in the file inflicts on every user at
  // once, so the correction has to reach them on their next panel open rather
  // than six hours later.
  const blocked = { ...GOOD, blockBelowVersion: "9.9.9" };
  const age = BLOCKED_TTL_MS + 1000;
  assert.ok(age < TTL_MS, "still fresh by the ordinary rule");

  fakeStorage({ [KEY]: { at: NOW - age, data: blocked } });
  const fetchImpl = fakeFetch(withText({ blockBelowVersion: "" }));
  const config = await ensureConfig({ version: "1.0.0", now: () => NOW, fetchImpl });

  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(isBlocked(config, "1.0.0"), false, "the block lifted on the next open");
});

test("a block cannot be lifted by pulling the network cable", async () => {
  // The cached copy is kept when a fetch fails, so going offline holds whatever
  // was last learned rather than reverting to no opinion.
  const blocked = { ...GOOD, blockBelowVersion: "9.9.9" };
  const store = fakeStorage({ [KEY]: { at: NOW - TTL_MS - 1, data: blocked } });

  const config = await ensureConfig({
    version: "1.0.0",
    now: () => NOW,
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });

  assert.equal(isBlocked(config, "1.0.0"), true);
  assert.equal(store[KEY].at, NOW - TTL_MS - 1, "and the failure did not restamp it");
});

test("force ignores the TTL, which is what a dead model needs mid-run", async () => {
  fakeStorage({ [KEY]: { at: NOW, data: GOOD } });
  const fetchImpl = fakeFetch(withText({ models: { simul: ["successor-model"] } }));

  const config = await ensureConfig({ version: "1.0.0", force: true, now: () => NOW, fetchImpl });
  assert.equal(fetchImpl.calls.length, 1);
  assert.deepEqual(config.models.simul, ["successor-model"]);
});

test("a first run with nothing cached fetches, and survives having no answer", async () => {
  fakeStorage();
  assert.deepEqual(await readCached(), { at: 0, data: null });

  const fetchImpl = fakeFetch("", { ok: false });
  assert.equal(await ensureConfig({ version: "1.0.0", now: () => NOW, fetchImpl }), null);
  assert.equal(fetchImpl.calls.length, 1);
});

test("a stored envelope that is not one reads as nothing cached", async () => {
  fakeStorage({ [KEY]: "corrupted" });
  assert.deepEqual(await readCached(), { at: 0, data: null });
});

test("turning the switch off forgets what was learned", async () => {
  const store = fakeStorage({ [KEY]: { at: NOW, data: GOOD } });
  await clearCached();
  assert.equal(KEY in store, false);
});
