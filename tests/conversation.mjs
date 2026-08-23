/**
 * A two-way conversation, and which of the two speakers gets ignored — not part
 * of `npm test`.
 *
 * `soak.mjs` speaks one language for an hour, so it can say whether translation
 * still works; it cannot say anything about conversation mode's actual job,
 * which is deciding *which way* to interpret an utterance it was not told the
 * language of in advance. This script is the two-speaker case: an English
 * speaker and a Japanese speaker taking turns into one microphone, exactly as
 * `micMode: "conversation"` is meant to be used.
 *
 * It exists because of a report that English utterances are sometimes ignored —
 * the Japanese half of the conversation comes back interpreted and the English
 * half sometimes produces nothing at all. There are two candidate causes and
 * they live in different places, so the run measures both rather than assuming
 * one:
 *
 *   1. **The duplex gate.** `usesDuplexGate` is on for exactly this mode, and
 *      `offscreen.js` drops microphone frames for as long as this direction's
 *      own translated voice is still playing out. The model sends a whole
 *      sentence of audio far faster than it takes to say, so the gate stays shut
 *      for seconds after the session looks idle — and anyone who starts talking
 *      before the interpreter has finished is not being ignored by the model,
 *      they are being cut off by us, before a byte leaves the machine. That gate
 *      is reproduced here, deadline for deadline, so a lost utterance can be
 *      attributed to it or cleared of it. `--gate off` takes it away.
 *
 *   2. **The echo guard.** The instruction tells the model to ignore "your own
 *      output coming back — your voice, repeating what you just said". In a
 *      two-language session the interpreter's own voice is, half the time,
 *      speaking the same language as one of the humans, so a human turn can look
 *      like the echo the guard is aimed at. The dialogue therefore contains a
 *      few places where the same person speaks twice in a row, which is the only
 *      way to get turns that are *not* preceded by the interpreter speaking that
 *      speaker's language — and the report splits the drop rate by that.
 *
 * No glossary and no display map: the only thing under test is which speaker
 * gets heard, and every extra sentence in the system instruction is another
 * thing to explain a difference by.
 *
 * The key is read from a file and never printed, as everywhere else here.
 *
 * Usage:
 *   node tests/conversation.mjs <key-file> [options]
 *
 *     --turns 12            how many utterances the dialogue has
 *     --source en           the language you speak — `micSource`
 *     --target ja           the language the other person speaks — `micTarget`
 *     --source-voice Samantha   a `say` voice for --source
 *     --target-voice Kyoko      a `say` voice for --target
 *     --gate on|off         reproduce offscreen's duplex gate (default on: it ships on)
 *     --reply-gap 300       ms between the interpretation finishing and the next
 *                           person starting. Negative means they start before it
 *                           has finished, which is what a real room does.
 *     --topic "…"           what the two of them talk about
 *     --log conversation.jsonl
 */

import fs from "node:fs";
import { UPLINK_RATE, buildSetup } from "../lib/live-session.js";
import { SessionLoop } from "../lib/session-loop.js";
import { DEFAULTS } from "../lib/settings.js";
import { LANGUAGES } from "../lib/languages.js";
import {
  SCORE_BUCKETS,
  argOf,
  clock,
  duplexGate,
  formatDistribution,
  judge,
  readKey,
  sleep,
  speak,
  streamPcm,
  streamSilence,
  trackedSessionClass,
} from "./live-harness.mjs";

/** How long one utterance may take to come back before it counts as ignored. */
const RESPONSE_TIMEOUT_MS = 30000;

/** Trailing silence, so the server's voice-activity detection can end the turn. */
const SILENCE_AFTER_SPEECH_MS = 2000;

/** How long the stream must be quiet before the conversation moves on. */
const SETTLE_QUIET_MS = 500;
const SETTLE_MAX_MS = 5000;

/** Silence `speak()` puts at both ends of a clip; named so it can be subtracted. */
const PAD_MS = 1000;

