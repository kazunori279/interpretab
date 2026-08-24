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
 * `NOT-A-REAL-KEY-only-a-placeholder-00000`, written into a profile that is
 * deleted on the way out, and nothing here opens a socket to the Live API.
 *
 * Composition is `tests/store-frame.html`, driven by `tests/framed-shot.mjs` —
 * which `guide-shots.mjs` photographs its two page pictures on as well. These
 * three are English, because the store localizes a listing's words and not its
 * screenshots; the guide's are taken once per language.
 */

import fs from "node:fs";
import path from "node:path";
import { Chrome } from "./chrome-harness.mjs";
import { FAKE_KEY, framedShot, openStage } from "./framed-shot.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "store");

const headed = process.argv.includes("--headed");
const keepOpen = process.argv.includes("--keep");

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

  const stage = await openStage(chrome, origin);

  for (const shot of SHOTS) {
    const size = await framedShot(stage, origin, shot, path.join(OUT, shot.file));
    console.log(`   ok   ${shot.file} — ${size.join("×")}`);
  }
  console.log(`\n${SHOTS.length} screenshots written to store/`);
} finally {
  await chrome.close({ keepOpen });
}
