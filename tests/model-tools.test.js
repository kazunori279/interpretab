/**
 * The one function in `tools/find-models.mjs` that decides what gets committed.
 *
 * Everything else in that file is a network call. `mergeConfig` is where a
 * language model's guess becomes a change to a file that every installed copy of
 * this extension reads within hours, with no human between the two — so the
 * rules it enforces are worth writing down twice.
 */

import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  PROMOTE_WITHIN_DAYS,
  STALE_AFTER_DAYS,
  commitMessage,
  daysBetween,
  formatConfig,
  mergeConfig,
  modelDrift,
  pricesAreStale,
  unpricedModels,
} from "../tools/find-models.mjs";
import { describeDiff, rateDiff } from "../tools/check-rates.mjs";
import { parseConfig } from "../lib/remote-config.js";
import { modelsUnderTest, setupFor } from "./model-check.mjs";
import { MODEL, SIMUL_MODEL } from "../lib/languages.js";
import "./messages.mjs";

const CONFIG = path.join(import.meta.dirname, "..", "docs", "config.json");

const base = () => ({
  schemaVersion: 1,
  models: { simul: ["simul-one"], conversation: ["chat-one"] },
  rates: { "simul-one": { audioIn: 3.5, audioOut: 21 } },
  ratesReadAt: "2026-08-01",
  blockBelowVersion: "",
  learnMoreUrl: "https://kazunori279.github.io/interpretab/",
});

/** A price for every name a session starts on: the head of each list, and the build's two. */
const allPriced = (config = base()) =>
  [config.models.simul[0], config.models.conversation[0], SIMUL_MODEL, MODEL].map((model) => ({
    model,
    audioIn: 1,
    audioOut: 2,
  }));

const empty = { simul: [], conversation: [], rates: [] };

const NEXT_SIMUL = "gemini-4.0-live-translate-preview";

test("a verified newcomer goes behind the name that is already working", () => {
  const verdict = new Map([
    ["simul:simul-one", true],
    [`simul:${NEXT_SIMUL}`, true],
  ]);
  const merged = mergeConfig(base(), verdict, { ...empty, simul: [NEXT_SIMUL] });
  // Not in front. A discovery is a fallback until a human promotes it — the
  // first name is the one every session starts on.
  assert.deepEqual(merged.models.simul, ["simul-one", NEXT_SIMUL]);
});

test("a name the agent invented is not written, because it never verified", () => {
  const verdict = new Map([["simul:simul-one", true]]); // the 4.0 name never checked out
  const merged = mergeConfig(base(), verdict, { ...empty, simul: [NEXT_SIMUL] });
  assert.deepEqual(merged.models.simul, ["simul-one"]);
});

test("a name that verified gone is dropped", () => {
  const config = base();
  config.models.simul = ["simul-one", "simul-two"];
  const verdict = new Map([
    ["simul:simul-one", false],
    ["simul:simul-two", true],
  ]);
  assert.deepEqual(mergeConfig(config, verdict, empty).models.simul, ["simul-two"]);
});

test("the last name is never dropped, however badly it is doing", () => {
  const verdict = new Map([
    ["simul:simul-one", false],
    ["conversation:chat-one", false],
  ]);
  const merged = mergeConfig(base(), verdict, empty);
  // An empty list means "the file has no opinion", which is the opposite of
  // what an outage should be saying.
  assert.deepEqual(merged.models.simul, ["simul-one"]);
  assert.deepEqual(merged.models.conversation, ["chat-one"]);
});

test("one name, two modes, two answers", () => {
  // The two frames are not the same request: simultaneous carries
  // `translationConfig` and conversation a system instruction, and a model that
  // takes one may refuse the other. A verdict keyed on the name alone would let
  // the first answer stand for both.
  const bothWays = "gemini-4.0-flash-live-preview";
  const verdict = new Map([
    [`simul:${bothWays}`, true],
    [`conversation:${bothWays}`, false],
    ["simul:simul-one", true],
    ["conversation:chat-one", true],
  ]);
  const merged = mergeConfig(base(), verdict, {
    ...empty,
    simul: [bothWays],
    conversation: [bothWays],
  });
  assert.deepEqual(merged.models.simul, ["simul-one", bothWays]);
  assert.deepEqual(merged.models.conversation, ["chat-one"]);
});

