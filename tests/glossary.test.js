import test from "node:test";
import assert from "node:assert/strict";

import {
  applyDisplayMap,
  buildDisplayMap,
  cleanCJKSpaces,
  normalizeEntry,
  parseGlossaryCsv,
} from "../lib/glossary.js";

test("parseGlossaryCsv reads two- and three-column rows", () => {
  const pairs = parseGlossaryCsv("Kubernetes,クバネティス,Kubernetes\nCloud Run,クラウドラン\n");
  assert.deepEqual(pairs, [
    { source: "Kubernetes", target: "クバネティス", transcription: "Kubernetes" },
    // No third column, so the transcript shows what the model was told to say.
    { source: "Cloud Run", target: "クラウドラン", transcription: "クラウドラン" },
  ]);
});

test("parseGlossaryCsv keeps commas inside the third column", () => {
  const [entry] = parseGlossaryCsv("a,b,c,d");
  assert.equal(entry.transcription, "c,d");
});

test("parseGlossaryCsv names the offending line", () => {
  assert.throws(() => parseGlossaryCsv("ok,fine\nbroken\n"), /Line 2/);
  assert.throws(() => parseGlossaryCsv("ok,fine\n ,missing\n"), /Line 2 is missing/);
});

test("parseGlossaryCsv skips blank lines rather than failing on them", () => {
  assert.equal(parseGlossaryCsv("a,b\n\n\nc,d\n").length, 2);
});

test("normalizeEntry rejects anything that is not a pair of strings", () => {
  assert.equal(normalizeEntry({ source: "a" }), null);
  assert.equal(normalizeEntry(null), null);
  assert.deepEqual(normalizeEntry({ source: "a", target: "b" }), {
    source: "a",
    target: "b",
    transcription: "b",
  });
});

test("buildDisplayMap only carries entries whose transcript differs", () => {
  const map = buildDisplayMap([
    { source: "Gemini", target: "ジェミニ", transcription: "Gemini" },
    { source: "x", target: "y", transcription: "y" },
  ]);
  assert.deepEqual(map, [["ジェミニ", "Gemini"]]);
});

test("buildDisplayMap puts longer targets first so a prefix cannot win", () => {
  const map = buildDisplayMap([
    { source: "a", target: "クラウド", transcription: "Cloud" },
    { source: "b", target: "クラウドラン", transcription: "Cloud Run" },
  ]);
  assert.deepEqual(map[0], ["クラウドラン", "Cloud Run"]);
  assert.equal(applyDisplayMap("クラウドランで動かす", map), "Cloud Runで動かす");
});

test("applyDisplayMap matches across a half-width/full-width difference", () => {
  // NFKC folds the full-width forms the model's transcript sometimes uses.
  const map = buildDisplayMap([
    { source: "a", target: "ＧＰＵ", transcription: "GPU" },
  ]);
  assert.equal(applyDisplayMap("GPUを使う", map), "GPUを使う");
});

test("applyDisplayMap leaves text alone when the map is empty", () => {
  assert.equal(applyDisplayMap("そのまま", []), "そのまま");
  assert.equal(applyDisplayMap("", [["a", "b"]]), "");
});

test("cleanCJKSpaces drops spaces between CJK but keeps them in Latin text", () => {
  assert.equal(cleanCJKSpaces("これ は テスト です"), "これはテストです");
  assert.equal(cleanCJKSpaces("hello there world"), "hello there world");
  // A boundary between scripts is a real word break and has to survive.
  assert.equal(cleanCJKSpaces("Cloud Run を 使う"), "Cloud Run を使う");
});
