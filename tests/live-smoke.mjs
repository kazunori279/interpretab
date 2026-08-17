/**
 * A real call to the Live API — not part of `npm test`.
 *
 * The unit tests drive `LiveSession` and `SessionLoop` against a fake socket,
 * which proves the plumbing and nothing about the wire format. This script
 * proves the wire format: it opens actual sessions with a real key and streams
 * real speech through them, so a `setup` frame the server dislikes shows up here
 * rather than in a user's first session.
 *
 * It goes through `SessionLoop`, not `LiveSession`, and that is the point of the
 * long runs. Everything the loop exists for — `goAway`, the replacement opened
 * while the dying session is still talking, the preroll replay, the synthetic
 * `turnComplete` — is invisible to a test that stops after thirty seconds and
 * unreachable by a fake socket, because only the real server decides when a
 * session has had enough. Run it for twelve minutes and the whole cutover path
 * executes against the thing it was written for.
 *
 * It needs speech to work with. Any 16 kHz mono PCM WAV will do; macOS can make
 * one without leaving the shell:
 *
 *   say -v Kyoko -o /tmp/ja16k.wav --data-format=LEI16@16000 "こんにちは。…"
 *
 * Usage:
 *   node tests/live-smoke.mjs <key-file> <wav> [--direction tab|mic]
 *                             [--mic-mode simul|conversation] [--minutes N] [--raw]
 *
 * The key comes from a file rather than an argument so it stays out of the shell
 * history and the process list. There are three distinct `setup` frames to
 * cover, not two — tab, mic in simultaneous mode, and mic in conversation mode
 * — and only the last of them sends a system instruction and a glossary, so one
 * passing says nothing about the others. `--minutes` loops the audio to hold the stream open
 * past the ~10 minute expiry, which is the only way to see a real `goAway`;
 * `--raw` prints every frame the server sends, minus the audio payloads that
 * would drown the log.
 *
 * Every run also reports the token tally the side panel is built on, both
 * summed and read as a running total. Which of the two is right is not
 * something the documentation says and not something a fake socket can show, so
 * a single real run here is what settles it.
 */

import { buildSetup, isSimul, modelFor } from "../lib/live-session.js";
import { SessionLoop } from "../lib/session-loop.js";
import { DEFAULTS } from "../lib/settings.js";
import { AUDIO_TOKENS_PER_SECOND, costOf, formatCost, formatDuration } from "../lib/usage.js";
import {
  argOf,
  hasFlag,
  readKey,
  readWav,
  sleep,
  stamp,
  streamPcm,
  streamSilence,
  trackedSessionClass,
} from "./live-harness.mjs";

const [keyFile, wavFile] = process.argv.slice(2);
const minutes = Number(argOf("--minutes", 0));
const direction = argOf("--direction", "tab");
const micMode = argOf("--mic-mode", DEFAULTS.micMode);
const raw = hasFlag("--raw");

if (
  !keyFile ||
  !wavFile ||
  !["tab", "mic"].includes(direction) ||
  !["simul", "conversation"].includes(micMode)
) {
  console.error(
    "usage: node tests/live-smoke.mjs <key-file> <wav> [--direction tab|mic] " +
      "[--mic-mode simul|conversation] [--minutes N] [--raw]"
  );
  process.exit(2);
}

/** A silence in the translated audio long enough to be worth a line in the log. */
const NOTABLE_GAP_MS = 1500;

const t0 = Date.now();
const log = (line) => console.log(`[${stamp(t0)}] ${line}`);

const apiKey = readKey(keyFile);
const pcm = readWav(wavFile);

let inputText = "";
let outputText = "";
let audioBytes = 0;
let turns = 0;
let lastAudioAt = 0;
let maxAudioGapMs = 0;
let measuringGaps = false;

/**
 * The token tally, and the one thing about it the documentation does not
 * settle: whether a `usageMetadata` frame is what that turn cost or what the
 * session has cost so far. The side panel used to sum them and ran three to
 * five times high (#16), so it now prices the audio clock instead and this is
 * the only place the frames are still read. Every reading is printed — summed,
 * the largest single frame, and what the audio actually moved — along with the
 * shape that tells the first two apart. Per-frame totals that only ever climb
 * are cumulative; totals that rise and fall with the length of each turn are
 * not. A drop right after a cutover is not evidence either way: the replacement
 * session starts its own count.
 */
const usage = { totals: [], climbing: true };

// A rendering no model would produce on its own, so the transcript says plainly
// whether the glossary reached the session or was quietly ignored.
const GLOSSARY = [{ source: "リアルタイム翻訳", target: "Interpretab live relay" }];

const settings = { ...DEFAULTS, micMode, tabTarget: "en", micSource: "ja", micTarget: "en" };
const useGlossary = !isSimul(direction, settings);

const { SessionClass, counts } = trackedSessionClass(log, raw);

let onReady;
const ready = new Promise((resolve) => {
  onReady = resolve;
});