/** Never wait longer than this for the interpreter's voice to finish. */
const REPLY_WAIT_MAX_MS = 20000;

/** How many times in the dialogue the same person speaks twice in a row. */
const DOUBLE_TURNS = 2;

// ------------------------------------------------------------------ arguments

const keyFile = process.argv[2];
if (!keyFile || keyFile.startsWith("--")) {
  console.error("usage: node tests/conversation.mjs <key-file> [--turns 12] [--gate off] …");
  process.exit(2);
}

const turnCount = Number(argOf("--turns", 12));
const source = argOf("--source", "en");
const target = argOf("--target", "ja");
const sourceVoice = argOf("--source-voice", "Samantha");
const targetVoice = argOf("--target-voice", "Kyoko");
const gateOn = argOf("--gate", "on") !== "off";
const replyGapMs = Number(argOf("--reply-gap", 300));
const topic = argOf("--topic", "arranging a factory visit next month");
const logPath = argOf("--log", `conversation_${source}_${target}${gateOn ? "" : "_ungated"}.jsonl`);

const apiKey = readKey(keyFile);

/**
 * `LANGUAGES` carries the endonym for the language menu — "Japanese (日本語)" —
 * and that is the name the system instruction uses, so it is the name the model
 * is working from. It is the wrong name to compare against: asked what language
 * a line is in, a model answers "Japanese", and a check that the answer contains
 * "Japanese (日本語)" is a check that never fires. So the parenthetical comes off
 * for everything this script says and reads.
 */
const named = (code) => (LANGUAGES[code] || code).replace(/\s*\(.*\)\s*$/, "");
const sourceName = named(source);
const targetName = named(target);

const settings = {
  ...DEFAULTS,
  micMode: "conversation",
  micSource: source,
  micTarget: target,
};

/** A speaks --source, B speaks --target. Everything downstream keys off this. */
const SPEAKERS = {
  A: { code: source, name: sourceName, voice: sourceVoice, other: targetName },
  B: { code: target, name: targetName, voice: targetVoice, other: sourceName },
};

const t0 = Date.now();
const log = (line) => console.log(`[${clock(t0)}] ${line}`);
const logFile = fs.createWriteStream(logPath, { flags: "a" });

// -------------------------------------------------------------------- the loop

/**
 * What the recorder in `offscreen.js` does with a frame while the interpreter is
 * still talking, which is: throw it away. `loop` is filled in below — nothing
 * sends through the gate until the conversation starts.
 */
const uplink = duplexGate({ send: (buffer) => loop.send(buffer) }, { enabled: gateOn });

/**
 * Where events land. Always points at the most recent utterance — there is no
 * gap during which events belong to nobody, because an answer that arrives after
 * this run gave up is the most interesting kind and must not be dropped
 * unnoticed.
 */
let turn = newTurn(-1);
let lastEventAt = 0;

function newTurn(index) {
  return {
    index,
    inputFinals: [],
    inputPartial: "",
    outputFinals: [],
    outputPartial: "",
    audioBytes: 0,
    firstResponseAt: 0,
    turnCompleteAt: 0,
    complete: false,
    scoredAt: 0,
    trailing: false,
  };
}

/** The text to score: the last finished fragment, or everything accumulated. */
const settle = (finals, partial) => (finals.length ? finals[finals.length - 1] : partial);

const { SessionClass, counts } = trackedSessionClass(log);

let onReady;
const ready = new Promise((resolve) => {
  onReady = resolve;
});

