/**
 * Every photograph in the guide, in each of the ten languages it is written in.
 *
 *     node tests/guide-shots.mjs [--headed] [--keep] [--only <figure,…>]
 *
 * `docs/assets/install-1-store-<lang>.png`, `-2-key-<lang>.png` and
 * `-4-start-<lang>.png` are the three photographs in the install section — the
 * store listing with its Add to Chrome button, the Options page with a key in
 * it, and the side panel with its language picker and Start. `meet-1-tab`,
 * `-2-mic` and `-3-start` are the three in the Google Meet section: the two
 * direction cards set up for a call, and the button row. `slide-1-mic` and
 * `-2-size` are the two in the slide-presentation section: the microphone card
 * translating the presenter, and the subtitle size wound up for a room. The
 * steps none of the three sections photographs are AI Studio, which is behind a
 * Google sign-in, Chrome's own toolbar, which no page can photograph, Meet
 * itself, whose labels are not ours to translate, and a slide deck, which is
 * somebody else's page; all of them are drawn in CSS inside the includes and
 * there is nothing here to take.
 *
 * `panel-<lang>.png` and `glossary-<lang>.png` are the other two, and they are
 * not in a slideshow: they are the pictures the prose sits beside under
 * "Choosing what to translate" and "Teaching it your words". Both used to be the
 * store's own uploads, copied into `docs/assets/` and shown to all ten
 * languages — an English panel over a Japanese sentence about タブ音声, which is
 * the one thing the other eighty pictures exist to avoid. They are taken on the
 * store's stage rather than cropped, so they still look like the pictures the
 * guide has always had; only their words change.
 *
 * Eighty pictures rather than eight because all eight are localized and none of
 * them is ours to translate. The store listing is Google's page and says
 * `Chrome に追加` to a reader whose Chrome is Japanese; the rest are the
 * extension's own UI coming out of `_locales`. A guide that walks a reader
 * through a screen and shows them a different screen is the failure this
 * repository keeps finding, and the fix is the same each time: take the picture
 * the reader is actually looking at. So Chrome is launched once per language —
 * which is what decides both the store's language and the catalogue the
 * extension loads — and the same eight crops come out ten times.
 *
 * Sibling of `tests/store-shots.mjs`, and deliberately not part of it. Those
 * three are 1280×800 because the store demands it, and are composed to be
 * looked at full size; these are crops, sized to be legible in a 980px
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
 * `--only` takes the names below and skips the rest, for the re-take that does
 * not need all eight: `--only pages` is twenty pictures and no network, where a
 * full run visits Google's listing ten times. A run that skipped a slideshow
 * figure leaves `docs/_data/shots.yml` alone rather than writing a file with the
 * skipped figures missing from it.
 *
 * It costs nothing and needs no key. The key it shows is the same obvious fake
 * `store-shots.mjs` uses, in a profile that is deleted on the way out, and
 * nothing here opens a socket to the Live API.
 */

import fs from "node:fs";
import path from "node:path";
import { Chrome, catalogueFor, plainMessage, sleep } from "./chrome-harness.mjs";
import { FAKE_KEY, framedShot, inFrame, openStage, pngSize } from "./framed-shot.mjs";
import { simulLanguageCode } from "../lib/languages.js";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "docs", "assets");

const headed = process.argv.includes("--headed");
const keepOpen = process.argv.includes("--keep");

/** The six steps below, in the order the loop runs them. */
const STEPS = ["store", "key", "start", "meet", "slides", "pages"];

/** `--only key,pages` — everything, unless the run asked for less. */
const asked = process.argv.indexOf("--only");
const only = asked === -1 ? [] : (process.argv[asked + 1] || "").split(",").filter(Boolean);
for (const name of only) {
  if (!STEPS.includes(name)) throw new Error(`--only ${name}: there is no such figure. ${STEPS.join(", ")}`);
}
const wanted = (name) => !only.length || only.includes(name);

