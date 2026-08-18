/**
 * Shared machinery for the two scripts here that talk to the real Live API:
 * `live-smoke.mjs` (does the wire format still work?) and `soak.mjs` (does it
 * still work an hour later?). Neither is part of `npm test` — both spend money
 * and need a key — so nothing in this file is imported by the extension.
 *
 * Three things are worth knowing before reading further.
 *
 * **The key never appears in output.** It is read from a file, not an argument,
 * so it stays out of the shell history and the process list, and nothing here
 * logs it. The Live API also takes it as a query parameter, which means any
 * frame dump that included the handshake URL would leak it — `rawLogger` below
 * only ever sees frames, never the URL.
 *
 * **Speech comes from `say`.** The Python soak this replaces called Cloud
 * Text-to-Speech; macOS already has a synthesiser that writes exactly the format
 * the API wants, and using it drops a dependency, a second credential and a
 * quota from the test.
 *
 * **Sessions are observable.** `SessionLoop` takes a `SessionClass`, which the
 * unit tests use to inject a fake. Here it is used the other way round — to
 * inject the *real* class with counting around it — so a run can report how many
 * sessions it burned through and why, which is the whole point of running long.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { LiveSession } from "../lib/live-session.js";
// The library's messages come from `chrome.i18n`, which Node does not have, so
// without this every close reason a script prints is a bare key. Imported here
// rather than in each script: everything that talks to the live API goes
// through this file.
import "./messages.mjs";

/** 32 ms of 16 kHz PCM16 — the frame size the extension's recorder sends. */
export const CHUNK = 1024;

/** Model behind the sentence generation and the scoring. Not the one under test. */
export const JUDGE_MODEL = "gemini-2.5-flash-lite";

/**
 * The extension's own manifest, so a harness reports the version the extension
 * would have reported rather than a second copy of the string.
 */
export const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "..", "manifest.json"), "utf8")
);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Seconds since *t0*, for log lines that need to be read against each other. */
export const stamp = (t0) => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