const loop = new SessionLoop({
  apiKey,
  setup: buildSetup("mic", settings, []),
  SessionClass,
  now: () => Date.now(),
  onStatus: (state, detail) => {
    if (state === "connected") onReady();
    if (state === "error" || state === "disconnected") log(`status: ${state}${detail ? ` (${detail})` : ""}`);
  },
  onEvent: (ev) => {
    lastEventAt = Date.now();
    // Said after this run had already written the utterance off. It is too late
    // to go in that turn's row, and it would be scored against the next
    // speaker's sentence, so it is called out here and nowhere else.
    if (turn.scoredAt && !turn.trailing && (ev.type === "output" || ev.type === "audio")) {
      turn.trailing = true;
      log(`         (#${turn.index} answered ${((Date.now() - turn.scoredAt) / 1000).toFixed(1)}s too late)`);
    }
    if (ev.type === "audio") {
      // Before anything else: the gate follows the audio, and it has to keep
      // following it even for a turn this run has already given up on.
      uplink.note(ev.buffer.byteLength);
      turn.audioBytes += ev.buffer.byteLength;
      turn.firstResponseAt ||= Date.now();
      return;
    }
    if (ev.type === "turnComplete") {
      // A boundary with nothing in front of it belongs to whatever came before,
      // including the synthetic one `SessionLoop` emits for a turn abandoned at
      // a handover. Closing on it would move every later utterance one turn out.
      if (turn.firstResponseAt) {
        turn.turnCompleteAt = Date.now();
        turn.complete = true;
      }
      return;
    }
    // Everything that is left is not necessarily a transcript: `usage` frames
    // come up this path too, and one of them landing in the accumulator appends
    // the string "undefined" to the sentence about to be scored — which is how
    // this was found, in the first run of this script.
    if (ev.type !== "input" && ev.type !== "output") return;
    const finals = ev.type === "input" ? turn.inputFinals : turn.outputFinals;
    if (ev.finished) finals.push(ev.text);
    else if (ev.type === "input") turn.inputPartial += ev.text;
    else turn.outputPartial += ev.text;
    if (ev.type === "output") turn.firstResponseAt ||= Date.now();
  },
});

// ------------------------------------------------------------------- the words

/**
 * Ask a model for the dialogue rather than writing one down.
 *
 * A fixed script would be the same twelve sentences every run, and this is
 * looking for a behaviour that shows up "sometimes" — twelve sentences that
 * happen not to trigger it would read as a fix. The shape is fixed instead: the
 * turn count, the two languages, and the handful of places where one person
 * speaks twice in a row.
 *
 * It is written in one language and then half of it is translated, which is a
 * detour with a reason. Asked outright for a conversation in two languages, the
 * model writes a sentence and then writes that same sentence again in the other
 * one — twelve turns carrying six sentences, each said twice. Told not to, it
 * does it anyway; the first two rounds of this script were run on such a script
 * before it was noticed. That dialogue tests far less than it looks like it
 * does, and it is the one input a run investigating an echo guard must not be
 * built out of: every utterance the session hears is then one it has itself just
 * produced a translation of, so a model that ignores the humans and a model that
 * is working perfectly produce the same transcript.
 *
 * Writing it monolingual first removes the temptation. B answers A because at
 * that point there is nothing to translate, and the second pass only changes
 * what language B's answers are in.
 */