/**
 * How wide a picture ends up in the guide: `.container-lg` less its padding.
 * Both the crops and the arrows are sized against it — one to be rasterized at
 * the width it is drawn at, the other to know whether a percentage of margin is
 * room for an arrow or eleven pixels.
 */
const COLUMN = 980;

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

/**
 * The one state the Meet section is about: both directions on, tab audio into
 * the reader's language and the microphone out of it, with the Meet switch
 * left where it defaults. `micCaptions` is stored on, and the panel is expected
 * to render it off and greyed — the pictures are of a call, and on a call the
 * microphone's subtitles would be subtitles of your own voice.
 */
const callState = (lang) => ({
  ...panelState(lang),
  micEnabled: true,
  micTarget: lang === "en" ? "ja" : "en",
  micCaptions: true,
  micToCall: true,
});

/**
 * The one state the slide-presentation section is about: the microphone on and
 * simultaneous, translating the presenter out of the language the guide is
 * written in, with tab audio off — a deck makes no sound to translate, and a
 * second direction running is a second bill for nothing.
 *
 * `soundMuted` is stored on because that is what the panel does the moment the
 * microphone goes on in this mode, and it is the sentence the picture is
 * carrying: a room full of people should hear the presenter, not a laptop
 * speaking over them.
 */
const presentState = (lang) => ({
  ...panelState(lang),
  tabEnabled: false,
  micEnabled: true,
  micTarget: lang === "en" ? "ja" : "en",
  micCaptions: true,
  soundMuted: true,
  captionSize: 48,
});

/**
 * The state the two page pictures are of: both directions on and the microphone
 * in conversation mode, which is the only arrangement where one frame holds the
 * two-way pair, the second mode, the ducking slider and the cost note at once.
 *
 * The pair is the reader's own language and English, the other way round from
 * the tab card above it — a reader looking at their language on both sides of
 * one panel cannot see which half is which. English readers get Japanese, as
 * the store shot has always shown them. Conversation mode stores its languages
 * in the agent model's code space, and all ten of the guide's codes are already
 * in it, so they go in unconverted.
 */
const pageState = (lang) => ({
  ...panelState(lang),
  micEnabled: true,
  micMode: "conversation",
  micSource: lang,
  micTarget: lang === "en" ? "ja" : "en",
});

/** Which numbered file each figure's pictures are, one per language. */
const FILES = {
  store: "install-1-store",
  key: "install-2-key",
  start: "install-4-start",
  meettab: "meet-1-tab",
  meetmic: "meet-2-mic",
  meetstart: "meet-3-start",
  slidemic: "slide-1-mic",
  slidesize: "slide-2-size",
};

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
    if (wanted("store")) await store(chrome, lang);

    const extensionId = await chrome.loadExtension(ROOT);
    const origin = `chrome-extension://${extensionId}`;
    await chrome.closeTargets("options.html");
    // Otherwise the panel carries its first-run microphone banner, which is not
    // the step being illustrated.
    await chrome.grantMic(origin);

    if (wanted("key")) await key(chrome, origin, lang);
    if (wanted("start")) await start(chrome, origin, lang);
    if (wanted("meet")) await meet(chrome, origin, lang);
    if (wanted("slides")) await slides(chrome, origin, lang);
    if (wanted("pages")) await pages(chrome, origin, lang);
  } finally {
    await chrome.close({ keepOpen });
  }
}
// `shots.yml` is written whole or not at all: a partial run knows about the
// figures it took and nothing about the ones it skipped, and writing what it
// knows would delete the rest.
if (["store", "key", "start", "meet", "slides"].every(wanted)) writeShots();
else console.log(`\n   --   docs/_data/shots.yml left alone: ${only.join(", ")} is not every figure`);

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
  // Above, not beside. This is the whole panel in a picture that renders three
  // hundred pixels wide, so the only room left of Start is nine pixels and the
  // room to its right is the microphone button — an arrow there covers the
  // control it is not pointing at.
  await capture(page, "start", lang, { ...clip, scale: 1.6 }, await rect(page, "toggle"), "above");
  await page.close();
}

