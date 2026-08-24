/**
 * The three photographed panels of the guide's install slideshow, in each of
 * the ten languages the guide is written in.
 *
 *     node tests/guide-shots.mjs [--headed] [--keep]
 *
 * `docs/assets/install-1-store-<lang>.png`, `-2-key-<lang>.png` and
 * `-4-start-<lang>.png` are the three photographs in the install section — the
 * store listing with its Add to Chrome button, the Options page with a key in
 * it, and the side panel with its language picker and Start. The section's
 * other steps are AI Studio, which is behind a Google sign-in, and a click on
 * Chrome's own toolbar, which no page can photograph; both are drawn in CSS
 * inside `docs/_includes/install-steps.html` and there is nothing here to take.
 *
 * Thirty pictures rather than three because all three are localized and none of
 * them is ours to translate. The store listing is Google's page and says
 * `Chrome に追加` to a reader whose Chrome is Japanese; the other two are the
 * extension's own UI coming out of `_locales`. A guide that walks a reader
 * through a screen and shows them a different screen is the failure this
 * repository keeps finding, and the fix is the same each time: take the picture
 * the reader is actually looking at. So Chrome is launched once per language —
 * which is what decides both the store's language and the catalogue the
 * extension loads — and the same three crops come out ten times.
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
 * that grows a line is still framed correctly, and a language whose sentences
 * run longer is framed correctly too. `scale` is what makes the crops sharp:
 * the pages are laid out narrow, so their text is large relative to the frame,
 * and then rasterized above 1× so the frame is still wide enough to fill the
 * column.
 *
 * It also writes `docs/_data/shots.yml`, which is where each picture's size and
 * the rectangle of the one thing it is about — the button, the field — end up,
 * as percentages of the picture. The slideshow draws its ring and its arrow off
 * those numbers, so the marker follows the button when the picture is taken
 * again instead of pointing at where the button used to be — and it follows the
 * button across languages, which is what a hand-typed percentage could not do
 * for a button that is `Add to Chrome` in one and `Hinzufügen` in another.
 *
 * It costs nothing and needs no key. The key it shows is the same obvious fake
 * `store-shots.mjs` uses, in a profile that is deleted on the way out, and
 * nothing here opens a socket to the Live API.
 */

import fs from "node:fs";
import path from "node:path";
import { Chrome, sleep } from "./chrome-harness.mjs";
import { simulLanguageCode } from "../lib/languages.js";

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
 * The guide's ten languages, and the UI language to run Chrome in for each.
 *
 * The keys are `docs/_data/languages.yml`'s codes, which is what a guide page
 * calls itself and what the file names here end in. Two of the values are
 * region-qualified because Chrome will not match a bare `zh` or `pt` to the
 * `_locales/zh_CN` and `_locales/pt_BR` catalogues — the same split
 * `tests/assets.test.js` ties together. English runs in whatever the machine is
 * set to, which for the store listing is English.
 */
const LANGUAGES = {
  en: "",
  ja: "ja",
  zh: "zh-CN",
  es: "es",
  fr: "fr",
  de: "de",
  pt: "pt-BR",
  ko: "ko",
  hi: "hi",
  ar: "ar",
};

/**
 * The one state the last step is about: tab audio into the reader's own
 * language, and the microphone left off, so that the picker and Start are close
 * enough together to sit in one crop. The store's panel shot is the loaded one;
 * this is the one a reader is being walked through, and the step above the
 * picture tells them to pick their language — so the picture shows it picked.
 */
const panelState = (lang) => ({
  apiKey: FAKE_KEY,
  tabEnabled: true,
  tabTarget: lang,
  tabCaptions: true,
  micEnabled: false,
  micMode: "simul",
  micSource: "en",
  micTarget: lang === "ja" ? "en" : "ja",
  micCaptions: false,
  duckLevel: 0.15,
});

/** Which numbered file each figure's pictures are, one per language. */
const FILES = { store: "install-1-store", key: "install-2-key", start: "install-4-start" };

/** Filled in by `capture()`, written out as `docs/_data/shots.yml` at the end. */
const shots = {};

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