async function writeDialogue() {
  const draft =
    `Write a natural spoken conversation between two colleagues, A and B, about ${topic}.\n\n` +
    `Rules:\n` +
    `- Exactly ${turnCount} lines, all in ${sourceName}.\n` +
    `- Every line is one sentence of 8 to 20 words.\n` +
    `- Start every line with "A: " or "B: ".\n` +
    `- They mostly take turns, but ${DOUBLE_TURNS} times the same person says two lines in a row.\n` +
    `- Nobody ever repeats what the other one just said. Each line moves the conversation on: a ` +
    `question, an answer, a disagreement, a detail nobody has mentioned yet.\n` +
    `- Output the lines and nothing else: no numbering, no stage directions.`;

  for (let attempt = 0; attempt < 3; attempt++) {
    const lines = parseDialogue(await judge(apiKey, draft));
    if (lines.length < 4 || !lines.some((l) => l.who === "A") || !lines.some((l) => l.who === "B")) {
      log(`dialogue attempt ${attempt + 1} came back unusable, asking again`);
      continue;
    }
    const script = lines.slice(0, turnCount);
    // Only B changes language. A is already speaking theirs, and translating a
    // line nobody asked to have translated is how the parroting got in.
    const mine = script.filter((l) => l.who === "B");
    if (!mine.length) return script;
    const numbered = mine.map((l, i) => `${i + 1}. ${l.text}`).join("\n");
    const rendered = await judge(
      apiKey,
      `Translate each numbered line into ${targetName}, as someone would actually say it out ` +
        `loud. Keep the numbering and the order, one line each, and output nothing else.\n\n${numbered}`
    );
    const out = [];
    for (const raw of rendered.split("\n")) {
      const m = /^\s*(\d+)[.)]\s*(.+?)\s*$/.exec(raw);
      if (m) out.push(m[2]);
    }
    if (out.length !== mine.length) {
      log(`translation came back with ${out.length} of ${mine.length} lines, asking for the dialogue again`);
      continue;
    }
    mine.forEach((line, i) => (line.text = out[i]));
    return script;
  }
  throw new Error("could not get a usable dialogue out of the judge model");
}

/** Markdown emphasis and a full-width colon both turn up in a reply; neither loses a line. */
function parseDialogue(text) {
  const lines = [];
  for (const raw of text.split("\n")) {
    const m = /^[\s*_]*([AB])[\s*_]*[:：][\s*_]*(.+?)[\s*_]*$/.exec(raw);
    if (m) lines.push({ who: m[1], text: m[2] });
  }
  return lines;
}

/**
 * Two questions in one call: what language did the interpreter answer in, and
 * was the answer right?
 *
 * The language matters as much as the score here. An utterance restated in the
 * language it was already spoken in is not a translation failure with a low
 * score — it is the routing failing, the same failure mode as being ignored, and
 * it has to be counted separately or it disappears into the average.
 */
async function judgeTurn(spokenName, expectedName, original, output) {
  const text = await judge(
    apiKey,
    `An interpreter sits between a ${sourceName} speaker and a ${targetName} speaker.\n\n` +
      `The utterance, spoken in ${spokenName}: ${original}\n` +
      `What the interpreter said: ${output}\n\n` +
      `Reply in exactly this format, and nothing else:\n` +
      `LANGUAGE: <the English name of the language the interpreter's line is written in>\n` +
      `SCORE: <0-10, how accurately it carries the utterance into ${expectedName}; 0 if unrelated>`
  );
  let language = "";
  let score = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const upper = line.toUpperCase();
    if (upper.startsWith("LANGUAGE:")) language = line.slice(line.indexOf(":") + 1).trim();
    else if (upper.startsWith("SCORE:")) score = Number.parseFloat(line.split(":")[1]) || 0;
  }
  return { language, score };
}

// ------------------------------------------------------------------ one person

/**
 * Wait for the moment the next person starts talking.
 *
 * Measured from the end of the interpreter's voice, not from the end of the
 * frames: the other person in the room is waiting to hear the sentence, not to
 * see the socket go quiet. A negative gap starts them before it has finished,
 * which is the ordinary way two people talk and the case the gate is hardest on.
 */
async function waitForFloor() {
  const limit = Date.now() + REPLY_WAIT_MAX_MS;
  while (Date.now() < limit && Date.now() < uplink.endsAt() + replyGapMs) await sleep(20);
}

/** Let whatever is still arriving arrive, so a slow answer is not a missing one. */
async function settleStream() {
  const deadline = Date.now() + SETTLE_MAX_MS;
  lastEventAt = Date.now();
  while (Date.now() < deadline && Date.now() - lastEventAt < SETTLE_QUIET_MS) await sleep(100);
}