/**
 * The side panel set up for a Meet call, cropped three ways.
 *
 * One page load and three pictures, because the three steps are three parts of
 * one screen and photographing them separately would let them drift out of
 * step with each other. The crops are the two direction cards and the button
 * row rather than the whole panel: a 420-wide panel with both directions open
 * is taller than it is wide, and a picture that tall comes out about a third of
 * the column and unreadable.
 *
 * The panel only offers the Meet switch on `meet.google.com` — `callMicOn` in
 * `lib/settings.js` — and it learns where it is from `chrome.tabs`, which here
 * answers with the extension page it is being photographed in. So the answer is
 * wrapped before any of the panel's own scripts run. Nothing else about the
 * page is faked: the switch, the greyed-out subtitles box and the note under it
 * are the panel's own rendering of that URL.
 */
async function meet(chrome, origin, lang) {
  const page = await chrome.newPage(`${origin}/sidepanel.html`, { width: 420, height: 900 });
  await page.chrome.send(
    "Page.addScriptToEvaluateOnNewDocument",
    { source: `(${asMeetTab})("https://meet.google.com/abc-defg-hij")` },
    page.sessionId
  );
  await page.eval(`chrome.storage.local.set(${JSON.stringify(callState(lang))})`);
  await page.reload();
  const ok = await page.waitFor(`!document.getElementById("micToCallRow").hidden`);
  if (!ok) throw new Error("the panel never believed it was on a Meet tab");

  const wanted = simulLanguageCode(lang);
  const picked = await page.eval(`document.getElementById("tabTarget").value`);
  if (picked !== wanted) throw new Error(`the panel will not translate into ${lang}: it picked ${picked}`);
  // The picture is of the rule this section exists to explain, so it is checked
  // rather than trusted: on a call the microphone's subtitles come off and stay
  // off, and a shot of a ticked box would be a shot contradicting its caption.
  const captions = await page.eval(`(() => {
    const box = document.getElementById("micCaptions");
    return { checked: box.checked, disabled: box.disabled };
  })()`);
  if (captions.checked || !captions.disabled) {
    throw new Error(`the panel still offers the microphone's subtitles on a call: ${JSON.stringify(captions)}`);
  }
  await sleep(400);

  // The microphone card stops at the Meet switch rather than at its own bottom
  // edge. Below it are two notes that run to six lines in some languages, and a
  // card that tall renders about a third of the column wide — the switch this
  // step is about would be eleven pixels of it. The notes say what the step
  // says anyway. The cut goes in the gap between the switch and the first of
  // them: far enough down that the marker's ring is whole, and not so far that
  // the picture ends on the top halves of a line of letters.
  const clips = await page.eval(`(() => {
    const cards = document.querySelectorAll("section.direction");
    const bar = document.querySelector("section.buttons");
    const buttons = bar.getBoundingClientRect();
    const row = document.getElementById("micToCallRow").getBoundingClientRect();
    const note = document.getElementById("micToCallNote").getBoundingClientRect();
    const call = { bottom: note.height ? (row.bottom + note.top) / 2 : row.bottom + 8 };
    const from = (el, bottom) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left) - 6, y: Math.round(r.top) - 6,
               width: Math.round(r.width) + 12, height: Math.round(bottom - r.top) + 12 };
    };
    // The button row stops after the last button rather than at the panel's
    // edge. What is past it is empty, and empty pixels in a picture this wide
    // are pixels taken off Start: the wider the crop, the smaller everything in
    // it renders in a column of a fixed width. Measured off the buttons rather
    // than off the row, and from both ends, because in Arabic they run the
    // other way.
    const ends = [...bar.children].map((el) => el.getBoundingClientRect());
    const left = Math.max(0, Math.round(Math.min(...ends.map((r) => r.left))) - 20);
    const right = Math.round(Math.max(...ends.map((r) => r.right))) + 20;
    return {
      meettab: from(cards[0], cards[0].getBoundingClientRect().bottom),
      meetmic: from(cards[1], call.bottom),
      meetstart: { x: left, y: Math.round(buttons.top) - 6, width: right - left,
                   height: Math.round(buttons.height) + 12 },
    };
  })()`);
  // Both arrows stand on the side of their subject that has nothing else on it:
  // the language picker has its `into` in front of it, and Start has the
  // microphone button behind it. Which side that is swaps with the panel's own
  // direction, so it is read off the panel rather than off a list of languages.
  const rtl = await page.eval(`document.documentElement.dir === "rtl"`);
  // 2.4 on the wide crop and 2 on the tall one: both end up about as wide as the
  // guide's column allows, and a crop rasterized below the width it is drawn at
  // is a crop the browser has to invent pixels for. The button row is a third of
  // the width of either, so its multiple is worked out rather than picked —
  // 2.4 there would be a picture stretched to two-thirds again.
  const target = await rect(page, "tabTarget");
  await capture(page, "meettab", lang, { ...clips.meettab, scale: 2.4 }, target, rtl ? "left" : "right");
  await capture(page, "meetmic", lang, { ...clips.meetmic, scale: 2 }, await rect(page, "micToCallRow"));
  const toggle = await rect(page, "toggle");
  const scale = COLUMN / clips.meetstart.width;
  await capture(page, "meetstart", lang, { ...clips.meetstart, scale }, toggle, rtl ? "right" : "left");
  await page.close();
}

