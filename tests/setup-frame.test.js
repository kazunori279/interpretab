/**
 * The `setup` frame is the one place where a wrong field name is silent: the
 * API accepts the connection and simply ignores what it does not recognise, so
 * a misplaced `translationConfig` shows up as "the translation is in the wrong
 * language" half a minute into a demo. These assertions pin the exact shape.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  MODEL,
  SIMUL_MODEL,
  DEFAULT_VOICE,
  agentLanguageCode,
  resolveVoice,
  simulLanguageCode,
} from "../lib/languages.js";
import { buildSetup, endpointUrl, isSimul, parseDuration, arrayToBase64 } from "../lib/live-session.js";
import { buildConversationInstruction } from "../lib/instructions.js";
import { DEFAULTS } from "../lib/settings.js";

const SETTINGS = {
  voice: "Kore",
  tabTarget: "ja",
  micMode: "conversation",
  micSource: "en",
  micTarget: "ja",
};

test("the tab direction configures simultaneous translation and no instruction", () => {
  const { setup } = buildSetup("tab", SETTINGS, []);
  assert.equal(setup.model, `models/${SIMUL_MODEL}`);
  assert.equal(setup.systemInstruction, undefined);

  // Transcription sits on `setup`, translation inside `generationConfig`. The
  // live-translate guide shows both nested; the server rejects the nested
  // transcription outright, so this split is load-bearing and not cosmetic.
  assert.deepEqual(setup.inputAudioTranscription, {});
  assert.deepEqual(setup.outputAudioTranscription, {});

  const gen = setup.generationConfig;
  assert.deepEqual(gen.responseModalities, ["AUDIO"]);
  assert.equal(gen.inputAudioTranscription, undefined);
  assert.equal(gen.outputAudioTranscription, undefined);
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

test("the mic in conversation mode carries an instruction and no translationConfig", () => {
  const glossary = [{ source: "Kubernetes", target: "クバネティス", transcription: "Kubernetes" }];
  const { setup } = buildSetup("mic", SETTINGS, glossary);
  assert.equal(setup.model, `models/${MODEL}`);
  assert.equal(setup.generationConfig.translationConfig, undefined);

  const text = setup.systemInstruction.parts[0].text;
  assert.equal(text, buildConversationInstruction("en", "ja", glossary));
  // Both directions named, in both directions — the routing rule is spelled out
  // as two cases on purpose, because "swap the languages" leaves the model free
  // to decide a sentence is already in the right language and echo it back.
  assert.match(text, /one speaks English, the other speaks Japanese \(日本語\)/);
  assert.match(text, /When you hear English, say it in Japanese \(日本語\)/);
  assert.match(text, /When you hear Japanese \(日本語\), say it in English/);
  assert.match(text, /- Kubernetes → クバネティス/);
});

test("the mic in simul mode is the tab direction's model, aimed at micTarget", () => {
  const settings = { ...SETTINGS, micMode: "simul", micTarget: "ja", tabTarget: "en" };
  const { setup } = buildSetup("mic", settings, []);
  assert.equal(setup.model, `models/${SIMUL_MODEL}`);
  assert.equal(setup.systemInstruction, undefined);
  assert.deepEqual(setup.generationConfig.translationConfig, {
    // micTarget, not tabTarget: the two directions are aimed independently and
    // reading the wrong one is silent — the session connects and translates
    // into the other direction's language.
    targetLanguageCode: "ja",
    echoTargetLanguage: false,
  });
  assert.deepEqual(setup.inputAudioTranscription, {});
  assert.deepEqual(setup.outputAudioTranscription, {});
});

test("simul is the microphone's default, and anything but conversation means simul", () => {
  // The setting decides which model opens and whether the transcript
  // accumulator can wait for a `turnComplete` that simul never sends, so a
  // value that fell out of storage must not land on the turn-taking model.
  assert.equal(DEFAULTS.micMode, "simul");
  assert.equal(isSimul("mic", { micMode: "conversation" }), false);
  assert.equal(isSimul("mic", { micMode: "simul" }), true);
  assert.equal(isSimul("mic", {}), true);
  // The tab direction has no say in it.
  assert.equal(isSimul("tab", { micMode: "conversation" }), true);
});

test("the mic's target maps between the two models' code spaces", () => {
  // One stored `micTarget` serves both modes and the models disagree about a
  // handful of names, so the round trip has to survive a mode change.
  for (const [agent, simul] of [
    ["zh", "zh-Hans"],
    ["pt", "pt-BR"],
    ["iw", "he"],
    ["ja", "ja"],
  ]) {
    const { setup } = buildSetup("mic", { ...SETTINGS, micMode: "simul", micTarget: agent }, []);
    assert.equal(setup.generationConfig.translationConfig.targetLanguageCode, simul);
    assert.equal(agentLanguageCode(simul), agent);
  }
  // Not an inverse: the simultaneous model splits two of these and the agent
  // model has one code for each pair.
  assert.equal(agentLanguageCode("zh-Hant"), "zh");
  assert.equal(agentLanguageCode("pt-PT"), "pt");
  assert.equal(agentLanguageCode("en"), "en");
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

test("the glossary only reaches the session that can use it", () => {
  const glossary = [{ source: "Gemini", target: "ジェミニ", transcription: "Gemini" }];
  const tab = JSON.stringify(buildSetup("tab", SETTINGS, glossary));
  assert.ok(!tab.includes("ジェミニ"), "simul mode takes no glossary");
  // Same model, same reason, even though this one is the microphone.
  const micSimul = JSON.stringify(buildSetup("mic", { ...SETTINGS, micMode: "simul" }, glossary));
  assert.ok(!micSimul.includes("ジェミニ"));
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
