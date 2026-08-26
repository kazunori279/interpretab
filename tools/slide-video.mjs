/**
 * Record the deck as a single MP4: every slide, its narration, and the demo
 * clips playing where they play in the browser.
 *
 *     node tools/slide-video.mjs                                  # docs/slides -> deck-en.mp4
 *     node tools/slide-video.mjs --deck docs/slides/ja/index.html # -> deck-ja.mp4
 *     node tools/slide-video.mjs --only 2,10                      # re-cut two slides
 *     node tools/slide-video.mjs --fps 24 --workers 6
 *
 * **Nothing plays in real time.** Capturing a deck by hitting play and filming
 * the screen gives you whatever frame rate the machine felt like producing.
 * Instead every slide is stepped: its CSS animations are paused and their
 * `currentTime` is set by hand, its clip is seeked, and one screenshot comes
 * out per output frame. The result is exactly `fps` frames a second whatever
 * the machine was doing, and slides can be captured out of order and in
 * parallel, which is the only reason a six-minute deck takes a few minutes
 * rather than six.
 *
 * **The audio is not captured, it is assembled.** Headless Chrome has no
 * speakers worth recording. Each slide already owns a sound: `audio/slide-NN.mp3`
 * for a narrated one, the clip's own track for a demo. Those are concatenated
 * on the same timeline the frames were counted against, so the two cannot
 * drift. Both are stretched by RATE, exactly as the deck's player does.
 *
 * **The frame is forced to 1280x720.** The deck's `fit()` scales itself to 96%
 * of the viewport so a browser window has a margin around it; a video file
 * wants none, so the transform is overwritten with `scale(1)`. The play pill,
 * the slide counter and the keyboard help bar are interactive furniture and
 * are hidden too.
 *
 * **The deck is served, not opened.** A `file://` page has an opaque origin,
 * and a browser will not load a `<track>` across one, so the Japanese deck
 * opened off disk plays its demo clips with no subtitles at all and says
 * nothing about it. A one-request-at-a-time static server over loopback costs
 * twenty lines and makes the capture match what the published deck does.
 *
 * Frames are piped straight into `ffmpeg`, never written out, so the run costs
 * a few hundred megabytes of temporary MP4 rather than a gigabyte of PNG.
 */

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { Chrome, sleep } from "../tests/chrome-harness.mjs";
import { argOf } from "../tests/live-harness.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const DECK = path.resolve(ROOT, argOf("--deck", path.join("docs", "slides", "index.html")));
const AUDIO = path.join(path.dirname(DECK), "audio");

/** `docs/slides` -> `deck-en`, `docs/slides/ja` -> `deck-ja`. */
const LANG = path.basename(path.dirname(DECK)) === "slides" ? "en" : path.basename(path.dirname(DECK));
const OUT = path.resolve(ROOT, argOf("--out", path.join("docs", "slides", "video", `deck-${LANG}.mp4`)));

const FPS = Number(argOf("--fps", "30"));

/** Must match the deck's own `RATE`, which speeds up both narration and clips. */
const RATE = Number(argOf("--rate", "1.15"));

/**
 * How many pages capture at once. Each is its own renderer, so this scales
 * with cores until the encoder becomes the bottleneck; four is comfortable on
 * a laptop and still leaves the machine usable.
 */
const WORKERS = Number(argOf("--workers", "4"));

const ONLY = argOf("--only", "")
  .split(",")
  .filter(Boolean)
  .map((n) => Number(n));

const WORK = fs.mkdtempSync(path.join(os.tmpdir(), "deck-video-"));

const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: ["ignore", "pipe", "pipe"] });

/**
 * `Page.eval` hands exceptions back as a string, which is right for a test
 * polling a page that is still building and wrong for a capture loop: a typo
 * in an expression would quietly produce ten thousand identical frames.
 */
async function must(page, expression) {
  const value = await page.eval(expression);
  if (typeof value === "string" && value.startsWith("[error]")) throw new Error(value);
  return value;
}

/** Seconds in a media file, from the container rather than a guess. */
function duration(file) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file,
  ]).toString();
  return Number(out.trim());
}

/**
 * What each slide is made of, in slide order.
 *
 * A slide either narrates or plays a clip, never both: the demo slides carry
 * `class="notes silent"` and get no MP3. `frames` is the authority on length
 * for everything downstream — the audio is padded or trimmed to match it, so
 * a rounded frame count can never turn into creeping lip-sync error.
 */