/**
 * The two pictures the slide-presentation section is about.
 *
 * The microphone card set up to translate the presenter, and the Options page's
 * subtitle size wound up to where the back row can read it. The other three
 * steps in that section have nothing here to take: the deck is somebody else's
 * page, the slideshow is that page in fullscreen, and Start is `meet-3-start` —
 * the same buttons in the same panel, and a second photograph of them would be
 * one more picture to re-take every time the row changes.
 *
 * The size is a whole page rather than a crop of the panel, so it is taken at
 * the Options page's own width the way `key()` is, and both are rasterized
 * above 1× for the same reason: the guide's column is wider than either page is
 * drawn.
 */
async function slides(chrome, origin, lang) {
  const panel = await chrome.newPage(`${origin}/sidepanel.html`, { width: 420, height: 900 });
  await panel.eval(`chrome.storage.local.set(${JSON.stringify(presentState(lang))})`);
  await panel.reload();
  const ok = await panel.waitFor(
    `document.getElementById("micEnabled").checked && !document.getElementById("micNoteSimul").hidden`
  );
  if (!ok) throw new Error("the side panel never came up with the microphone on and its voice muted");

  // The direction the section is about is the opposite of every other picture
  // here: out of the reader's language, not into it. A shot translating a
  // presenter into the language they are presenting in illustrates nothing.
  const audience = simulLanguageCode(lang === "en" ? "ja" : "en");
  const picked = await panel.eval(`document.getElementById("micTarget").value`);
  if (picked !== audience) throw new Error(`the panel will not translate the room into ${audience}: it picked ${picked}`);
  await sleep(400);

  // Down to the muted note rather than to the card's bottom edge: the note is
  // the half of this step that is not a control, and what follows it is the
  // line of links to the other two cards, which this section is not one of.
  const clip = await panel.eval(`(() => {
    const card = document.querySelectorAll("section.direction")[1].getBoundingClientRect();
    const note = document.getElementById("micNoteSimul").getBoundingClientRect();
    return { x: Math.round(card.left) - 6, y: Math.round(card.top) - 6,
             width: Math.round(card.width) + 12, height: Math.round(note.bottom - card.top) + 12 };
  })()`);
  const rtl = await panel.eval(`document.documentElement.dir === "rtl"`);
  await capture(panel, "slidemic", lang, { ...clip, scale: 2 }, await rect(panel, "micTarget"), rtl ? "left" : "right");
  await panel.close();

  const page = await chrome.newPage(`${origin}/options.html`, { width: 760, height: 900 });
  await page.eval(`chrome.storage.local.set(${JSON.stringify(presentState(lang))})`);
  await page.reload();
  const sized = await page.waitFor(`document.getElementById("captionSize").value === "48"`);
  if (!sized) throw new Error("the Options page never came up with the subtitle size it was given");
  await sleep(300);

  const size = await page.eval(`(() => {
    const head = document.querySelector('[data-i18n="optSizeHeading"]').getBoundingClientRect();
    const tail = document.getElementById("captionPreview").getBoundingClientRect();
    return { x: 16, y: Math.round(head.top) - 14, width: 728,
             height: Math.round(tail.bottom - head.top) + 28 };
  })()`);
  // The slider fills the card, so the only room is at its ends: the margin on
  // the side the reading starts from, because the other end has the px value
  // printed against it. Above is where an arrow would land on the sentence
  // under the heading, which in some languages runs the width of the picture.
  await capture(page, "slidesize", lang, { ...size, scale: 1.6 }, await rect(page, "captionSize"), rtl ? "right" : "left");
  await page.close();
}