// Which way the list may grow. The bundled names set the floor when the config
// carries nothing rankable, so `conversation` here is measured against
// gemini-3.1-flash-live-preview.
//
// The rule exists because of what happened the first time this ran unattended:
// the agent found two 2.5 native-audio previews, both opened a session
// perfectly well, and both went into the file. Neither had ever been measured on
// a translation, and the client walks the list in order — so the day 3.1 was
// withdrawn, every session would have landed on a 2.5 before reaching whatever
// actually replaced it.
const forward = (candidate, verified = true) => {
  const config = { ...base(), models: { simul: [], conversation: ["chat-one"] } };
  const verdict = new Map([
    ["conversation:chat-one", true],
    [`conversation:${candidate}`, verified],
  ]);
  return mergeConfig(config, verdict, { ...empty, conversation: [candidate] }).models.conversation;
};

test("an earlier generation is not a fallback", () => {
  assert.deepEqual(forward("gemini-2.5-flash-native-audio-preview-12-2025"), ["chat-one"]);
});

test("a later generation is", () => {
  assert.deepEqual(forward("gemini-3.5-flash-live-preview"), ["chat-one", "gemini-3.5-flash-live-preview"]);
});

test("the GA id of the model already in use is taken, though it raises no number", () => {
  // The usual way a preview ends: the same model, same generation, without the
  // word preview, and the preview gone the same day.
  assert.deepEqual(forward("gemini-3.1-flash-live"), ["chat-one", "gemini-3.1-flash-live"]);
});

test("so is a redated preview of it", () => {
  const respin = "gemini-3.1-flash-live-preview-02-2026";
  assert.deepEqual(forward(respin), ["chat-one", respin]);
});

test("a different model of the same generation is not", () => {
  // Level with what is running, but a different family: no reason to think it
  // behaves like the one being replaced, and nobody has checked.
  assert.deepEqual(forward("gemini-3.1-flash-native-audio-preview"), ["chat-one"]);
});

test("an id with no generation to read is left alone", () => {
  // Better an outage issue a human reads than a silent promotion this file
  // cannot rank. Same for a name that does not look like a Gemini id at all.
  assert.deepEqual(forward("gemini-flash-live-ga"), ["chat-one"]);
  assert.deepEqual(forward("some-other-vendor-live-1.0"), ["chat-one"]);
});

test("the emergency brake is not the agent's to touch", () => {
  const config = base();
  config.blockBelowVersion = "1.0.4";
  const merged = mergeConfig(config, new Map([["simul:simul-one", true]]), {
    ...empty,
    // Nothing in the answer shape can reach it, and this is the test that says
    // adding a field for it would have to break here first.
    simul: ["simul-one"],
  });
  assert.equal(merged.blockBelowVersion, "1.0.4");
  assert.equal(merged.learnMoreUrl, config.learnMoreUrl);
  assert.equal(merged.schemaVersion, 1);
});

// Dates, and the one thing they are allowed to do. `modelInfo` is a note on the
// side for the Options menu right up until the day a shutdown date comes within
// a week, when it moves the name every session starts on.

test("a name the file did not have yesterday is dated today", () => {
  const verdict = new Map([["simul:simul-one", true], [`simul:${NEXT_SIMUL}`, true]]);
  const merged = mergeConfig(base(), verdict, { ...empty, simul: [NEXT_SIMUL] }, "2026-09-01");
  assert.deepEqual(merged.modelInfo[NEXT_SIMUL], { since: "2026-09-01" });
  // Not the names that were already there. Nobody knows when those arrived, and
  // "today" would be a lie that makes every old name look new in the menu.
  assert.equal(merged.modelInfo["simul-one"], undefined);
});

test("a shutdown date is taken only where the answer prints one", () => {
  const verdict = new Map([["simul:simul-one", true]]);
  const found = {
    ...empty,
    retiring: [
      { model: "simul-one", date: "2026-10-01" },
      { model: "chat-one", date: "in about six weeks" },
      { model: "chat-one", date: "2026-02-31" },
      { model: "long-gone", date: "2026-10-01" },
    ],
  };
  const merged = mergeConfig(base(), verdict, found, "2026-09-01");
  assert.deepEqual(merged.modelInfo["simul-one"], { retiring: "2026-10-01" });
  // Prose is not a date, nor is the 31st of February, and a date for a name the
  // file does not carry is a fact about somebody else's model.
  assert.equal(merged.modelInfo["chat-one"], undefined);
  assert.equal(merged.modelInfo["long-gone"], undefined);
});

