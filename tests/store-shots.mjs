/**
 * The three store screenshots that are pure extension UI, taken again.
 *
 *     node tests/store-shots.mjs [--headed] [--keep]
 *
 * `store/screenshot-3-glossary.png`, `-4-panel.png` and `-5-api-key.png` are the
 * Options page and the side panel photographed at 1280×800. They used to be
 * taken by hand, which meant that every wording change quietly aged them: the
 * three that shipped were still showing "source auto-detected", "Original volume
 * while speaking" and an Options page from before it grew its two groups. A
 * screenshot that has to be re-taken by hand is a screenshot that is out of date
 * — so this takes them the same way `onboarding.mjs` takes its own, from a
 * throwaway profile over the DevTools Protocol.
 *
 * The other two, `-1-subtitles` and `-2-microphone`, are off-screen captures of
 * a live session with a real video playing and a real side panel open. Nothing
 * inside a page can photograph browser UI, and no harness can supply the video,
 * so those stay manual and are not touched here.
 *
 * It costs nothing and needs no key. The key it shows is the obvious fake
 * `AIzaSyA-EXAMPLE-KEY-not-a-real-one-0000`, written into a profile that is
 * deleted on the way out, and nothing here opens a socket to the Live API.
 *
 * Composition is `tests/store-frame.html`: a 1280×800 extension page with one
 * iframe on it. The page being shot is laid out at `width`×`height` CSS pixels
 * and scaled up by `zoom`, so the product of the two is the frame — which is how
 * the Options page ends up legible at store scale instead of being a wall of
 * 14px text with 250px of margin either side.
 */

import fs from "node:fs";
import path from "node:path";
import { Chrome, sleep } from "./chrome-harness.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "store");

const headed = process.argv.includes("--headed");
const keepOpen = process.argv.includes("--keep");

/** What the store takes, and what `tests/assets.test.js` insists on. */
const FRAME = { width: 1280, height: 800 };

/**
 * An obvious fake, in the shape Google used to issue and long enough to clear
 * the "too short to be a secret" check, so the page shows the saved state
 * rather than a warning. The store's own rules forbid a real one in frame.
 */
const FAKE_KEY = "AIzaSyA-EXAMPLE-KEY-not-a-real-one-0000";

/**
 * Both directions on, the microphone in conversation mode: the only
 * arrangement in which one frame shows the two-way pair, the second mode, the
 * ducking slider and the cost note at once.
 */
const PANEL_STATE = {
  apiKey: FAKE_KEY,
  tabEnabled: true,
  tabTarget: "en",
  tabCaptions: true,
  micEnabled: true,
  micMode: "conversation",
  micSource: "en",
  micTarget: "ja",
  micCaptions: false,
  duckLevel: 0.15,
};

const SHOTS = [
  {
    file: "screenshot-3-glossary.png",
    page: "options.html",
    // 1280/1.4 and 800/1.4, rounded up so the iframe covers the frame rather
    // than leaving a hairline of host page down two edges.
    width: 916,
    height: 574,
    zoom: 1.4,
    state: { ...PANEL_STATE },
    // The list is built from storage after `init` awaits, so a row in the table
    // is the sign that the section is finished rather than merely present.
    until: `d.querySelector("#glossaryList table tr")`,
    // The glossary heading at the top of the frame: the section above it ends
    // in a device dropdown whose contents are the test machine's, and a store
    // screenshot should not be showing anybody's hardware.
    scrollTo: `[data-i18n="optGlossaryHeading"]`,
    margin: 24,
  },
  {
    file: "screenshot-4-panel.png",
    page: "sidepanel.html",
    // Wider than the 400px the side panel opens at: the panel is a column of
    // sentences, and at 400 the two direction labels and the conversation gloss
    // wrap enough to push Start off the bottom of the card. 460×540 at 1.43 is
    // a 658×772 card, which is the tallest that leaves the gradient a margin.
    width: 460,
    height: 540,
    zoom: 1.43,
    card: true,
    state: { ...PANEL_STATE },
    // Nothing renders until the settings load, and these two are what the
    // arrangement above is for: the conversation gloss and the cost note.
    until: `!d.getElementById("micNoteConversation").hidden && !d.getElementById("costNote").hidden`,
  },
  {
    file: "screenshot-5-api-key.png",
    page: "options.html",
    width: 916,
    height: 574,
    zoom: 1.4,
    state: { ...PANEL_STATE },
    until: `d.getElementById("apiKeyStatus").textContent.length > 0`,
    // Reveal the key. It is a fake, and a field of dots does not show that.
    prepare: `d.getElementById("toggleKey").click()`,
  },
];