function plan(page) {
  return page.eval(`(() => {
    const out = [];
    document.querySelectorAll('.slide').forEach((s, i) => {
      const v = s.querySelector('video');
      out.push({ n: i + 1, clip: v ? v.getAttribute('src') : null });
    });
    return JSON.stringify(out);
  })()`).then((json) => JSON.parse(json).map((slide) => {
    const mp3 = path.join(AUDIO, `slide-${String(slide.n).padStart(2, "0")}.mp3`);
    const clip = slide.clip && path.resolve(path.dirname(DECK), slide.clip);
    const seconds = clip ? duration(clip) / RATE
                    : fs.existsSync(mp3) ? duration(mp3)
                    : 4;
    return { ...slide, clip, mp3: fs.existsSync(mp3) ? mp3 : null,
             frames: Math.round(seconds * FPS) };
  }));
}

/**
 * Serve the repository over loopback, with byte ranges.
 *
 * Ranges are not optional here: a `<video>` seeks by asking for one, and a
 * server that answers every request with the whole file makes Chrome refuse to
 * seek at all.
 */
function serve(root) {
  const types = { ".html": "text/html", ".mp4": "video/mp4", ".mp3": "audio/mpeg",
                  ".jpg": "image/jpeg", ".png": "image/png", ".json": "application/json",
                  ".vtt": "text/vtt", ".css": "text/css", ".js": "text/javascript" };
  const server = http.createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(req.url.split("?")[0]));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    const size = fs.statSync(file).size;
    const type = types[path.extname(file)] || "application/octet-stream";
    const range = req.headers.range && /bytes=(\d+)-(\d*)/.exec(req.headers.range);
    if (range) {
      const start = Number(range[1]);
      const end = range[2] ? Number(range[2]) : size - 1;
      res.writeHead(206, { "content-type": type, "accept-ranges": "bytes",
        "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { "content-type": type, "accept-ranges": "bytes", "content-length": size });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

/** Put a page in recording trim: no furniture, no scaling, nothing moving. */
const PREPARE = `(() => {
  document.getElementById('vo').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('help').style.display = 'none';
  document.getElementById('frame').style.transform = 'translate(-50%, -50%) scale(1)';
  document.documentElement.style.background = '#fff';
  return true;
})()`;

/**
 * Hold the slide at one instant.
 *
 * Every running animation is paused and moved to `t`, which is what makes two
 * runs of this file produce the same bytes. A clip is seeked to the same
 * instant on its own faster timeline and awaited, because a screenshot taken
 * before `seeked` shows the frame we were trying to leave.
 */
const seek = (t) => `(async () => {
  for (const a of document.getAnimations()) { a.pause(); a.currentTime = ${t * 1000}; }
  const v = document.querySelector('.slide.active video');
  if (v && Math.abs(v.currentTime - ${t * RATE}) > 1e-3) {
    v.currentTime = ${t * RATE};
    await new Promise((r) => v.addEventListener('seeked', r, { once: true }));
  }
  return true;
})()`;

/** Record one slide's frames into a silent MP4. */
async function capture(chrome, page, slide) {
  const file = path.join(WORK, `v-${String(slide.n).padStart(2, "0")}.mp4`);
  await must(page, `location.hash = '#${slide.n}'`);
  await sleep(400);
  if (slide.clip) {
    // Wait for the metadata `preload="metadata"` is already fetching, and for
    // the subtitles, which are a separate request: an early first frame would
    // go out with no cue on it. Calling `load()` here to hurry it along is what
    // the obvious version of this did, and it deadlocks — the restarted fetch
    // races the one the page already had in flight and the element can sit at
    // `HAVE_NOTHING` for ever. Seeking pulls in whatever data it needs anyway.
    await must(page, `(async () => {
      const v = document.querySelector('.slide.active video');
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        const track = v.textTracks[0];
        if (v.readyState >= 1 && (!track || (track.cues && track.cues.length))) return true;
        await new Promise((r) => setTimeout(r, 50));
      }
      const t = v.textTracks[0];
      throw new Error('clip never loaded: src=' + v.currentSrc + ' readyState=' + v.readyState +
                      ' network=' + v.networkState + ' err=' + (v.error && v.error.message) +
                      ' cues=' + (t && t.cues && t.cues.length));
    })()`);
  }

  const enc = spawn("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-pix_fmt", "yuv420p", "-r", String(FPS), file,
  ], { stdio: ["pipe", "ignore", "inherit"] });

  for (let k = 0; k < slide.frames; k++) {
    await must(page, seek(k / FPS));
    const { data } = await chrome.send("Page.captureScreenshot", { format: "png" }, page.sessionId);
    const buf = Buffer.from(data, "base64");
    if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once("drain", r));
  }
  enc.stdin.end();
  const code = await new Promise((r) => enc.on("close", r));
  if (code !== 0) throw new Error(`slide ${slide.n}: ffmpeg exited ${code}`);
  return file;
}

/**
 * One slide's sound, padded or trimmed to the exact length of its frames.
 *
 * `apad` then `-t` is the pair that guarantees the length in both directions:
 * a recording a hair short gets silence, one a hair long gets cut.
 */
function soundtrack(slide) {
  const file = path.join(WORK, `a-${String(slide.n).padStart(2, "0")}.m4a`);
  const exact = (slide.frames / FPS).toFixed(6);
  if (slide.clip) {
    ff(["-i", slide.clip, "-vn", "-af", `atempo=${RATE},apad`, "-t", exact,
        "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", file]);
  } else if (slide.mp3) {
    ff(["-i", slide.mp3, "-af", "apad", "-t", exact,
        "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", file]);
  } else {
    ff(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", exact,
        "-c:a", "aac", "-b:a", "160k", file]);
  }
  return file;
}