test("a date already in the file survives a run that read nothing", () => {
  const config = base();
  config.modelInfo = { "simul-one": { since: "2026-07-01", retiring: "2026-10-01" } };
  // An agent that could not open the changelog this morning has not learned
  // that the shutdown was called off.
  const merged = mergeConfig(config, new Map([["simul:simul-one", true]]), empty, "2026-09-01");
  assert.deepEqual(merged.modelInfo["simul-one"], { since: "2026-07-01", retiring: "2026-10-01" });
});

test("a date for a name that left the file leaves with it", () => {
  const config = base();
  config.models.simul = ["simul-one", "simul-two"];
  config.modelInfo = { "simul-two": { since: "2026-07-01" } };
  const verdict = new Map([["simul:simul-one", true], ["simul:simul-two", false]]);
  const merged = mergeConfig(config, verdict, empty, "2026-09-01");
  assert.deepEqual(merged.models.simul, ["simul-one"]);
  assert.equal(merged.modelInfo["simul-two"], undefined);
});

// The promotion. Everything above this line keeps the working name in front;
// this is the single exception, and the reason the dates are collected at all.
const promoted = (retiring, { verified = true, today = "2026-09-01" } = {}) => {
  const config = base();
  config.models.simul = ["simul-one", NEXT_SIMUL];
  config.modelInfo = { "simul-one": { retiring } };
  const verdict = new Map([["simul:simul-one", true], [`simul:${NEXT_SIMUL}`, verified]]);
  return mergeConfig(config, verdict, empty, today).models.simul;
};

test("the default moves before the old model is switched off, not when it breaks", () => {
  // Six days left. The alternative is every session in the world reconnecting
  // mid-sentence on the morning the name stops answering.
  assert.deepEqual(promoted("2026-09-07"), [NEXT_SIMUL, "simul-one"]);
  // The old name stays behind it, so the worst case is one reconnection to a
  // model that still works.
  assert.deepEqual(promoted("2026-08-20"), [NEXT_SIMUL, "simul-one"]);
});

test("a deadline that is still weeks away moves nothing", () => {
  assert.deepEqual(promoted("2026-09-30"), ["simul-one", NEXT_SIMUL]);
  assert.equal(PROMOTE_WITHIN_DAYS, 7);
});

test("nothing is promoted to a name that did not answer this morning", () => {
  // The successor has to have opened a real session today. A dead name in front
  // of a dying one is two outages instead of one.
  assert.deepEqual(promoted("2026-09-07", { verified: false }), ["simul-one"]);
});

test("with no successor to move to, the file keeps the name it has", () => {
  const config = base();
  config.modelInfo = { "simul-one": { retiring: "2026-09-02" } };
  const merged = mergeConfig(config, new Map([["simul:simul-one", true]]), empty, "2026-09-01");
  assert.deepEqual(merged.models.simul, ["simul-one"]);
});

test("a run with no date of its own promotes nothing", () => {
  // `--dry` and the tests above pass no date; without one there is no telling
  // whether the deadline is next week or last year.
  assert.deepEqual(promoted("2026-09-07", { today: "" }), ["simul-one", NEXT_SIMUL]);
});

test("the build being behind the config is worth saying out loud", () => {
  // Nothing breaks: every install reads the file within six hours and starts on
  // the first name. What breaks is a fresh install, and anyone with model
  // updates switched off — both run the bundled name until a release ships.
  assert.deepEqual(modelDrift({ simul: [SIMUL_MODEL], conversation: [MODEL] }), []);
  const behind = modelDrift({ simul: [NEXT_SIMUL], conversation: [MODEL] });
  assert.equal(behind.length, 1);
  assert.match(behind[0], new RegExp(`simul: ${SIMUL_MODEL} → ${NEXT_SIMUL}`));
});

test("a price is corrected, and only for a model somebody asks for", () => {
  const verdict = new Map([["simul:simul-one", true]]);
  const merged = mergeConfig(base(), verdict, {
    ...empty,
    rates: [
      { model: "simul-one", audioIn: 4, audioOut: 24 },
      { model: "some-other-model", audioIn: 1, audioOut: 2 },
    ],
  });
  assert.deepEqual(merged.rates["simul-one"], { audioIn: 4, audioOut: 24 });
  assert.equal(merged.rates["some-other-model"], undefined);
});

