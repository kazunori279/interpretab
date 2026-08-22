/**
 * The three photographed panels of the guide's install slideshow, taken again.
 *
 *     node tests/guide-shots.mjs [--headed] [--keep]
 *
 * `docs/assets/install-1-store.png`, `-2-key.png` and `-4-start.png` are the
 * three photographs in the install section — the store listing with its Add to
 * Chrome button, the Options page with a key in it, and the side panel with its
 * language picker and Start. The section's other steps are AI Studio, which is
 * behind a Google sign-in, and a click on Chrome's own toolbar, which no page
 * can photograph; both are drawn in CSS inside
 * `docs/_includes/install-steps.html` and there is nothing here to take.
 *
 * Sibling of `tests/store-shots.mjs`, and deliberately not part of it. Those
 * three are 1280×800 because the store demands it, and are composed to be
 * looked at full size; these three are crops, sized to be legible in a 980px
 * column, and one of them is not an extension page at all. What they share is
 * the reason for existing: a screenshot that has to be re-taken by hand is a
 * screenshot that goes quietly out of date the next time a label changes.
 *
 * Cropping happens in Chrome, through `Page.captureScreenshot`'s `clip`, and
 * the rectangle is measured off the DOM rather than typed in — so a section
 * that grows a line is still framed correctly. `scale` is what makes the crops
 * sharp: the pages are laid out narrow, so their text is large relative to the
 * frame, and then rasterized above 1× so the frame is still wide enough to fill
 * the column.
 *
 * It also writes `docs/_data/shots.yml`, which is where each picture's size and
 * the rectangle of the one thing it is about — the button, the field — end up,
 * as percentages of the picture. The slideshow draws its ring and its arrow off
 * those numbers, so the marker follows the button when the picture is taken
 * again instead of pointing at where the button used to be.
 *
 * It costs nothing and needs no key. The key it shows is the same obvious fake
 * `store-shots.mjs` uses, in a profile that is deleted on the way out, and
 * nothing here opens a socket to the Live API.
 */

import fs from "node:fs";
import path from "node:path";
import { Chrome, sleep } from "./chrome-harness.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "docs", "assets");

const headed = process.argv.includes("--headed");
const keepOpen = process.argv.includes("--keep");

/** Same fake as `store-shots.mjs`, for the same reason: no real key in frame. */
const FAKE_KEY = "NOT-A-REAL-KEY-only-a-placeholder-00000";

/** The listing the first step sends people to. */
const LISTING =
  "https://chromewebstore.google.com/detail/interpretab/johnocemcoemdhiogfgmphjmlghgdnbm";

/**
 * The one state the last step is about: tab audio into a language, and the
 * microphone left off, so that the picker and Start are close enough together
 * to sit in one crop. The store's panel shot is the loaded one; this is the
 * one a reader is being walked through.
 */
const PANEL_STATE = {
  apiKey: FAKE_KEY,
  tabEnabled: true,
  tabTarget: "en",
  tabCaptions: true,
  micEnabled: false,
  micMode: "simul",
  micSource: "en",
  micTarget: "ja",
  micCaptions: false,
  duckLevel: 0.15,
};

/** Filled in by `capture()`, written out as `docs/_data/shots.yml` at the end. */
const shots = {};

const chrome = await Chrome.launch({ headed });
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
console.log(`${chrome.version} — Interpretab ${manifest.version}`);

try {
  const extensionId = await chrome.loadExtension(ROOT);
  const origin = `chrome-extension://${extensionId}`;
  await chrome.closeTargets("options.html");
  // Otherwise the panel carries its first-run microphone banner, which is not
  // the step being illustrated.
  await chrome.grantMic(origin);

  await store();
  await key(origin);
  await start(origin);
  writeShots();
} finally {
  await chrome.close({ keepOpen });
}

/**
 * The store listing, cropped to the row a reader is looking for.
 *
 * The only page here that belongs to somebody else, so the one thing the
 * picture is for is checked rather than assumed: the Add to Chrome button's
 * rectangle is read off the page and has to be inside the crop. A layout change
 * on Google's side then fails the run instead of silently shipping a picture of
 * a button that is no longer in it.
 *
 * 1360 wide because the listing needs it. Below about 1150 the button leaves
 * the viewport rather than reflowing, which is the whole point of the picture,
 * and the rest is margin for the sign-in button at the other end of the header.
 */