async function runTurn(index, line, pcm) {
  const speaker = SPEAKERS[line.who];
  const result = {
    index,
    who: line.who,
    spoken: speaker.code,
    original: line.text,
    inputTranscription: null,
    outputTranscription: null,
    answeredIn: null,
    score: 0,
    ignored: false,
    restated: false,
    late: false,
    error: null,
    // Filled in after the conversation: true when the last thing the interpreter
    // said was in this speaker's own language, which is the condition under
    // which a human turn can look to the model like its own voice coming back.
    // See the echo guard in `lib/instructions.js`.
    echoLookalike: false,
    swallowedMs: 0,
    leadingSwallowedMs: 0,
    spokenMs: 0,
    firstResponseSec: null,
    turnCompleteSec: null,
  };

  turn = newTurn(index);
  uplink.reset();
  await streamPcm(uplink, pcm);
  const speechDoneAt = Date.now();
  await streamSilence(uplink, SILENCE_AFTER_SPEECH_MS);
  result.swallowedMs = Math.round(uplink.droppedMs);
  // The clip opens with a second of silence, and a gate that eats only that has
  // eaten nothing: what matters is how much of the sentence never went out.
  result.leadingSwallowedMs = Math.max(0, Math.round(uplink.leadingDroppedMs - PAD_MS));
  result.spokenMs = Math.round((pcm.length / 2 / UPLINK_RATE) * 1000 - 2 * PAD_MS);

  const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
  while (Date.now() < deadline && !turn.complete) await sleep(100);
  const timedOut = !turn.complete;
  await settleStream();

  const done = turn;
  done.scoredAt = Date.now();
  result.inputTranscription = settle(done.inputFinals, done.inputPartial) || null;
  result.outputTranscription = settle(done.outputFinals, done.outputPartial) || null;
  result.late = timedOut && Boolean(result.outputTranscription);
  if (done.firstResponseAt) {
    result.firstResponseSec = Math.max(0, (done.firstResponseAt - speechDoneAt) / 1000);
  }
  if (done.turnCompleteAt) {
    result.turnCompleteSec = Math.max(0, (done.turnCompleteAt - speechDoneAt) / 1000);
  }

  // The reported bug, and the one number this whole script exists to produce.
  result.ignored = !result.outputTranscription;
  return result;
}

/**
 * Score the whole conversation afterwards, not turn by turn.
 *
 * A judge call takes seconds, and seconds spent scoring between two utterances
 * are seconds in which the interpreter's voice finishes playing — which would
 * hold the gate open for every turn and quietly turn this into a run that cannot
 * reproduce the gate at all. Nothing that talks to a model may sit inside the
 * conversation's clock.
 */
async function scoreTurns(results) {
  let lastOutputLanguage = null;
  for (const result of results) {
    const speaker = SPEAKERS[result.who];
    // What the interpreter last said, read from the judge rather than assumed
    // from the routing rule: the flag is about what the model actually spoke,
    // not what it was told to speak. An ignored turn leaves it null — it said
    // nothing, so nothing can look like it.
    result.echoLookalike = lastOutputLanguage === speaker.code;
    if (result.ignored || !result.outputTranscription) {
      lastOutputLanguage = null;
      continue;
    }
    try {
      const verdict = await judgeTurn(speaker.name, speaker.other, result.original, result.outputTranscription);
      result.answeredIn = verdict.language;
      result.score = verdict.score;
      const answered = verdict.language.toLowerCase();
      result.restated = answered.includes(speaker.name.toLowerCase());
      if (answered.includes(sourceName.toLowerCase())) lastOutputLanguage = source;
      else if (answered.includes(targetName.toLowerCase())) lastOutputLanguage = target;
      else lastOutputLanguage = null;
    } catch (err) {
      result.error = `judge: ${err.message}`;
      lastOutputLanguage = null;
    }
  }
}

// ---------------------------------------------------------------------- start

log(`conversation mode: ${sourceName} (A, ${sourceVoice}) ↔ ${targetName} (B, ${targetVoice})`);
log(
  `duplex gate: ${gateOn ? "on, as it ships" : "off"} | ` +
    `reply gap: ${replyGapMs}ms after the interpreter stops | turns: ${turnCount}`
);