/**
 * The two pictures the guide's prose sits beside, on the store's own stage.
 *
 * Not crops, and not in `shots.yml`: no ring points at anything in them, and
 * the subject is the whole page rather than one control on it. The composition
 * is what `store-shots.mjs` uses for the same two pages, so these are the
 * pictures the guide has always had — in the language of the page showing them.
 *
 * Each is checked before it counts, against two different kinds of wrong. The
 * languages in the panel come out of storage, so a wrong one there is ours; the
 * words on both pages come out of `_locales`, so a wrong one there means Chrome
 * ignored the language it was launched in. That second one is what would
 * quietly produce ten English pictures, which is the whole reason this step
 * exists, and it is not a thing a diff of two PNGs shows anybody.
 */
async function pages(chrome, origin, lang) {
  const catalogue = catalogueFor(LANGUAGES[lang] || "en", ROOT);
  const says = (key) => JSON.stringify(plainMessage(catalogue, key));
  const figures = [
    {
      name: "panel",
      page: "sidepanel.html",
      // Wider than the 400px the side panel opens at: the panel is a column of
      // sentences, and at 400 the two direction labels and the conversation
      // gloss wrap enough to push Start off the bottom of the card.
      width: 460,
      height: 540,
      zoom: 1.43,
      card: true,
      state: pageState(lang),
      // Nothing renders until the settings load, and these two are what the
      // arrangement in `pageState` is for: the conversation gloss and the cost
      // note.
      until: `!d.getElementById("micNoteConversation").hidden && !d.getElementById("costNote").hidden`,
      // The cost note is the last thing in the panel until a run starts. Below
      // it is the transcript, which is empty here, and 540 of frame is what the
      // longest of the ten languages needs — leaving the other nine with an inch
      // of blank card under the sentence they end on.
      fit: `d.getElementById("costNote").getBoundingClientRect().bottom + 14`,
      checks: [
        [
          `d.getElementById("tabTarget").value === ${JSON.stringify(simulLanguageCode(lang))}`,
          `the tab card is not translating into ${lang}`,
        ],
        [`d.getElementById("micSource").value === ${JSON.stringify(lang)}`, `the microphone is not hearing ${lang}`],
        [
          `d.querySelector('[data-i18n="panelTabDirection"]').textContent.trim() === ${says("panelTabDirection")}`,
          `the panel is not rendering ${catalogue.locale}`,
        ],
      ],
    },
    {
      name: "glossary",
      page: "options.html",
      // 1280/1.4 and 800/1.4, rounded up so the iframe covers the frame rather
      // than leaving a hairline of host page down two edges.
      width: 916,
      height: 574,
      zoom: 1.4,
      state: pageState(lang),
      // The list is built from storage after `init` awaits, so a row in the
      // table is the sign that the section is finished rather than present. The
      // rows are the bundled example glossary, which seeds itself on first run.
      until: `d.querySelector("#glossaryList table tr")`,
      // The glossary heading at the top of the frame: the section above it ends
      // in a device dropdown whose contents are the test machine's, and a
      // picture in the guide should not be showing anybody's hardware.
      scrollTo: `[data-i18n="optGlossaryHeading"]`,
      margin: 24,
      checks: [
        [
          `d.querySelector('[data-i18n="optGlossaryHeading"]').textContent.trim() === ${says("optGlossaryHeading")}`,
          `the Options page is not rendering ${catalogue.locale}`,
        ],
      ],
    },
  ];

  const stage = await openStage(chrome, origin);
  for (const figure of figures) {
    const file = path.join(OUT, `${figure.name}-${lang}.png`);
    const size = await framedShot(stage, origin, figure, file);
    for (const [expression, complaint] of figure.checks) {
      if ((await stage.eval(inFrame(figure.page, expression))) !== true) {
        throw new Error(`${figure.name}-${lang}.png: ${complaint}`);
      }
    }
    console.log(`   ok   docs/assets/${figure.name}-${lang}.png — ${size.join("×")}`);
  }
  await stage.close();
}