async function store() {
  const page = await chrome.newPage(LISTING, { width: 1360, height: 800 });
  const ok = await page.waitFor(`document.body.innerText.includes("Add to Chrome")`);
  if (!ok) throw new Error("the listing never rendered its Add to Chrome button");
  // The extension's own icon is the last thing on the page to arrive, and it is
  // the left edge of the crop.
  const drawn = await page.waitFor(
    `[...document.images].some((i) => i.getBoundingClientRect().width === 60 && i.naturalWidth > 0)`
  );
  if (!drawn) throw new Error("the listing never drew the extension's icon");
  await sleep(1500);

  const button = await page.eval(`(() => {
    const el = [...document.querySelectorAll("button, a")]
      .find((e) => e.textContent.trim() === "Add to Chrome");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  })()`);
  if (!button) throw new Error("the listing's Add to Chrome button is no longer a button or a link");

  // Between the store's own header bar and its media strip. The strip below is
  // the promo video and the five store screenshots, which this page is already
  // showing further up; the bar above is dropped because headless Chrome will
  // not draw the store's logo, and a broken-image glyph in the corner of a
  // picture that is meant to build confidence undoes the picture.
  const clip = { x: 32, y: 62, width: 1244, height: 248 };
  const inside =
    button.left > clip.x &&
    button.right < clip.x + clip.width &&
    button.top > clip.y &&
    button.bottom < clip.y + clip.height;
  if (!inside) {
    throw new Error(
      `the listing moved: Add to Chrome is at ${JSON.stringify(button)}, outside ${JSON.stringify(clip)}`
    );
  }

  await capture(page, "store", "install-1-store.png", { ...clip, scale: 1 }, button);
  await page.close();
}

/**
 * The Options page, cropped to the key.
 *
 * Laid out at 760, which is the page's own 44rem column plus its padding, and
 * rasterized at 1.6 so the crop is wide enough to fill the guide's column with
 * 14px text rather than 9px text. The key is revealed for the same reason the
 * store shot reveals it: a field of dots does not show that it is a fake.
 */
async function key(origin) {
  const page = await chrome.newPage(`${origin}/options.html`, { width: 760, height: 900 });
  await page.eval(`chrome.storage.local.set(${JSON.stringify(PANEL_STATE)})`);
  await page.reload();
  const ok = await page.waitFor(`document.getElementById("apiKey").value.length > 0`);
  if (!ok) throw new Error("the Options page never came up with the key in it");
  await page.eval(`document.getElementById("toggleKey").click(), true`);
  await sleep(300);

  const clip = await page.eval(`(() => {
    const head = document.querySelector('[data-i18n="optKeyHeading"]').getBoundingClientRect();
    const tail = document.getElementById("apiKeyStatus").getBoundingClientRect();
    return { x: 16, y: Math.round(head.top) - 14, width: 728,
             height: Math.round(tail.bottom - head.top) + 28 };
  })()`);
  await capture(page, "key", "install-2-key.png", { ...clip, scale: 1.6 }, await rect(page, "apiKey"));
  await page.close();
}

/**
 * The side panel, cropped to everything above the transcript.
 *
 * 420 is the width the panel actually opens at, so this is the panel at its own
 * proportions rather than the widened one the store shot uses. The bottom of
 * the crop is the button row: below it the panel is empty until a run starts,
 * and an inch of blank card is an inch the picture does not need.
 */
async function start(origin) {
  const page = await chrome.newPage(`${origin}/sidepanel.html`, { width: 420, height: 900 });
  await page.eval(`chrome.storage.local.set(${JSON.stringify(PANEL_STATE)})`);
  await page.reload();
  const ok = await page.waitFor(
    `document.getElementById("tabEnabled").checked && document.getElementById("toggle").textContent.length > 0`
  );
  if (!ok) throw new Error("the side panel never came up with tab audio on");
  await sleep(400);

  const clip = await page.eval(`(() => {
    const row = document.getElementById("toggle").closest(".row, .buttons") ||
                document.getElementById("toggle").parentElement;
    const r = row.getBoundingClientRect();
    return { x: 0, y: 0, width: 420, height: Math.round(r.bottom) + 14 };
  })()`);
  await capture(page, "start", "install-4-start.png", { ...clip, scale: 1.6 }, await rect(page, "toggle"));
  await page.close();
}

/** One element's box, in the page's own coordinates — the ones `clip` is in. */
async function rect(page, id) {
  const box = await page.eval(`(() => {
    const el = document.getElementById(${JSON.stringify(id)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  })()`);
  if (!box) throw new Error(`there is no #${id} on the page to point the slideshow's arrow at`);
  return box;
}