const chrome = await Chrome.launch({ headed });
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
console.log(`${chrome.version} — Interpretab ${manifest.version}`);

try {
  const extensionId = await chrome.loadExtension(ROOT);
  const origin = `chrome-extension://${extensionId}`;
  // The install opens Options by itself; this needs the stage, not that.
  await chrome.closeTargets("options.html");
  // Otherwise the panel carries its microphone banner, which is a first-run
  // state and not the one the store is being sold.
  await chrome.grantMic(origin);

  const stage = await chrome.newPage(`${origin}/tests/store-frame.html`, FRAME);

  for (const shot of SHOTS) {
    await stage.eval(`chrome.storage.local.set(${JSON.stringify(shot.state)})`);
    // Cleared first, and waited for. Two of the three shots are the same page,
    // and assigning `src` does not replace the document at once: without this
    // the next shot's checks all pass against the last one's, still scrolled to
    // where it was left, and get photographed.
    await stage.eval(`(() => { document.getElementById("stage").src = "about:blank"; return true; })()`);
    await stage.waitFor(
      `document.getElementById("stage").contentWindow.location.href === "about:blank"`
    );

    // An IIFE, and every expression below is one too: `Runtime.evaluate` runs
    // in the page's global scope, where a bare `const` from the first shot is
    // still declared when the second one tries to declare it again.
    await stage.eval(`(() => {
      document.body.className = ${JSON.stringify(shot.card ? "card" : "")};
      const frame = document.getElementById("stage");
      frame.style.width = "${shot.width}px";
      frame.style.height = "${shot.height}px";
      frame.style.zoom = "${shot.zoom}";
      frame.src = ${JSON.stringify(`${origin}/${shot.page}`)};
      return true;
    })()`);

    // Every per-shot expression is written against the framed page rather than
    // the stage, so each one runs with `f` bound to its window and `d` to its
    // document. The guard is the previous shot's page: assigning `src` does not
    // replace the document at once, and the one still in the frame is complete,
    // titled, and missing every element the next expression asks for.
    const inFrame = (expression) => `(() => {
      const f = document.getElementById("stage").contentWindow;
      const d = f && f.document;
      if (!d || !f.location.href.endsWith("/${shot.page}")) return false;
      if (d.readyState !== "complete" || !d.title) return false;
      return (${expression});
    })()`;

    const ready = await stage.waitFor(inFrame(`!!(${shot.until})`));
    if (!ready) throw new Error(`${shot.file}: the page never finished rendering`);

    // A page taller than the frame draws a scrollbar down the right edge, and a
    // half-length scrollbar in a store screenshot reads as a crop of something
    // bigger. The page still scrolls; only the bar is gone.
    await stage.eval(inFrame(`d.documentElement.style.scrollbarWidth = "none", true`));

    if (shot.prepare) await stage.eval(inFrame(`${shot.prepare}, true`));
    if (shot.scrollTo) {
      await stage.eval(
        inFrame(`f.scrollTo(0, d.querySelector(${JSON.stringify(shot.scrollTo)})
                     .getBoundingClientRect().top + f.scrollY - ${shot.margin}), true`)
      );
    }
    // Fonts and the scroll both settle a frame late, and a screenshot taken
    // between the two catches the page mid-jump.
    await sleep(400);

    const file = path.join(OUT, shot.file);
    await stage.screenshot(file);
    const size = pngSize(file);
    const ok = size[0] === FRAME.width && size[1] === FRAME.height;
    console.log(`   ${ok ? "ok  " : "FAIL"} ${shot.file} — ${size.join("×")}${copied(shot.file)}`);
    if (!ok) throw new Error(`${shot.file} came out ${size.join("×")}`);
  }
  console.log(`\n${SHOTS.length} screenshots written to store/`);
} finally {
  await chrome.close({ keepOpen });
}

/**
 * The guide reuses two of these, and Jekyll cannot reach outside `docs/`, so
 * the site keeps its own copy of each. `tests/assets.test.js` fails when the
 * two drift — this keeps them from drifting in the first place.
 */
function copied(name) {
  const copy = path.join(ROOT, "docs", "assets", name);
  if (!fs.existsSync(copy)) return "";
  fs.copyFileSync(path.join(OUT, name), copy);
  return ", and into docs/assets/";
}

/** Width and height out of a PNG's IHDR, as `tests/assets.test.js` reads them. */
function pngSize(file) {
  const buf = fs.readFileSync(file);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}