const dialogue = await writeDialogue();
log(`dialogue: ${dialogue.length} lines, ${dialogue.filter((l) => l.who === "A").length} from A`);

// Synthesised before the session opens, for the same reason the scoring happens
// after it closes: `say` takes a moment, and a moment spent synthesising between
// two utterances is a moment the interpreter's voice is finishing in. It also
// means a missing voice fails the run before a byte of quota is spent.
let clips;
try {
  clips = dialogue.map((line) => speak(line.text, { voice: SPEAKERS[line.who].voice, padMs: PAD_MS }));
} catch (err) {
  // Overwhelmingly this is a voice macOS does not have installed, and the two
  // this run needs are in different languages — `say -v '?'` lists what is there.
  console.error(`could not synthesise the dialogue with ${sourceVoice}/${targetVoice}: ${err.message}`);
  process.exit(2);
}

loop.start();
await ready;

const results = [];

for (const [index, line] of dialogue.entries()) {
  if (index > 0) await waitForFloor();
  const result = await runTurn(index, line, clips[index]);
  results.push(result);

  const gateTag = result.leadingSwallowedMs
    ? ` GATE(-${(result.leadingSwallowedMs / 1000).toFixed(1)}s of ${(result.spokenMs / 1000).toFixed(1)}s)`
    : "";
  const lateTag = result.late ? " LATE" : "";
  const heard = `${line.who}/${result.spoken}`;
  const said = result.original.slice(0, 44);
  if (result.ignored) {
    log(`#${index} ${heard} IGNORED${gateTag} | "${said}" | nothing came back`);
  } else {
    log(`#${index} ${heard} answered${gateTag}${lateTag} | "${said}" -> "${result.outputTranscription.slice(0, 44)}"`);
  }
}

loop.close();

// Scored now that the clock no longer matters, and written to the log only once
// every row is complete.
log(`scoring ${results.filter((r) => !r.ignored).length} answered utterance(s)`);
await scoreTurns(results);
for (const result of results) {
  logFile.write(JSON.stringify({ ...result, at: new Date().toISOString() }) + "\n");
  if (result.restated) {
    log(`#${result.index} RESTATED in ${result.answeredIn} — the routing failed, not the translation`);
  }
}

// --------------------------------------------------------------------- report

const pct = (n, of) => `${((100 * n) / (of || 1)).toFixed(1)}%`;
const bySpeaker = (who) => results.filter((r) => r.who === who);

const report = [];
report.push(`\n[${clock(t0)}] === SUMMARY ===`);
report.push(
  `${sourceName} ↔ ${targetName}, conversation mode | duplex gate ${gateOn ? "on" : "off"} | ` +
    `reply gap ${replyGapMs}ms | ${results.length} utterances`
);
report.push(
  `Sessions: ${counts.opened} opened, ${counts.ready} ready, ${counts.failed} failed | ` +
    `goAway: ${counts.goAways} | server closes: ${counts.closed}`
);

report.push("\n  Per speaker");
for (const who of ["A", "B"]) {
  const mine = bySpeaker(who);
  if (!mine.length) continue;
  const ignored = mine.filter((r) => r.ignored);
  const restated = mine.filter((r) => r.restated);
  const scored = mine.filter((r) => !r.ignored && !r.error);
  const avg = scored.length ? scored.reduce((a, r) => a + r.score, 0) / scored.length : 0;
  report.push(
    `  ${who} — ${SPEAKERS[who].name.padEnd(9)} ${String(mine.length).padStart(3)} spoken | ` +
      `ignored ${String(ignored.length).padStart(2)} (${pct(ignored.length, mine.length).padStart(6)}) | ` +
      `restated ${String(restated.length).padStart(2)} | ` +
      `avg score ${avg.toFixed(1)}/10`
  );
}

