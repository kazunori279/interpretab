/**
 * Read the narration out of `docs/slides/index.html` and record it with the
 * Gemini text-to-speech API, one MP3 per slide.
 *
 *     node tools/slide-voice.mjs <key-file>              # only what changed
 *     node tools/slide-voice.mjs <key-file> --force      # all of them again
 *     node tools/slide-voice.mjs <key-file> --only 7,10  # just these slides
 *     node tools/slide-voice.mjs <key-file> --dry        # print the scripts, call nothing
 *
 * **The deck is the script.** Each slide's `<div class="notes">` is both what
 * the presenter reads on the `n` panel and what this file sends to the model,
 * so the two cannot drift apart. Edit the note, re-run this, and only that
 * slide is re-recorded. `audio/manifest.json` keeps a hash of the text each
 * MP3 was made from, which is also what stops a stale recording from surviving
 * a rewrite unnoticed.
 *
 * **The key goes in a header, not the URL.** Unlike the Live API, which takes
 * it as a query parameter, `generateContent` accepts `x-goog-api-key`. Nothing
 * here logs a URL anyway, but that is one fewer place a key can end up.
 *
 * **The style lives outside the transcript.** Google's own guidance is that a
 * vague prompt makes the classifier either reject the request or read the
 * director's notes aloud, so the prompt states plainly that it is synthesising
 * speech and labels where the spoken text begins.
 *
 * The model returns headerless 16-bit PCM at 24 kHz. `ffmpeg` turns that into
 * an MP3 because the alternative is about twenty megabytes of WAV in a
 * repository that otherwise ships a 220 KB extension.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { apiKeyFrom } from "../tests/model-check.mjs";
import { argOf, hasFlag } from "../tests/live-harness.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const DECK = path.join(ROOT, "docs", "slides", "index.html");
const OUT = path.join(ROOT, "docs", "slides", "audio");
const MANIFEST = path.join(OUT, "manifest.json");

const REST = "https://generativelanguage.googleapis.com/v1beta/models";

/** Newest TTS preview at the time of writing; `--model` overrides it. */
const MODEL = argOf("--model", "gemini-3.1-flash-tts-preview");

/**
 * "Charon — Informative". A conference talk wants someone explaining a thing
 * they built, not a trailer voice, and the upbeat voices oversell it.
 */
const VOICE = argOf("--voice", "Charon");

/**
 * How the delivery is steered. Kept short: the same guidance warns that
 * over-specifying flattens the performance.
 */
const DIRECTION = [
  "Synthesize speech for the transcript below. Read only the transcript.",
  "",
  "Style: an engineer presenting a side project to other engineers at a meetup.",
  "Warm, unhurried, matter-of-fact, faintly amused. No announcer polish, no sell.",
  "Pace: conversational. Land the full stops. Let numbers breathe.",
  "",
  "TRANSCRIPT:",
].join("\n");

/** The model drops an audio token every so often and the request 500s. */
const ATTEMPTS = 4;

/** Slide narration, in document order. */
export function scriptsFrom(html) {
  return [...html.matchAll(/<div class="notes">([\s\S]*?)<\/div>/g)].map(([, body]) =>
    body
      .replace(/<[^>]+>/g, "")
      .replace(/&mdash;/g, "—")
      .replace(/&middot;/g, "·")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const digest = (text) => createHash("sha256").update(`${MODEL}\n${VOICE}\n${text}`).digest("hex").slice(0, 16);

/** One `generateContent` call. Returns the PCM and the rate the model tagged it with. */
async function speak(key, text) {
  const res = await fetch(`${REST}/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${DIRECTION}\n${text}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
      },
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const why = body?.error?.message || res.statusText;
    throw new Error(`HTTP ${res.status}: ${why}`);
  }
  const part = body?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) {
    // A refusal comes back as a text part, and it is worth seeing.
    const said = body?.candidates?.[0]?.content?.parts?.map((p) => p.text).join(" ") || "";
    throw new Error(`no audio in the response${said ? `: ${said.slice(0, 200)}` : ""}`);
  }
  const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType || "")?.[1]) || 24000;
  return { pcm: Buffer.from(part.inlineData.data, "base64"), rate };
}

/** Headerless PCM in, MP3 on disk. 64 kbps mono is transparent enough for speech. */
function encode(pcm, rate, file) {
  execFileSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", "-f", "s16le", "-ar", String(rate), "-ac", "1",
     "-i", "pipe:0", "-codec:a", "libmp3lame", "-b:a", "64k", file],
    { input: pcm },
  );
}

const seconds = (pcm, rate) => pcm.length / 2 / rate;

async function main() {
  const scripts = scriptsFrom(fs.readFileSync(DECK, "utf8"));
  if (!scripts.length) throw new Error("no .notes blocks in the deck");

  const only = argOf("--only");
  const wanted = only ? new Set(only.split(",").map((n) => Number(n.trim()))) : null;
  const force = hasFlag("--force");
  const dry = hasFlag("--dry");
  // The key file comes first, ahead of any flag, so that a flag *value* is
  // never mistaken for it. `--dry` needs no key at all.
  const key = dry ? null : apiKeyFrom(process.argv.slice(2, 3));

  fs.mkdirSync(OUT, { recursive: true });
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : {};

  let spoken = 0;
  for (const [i, text] of scripts.entries()) {
    const n = i + 1;
    const name = `slide-${String(n).padStart(2, "0")}.mp3`;
    const file = path.join(OUT, name);
    const hash = digest(text);
    const words = text.split(/\s+/).length;

    if (wanted && !wanted.has(n)) continue;
    if (dry) {
      console.log(`${String(n).padStart(2)}  ${words} words  ${text}`);
      continue;
    }
    if (!force && manifest[name]?.hash === hash && fs.existsSync(file)) {
      console.log(`${String(n).padStart(2)}  unchanged`);
      continue;
    }

    let audio = null;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        audio = await speak(key, text);
        break;
      } catch (err) {
        if (attempt === ATTEMPTS) throw err;
        console.log(`${String(n).padStart(2)}  ${err.message}; retrying (${attempt}/${ATTEMPTS - 1})`);
        await sleep(2000 * attempt);
      }
    }
    encode(audio.pcm, audio.rate, file);
    const secs = seconds(audio.pcm, audio.rate);
    manifest[name] = { hash, words, seconds: Number(secs.toFixed(1)), voice: VOICE, model: MODEL };
    fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`${String(n).padStart(2)}  ${words} words  ${secs.toFixed(1)}s  ${name}`);
    spoken++;
    await sleep(500);
  }

  if (dry) return;
  const total = Object.values(manifest).reduce((sum, m) => sum + (m.seconds || 0), 0);
  console.log(`\n${spoken} recorded, ${Math.floor(total / 60)}m ${Math.round(total % 60)}s of narration`);
}

await main();