/**
 * Injected into the panel before its own scripts: every tab `chrome.tabs`
 * hands back is on *url*. The panel asks once, at startup, for the active tab
 * — and what it does with the answer is the whole subject of the section being
 * photographed.
 */
function asMeetTab(url) {
  const query = chrome.tabs.query.bind(chrome.tabs);
  chrome.tabs.query = async (info) => (await query(info)).map((tab) => ({ ...tab, url }));
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
async function capture(page, name, lang, clip, mark, prefer) {
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
  shots[name][lang] = { file, width, height, side: arrowSide(box, width / height, prefer), mark: box };
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
 *
 * Room is all this can see, and room is not the same as empty: a control with
 * its label beside it has both. `prefer` is the caller saying which side it
 * knows to be blank, and it is still only a preference — a side with a label in
 * it and a side too narrow to draw in are different problems.
 */
function arrowSide(box, ratio, prefer) {
  const FRAME = 362; // `--stage`, less `--pad` twice, `--say` and `--gap`, at 16px to the rem.
  const ARROW = 34; // The arrow, and enough of a gap to read as pointing.

  const rendered = Math.min(COLUMN, FRAME * ratio);
  const room = {
    left: (box.x / 100) * rendered,
    right: ((100 - box.x - box.width) / 100) * rendered,
    above: (box.y / 100) * (rendered / ratio),
  };
  for (const side of prefer ? [prefer, "left", "right"] : ["left", "right"]) {
    if (room[side] >= ARROW) return side;
  }
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
    "# Where each photographed picture in the guide's three slideshows is, and where the",
    "# one thing it is about sits inside it — for every language the guide is written in.",
    "#",
    "# Written by `tests/guide-shots.mjs`, which takes the pictures. Edit that, not",
    "# this: the next run overwrites the file.",
    "#",
    "# A picture per language because all eight are localized: the store listing is",
    "# Google's, the rest are the extension's own UI. The numbers differ with the",
    "# words — a button called `Hinzufügen` is not where a button called `Add to",
    "# Chrome` is — which is why none of this is typed in by hand.",
    "#",
    "# `mark` is a rectangle in percentages of the picture, and it is what lets",
    "# `_includes/install-steps.html`, `meet-steps.html` and `slide-steps.html` put a ring",
    "# and an arrow on the right button",
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
