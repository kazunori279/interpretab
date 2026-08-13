/**
 * An hour of continuous translation, scored — not part of `npm test`.
 *
 * `live-smoke.mjs` answers "does the wire format work". This answers the
 * question that only time can: does it still work an hour later, and is the
 * translation as good at minute 58 as at minute 2? Those are different
 * questions because a Live session expires roughly every ten minutes, so an hour
 * contains half a dozen handovers, and a handover is where quality goes to die —
 * a sentence half-spoken into a session that is closing, replayed into one that
 * has not heard the beginning.
 *
 * It is a port of `tests/test_long.py` from the relay this extension replaced
 * (https://github.com/kazunori279/adk-live-translator), and deliberately writes
 * the same report format: that repo's `tests/chart_soak.py` will chart a run
 * from here against the relay's old runs, which is the only way to say whether
 * dropping the server cost anything.
 *
 * Three things changed in the port, all of them to keep this repo dependency-free:
 *
 *   - **TTS**: macOS `say` instead of Cloud Text-to-Speech.
 *   - **Sentence generation and scoring**: `generateContent` over REST with the
 *     same key, instead of the Python client library.
 *   - **Speech-to-text on the returned audio is gone.** Cloud STT gave the
 *     original an independent reading of the spoken translation, which fed one
 *     metric — Output Transcription Score, the model's own transcript checked
 *     against what an outside listener heard. Nothing else used it: the
 *     translation itself was always scored from the model's `outputTranscription`,
 *     because Cloud STT mishears correctly-spoken Japanese often enough to be the
 *     less reliable witness. So that one distribution is absent here and every
 *     other number remains comparable.
 *
 * What this run has that the original could not: it drives `SessionLoop`
 * in-process, so the session count, the `goAway`s and the handovers are reported
 * rather than inferred from a server log.
 *
 * Usage:
 *   node tests/soak.mjs <key-file> [options]
 *
 *     --direction mic|tab   mic (default) declares the source and applies the
 *                           glossary; tab detects the source and cannot.
 *     --duration 3600       seconds
 *     --source en           spoken language (mic direction only)
 *     --target ja           translate into
 *     --voice Samantha      a `say` voice that speaks --source
 *     --glossary <csv>      default tests/soak-glossary.csv
 *     --log soak.jsonl      metrics per iteration; the report goes beside it
 */

import fs from "node:fs";
import { buildSetup } from "../lib/live-session.js";
import { SessionLoop } from "../lib/session-loop.js";
import { DEFAULTS } from "../lib/settings.js";
import { applyDisplayMap, buildDisplayMap, normalizeEntry, parseGlossaryCsv } from "../lib/glossary.js";
import {
  SCORE_BUCKETS,
  argOf,
  clock,
  formatDistribution,
  judge,
  readKey,
  sleep,
  speak,
  streamPcm,
  streamSilence,
  trackedSessionClass,
} from "./live-harness.mjs";

/** How long one sentence may take to come back before it counts as lost. */
const RESPONSE_TIMEOUT_MS = 30000;

/** Trailing silence, so the server's voice-activity detection can end the turn. */
const SILENCE_AFTER_SPEECH_MS = 2000;

/**
 * Simultaneous translation never ends a turn — it answers continuously, so no
 * `turnComplete` is coming and the transcript falling quiet is the only signal
 * that the sentence is finished. Same value and same reasoning as `SIMUL_IDLE_MS`
 * in `offscreen.js`, which is what closes the caption on screen.
 */
const SIMUL_IDLE_FINALIZE_MS = 2000;

/** Above this, a first response is called out as slow in the running log. */
const LATENCY_THRESHOLD_SEC = 5.0;

/** Every third sentence is built around a glossary term. */
const GLOSSARY_EVERY = 3;

/** How long the stream must be quiet before the next sentence goes in. */
const SETTLE_QUIET_MS = 500;
const SETTLE_MAX_MS = 5000;

const TOPICS = [
  "technology and software engineering",
  "travel and geography",
  "food and cooking",
  "business and finance",
  "science and nature",
  "sports and fitness",
  "art and music",
  "history and culture",
  "health and medicine",
  "education and learning",
  "weather and seasons",
  "daily life and routines",
  "news and current events",
  "philosophy and ethics",
];

// ------------------------------------------------------------------ arguments