test("a nonsense price is ignored rather than written", () => {
  const verdict = new Map([["simul:simul-one", true]]);
  for (const bad of [{ audioIn: 0, audioOut: 21 }, { audioIn: NaN, audioOut: 21 }, { audioIn: -1, audioOut: 21 }]) {
    const merged = mergeConfig(base(), verdict, { ...empty, rates: [{ model: "simul-one", ...bad }] });
    assert.deepEqual(merged.rates["simul-one"], { audioIn: 3.5, audioOut: 21 });
  }
});

test("rates for models nobody asks for any more are dropped, except the bundled ones", () => {
  const config = base();
  config.rates = {
    "simul-one": { audioIn: 3.5, audioOut: 21 },
    "long-gone": { audioIn: 1, audioOut: 2 },
    [SIMUL_MODEL]: { audioIn: 3.5, audioOut: 21 },
    [MODEL]: { audioIn: 3, audioOut: 12 },
  };
  const merged = mergeConfig(config, new Map([["simul:simul-one", true]]), empty);
  assert.equal(merged.rates["long-gone"], undefined);
  // The bundled names stay: `modelCandidates` keeps them as the last resort, so
  // the meter still has to be able to price them.
  assert.ok(merged.rates[SIMUL_MODEL]);
  assert.ok(merged.rates[MODEL]);
});

// Prices. The rules above are about a model that went away, which announces
// itself; a price that changed announces nothing at all, and `mergeConfig`
// keeping the old number is indistinguishable from Google keeping its own. So
// the run has to be able to say which models it actually got a price for.

test("the models this run got no price for are named", () => {
  const found = { ...empty, rates: [{ model: "simul-one", audioIn: 4, audioOut: 24 }] };
  const unpriced = unpricedModels(base(), found);
  assert.ok(!unpriced.includes("simul-one"));
  assert.ok(unpriced.includes("chat-one"));
  // The two compiled into the build are priced by the file as well, since
  // `modelCandidates` keeps them as the last resort a session can land on.
  assert.ok(unpriced.includes(SIMUL_MODEL));
  assert.ok(unpriced.includes(MODEL));
});

test("a fallback nobody is on does not hold the date back", () => {
  // Google's pricing page stops listing a preview about when it stops serving
  // it, so a file that keeps one as a fallback would otherwise pin `ratesReadAt`
  // to the oldest name in it and raise an issue nobody could close.
  const config = base();
  config.models.simul = ["simul-one", "simul-old"];
  const found = { ...empty, rates: allPriced(config) };
  assert.deepEqual(unpricedModels(config, found), []);
  const verdict = new Map([["simul:simul-one", true], ["simul:simul-old", true], ["conversation:chat-one", true]]);
  assert.equal(mergeConfig(config, verdict, found, "2026-09-01").ratesReadAt, "2026-09-01");
});

test("a price the answer garbled counts as no price at all", () => {
  // Same rejection `mergeConfig` applies before writing. If the two disagreed,
  // a nonsense number would be dropped from the file and reported as read.
  const found = { ...empty, rates: [{ model: "simul-one", audioIn: 0, audioOut: 24 }] };
  assert.ok(unpricedModels(base(), found).includes("simul-one"));
});

test("the date moves only when every price arrived", () => {
  const verdict = new Map([["simul:simul-one", true], ["conversation:chat-one", true]]);
  const partial = mergeConfig(base(), verdict, { ...empty, rates: allPriced().slice(0, 1) }, "2026-09-01");
  // A floor, not a timestamp of the last run: no price in the file is older
  // than this date, which is only true if the date waits for the slowest one.
  assert.equal(partial.ratesReadAt, "2026-08-01");

  const full = mergeConfig(base(), verdict, { ...empty, rates: allPriced() }, "2026-09-01");
  assert.equal(full.ratesReadAt, "2026-09-01");
});

test("a run with no date of its own leaves the date alone", () => {
  // `--dry` and every test above call `mergeConfig` without one.
  const merged = mergeConfig(base(), new Map(), { ...empty, rates: allPriced() });
  assert.equal(merged.ratesReadAt, "2026-08-01");
});

test("three quiet mornings is when somebody is told", () => {
  const unpriced = ["chat-one"];
  assert.equal(pricesAreStale(unpriced, "2026-08-30", "2026-09-01"), false);
  assert.equal(pricesAreStale(unpriced, "2026-08-29", "2026-09-01"), true);
  assert.equal(STALE_AFTER_DAYS, 3);
  // Nothing missing, nothing to say, however old the date is.
  assert.equal(pricesAreStale([], "2020-01-01", "2026-09-01"), false);
  // Never confirmed is not fresher than confirmed a week ago.
  assert.equal(pricesAreStale(unpriced, "", "2026-09-01"), true);
  assert.equal(daysBetween("2026-08-29", "2026-09-01"), 3);
  assert.equal(daysBetween("not a date", "2026-09-01"), null);
});