// The two candidate causes, each with the turns that could have been its doing.
// A turn the gate ate the front of and a turn nothing was taken from are
// different events with the same symptom, and only this split tells them apart.
const cut = results.filter((r) => r.leadingSwallowedMs > 0);
const clean = results.filter((r) => r.leadingSwallowedMs === 0);
report.push("\n  Cause");
report.push(
  `  duplex gate  — ${cut.length} utterance(s) lost speech off the front ` +
    `(${cut.filter((r) => r.ignored).length} of those ignored); ` +
    `${clean.length} went out whole (${clean.filter((r) => r.ignored).length} ignored)`
);
// Asked only of the utterances the gate left alone. An utterance that was cut
// short and then ignored has two explanations and settles nothing, and mixing
// those in here would let the gate's damage read as evidence about the model.
const lookalike = clean.filter((r) => r.echoLookalike);
const fresh = clean.filter((r) => !r.echoLookalike);
report.push(
  `  echo guard   — of the ${clean.length} that went out whole: ` +
    `${lookalike.filter((r) => r.ignored).length}/${lookalike.length} ignored after the ` +
    `interpreter had just spoken that speaker's own language, ` +
    `${fresh.filter((r) => r.ignored).length}/${fresh.length} otherwise`
);
if (!clean.length) {
  report.push(`  (the gate cut into every utterance, so this run says nothing about the model — try --reply-gap 1500)`);
}

const swallowed = results.filter((r) => r.leadingSwallowedMs > 0).map((r) => r.leadingSwallowedMs / 1000);
report.push(
  ...formatDistribution("Speech lost to the gate before the first frame went out (s)", swallowed, [
    ["<0.5s", 0, 0.5],
    ["0.5-1s", 0.5, 1.0],
    ["1-2s", 1.0, 2.0],
    ["2-4s", 2.0, 4.0],
    [">4s", 4.0, 1e9],
  ])
);

const defined = (key) => results.map((r) => r[key]).filter((v) => v !== null && v !== undefined);
report.push(
  ...formatDistribution(
    "Interpretation Score",
    results.filter((r) => !r.ignored && !r.error).map((r) => r.score),
    SCORE_BUCKETS
  )
);
report.push(
  ...formatDistribution("First Response (speech-end to first audio/transcript)", defined("firstResponseSec"), [
    ["=0s", 0, 0.001],
    ["0-0.5s", 0.001, 0.5],
    ["0.5-1s", 0.5, 1.0],
    ["1-2s", 1.0, 2.0],
    ["2-5s", 2.0, 5.0],
    [">5s", 5.0, 1e9],
  ])
);

const ignored = results.filter((r) => r.ignored);
report.push("");
if (ignored.length) {
  const worst = ignored.reduce((acc, r) => ((acc[r.spoken] = (acc[r.spoken] || 0) + 1), acc), {});
  const spread = Object.entries(worst)
    .map(([code, n]) => `${named(code)} ${n}/${results.filter((r) => r.spoken === code).length}`)
    .join(", ");
  report.push(`REPRODUCED: ${ignored.length} utterance(s) got no interpretation — ${spread}.`);
} else {
  report.push(`Not reproduced this run: every utterance came back interpreted.`);
}
const restated = results.filter((r) => r.restated);
if (restated.length) {
  report.push(`Also: ${restated.length} utterance(s) were restated in the language they were spoken in.`);
}

for (const line of report) console.log(line);

const reportPath = logPath.replace(/\.jsonl$/, "") + ".report";
fs.writeFileSync(reportPath, report.join("\n") + "\n");
logFile.end();
log(`Metrics log: ${logPath}`);
log(`Report: ${reportPath}`);

await sleep(100); // let the sockets go before the process does
// A run that reproduces the bug is a failing run. Restating an utterance in the
// language it arrived in is the same routing failure wearing a different face,
// so it fails too.
process.exit(ignored.length === 0 && restated.length === 0 && results.every((r) => !r.error) ? 0 : 1);