/** A concat demuxer list, which is the only join that does not re-encode. */
function concat(files, out, extra = []) {
  const list = path.join(WORK, `list-${path.basename(out)}.txt`);
  fs.writeFileSync(list, files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"));
  ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", ...extra, out]);
}

const server = await serve(ROOT);
const url = `http://127.0.0.1:${server.address().port}/` +
            path.relative(ROOT, DECK).split(path.sep).join("/");

const chrome = await Chrome.launch({});
const pages = [];
for (let i = 0; i < WORKERS; i++) {
  const page = await chrome.newPage(url, { width: 1280, height: 720 });
  await sleep(900);
  await must(page, PREPARE);
  pages.push(page);
}

const slides = await plan(pages[0]);
const wanted = ONLY.length ? slides.filter((s) => ONLY.includes(s.n)) : slides;
const total = wanted.reduce((n, s) => n + s.frames, 0);
console.log(`${path.relative(ROOT, DECK)} -> ${path.relative(ROOT, OUT)}`);
console.log(`${wanted.length} slides, ${total} frames at ${FPS} fps, ${WORKERS} in parallel\n`);

const queue = [...wanted];
let done = 0;
await Promise.all(pages.map(async (page) => {
  for (let slide = queue.shift(); slide; slide = queue.shift()) {
    const started = Date.now();
    await capture(chrome, page, slide);
    soundtrack(slide);
    done++;
    const label = slide.clip ? path.basename(slide.clip) : slide.mp3 ? path.basename(slide.mp3) : "silent";
    console.log(`${String(slide.n).padStart(2)}  ${String(slide.frames).padStart(5)} frames  ` +
                `${(slide.frames / FPS).toFixed(1).padStart(5)}s  ${label.padEnd(16)}` +
                `${((Date.now() - started) / 1000).toFixed(0)}s  (${done}/${wanted.length})`);
  }
}));
await chrome.close();
server.close();

// `--only` is for looking at one slide, so it leaves the pieces where they
// are: joining them would need the other thirteen, which this run never made.
if (ONLY.length) {
  console.log(`\nsegments in ${WORK}`);
  process.exit(0);
}

const video = path.join(WORK, "video.mp4");
const audio = path.join(WORK, "audio.m4a");
concat(slides.map((s) => path.join(WORK, `v-${String(s.n).padStart(2, "0")}.mp4`)), video);
concat(slides.map((s) => path.join(WORK, `a-${String(s.n).padStart(2, "0")}.m4a`)), audio);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
ff(["-i", video, "-i", audio, "-c", "copy", "-movflags", "+faststart", "-shortest", OUT]);
fs.rmSync(WORK, { recursive: true, force: true });

const secs = duration(OUT);
console.log(`\n${path.relative(ROOT, OUT)}  ` +
            `${Math.floor(secs / 60)}m ${String(Math.round(secs % 60)).padStart(2, "0")}s  ` +
            `${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB`);