test("the commit message says what the run learned about money", () => {
  const verdict = new Map([["simul:simul-one", true]]);
  const found = { ...empty, rates: [{ model: "simul-one", audioIn: 4, audioOut: 24 }], notes: "" };
  const merged = mergeConfig(base(), verdict, found, "2026-09-01");
  const message = commitMessage(verdict, found, merged);
  assert.match(message, /No price reported: .*chat-one/);
  assert.match(message, /Prices last confirmed: 2026-08-01/);
});

test("the build's prices and the published ones are compared, and the difference is readable", () => {
  const bundled = { "simul-one": { audioIn: 3.5, audioOut: 21 } };
  assert.deepEqual(rateDiff(bundled, { "simul-one": { audioIn: 3.5, audioOut: 21 } }), []);
  // A model the file carries and the build does not is not a difference: the
  // file lists fallbacks this build has never heard of, which is its job.
  assert.deepEqual(rateDiff(bundled, { "simul-one": { audioIn: 3.5, audioOut: 21 }, other: { audioIn: 1, audioOut: 2 } }), []);

  const differs = rateDiff(bundled, { "simul-one": { audioIn: 4, audioOut: 21 } });
  assert.equal(differs[0].kind, "differs");
  assert.match(describeDiff(differs)[0], /simul-one: build says in 3.5 \/ out 21, config says in 4 \/ out 21/);

  const missing = rateDiff(bundled, {});
  assert.equal(missing[0].kind, "missing");
  assert.match(describeDiff(missing)[0], /config says no price/);
});

test("what it writes is what the extension can read back", () => {
  const merged = mergeConfig(base(), new Map([["simul:simul-one", true]]), {
    ...empty,
    rates: [{ model: "simul-one", audioIn: 4, audioOut: 24 }],
  });
  const parsed = parseConfig(formatConfig(merged));
  assert.ok(parsed, "the formatted file survives parseConfig");
  assert.deepEqual(parsed.models.simul, ["simul-one"]);
  assert.deepEqual(parsed.rates["simul-one"], { audioIn: 4, audioOut: 24 });
  // Nothing to say about dates, so nothing written: the day the file first
  // learns one, the diff is about that date and not about a block of braces.
  assert.equal(parsed.modelInfo, null);

  const dated = mergeConfig(base(), new Map([["simul:simul-one", true]]), {
    ...empty,
    retiring: [{ model: "simul-one", date: "2026-10-01" }],
  }, "2026-09-01");
  const back = parseConfig(formatConfig(dated));
  assert.deepEqual(back.modelInfo["simul-one"], { retiring: "2026-10-01" });
});

test("re-formatting the committed file changes nothing", () => {
  // Otherwise the first run of the agent commits a whitespace diff and calls it
  // a model change.
  const text = fs.readFileSync(CONFIG, "utf8");
  const config = JSON.parse(text);
  assert.equal(formatConfig(mergeConfig(config, new Map(), empty)), text);
});

test("the health check asks about the bundled models as well as the file's", () => {
  const targets = modelsUnderTest({ models: { simul: ["simul-one"], conversation: [] } });
  const names = targets.map((t) => `${t.mode}:${t.model}`);
  // A bundled model going away is a real outage that the config file, on its
  // own, says nothing about.
  assert.ok(names.includes(`simul:${SIMUL_MODEL}`));
  assert.ok(names.includes(`conversation:${MODEL}`));
  assert.ok(names.includes("simul:simul-one"));
});

test("the frame the check sends is the frame the extension sends", () => {
  const simul = setupFor("simul", "some-model");
  assert.equal(simul.setup.model, "models/some-model");
  // The field a general-purpose model rejects, which is the whole reason the
  // check opens a session instead of trusting ListModels.
  assert.ok(simul.setup.generationConfig.translationConfig);
  assert.equal(simul.setup.systemInstruction, undefined);

  const chat = setupFor("conversation", "some-model");
  assert.ok(chat.setup.systemInstruction);
  assert.equal(chat.setup.generationConfig.translationConfig, undefined);
});