for (const [lang, ui] of Object.entries(LANGUAGES)) {
  const chrome = await Chrome.launch({ headed, lang: ui });
  if (lang === "en") console.log(`${chrome.version} — Interpretab ${manifest.version}`);
  console.log(`\n${lang}`);
  try {
    // The listing first, before the extension is loaded: to a browser that
    // already has it, the store greys Add to Chrome out and drops the `jsname`
    // the button is found by. Neither is the button the reader is about to
    // press, and the picture is of that button.
    await store(chrome, lang);

    const extensionId = await chrome.loadExtension(ROOT);
    const origin = `chrome-extension://${extensionId}`;
    await chrome.closeTargets("options.html");
    // Otherwise the panel carries its first-run microphone banner, which is not
    // the step being illustrated.
    await chrome.grantMic(origin);

    await key(chrome, origin, lang);
    await start(chrome, origin, lang);
  } finally {
    await chrome.close({ keepOpen });
  }
}
writeShots();

/**
 * The store listing, cropped to the row a reader is looking for.
 *
 * The only page here that belongs to somebody else, so the one thing the
 * picture is for is checked rather than assumed: the Add to Chrome button's
 * rectangle is read off the page and has to be inside the crop. A layout change
 * on Google's side then fails the run instead of silently shipping a picture of
 * a button that is no longer in it.
 *
 * The button is found by `jsname`, not by its words, because its words are the
 * point: `Add to Chrome`, `Chrome に追加`, and in German just `Hinzufügen`.
 * `jsname` is compiled output and could be renamed tomorrow, which is why the
 * label it found is printed — a run whose ten lines suddenly all say the same
 * thing is a run that stopped following the language.
 *
 * 1360 wide because the listing needs it. Below about 1150 the button leaves
 * the viewport rather than reflowing, which is the whole point of the picture,
 * and the rest is margin for the sign-in button at the other end of the header.
 */