const keyFile = process.argv[2];
if (!keyFile || keyFile.startsWith("--")) {
  console.error("usage: node tests/soak.mjs <key-file> [--direction mic|tab] [--duration 3600] …");
  process.exit(2);
}

const direction = argOf("--direction", "mic");
const durationSec = Number(argOf("--duration", 3600));
const source = argOf("--source", "en");
const target = argOf("--target", "ja");
const voice = argOf("--voice", "Samantha");
const glossaryFile = argOf("--glossary", new URL("soak-glossary.csv", import.meta.url).pathname);
const logPath = argOf("--log", `soak_${direction}.jsonl`);

if (!["mic", "tab"].includes(direction)) {
  console.error(`--direction must be mic or tab, got ${direction}`);
  process.exit(2);
}

const apiKey = readKey(keyFile);

// The tab direction runs the simultaneous-translation model, which takes no
// system instruction and therefore has nowhere to put a glossary. Loading one
// and reporting on it would be measuring nothing.
const glossary = parseGlossaryCsv(fs.readFileSync(glossaryFile, "utf8"))
  .map(normalizeEntry)
  .filter(Boolean);
const useGlossary = direction === "mic";
const displayMap = buildDisplayMap(useGlossary ? glossary : []);

const t0 = Date.now();
const log = (line) => console.log(`[${clock(t0)}] ${line}`);
const logFile = fs.createWriteStream(logPath, { flags: "a" });

// ------------------------------------------------------------------- the loop

/** Where events land. Swapped per iteration; null while the stream is settling. */
let turn = null;
let staleEvents = 0;
let lastEventAt = 0;

function newTurn() {
  return {
    inputFinals: [],
    inputPartial: "",
    outputFinals: [],
    outputPartial: "",
    audioBytes: 0,
    firstResponseAt: 0,
    lastTextAt: 0,
    turnCompleteAt: 0,
    complete: false,
  };
}

/** The text to score: the last finished fragment, or everything accumulated. */
const settle = (finals, partial) => (finals.length ? finals[finals.length - 1] : partial);

const { SessionClass, counts } = trackedSessionClass(log);

let onReady;
const ready = new Promise((resolve) => {
  onReady = resolve;
});

const settings = { ...DEFAULTS, tabTarget: target, micSource: source, micTarget: target };

const loop = new SessionLoop({
  apiKey,
  setup: buildSetup(direction, settings, useGlossary ? glossary : []),
  SessionClass,
  now: () => Date.now(),
  onStatus: (state, detail) => {
    if (state === "connected") onReady();
    if (state === "error" || state === "disconnected") log(`status: ${state}${detail ? ` (${detail})` : ""}`);
  },
  onEvent: (ev) => {
    lastEventAt = Date.now();
    if (!turn) {
      staleEvents += 1;
      return;
    }
    if (ev.type === "audio") {
      turn.audioBytes += ev.buffer.byteLength;
      turn.firstResponseAt ||= Date.now();
      return;
    }
    if (ev.type === "turnComplete") {
      // A turn boundary with nothing in front of it belongs to whatever came
      // before — including the synthetic one `SessionLoop` emits for a turn it
      // abandoned at a handover. Closing this iteration on it would score this
      // sentence against the previous one and leave every later iteration a
      // turn behind.
      if (turn.firstResponseAt) {
        turn.turnCompleteAt = Date.now();
        turn.complete = true;
      }
      return;
    }
    // "input" or "output". A finished fragment carries the whole sentence and
    // replaces what came before it, exactly as `offscreen.js` treats it.
    const finals = ev.type === "input" ? turn.inputFinals : turn.outputFinals;
    if (ev.finished) finals.push(ev.text);
    else if (ev.type === "input") turn.inputPartial += ev.text;
    else turn.outputPartial += ev.text;
    if (ev.type === "output") {
      turn.firstResponseAt ||= Date.now();
      turn.lastTextAt = Date.now();
    }
  },
});

// ----------------------------------------------------------------- iterations