/**
 * Take the crop, write it, and record where the marker goes.
 *
 * `mark` is the thing the step is about, in the same coordinates as `clip`, and
 * comes out the other side as percentages of the picture — which is the only
 * form the slideshow can use, since the picture is scaled to whatever width the
 * column has left. It has to be inside the crop, or the arrow points off the
 * edge of a picture and the step has lost its subject.
 */
async function capture(page, name, file, clip, mark) {
  const { data } = await chrome.send(
    "Page.captureScreenshot",
    { format: "png", captureBeyondViewport: true, clip },
    page.sessionId
  );
  const target = path.join(OUT, file);
  fs.writeFileSync(target, Buffer.from(data, "base64"));
  const [width, height] = pngSize(target);

  if (
    mark.left < clip.x ||
    mark.top < clip.y ||
    mark.right > clip.x + clip.width ||
    mark.bottom > clip.y + clip.height
  ) {
    throw new Error(`${file}: the marker's subject is outside the crop — ${JSON.stringify(mark)}`);
  }
  const percent = (n) => Math.round(n * 1000) / 10;
  const box = {
    x: percent((mark.left - clip.x) / clip.width),
    y: percent((mark.top - clip.y) / clip.height),
    width: percent((mark.right - mark.left) / clip.width),
    height: percent((mark.bottom - mark.top) / clip.height),
  };
  shots[name] = { file, width, height, side: arrowSide(box, width / height), mark: box };
  console.log(`   ok   docs/assets/${file} — ${width}×${height}`);
}

/**
 * Which side of the ring the arrow stands on: whichever one it fits in.
 *
 * The answer is in pixels and the rectangle is in percentages, so this needs to
 * know how big the picture ends up. It ends up as wide as the guide's column,
 * or as wide as its own shape allows inside a frame of a fixed height, and both
 * of those numbers are in `_includes/head-custom.html`. They are copied here
 * because the alternative is arithmetic in Liquid, which cannot do it in
 * pixels at all: a percentage of room is generous on a picture that renders a
 * thousand pixels wide and is eleven pixels on one that renders four hundred.
 */
function arrowSide(box, ratio) {
  const COLUMN = 980; // `.container-lg` less its padding.
  const FRAME = 448; // `--stage` less `--pad` twice, at 16px to the rem.
  const ARROW = 34; // The arrow, and enough of a gap to read as pointing.

  const rendered = Math.min(COLUMN, FRAME * ratio);
  if ((box.x / 100) * rendered >= ARROW) return "left";
  if (((100 - box.x - box.width) / 100) * rendered >= ARROW) return "right";
  return "above";
}

/**
 * `docs/_data/shots.yml`, which the slideshow reads and nobody edits.
 *
 * Small enough to write by hand rather than take a YAML library for, and the
 * shape is fixed by the loop below rather than by whatever a serializer feels
 * like emitting — which keeps the diff after a re-run down to the numbers that
 * actually moved.
 */
function writeShots() {
  const lines = [
    "# Where each photographed picture in the install slideshow is, and where the one",
    "# thing it is about sits inside it.",
    "#",
    "# Written by `tests/guide-shots.mjs`, which takes the pictures. Edit that, not",
    "# this: the next run overwrites the file.",
    "#",
    "# `mark` is a rectangle in percentages of the picture, and it is what lets",
    "# `_includes/install-steps.html` put a ring and an arrow on the right button",
    "# without anybody measuring a screenshot by hand. Re-take a picture and the",
    "# ring moves with the button. `side` is where the arrow stands, which is",
    "# wherever it fits — see `arrowSide()`. `width` and `height` are the picture's own, and",
    "# are there for the `aspect-ratio` the slideshow reserves space with — a",
    "# picture that arrives after the text around it has been laid out moves the",
    "# text, and a reader who has started reading is the one it moves under.",
    "",
  ];
  for (const [name, shot] of Object.entries(shots)) {
    lines.push(`${name}:`);
    lines.push(`  file: ${shot.file}`);
    lines.push(`  width: ${shot.width}`);
    lines.push(`  height: ${shot.height}`);
    lines.push(`  side: ${shot.side}`);
    lines.push("  mark:");
    for (const [side, value] of Object.entries(shot.mark)) lines.push(`    ${side}: ${value}`);
    lines.push("");
  }
  const target = path.join(ROOT, "docs", "_data", "shots.yml");
  fs.writeFileSync(target, lines.join("\n"));
  console.log(`   ok   docs/_data/shots.yml — ${Object.keys(shots).length} pictures`);
}

/** Width and height out of a PNG's IHDR, as `tests/assets.test.js` reads them. */
function pngSize(file) {
  const head = fs.readFileSync(file).subarray(16, 24);
  return [head.readUInt32BE(0), head.readUInt32BE(4)];
}
