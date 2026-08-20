/**
 * What the server actually does when a session runs out of quota — not part of
 * `npm test`.
 *
 * `closeReason()` in `lib/live-session.js` has three branches, and only two of
 * them have ever been seen: a `reason` string, and the opaque 1006 a browser
 * reports for a rejected handshake. The third — a close with a code and no
 * reason — is what a mid-session `RESOURCE_EXHAUSTED` was assumed to look like,
 * assumed being the word. Nothing in the repo has ever observed one, so the
 * message the side panel shows a user whose free tier ran out mid-sentence is a
 * guess. This script replaces the guess with a transcript.
 *
 * The obvious way to get one is to burn a day of free tier, which costs a day
 * and can only be done once. The cheap way is to move the limit instead of the
 * usage: the free tier's only enforced lever for the Live models is
 *
 *   generativelanguage.googleapis.com/generate_content_free_tier_input_token_count
 *   1/min/{project}/{model}
 *
 * — every requests-per-minute and requests-per-day bucket for every `*-live`
 * model reads -1, so tokens per minute is the whole of it. Override that bucket
 * down to a couple of hundred and one session crosses it in seconds:
 *
 *   gcloud alpha services quota update \
 *     --service=generativelanguage.googleapis.com \
 *     --consumer=projects/<project> \
 *     --metric=generativelanguage.googleapis.com/generate_content_free_tier_input_token_count \
 *     --unit='1/min/{project}/{model}' \
 *     --dimensions=model=gemini-3.5-live-translate \
 *     --value=100 --force
 *
 * Put it back with `--value=20000` (the default for that model) or
 * `gcloud alpha services quota delete` on the same coordinates. The dimension is
 * the model *family*, not the id the extension sends: there is no
 * `gemini-3.1-flash-live` bucket at all, so `gemini-3.1-flash-live-preview`
 * accounts under `gemini-3-flash-live`, and `gemini-3.5-live-translate-preview`
 * under `gemini-3.5-live-translate`. An override on the id rather than the
 * family is accepted and does nothing.
 *
 * This drives `LiveSession` directly rather than `SessionLoop`, because the loop
 * exists to hide exactly the event being measured — it would open a replacement
 * and the close would never reach the report.
 *
 * Usage:
 *   node tests/quota-close.mjs <key-file> <wav> [--direction tab|mic]
 *                              [--mic-mode simul|conversation] [--seconds N]
 *
 * The key comes from a file rather than an argument so it stays out of the shell
 * history and the process list, and nothing here logs it — the Live API takes it
 * as a query parameter, so the frame dump below prints frames and never the URL.
 */

import { buildSetup, isSimul, modelFor, LiveSession } from "../lib/live-session.js";
import { DEFAULTS } from "../lib/settings.js";
import { AUDIO_TOKENS_PER_SECOND } from "../lib/usage.js";
import { argOf, readKey, readWav, sleep, stamp, streamPcm } from "./live-harness.mjs";

const [keyFile, wavFile] = process.argv.slice(2);
const direction = argOf("--direction", "mic");
const micMode = argOf("--mic-mode", "simul");
const limitSec = Number(argOf("--seconds", 120));

if (
  !keyFile ||
  !wavFile ||
  !["tab", "mic"].includes(direction) ||
  !["simul", "conversation"].includes(micMode)
) {
  console.error(
    "usage: node tests/quota-close.mjs <key-file> <wav> [--direction tab|mic] " +
      "[--mic-mode simul|conversation] [--seconds N]"
  );
  process.exit(2);
}

const t0 = Date.now();
const log = (line) => console.log(`[${stamp(t0)}] ${line}`);

const apiKey = readKey(keyFile);
const pcm = readWav(wavFile);
const settings = { ...DEFAULTS, micMode, tabTarget: "en", micSource: "ja", micTarget: "en" };
const model = modelFor(direction, settings);

/** Every frame the server sent, audio payloads elided; the last one is the evidence. */
const frames = [];
/** The close as the socket reported it, before `LiveSession` narrows it to a code. */
let closed = null;
let heard = "";
let said = "";

/**
 * `LiveSession` with the socket tapped.
 *
 * The two things this run is for — the verbatim `reason` and the frame that came
 * immediately before the close — are both discarded on the way out of the
 * library. `onclose` at `lib/live-session.js:268` reports `{ type: "closed",
 * code }` and drops `event.reason` on the floor, which is itself half the
 * finding; reading it needs the raw event.
 */
