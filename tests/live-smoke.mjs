/**
 * A real call to the Live API — not part of `npm test`.
 *
 * The unit tests drive `LiveSession` against a fake socket, which proves the
 * plumbing and nothing about the wire format. This script proves the wire
 * format: it opens an actual session with a real key and streams real speech
 * through it, so a `setup` frame the server dislikes shows up here rather than
 * in a user's first session.
 *
 * It needs speech to work with. Any 16 kHz mono PCM WAV will do; macOS can make
 * one without leaving the shell:
 *
 *   say -v Kyoko -o /tmp/ja16k.wav --data-format=LEI16@16000 "こんにちは。…"
 *
 * Usage:
 *   node tests/live-smoke.mjs <key-file> <wav> [--direction tab|mic] [--minutes N] [--raw]
 *
 * The key comes from a file rather than an argument so it stays out of the
 * shell history and the process list. Both directions are worth running: they
 * send different models and differently shaped `setup` frames, so one passing
 * says nothing about the other. `--minutes` loops the audio to hold the session
 * open past the ~15 minute expiry, which is the only way to see a real
 * `goAway`; `--raw` prints every frame the server sends, minus the audio
 * payloads that would drown the log.
 */

import fs from "node:fs";
import { buildSetup, LiveSession } from "../lib/live-session.js";
import { DEFAULTS } from "../lib/settings.js";

const [keyFile, wavFile] = process.argv.slice(2);
const minutes = Number(argOf("--minutes") || 0);
const direction = argOf("--direction") || "tab";
const raw = process.argv.includes("--raw");

if (!keyFile || !wavFile || !["tab", "mic"].includes(direction)) {
  console.error(
    "usage: node tests/live-smoke.mjs <key-file> <wav> [--direction tab|mic] [--minutes N] [--raw]"
  );
  process.exit(2);
}

function argOf(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}

/** Walk the RIFF chunks rather than assuming a 44-byte header — `say` writes a JUNK chunk first. */
function readWav(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString("latin1", 0, 4) !== "RIFF" || buf.toString("latin1", 8, 12) !== "WAVE") {
    throw new Error(`${file} is not a RIFF/WAVE file`);
  }
  let offset = 12;
  let fmt = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("latin1", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        rate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === "data") {
      if (!fmt) throw new Error("data chunk before fmt chunk");
      if (fmt.format !== 1 || fmt.channels !== 1 || fmt.rate !== 16000 || fmt.bits !== 16) {
        throw new Error(
          `need mono 16-bit PCM at 16 kHz, got format ${fmt.format}, ` +
            `${fmt.channels}ch, ${fmt.rate} Hz, ${fmt.bits}-bit`
        );
      }
      return buf.subarray(body, body + size);
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }
  throw new Error("no data chunk");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = (t0) => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

const apiKey = fs.readFileSync(keyFile, "utf8").trim();
const pcm = readWav(wavFile);
const CHUNK = 1024; // 32 ms, the same frame size the extension sends

const t0 = Date.now();
let inputText = "";
let outputText = "";
let audioBytes = 0;
let turns = 0;
let closed = null;

// A rendering no model would produce on its own, so the transcript says
// plainly whether the glossary reached the session or was quietly ignored.
const GLOSSARY = [{ source: "リアルタイム翻訳", target: "Interpretab live relay" }];

const settings = { ...DEFAULTS, tabTarget: "en", micSource: "ja", micTarget: "en" };

const session = new LiveSession({
  apiKey,
  // tab: simultaneous translation, source detected, no glossary possible.
  // mic: agent mode, source declared, system instruction and glossary applied.
  setup: buildSetup(direction, settings, direction === "mic" ? GLOSSARY : []),
  onStatus: (state, detail) => console.log(`[${stamp(t0)}] status: ${state}${detail ? ` (${detail})` : ""}`),
  onEvent: (ev) => {
    if (ev.type === "audio") {
      audioBytes += ev.buffer.byteLength;
      return;
    }
    if (ev.type === "input") inputText += ev.text;
    if (ev.type === "output") outputText += ev.text;
    if (ev.type === "turnComplete") turns += 1;
    if (ev.type === "closed") closed = ev;
    if (ev.type !== "input" && ev.type !== "output") {
      console.log(`[${stamp(t0)}] event:`, JSON.stringify(ev));
    }
  },
});

await session.open();

if (raw) {
  // Wrap the handler open() installed so the frames are logged on their way
  // through, with audio elided — one second of it is 32 kB of base64.
  const inner = session._ws.onmessage;
  session._ws.onmessage = async (event) => {
    // The server sends JSON, but as binary frames — a string here is the
    // exception, not the rule.
    let text = event.data;
    if (text instanceof Blob) text = await text.text();
    else if (text instanceof ArrayBuffer) text = new TextDecoder().decode(text);
    console.log(
      `[${stamp(t0)}] frame: ${String(text)
        .replace(/"data":\s*"[^"]*"/g, '"data":"…"')
        .slice(0, 400)}`
    );
    return inner(event);
  };
}

/**
 * Keep sending, but send nothing.
 *
 * The agent model ends a turn on the server's own voice-activity detection,
 * which needs silence to detect — and a WAV that stops mid-breath never
 * supplies any. A real microphone streams the pause after the sentence; without
 * this the mic direction connects, accepts everything, and answers nothing.
 */
async function streamSilence(ms) {
  const quiet = new ArrayBuffer(CHUNK);
  for (let sent = 0; sent < ms && !closed; sent += 32) {
    session.send(quiet.slice(0));
    await sleep(32);
  }
}

const passes = minutes ? Math.ceil((minutes * 60_000) / ((pcm.length / 2 / 16000) * 1000)) : 1;
console.log(
  `[${stamp(t0)}] ${direction}: streaming ${(pcm.length / 2 / 16000).toFixed(1)}s of speech` +
    (passes > 1 ? ` × ${passes} passes` : "")
);

for (let pass = 0; pass < passes && !closed; pass++) {
  for (let i = 0; i < pcm.length && !closed; i += CHUNK) {
    const slice = pcm.subarray(i, Math.min(i + CHUNK, pcm.length));
    session.send(slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength));
    await sleep(32); // real time, because the server paces itself against it
  }
  if (passes > 1) console.log(`[${stamp(t0)}] pass ${pass + 1}/${passes} done`);
}

// The translation trails the audio, so give it room — and keep the silence
// flowing while it does, because that is what a microphone would be doing and
// what the server's end-of-turn detection is listening to.
await streamSilence(15000);

console.log(`\n--- after ${stamp(t0)} ---`);
console.log("heard   :", inputText.trim() || "(nothing)");
console.log("said    :", outputText.trim() || "(nothing)");
console.log("audio   :", `${audioBytes} bytes ≈ ${(audioBytes / 2 / 24000).toFixed(1)}s at 24 kHz`);
console.log("turns   :", turns);
console.log("closed  :", closed ? JSON.stringify(closed) : "no");

session.close();
process.exit(outputText.trim() && audioBytes ? 0 : 1);
