/**
 * The `setup` frame is the one place where a wrong field name is silent: the
 * API accepts the connection and simply ignores what it does not recognise, so
 * a misplaced `translationConfig` shows up as "the translation is in the wrong
 * language" half a minute into a demo. These assertions pin the exact shape.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { MODEL, SIMUL_MODEL, DEFAULT_VOICE, resolveVoice, simulLanguageCode } from "../lib/languages.js";
import { buildSetup, endpointUrl, parseDuration, arrayToBase64 } from "../lib/live-session.js";
import { buildSystemInstruction } from "../lib/instructions.js";

const SETTINGS = {
  voice: "Kore",
  tabTarget: "ja",
  micSource: "en",
  micTarget: "ja",
};

test("the tab direction configures simultaneous translation and no instruction", () => {
  const { setup } = buildSetup("tab", SETTINGS, []);
  assert.equal(setup.model, `models/${SIMUL_MODEL}`);
  assert.equal(setup.systemInstruction, undefined);

  const gen = setup.generationConfig;
  assert.deepEqual(gen.responseModalities, ["AUDIO"]);
  // All four of these are fields of generationConfig on the wire, even though
  // the Python SDK flattens them onto its own connect config.
  assert.deepEqual(gen.inputAudioTranscription, {});
  assert.deepEqual(gen.outputAudioTranscription, {});
  assert.equal(gen.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Kore");
  assert.deepEqual(gen.translationConfig, {
    targetLanguageCode: "ja",
    echoTargetLanguage: false,
  });
});

test("the tab direction maps agent codes to the simultaneous model's BCP-47", () => {
  for (const [from, to] of [
    ["zh", "zh-Hans"],
    ["pt", "pt-BR"],
    ["iw", "he"],
    ["en", "en"],
  ]) {
    const { setup } = buildSetup("tab", { ...SETTINGS, tabTarget: from }, []);
    assert.equal(setup.generationConfig.translationConfig.targetLanguageCode, to);
    assert.equal(simulLanguageCode(from), to);
  }
});

test("the mic direction carries a system instruction and no translationConfig", () => {
  const glossary = [{ source: "Kubernetes", target: "クバネティス", transcription: "Kubernetes" }];
  const { setup } = buildSetup("mic", SETTINGS, glossary);
  assert.equal(setup.model, `models/${MODEL}`);
  assert.equal(setup.generationConfig.translationConfig, undefined);

  const text = setup.systemInstruction.parts[0].text;
  assert.equal(text, buildSystemInstruction("en", "ja", glossary));
  assert.match(text, /from English to Japanese \(日本語\)/);
  assert.match(text, /- Kubernetes → クバネティス/);
});

test("an unknown voice falls back rather than failing the connection", () => {
  // A bad name is a hard 1007 at connect, which the retry loop would spin on.
  assert.equal(resolveVoice("nonsense"), DEFAULT_VOICE);
  assert.equal(resolveVoice(""), DEFAULT_VOICE);
  assert.equal(resolveVoice(undefined), DEFAULT_VOICE);
  assert.equal(resolveVoice("  puck "), "Puck");
  const { setup } = buildSetup("tab", { ...SETTINGS, voice: "Nope" }, []);
  assert.equal(
    setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
    DEFAULT_VOICE
  );
});

test("the glossary only reaches the direction that can use it", () => {
  const glossary = [{ source: "Gemini", target: "ジェミニ", transcription: "Gemini" }];
  const tab = JSON.stringify(buildSetup("tab", SETTINGS, glossary));
  assert.ok(!tab.includes("ジェミニ"), "simul mode takes no glossary");
  const mic = JSON.stringify(buildSetup("mic", SETTINGS, glossary));
  assert.ok(mic.includes("ジェミニ"));
});

test("the endpoint is the Live API and the key is escaped into the query", () => {
  const url = endpointUrl("AIza+slash/key");
  assert.ok(url.startsWith("wss://generativelanguage.googleapis.com/ws/"));
  assert.ok(url.includes("BidiGenerateContent?key=AIza%2Bslash%2Fkey"));
});

test("parseDuration reads the protobuf Duration goAway carries", () => {
  assert.equal(parseDuration("30s"), 30000);
  assert.equal(parseDuration("1.5s"), 1500);
  assert.equal(parseDuration(undefined), 0);
  assert.equal(parseDuration("nonsense"), 0);
});

test("arrayToBase64 round-trips a PCM buffer", () => {
  const pcm = new Int16Array([0, 1, -1, 32767, -32768]);
  const encoded = arrayToBase64(pcm.buffer);
  // Buffer.from hands back a view into Node's shared pool, so copy before
  // reinterpreting the bytes as Int16.
  const bytes = Uint8Array.from(Buffer.from(encoded, "base64"));
  assert.deepEqual(new Int16Array(bytes.buffer), pcm);
});