class TappedSession extends LiveSession {
  open() {
    // The socket exists as soon as open() returns — the Promise executor runs
    // synchronously — so the taps go on before the first frame can arrive.
    const promise = super.open();
    const ws = this._ws;
    const innerMessage = ws.onmessage;
    const innerClose = ws.onclose;

    ws.onmessage = async (event) => {
      // The server sends JSON, but as binary frames — a string here is the
      // exception, not the rule.
      let text = event.data;
      if (text instanceof Blob) text = await text.text();
      else if (text instanceof ArrayBuffer) text = new TextDecoder().decode(text);
      frames.push({
        at: Date.now(),
        text: String(text).replace(/"data":\s*"[^"]*"/g, '"data":"…"'),
      });
      return innerMessage(event);
    };

    ws.onclose = (event) => {
      closed = {
        at: Date.now(),
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
      };
      log(`socket closed: code ${event.code}, reason ${JSON.stringify(event.reason)}`);
      return innerClose(event);
    };

    return promise;
  }
}

const session = new TappedSession({
  apiKey,
  setup: buildSetup(direction, settings, []),
  onStatus: (state, detail) => log(`status: ${state}${detail ? ` (${detail})` : ""}`),
  onEvent: (ev) => {
    if (ev.type === "input") heard += ev.text;
    else if (ev.type === "output") said += ev.text;
    else if (ev.type !== "audio") log(`event: ${JSON.stringify(ev)}`);
  },
});

log(`${direction}${direction === "mic" ? ` (${micMode})` : ""} on ${model}`);
log(`simultaneous translation: ${isSimul(direction, settings)}`);

try {
  await session.open();
} catch (err) {
  // A quota that is already spent when the session opens closes the handshake
  // instead of the stream, which is a different finding — and the one case where
  // the extension has nothing better than a 1006 to work with.
  console.log(`\n--- rejected at the handshake after ${stamp(t0)} ---`);
  console.log("open() threw   :", err.message);
  console.log("close event    :", closed ? JSON.stringify(closed) : "(none — no socket)");
  console.log("frames before  :", frames.length);
  for (const f of frames.slice(-3)) console.log("  ", f.text.slice(0, 400));
  process.exit(1);
}

// Loop the clip rather than pad it: the limit is per *minute*, so the run has to
// keep spending to cross it, and silence still costs tokens but reads worse in
// the transcript when the close finally lands.
const speechSec = pcm.length / 2 / 16000;
const passes = Math.ceil(limitSec / speechSec);
log(`streaming ${speechSec.toFixed(1)}s of speech × up to ${passes} passes`);

const openedAt = Date.now();
let sentSec = 0;
for (let pass = 0; pass < passes && !closed; pass++) {
  const finished = await streamPcm(session, pcm, { until: () => !!closed });
  sentSec += finished ? speechSec : 0;
  if (finished) log(`pass ${pass + 1}/${passes} done — ${Math.round(sentSec)}s of audio in`);
}

// The close trails the last chunk the server accepted, so give it room to arrive
// after the audio stops rather than reporting "no close" on a race.
for (let waited = 0; !closed && waited < 30_000; waited += 250) await sleep(250);

const secondsIn = (Date.now() - openedAt) / 1000;
console.log(`\n--- after ${stamp(t0)} ---`);
console.log("model      :", model);
console.log("audio in   :", `${secondsIn.toFixed(1)}s ≈ ${Math.round(secondsIn * AUDIO_TOKENS_PER_SECOND)} input tokens`);
console.log("heard      :", heard.trim() || "(nothing)");
console.log("said       :", said.trim() || "(nothing)");
console.log("frames     :", frames.length);

if (!closed) {
  console.log("\nthe session was never closed — the override has not taken, or it is not the binding limit");
  session.close();
  await sleep(100);
  process.exit(1);
}

const sinceLastFrame = frames.length ? (closed.at - frames.at(-1).at) / 1000 : null;
console.log("\nclose");
console.log("  code     :", closed.code);
console.log("  reason   :", JSON.stringify(closed.reason));
console.log("  wasClean :", closed.wasClean);
console.log("  at       :", `${((closed.at - openedAt) / 1000).toFixed(1)}s into the session`);
if (sinceLastFrame !== null) console.log("  after    :", `${sinceLastFrame.toFixed(1)}s of server silence`);
console.log("\nthe last three frames before it");
for (const f of frames.slice(-3)) {
  console.log(`  +${((f.at - openedAt) / 1000).toFixed(1)}s ${f.text.slice(0, 400)}`);
}

// What the side panel would have said. `LiveSession` reports `{ type: "closed",
// code }` for a close after `setupComplete`, so whatever the server put in
// `reason` above never reaches the UI — if the two lines here disagree, the
// event is carrying a sentence the user is not being shown.
console.log("\nwhat the extension shows for this close");
console.log("  the event it emits:", JSON.stringify({ type: "closed", code: closed.code }));
console.log("  the reason it drops:", JSON.stringify(closed.reason) || '""');

session.close();
await sleep(100);
process.exit(0);