const loop = new SessionLoop({
  apiKey,
  // Simultaneous translation — the tab direction and the microphone's default
  // mode — detects the source and can carry no glossary. Conversation mode
  // declares both languages and applies the system instruction and glossary.
  setup: buildSetup(direction, settings, useGlossary ? GLOSSARY : []),
  SessionClass,
  // The loop defaults to performance.now(); Date.now() keeps its clock and this
  // script's log stamps on the same origin.
  now: () => Date.now(),
  onStatus: (state, detail) => {
    log(`status: ${state}${detail ? ` (${detail})` : ""}`);
    if (state === "connected") onReady();
  },
  onEvent: (ev) => {
    if (ev.type === "audio") {
      audioBytes += ev.buffer.byteLength;
      const now = Date.now();
      // The gap between two pieces of translated audio is what a listener
      // actually hears at a cutover, so it is the one number that says whether
      // the handover worked. Only measured while speech is going in: the
      // silence at the end is meant to be quiet. Each notable gap is logged
      // with its time as well as counted, because the max on its own cannot say
      // whether it landed on the handover or on a pause the speaker took.
      if (measuringGaps && lastAudioAt) {
        const gap = now - lastAudioAt;
        if (gap >= NOTABLE_GAP_MS) log(`gap: ${(gap / 1000).toFixed(1)}s with no output audio`);
        maxAudioGapMs = Math.max(maxAudioGapMs, gap);
      }
      lastAudioAt = now;
      return;
    }
    if (ev.type === "usage") {
      const frame = Number(ev.usage.totalTokenCount) || 0;
      if (frame < (usage.totals.at(-1) ?? 0)) usage.climbing = false;
      usage.totals.push(frame);
      return; // `--raw` already prints the frame itself
    }
    if (ev.type === "input") inputText += ev.text;
    if (ev.type === "output") outputText += ev.text;
    if (ev.type === "turnComplete") turns += 1;
    if (ev.type !== "input" && ev.type !== "output") log(`event: ${JSON.stringify(ev)}`);
  },
});

loop.start();
await ready;

const speechSec = pcm.length / 2 / 16000;
const passes = minutes ? Math.ceil((minutes * 60_000) / (speechSec * 1000)) : 1;
log(
  `${direction}${direction === "mic" ? ` (${micMode})` : ""}: ` +
    `streaming ${speechSec.toFixed(1)}s of speech` +
    (passes > 1 ? ` × ${passes} passes ≈ ${minutes} min` : "")
);

measuringGaps = true;
for (let pass = 0; pass < passes; pass++) {
  await streamPcm(loop, pcm);
  if (passes > 1) log(`pass ${pass + 1}/${passes} done`);
}
measuringGaps = false;

// The translation trails the audio, so give it room — and keep the silence
// flowing while it does, because that is what a microphone would be doing and
// what the server's end-of-turn detection is listening to.
await streamSilence(loop, 15000);

// Long enough to have crossed at least one expiry, so a run that saw none found
// something worth knowing: either the expiry moved or the warning never came.
const expectedCutover = minutes >= 11;

console.log(`\n--- after ${stamp(t0)} ---`);
console.log("heard   :", inputText.trim() || "(nothing)");
console.log("said    :", outputText.trim() || "(nothing)");
console.log("audio   :", `${audioBytes} bytes ≈ ${(audioBytes / 2 / 24000).toFixed(1)}s at 24 kHz`);
console.log("turns   :", turns);
console.log("sessions:", `${counts.opened} opened, ${counts.ready} ready, ${counts.failed} failed`);
console.log("goAways :", counts.goAways, `| server closes: ${counts.closed}`);
console.log("max gap :", `${(maxAudioGapMs / 1000).toFixed(1)}s between output audio frames`);

const model = modelFor(direction, settings);
// What the side panel shows: the audio this run put on the wire and got back,
// at the 25 tokens a second the Live API bills it at.
const clock = { inSeconds: speechSec * passes + 15, outSeconds: audioBytes / 2 / 24000 };
console.log(
  "usage   :",
  `${formatDuration(clock.inSeconds)} in, ${formatDuration(clock.outSeconds)} out` +
    ` ≈ ${formatCost(costOf(clock, model))} on ${model} — what the side panel shows`
);
if (!usage.totals.length) {
  console.log("  the server reported no usageMetadata at all");
} else {
  const summed = usage.totals.reduce((a, b) => a + b, 0);
  const clockTokens = Math.round((clock.inSeconds + clock.outSeconds) * AUDIO_TOKENS_PER_SECOND);
  console.log(
    "  server:",
    `${usage.totals.length} frames — summed ${summed}, largest ${Math.max(...usage.totals)},` +
      ` last ${usage.totals.at(-1)}; the audio clock says ${clockTokens}`
  );
  console.log(
    "  per-frame totals",
    usage.climbing
      ? "never fell — cumulative, unless every turn happened to be longer than the last"
      : "rose and fell — per-turn"
  );
}

loop.close();
await sleep(100); // let the sockets go before the process does

const ok =
  !!outputText.trim() && audioBytes > 0 && counts.failed === 0 && (!expectedCutover || counts.goAways > 0);
if (!ok && expectedCutover && !counts.goAways) {
  console.error("no goAway in a run long enough to expect one — check the expiry assumption");
}
process.exit(ok ? 0 : 1);