async function store(chrome, lang) {
  const WIDTH = 1360;
  const page = await chrome.newPage(LISTING, { width: WIDTH, height: 800 });
  const ok = await page.waitFor(`!!document.querySelector('button[jsname="wQO0od"]')`);
  if (!ok) throw new Error("the listing never rendered its Add to Chrome button");
  // The extension's own icon is the last thing on the page to arrive, and it is
  // the leading edge of the crop.
  const drawn = await page.waitFor(
    `[...document.images].some((i) => i.getBoundingClientRect().width === 60 && i.naturalWidth > 0)`
  );
  if (!drawn) throw new Error("the listing never drew the extension's icon");
  await sleep(1500);

  const button = JSON.parse(await page.eval(`(() => {
    const found = document.querySelectorAll('button[jsname="wQO0od"]');
    if (found.length !== 1) return JSON.stringify({ found: found.length });
    const r = found[0].getBoundingClientRect();
    return JSON.stringify({
      label: found[0].textContent.trim(),
      left: r.left, right: r.right, top: r.top, bottom: r.bottom,
    });
  })()`));
  if (!button.label) {
    throw new Error(`the listing has ${button.found} buttons called wQO0od, not one — Google renamed it`);
  }

  // Between the store's own header bar and its media strip. The strip below is
  // the promo video and the five store screenshots, which this page is already
  // showing further up; the bar above is dropped because headless Chrome will
  // not draw the store's logo, and a broken-image glyph in the corner of a
  // picture that is meant to build confidence undoes the picture.
  //
  // Symmetric about the viewport, because Arabic lays the whole listing out the
  // other way round: the same inset that clears the tab strip on the left in
  // English has to clear it on the right in Arabic.
  const clip = { x: 32, y: 62, width: WIDTH - 64, height: 248 };
  const inside =
    button.left > clip.x &&
    button.right < clip.x + clip.width &&
    button.top > clip.y &&
    button.bottom < clip.y + clip.height;
  if (!inside) {
    throw new Error(
      `the listing moved: ${button.label} is at ${JSON.stringify(button)}, outside ${JSON.stringify(clip)}`
    );
  }

  console.log(`        the button reads ${button.label}`);
  await capture(page, "store", lang, { ...clip, scale: 1 }, button);
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
async function key(chrome, origin, lang) {
  const page = await chrome.newPage(`${origin}/options.html`, { width: 760, height: 900 });
  await page.eval(`chrome.storage.local.set(${JSON.stringify(panelState(lang))})`);
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
  await capture(page, "key", lang, { ...clip, scale: 1.6 }, await rect(page, "apiKey"));
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
async function start(chrome, origin, lang) {
  const page = await chrome.newPage(`${origin}/sidepanel.html`, { width: 420, height: 900 });
  await page.eval(`chrome.storage.local.set(${JSON.stringify(panelState(lang))})`);
  await page.reload();
  const ok = await page.waitFor(
    `document.getElementById("tabEnabled").checked && document.getElementById("toggle").textContent.length > 0`
  );
  if (!ok) throw new Error("the side panel never came up with tab audio on");
  // The picker is filled in from `lib/languages.js`, so a guide language that
  // is not one of its codes would quietly leave the shot on whatever the panel
  // defaults to — a picture of somebody else's language above the arrow. Tab
  // audio runs the simultaneous model, whose codes are the BCP-47 ones, so the
  // guide's `zh` and `pt` come back as `zh-Hans` and `pt-BR`.
  const wanted = simulLanguageCode(lang);
  const picked = await page.eval(`document.getElementById("tabTarget").value`);
  if (picked !== wanted) throw new Error(`the panel will not translate into ${lang}: it picked ${picked}`);
  await sleep(400);

  const clip = await page.eval(`(() => {
    const row = document.getElementById("toggle").closest(".row, .buttons") ||
                document.getElementById("toggle").parentElement;
    const r = row.getBoundingClientRect();
    return { x: 0, y: 0, width: 420, height: Math.round(r.bottom) + 14 };
  })()`);
  await capture(page, "start", lang, { ...clip, scale: 1.6 }, await rect(page, "toggle"));
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
async function capture(page, name, lang, clip, mark) {
  const file = `${FILES[name]}-${lang}.png`;
  const { data } = await page.chrome.send(
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
  shots[name] ??= {};
  shots[name][lang] = { file, width, height, side: arrowSide(box, width / height), mark: box };
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
  const FRAME = 362; // `--stage`, less `--pad` twice, `--say` and `--gap`, at 16px to the rem.
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
    "# thing it is about sits inside it — for every language the guide is written in.",
    "#",
    "# Written by `tests/guide-shots.mjs`, which takes the pictures. Edit that, not",
    "# this: the next run overwrites the file.",
    "#",
    "# A picture per language because all three are localized: the store listing is",
    "# Google's, the other two are the extension's own UI. The numbers differ with",
    "# the words — a button called `Hinzufügen` is not where a button called `Add to",
    "# Chrome` is — which is why none of this is typed in by hand.",
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
  for (const [name, languages] of Object.entries(shots)) {
    lines.push(`${name}:`);
    for (const [lang, shot] of Object.entries(languages)) {
      lines.push(`  ${lang}:`);
      lines.push(`    file: ${shot.file}`);
      lines.push(`    width: ${shot.width}`);
      lines.push(`    height: ${shot.height}`);
      lines.push(`    side: ${shot.side}`);
      lines.push("    mark:");
      for (const [side, value] of Object.entries(shot.mark)) lines.push(`      ${side}: ${value}`);
    }
    lines.push("");
  }
  const target = path.join(ROOT, "docs", "_data", "shots.yml");
  fs.writeFileSync(target, lines.join("\n"));
  const count = Object.values(shots).reduce((n, languages) => n + Object.keys(languages).length, 0);
  console.log(`\n   ok   docs/_data/shots.yml — ${count} pictures`);
}

/** Width and height out of a PNG's IHDR, as `tests/assets.test.js` reads them. */
function pngSize(file) {
  const head = fs.readFileSync(file).subarray(16, 24);
  return [head.readUInt32BE(0), head.readUInt32BE(4)];
}