async function generateSentence(index, term) {
  const prompt = term
    ? `Generate exactly one natural ${source} sentence (10-20 words) that uses the term ` +
      `"${term}" naturally. Output only the sentence, no quotes or explanation.`
    : `Generate exactly one natural ${source} sentence (10-20 words) about ` +
      `${TOPICS[index % TOPICS.length]}. Output only the sentence, no quotes or explanation.`;
  return (await judge(apiKey, prompt)).replace(/^["']|["']$/g, "").trim();
}

async function verifyTranslation(original, translated) {
  const text = await judge(
    apiKey,
    `You are a translation quality evaluator. Compare the original ${source} sentence ` +
      `with its ${target} translation.\n\n` +
      `Original (${source}): ${original}\n` +
      `Translation (${target}): ${translated}\n\n` +
      `Score the semantic accuracy from 0 to 10 (10 = perfect). Reply in exactly this format:\n` +
      `SCORE: <number>\nPASS: <yes/no>\nREASON: <one sentence>`
  );
  let score = 0;
  let passed = false;
  let reason = text;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const upper = line.toUpperCase();
    if (upper.startsWith("SCORE:")) score = Number.parseFloat(line.split(":")[1]) || 0;
    else if (upper.startsWith("PASS:")) passed = line.toLowerCase().includes("yes");
    else if (upper.startsWith("REASON:")) reason = line.slice(line.indexOf(":") + 1).trim();
  }
  return { passed, score, reason };
}

async function scoreTranscription(reference, transcription) {
  const text = await judge(
    apiKey,
    `Score how accurately the transcription matches the reference text. Ignore minor ` +
      `punctuation or formatting differences. Focus on whether the words and meaning are ` +
      `captured correctly.\n\nReference: ${reference}\nTranscription: ${transcription}\n\n` +
      `Score from 0 to 10 (10 = perfect match). Reply with ONLY a number, nothing else.`
  );
  return Number.parseFloat(text) || 0;
}

/**
 * Wait for the stream to go quiet, dropping whatever arrives.
 *
 * Anything still coming belongs to a turn this run has already given up on —
 * most often a handover, where the abandoned turn's audio is replayed into the
 * replacement and answered a few seconds after the iteration that sent it
 * finished. One stream serves the whole hour, so those frames have to be thrown
 * away here or they are scored against the next sentence.
 */
async function settleStream() {
  turn = null;
  staleEvents = 0;
  const deadline = Date.now() + SETTLE_MAX_MS;
  lastEventAt = Date.now();
  while (Date.now() < deadline && Date.now() - lastEventAt < SETTLE_QUIET_MS) await sleep(100);
  if (staleEvents) log(`dropped ${staleEvents} event(s) left over from the previous turn`);
}

async function runIteration(index, entry) {
  const started = Date.now();
  const goAwaysBefore = counts.goAways;
  const result = {
    index,
    original: "",
    inputTranscription: null,
    outputTranscription: null,
    passed: false,
    score: 0,
    reason: "",
    error: null,
    elapsed: 0,
    firstResponseSec: null,
    turnCompleteSec: null,
    glossaryTerm: entry?.source ?? null,
    glossaryFound: null,
    glossarySpoken: null,
    inputTranscriptionScore: null,
    cutover: false,
  };
  const finish = () => {
    result.elapsed = (Date.now() - started) / 1000;
    result.cutover = counts.goAways > goAwaysBefore;
    return result;
  };

  try {
    result.original = await generateSentence(index, entry?.source);
  } catch (err) {
    result.error = `generate: ${err.message}`;
    return finish();
  }

  let pcm;
  try {
    pcm = speak(result.original, { voice });
  } catch (err) {
    result.error = `tts: ${err.message}`;
    return finish();
  }

  turn = newTurn();
  await streamPcm(loop, pcm);
  const speechDoneAt = Date.now();
  await streamSilence(loop, SILENCE_AFTER_SPEECH_MS);

  const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
  while (Date.now() < deadline && !turn.complete) {
    await sleep(100);
    // No turn boundary is coming for simultaneous translation, so the
    // transcript falling quiet ends it — back-dated to the last text, which
    // keeps the latency figure comparable with the other direction's.
    if (direction === "tab" && turn.lastTextAt && Date.now() - turn.lastTextAt >= SIMUL_IDLE_FINALIZE_MS) {
      turn.turnCompleteAt = turn.lastTextAt;
      break;
    }
  }

  const done = turn;
  const inputText = settle(done.inputFinals, done.inputPartial);
  const rawOutput = settle(done.outputFinals, done.outputPartial);
  // The same post-processing the side panel and the captions see, so a glossary
  // term is checked in the form the user is actually shown.
  const outputText = applyDisplayMap(rawOutput, displayMap);
  result.inputTranscription = inputText || null;
  result.outputTranscription = outputText || null;
  if (done.firstResponseAt) {
    result.firstResponseSec = Math.max(0, (done.firstResponseAt - speechDoneAt) / 1000);
  }
  if (done.turnCompleteAt) {
    result.turnCompleteSec = Math.max(0, (done.turnCompleteAt - speechDoneAt) / 1000);
  }
  if (entry && outputText) {
    // Two different questions, and the original soak could only ask the first.
    // `glossaryFound` is what the user sees — but for a term whose display
    // column is the source spelling, a model that ignored the glossary entirely
    // and just said "Kubernetes" passes it. `glossarySpoken` looks at the
    // transcript before the display map and asks whether the configured
    // pronunciation is what actually came out of the speaker, which is the only
    // evidence that the glossary reached the model at all.
    result.glossaryFound = outputText.includes(entry.transcription);
    result.glossarySpoken = rawOutput.includes(entry.target);
  }

  if (inputText) {
    try {
      result.inputTranscriptionScore = await scoreTranscription(result.original, inputText);
    } catch {
      // A scoring failure is not a translation failure; the metric just goes missing.
    }
  }

  if (!outputText) {
    result.error = "no response";
    return finish();
  }

  try {
    Object.assign(result, await verifyTranslation(result.original, outputText));
  } catch (err) {
    result.error = `verify: ${err.message}`;
  }
  return finish();
}

// ---------------------------------------------------------------------- start

log(`${direction}: ${source} → ${target}, ${durationSec}s, voice ${voice}`);
log(`glossary: ${useGlossary ? `${glossary.length} entries from ${glossaryFile}` : "not applicable to tab audio"}`);
loop.start();
await ready;

const stats = {
  iterations: 0,
  passed: 0,
  failed: 0,
  errors: 0,
  totalScore: 0,
  results: [],
};

let iteration = 0;
let glossaryCursor = 0;

while ((Date.now() - t0) / 1000 < durationSec) {
  await settleStream();
  // Every third sentence carries a term, taken in order rather than at random,
  // so a run covers the whole CSV instead of re-testing the same few entries.
  const entry =
    useGlossary && iteration % GLOSSARY_EVERY === 0
      ? glossary[glossaryCursor++ % glossary.length]
      : null;
  const result = await runIteration(iteration, entry);
  iteration += 1;
  stats.iterations += 1;
  stats.results.push(result);
  logFile.write(JSON.stringify({ ...result, at: new Date().toISOString() }) + "\n");

  const latencyTag =
    result.turnCompleteSec === null
      ? ""
      : result.turnCompleteSec > LATENCY_THRESHOLD_SEC
        ? ` SLOW(${result.turnCompleteSec.toFixed(1)}s)`
        : ` ${result.turnCompleteSec.toFixed(1)}s`;
  // ✓ the pronunciation was used, ~ the caption is right but the model may have
  // simply said the source term, ✗ neither.
  const glossaryMark = result.glossarySpoken ? "✓" : result.glossaryFound ? "~" : "✗";
  const glossaryTag = entry ? ` GLOSS${glossaryMark} ${entry.source}` : "";
  const cutoverTag = result.cutover ? " [handover]" : "";
  const shown = (result.outputTranscription || "").slice(0, 40);

  if (result.error) {
    stats.errors += 1;
    log(`#${result.index} ERROR (${result.elapsed.toFixed(1)}s)${latencyTag}${glossaryTag}${cutoverTag} | "${result.original.slice(0, 50)}" | ${result.error}`);
  } else if (result.passed) {
    stats.passed += 1;
    stats.totalScore += result.score;
    log(`#${result.index} PASS (${result.score.toFixed(0)}/10) (${result.elapsed.toFixed(1)}s)${latencyTag}${glossaryTag}${cutoverTag} | "${result.original.slice(0, 50)}" -> "${shown}"`);
  } else {
    stats.failed += 1;
    stats.totalScore += result.score;
    log(`#${result.index} FAIL (${result.score.toFixed(0)}/10) (${result.elapsed.toFixed(1)}s)${latencyTag}${glossaryTag}${cutoverTag} | "${result.original.slice(0, 50)}" -> "${shown}" | ${result.reason}`);
  }
  const remaining = durationSec - (Date.now() - t0) / 1000;
  if (remaining > 0) log(`         [${(durationSec - remaining).toFixed(0)}s / ${durationSec}s elapsed, ${remaining.toFixed(0)}s remaining]`);
}

loop.close();

// --------------------------------------------------------------------- report

const ok = stats.results.filter((r) => !r.error);
const scored = stats.passed + stats.failed;
const report = [];
report.push(`\n[${clock(t0)}] === SUMMARY ===`);
report.push(
  `Duration: ${((Date.now() - t0) / 1000).toFixed(0)}s | Iterations: ${stats.iterations} | ` +
    `Passed: ${stats.passed}/${stats.iterations} (${((100 * stats.passed) / (stats.iterations || 1)).toFixed(1)}%) | ` +
    `Avg score: ${(scored ? stats.totalScore / scored : 0).toFixed(1)}/10 | Errors: ${stats.errors}`
);
report.push(
  `Sessions: ${counts.opened} opened, ${counts.ready} ready, ${counts.failed} failed | ` +
    `goAway: ${counts.goAways} | server closes: ${counts.closed} | ` +
    `handovers mid-sentence: ${stats.results.filter((r) => r.cutover).length}`
);

if (useGlossary) {
  const checked = stats.results.filter((r) => r.glossaryFound !== null);
  const shown = checked.filter((r) => r.glossaryFound).length;
  const spoken = checked.filter((r) => r.glossarySpoken).length;
  const pct = (n) => ((100 * n) / (checked.length || 1)).toFixed(1);
  report.push(
    `Glossary: ${shown}/${checked.length} terms captioned as configured (${pct(shown)}%) | ` +
      `${spoken}/${checked.length} spoken with the configured pronunciation (${pct(spoken)}%)`
  );
}

report.push(...formatDistribution("Translation Score", ok.map((r) => r.score), SCORE_BUCKETS));

if (useGlossary) {
  const glossaryScores = ok.filter((r) => r.glossaryFound !== null).map((r) => r.score);
  report.push(...formatDistribution("Glossary Iteration Score", glossaryScores, SCORE_BUCKETS));
}

const defined = (key) => stats.results.map((r) => r[key]).filter((v) => v !== null && v !== undefined);

report.push(
  ...formatDistribution("First Response (speech-end to first audio/transcript)", defined("firstResponseSec"), [
    ["=0s", 0, 0.001],
    ["0-0.1s", 0.001, 0.1],
    ["0.1-0.5s", 0.1, 0.5],
    ["0.5-1s", 0.5, 1.0],
    ["1-2s", 1.0, 2.0],
    ["2-5s", 2.0, 5.0],
    [">5s", 5.0, 1e9],
  ])
);

report.push(
  ...formatDistribution("Turn Complete (speech-end to full translation)", defined("turnCompleteSec"), [
    ["<2s", 0, 2.0],
    ["2-3s", 2.0, 3.0],
    ["3-4s", 3.0, 4.0],
    ["4-5s", 4.0, 5.0],
    ["5-7s", 5.0, 7.0],
    ["7-10s", 7.0, 10.0],
    [">10s", 10.0, 1e9],
  ])
);

report.push(...formatDistribution("Input Transcription Score", defined("inputTranscriptionScore"), SCORE_BUCKETS));

report.push(
  ...formatDistribution("Total Iteration Time", ok.map((r) => r.elapsed), [
    ["<10s", 0, 10.0],
    ["10-15s", 10.0, 15.0],
    ["15-20s", 15.0, 20.0],
    ["20-25s", 20.0, 25.0],
    ["25-30s", 25.0, 30.0],
    [">30s", 30.0, 1e9],
  ])
);

for (const line of report) console.log(line);

const reportPath = logPath.replace(/\.jsonl$/, "") + ".report";
fs.writeFileSync(reportPath, report.join("\n") + "\n");
logFile.end();
log(`Metrics log: ${logPath}`);
log(`Report: ${reportPath}`);

await sleep(100); // let the sockets go before the process does
process.exit(stats.errors === 0 && stats.passed > 0 ? 0 : 1);