/** `h:mm:ss` since *t0*, for runs long enough that seconds stop being readable. */
export function clock(t0) {
  const s = Math.floor((Date.now() - t0) / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function argOf(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}

export const hasFlag = (name) => process.argv.includes(name);

/** The API key, from a file. Callers must not log the return value. */
export function readKey(file) {
  const key = fs.readFileSync(file, "utf8").trim();
  if (!key) throw new Error(`${file} is empty`);
  return key;
}

/** Walk the RIFF chunks rather than assuming a 44-byte header — `say` writes a JUNK chunk first. */
export function readWav(file) {
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

let sayCounter = 0;

/**
 * Speak *text* and return it as raw PCM, padded with silence at both ends.
 *
 * The padding is not cosmetic. End of turn is decided by the server's own
 * voice-activity detection, and a clip that stops mid-breath never gives it the
 * silence it is listening for — without the tail the session accepts everything
 * and answers nothing.
 */
export function speak(text, { voice = "Samantha", padMs = 1000 } = {}) {
  const file = path.join(os.tmpdir(), `interpretab-say-${process.pid}-${++sayCounter}.wav`);
  try {
    execFileSync("say", ["-v", voice, "-o", file, "--data-format=LEI16@16000", text]);
    const pcm = Buffer.from(readWav(file));
    const pad = Buffer.alloc(Math.round(16000 * 2 * (padMs / 1000)));
    return Buffer.concat([pad, pcm, pad]);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

/**
 * Stream *pcm* into *sink* at the speed it would be spoken.
 *
 * Real time is not politeness: the server paces its own turn detection against
 * the wall clock, so audio delivered faster than speech is heard as one
 * unbroken utterance and the latency figures stop meaning anything.
 */
export async function streamPcm(sink, pcm, { until = () => false } = {}) {
  for (let i = 0; i < pcm.length; i += CHUNK) {
    if (until()) return false;
    const slice = pcm.subarray(i, Math.min(i + CHUNK, pcm.length));
    sink.send(slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength));
    await sleep(32);
  }
  return true;
}

/** Keep sending, but send nothing — what a microphone does between sentences. */
export async function streamSilence(sink, ms, { until = () => false } = {}) {
  const quiet = new ArrayBuffer(CHUNK);
  for (let sent = 0; sent < ms; sent += 32) {
    if (until()) return false;
    sink.send(quiet.slice(0));
    await sleep(32);
  }
  return true;
}

/**
 * A `LiveSession` subclass that narrates its own life, plus the tally.
 *
 * `SessionLoop` opens and retires sessions on its own schedule and reports none
 * of it — by design, since the UI above it is meant to see one continuous
 * stream. A long run needs the opposite view, so this wraps the class the loop
 * instantiates rather than reading the loop's internals.
 *
 * @param {(line: string) => void} log
 * @param {boolean} raw  dump every frame the server sends, audio elided
 */
export function trackedSessionClass(log, raw = false) {
  const counts = { opened: 0, ready: 0, failed: 0, closed: 0, goAways: 0 };
  let ids = 0;

  const SessionClass = class TrackedSession extends LiveSession {
    constructor(opts) {
      super({
        ...opts,
        onEvent: (ev) => {
          if (ev.type === "goAway") {
            counts.goAways += 1;
            log(`session ${this.id}: goAway, ${(ev.timeLeft / 1000).toFixed(0)}s left`);
          }
          if (ev.type === "closed") {
            counts.closed += 1;
            log(`session ${this.id}: closed by the server, code ${ev.code}`);
          }
          opts.onEvent?.(ev);
        },
      });
      this.id = ++ids;
    }

    open() {
      counts.opened += 1;
      log(`session ${this.id}: opening`);
      // The socket exists as soon as open() returns — the Promise executor runs
      // synchronously — so the frame logger goes on early enough to catch
      // `setupComplete`, which is the one frame worth seeing on a bad key.
      const promise = super.open();
      if (raw && this._ws) attachRawLogger(this._ws, this.id, log);
      return promise.then(
        (session) => {
          counts.ready += 1;
          log(`session ${this.id}: ready`);
          return session;
        },
        (err) => {
          counts.failed += 1;
          log(`session ${this.id}: failed to open — ${err.message}`);
          throw err;
        }
      );
    }
  };

  return { SessionClass, counts };
}

/** Log frames on their way through the handler `open()` installed. */
function attachRawLogger(ws, id, log) {
  const inner = ws.onmessage;
  ws.onmessage = async (event) => {
    // The server sends JSON, but as binary frames — a string here is the
    // exception, not the rule.
    let text = event.data;
    if (text instanceof Blob) text = await text.text();
    else if (text instanceof ArrayBuffer) text = new TextDecoder().decode(text);
    log(
      `session ${id} frame: ${String(text)
        .replace(/"data":\s*"[^"]*"/g, '"data":"…"')
        .slice(0, 400)}`
    );
    return inner(event);
  };
}

/**
 * One `generateContent` call over REST.
 *
 * The soak needs a model to write its sentences and mark its answers, and the
 * same key already opens one. Going over REST rather than through a client
 * library keeps this repo at zero dependencies, which is the reason `npm test`
 * needs nothing but Node.
 */
export async function judge(apiKey, prompt, { model = JUDGE_MODEL, retries = 2 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          // In the header, not the query string: an error body echoes the URL
          // often enough that a key in it would end up in a log.
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
      const json = await res.json();
      const text = (json.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text || "")
        .join("")
        .trim();
      if (!text) throw new Error("empty response");
      return text;
    } catch (err) {
      lastError = err;
      if (attempt < retries) await sleep(1000 * (attempt + 1));
    }
  }
  throw lastError;
}

/**
 * Histogram lines for a list of values.
 *
 * The format is copied exactly from `_format_distribution` in
 * `tests/test_long.py` of the parent repo, down to the column widths, so that
 * repo's `tests/chart_soak.py` parses a report written here and can draw this
 * run against the relay's old ones. Comparability is the point: the numbers are
 * only interesting next to the numbers from the architecture this replaced.
 *
 * @param {Array<[string, number, number]>} buckets  [label, low inclusive, high exclusive]
 */
export function formatDistribution(label, values, buckets, barWidth = 30) {
  if (!values.length) return [];
  const vals = [...values].sort((a, b) => a - b);
  const n = vals.length;
  const avg = vals.reduce((a, b) => a + b, 0) / n;
  const at = (q) => vals[Math.min(n - 1, Math.floor(n * q))];
  const f = (v) => v.toFixed(2);
  const lines = [
    `\n  ${label} (n=${n})`,
    `  min=${f(vals[0])}  avg=${f(avg)}  p50=${f(vals[n >> 1])}  ` +
      `p90=${f(at(0.9))}  p99=${f(at(0.99))}  max=${f(vals[n - 1])}`,
  ];
  const counts = buckets.map(([bl, lo, hi]) => [bl, vals.filter((v) => v >= lo && v < hi).length]);
  const maxCount = Math.max(1, ...counts.map(([, c]) => c));
  for (const [bl, c] of counts) {
    const bar = "#".repeat(Math.floor((c / maxCount) * barWidth));
    const pct = ((100 * c) / n).toFixed(1);
    lines.push(`  ${bl.padStart(10)}: ${String(c).padStart(4)} (${pct.padStart(5)}%) ${bar}`);
  }
  return lines;
}

/** Buckets used by more than one metric. */
export const SCORE_BUCKETS = [
  ["0-2", 0, 2.5],
  ["3-4", 2.5, 4.5],
  ["5-6", 4.5, 6.5],
  ["7-8", 6.5, 8.5],
  ["9-10", 8.5, 10.1],
];
