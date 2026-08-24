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
import { formatConfig, mergeConfig } from "../tools/find-models.mjs";
import { parseConfig } from "../lib/remote-config.js";
import { modelsUnderTest, setupFor } from "./model-check.mjs";
import { MODEL, SIMUL_MODEL } from "../lib/languages.js";
import "./messages.mjs";

const CONFIG = path.join(import.meta.dirname, "..", "docs", "config.json");

const base = () => ({
  schemaVersion: 1,
  models: { simul: ["simul-one"], conversation: ["chat-one"] },
  rates: { "simul-one": { audioIn: 3.5, audioOut: 21 } },
  blockBelowVersion: "",
  learnMoreUrl: "https://kazunori279.github.io/interpretab/",
});

const empty = { simul: [], conversation: [], rates: [] };

test("a verified newcomer goes behind the name that is already working", () => {
  const verdict = new Map([
    ["simul:simul-one", true],
    ["simul:simul-two", true],
  ]);
  const merged = mergeConfig(base(), verdict, { ...empty, simul: ["simul-two"] });
  // Not in front. A discovery is a fallback until a human promotes it — the
  // first name is the one every session starts on.
  assert.deepEqual(merged.models.simul, ["simul-one", "simul-two"]);
});

test("a name the agent invented is not written, because it never verified", () => {
  const verdict = new Map([["simul:simul-one", true]]); // gemini-9-imaginary never checked out
  const merged = mergeConfig(base(), verdict, { ...empty, simul: ["gemini-9-imaginary"] });
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
  const verdict = new Map([
    ["simul:both-ways", true],
    ["conversation:both-ways", false],
    ["simul:simul-one", true],
    ["conversation:chat-one", true],
  ]);
  const merged = mergeConfig(base(), verdict, {
    ...empty,
    simul: ["both-ways"],
    conversation: ["both-ways"],
  });
  assert.deepEqual(merged.models.simul, ["simul-one", "both-ways"]);
  assert.deepEqual(merged.models.conversation, ["chat-one"]);
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

test("what it writes is what the extension can read back", () => {
  const merged = mergeConfig(base(), new Map([["simul:simul-one", true]]), {
    ...empty,
    rates: [{ model: "simul-one", audioIn: 4, audioOut: 24 }],
  });
  const parsed = parseConfig(formatConfig(merged));
  assert.ok(parsed, "the formatted file survives parseConfig");
  assert.deepEqual(parsed.models.simul, ["simul-one"]);
  assert.deepEqual(parsed.rates["simul-one"], { audioIn: 4, audioOut: 24 });
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
