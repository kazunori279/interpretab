/**
 * The 1280×800 stage an extension page is photographed on.
 *
 * Two scripts need it, for different pictures. `store-shots.mjs` takes three
 * uploads at the size the Chrome Web Store demands; `guide-shots.mjs` takes the
 * two pictures the guide's prose sits beside, once per language. What they share
 * is the composition — `tests/store-frame.html`, an extension page with one
 * iframe on it — and every awkward part of driving it: an iframe whose `src`
 * does not replace the document at once, a framed page that is complete and
 * titled while it is still the *previous* shot's page, and a scroll and a font
 * that both settle a frame after everything else.
 *
 * Here rather than in `chrome-harness.mjs` because it knows what
 * `store-frame.html` is, and the harness knows nothing about this repository's
 * own pages on purpose.
 */

import fs from "node:fs";
import path from "node:path";
import { sleep } from "./chrome-harness.mjs";

/** What the store takes, and what `tests/assets.test.js` insists on. */
export const FRAME = { width: 1280, height: 800 };

/**
 * An obvious fake, long enough to clear the "too short to be a secret" check so
 * that the pages show their saved state rather than a warning. The store's own
 * rules forbid a real one in frame.
 *
 * It says what it is rather than wearing the `AIza…` prefix. A string in that
 * shape is what a secret scanner looks for, and GitHub duly reported one of
 * these files as a leaked Google API key — an alert that costs someone a look at
 * the source to dismiss, every time. The store's key shot reveals the field to
 * show the saved state, so this is also the sentence a reviewer reads in the
 * frame, which is a better answer to the store's "no real key" rule than a
 * plausible-looking fake.
 */
export const FAKE_KEY = "NOT-A-REAL-KEY-only-a-placeholder-00000";

/** The stage itself, sized once and reused for every shot taken on it. */
export function openStage(chrome, origin) {
  return chrome.newPage(`${origin}/tests/store-frame.html`, FRAME);
}

/**
 * An expression written against the framed page rather than the stage: `d` is
 * its document and `f` its window.
 *
 * The guard is the previous shot's page. Assigning `src` does not replace the
 * document at once, and the one still in the frame is complete, titled, and
 * missing every element the next expression asks for.
 */
export function inFrame(page, expression) {
  return `(() => {
    const f = document.getElementById("stage").contentWindow;
    const d = f && f.document;
    if (!d || !f.location.href.endsWith("/${page}")) return false;
    if (d.readyState !== "complete" || !d.title) return false;
    return (${expression});
  })()`;
}

/**
 * Frame *shot*, wait for it to mean something, and write it to *file*.
 *
 * The page is laid out at `width`×`height` CSS pixels and scaled up by `zoom`,
 * the product being the frame — which is how the Options page ends up legible
 * at store scale instead of a wall of 14px text with 250px of margin either
 * side. `until` is the shot's own answer to "is this page finished", written in
 * terms of the thing the picture is *about*, so a page that rendered but did not
 * arrange itself fails here rather than being photographed.
 *
 * Returns the picture's size, having refused anything but the frame's own.
 */
export async function framedShot(stage, origin, shot, file) {
  const name = path.basename(file);
  await stage.eval(`chrome.storage.local.set(${JSON.stringify(shot.state)})`);
  // Cleared first, and waited for. Consecutive shots are often the same page,
  // and without this the next shot's checks all pass against the last one's,
  // still scrolled to where it was left, and get photographed.
  await stage.eval(`(() => { document.getElementById("stage").src = "about:blank"; return true; })()`);
  await stage.waitFor(
    `document.getElementById("stage").contentWindow.location.href === "about:blank"`
  );

  // An IIFE, and every expression below is one too: `Runtime.evaluate` runs in
  // the page's global scope, where a bare `const` from the first shot is still
  // declared when the second one tries to declare it again.
  await stage.eval(`(() => {
    document.body.className = ${JSON.stringify(shot.card ? "card" : "")};
    const frame = document.getElementById("stage");
    frame.style.width = "${shot.width}px";
    frame.style.height = "${shot.height}px";
    frame.style.zoom = "${shot.zoom}";
    frame.src = ${JSON.stringify(`${origin}/${shot.page}`)};
    return true;
  })()`);

  const ready = await stage.waitFor(inFrame(shot.page, `!!(${shot.until})`));
  if (!ready) throw new Error(`${name}: the page never finished rendering`);

  // How far short of its frame a page falls depends on the language: the
  // English gloss under the conversation mode is six lines and the Japanese one
  // is two, and the difference was an inch of blank card at the bottom of the
  // picture. `fit` is the shot saying where its page actually ends, and the
  // frame comes up to meet it — never past the height above, which is the one
  // the zoom was chosen against.
  if (shot.fit) {
    const bottom = await stage.eval(inFrame(shot.page, shot.fit));
    if (!(bottom > 0)) throw new Error(`${name}: nothing says where the page ends (${bottom})`);
    const height = Math.min(shot.height, Math.ceil(bottom));
    await stage.eval(`(() => {
      document.getElementById("stage").style.height = "${height}px";
      return true;
    })()`);
  }

  // A page taller than the frame draws a scrollbar down the right edge, and a
  // half-length scrollbar in a screenshot reads as a crop of something bigger.
  // The page still scrolls; only the bar is gone.
  await stage.eval(inFrame(shot.page, `d.documentElement.style.scrollbarWidth = "none", true`));

  if (shot.prepare) await stage.eval(inFrame(shot.page, `${shot.prepare}, true`));
  if (shot.scrollTo) {
    await stage.eval(
      inFrame(
        shot.page,
        `f.scrollTo(0, d.querySelector(${JSON.stringify(shot.scrollTo)})
             .getBoundingClientRect().top + f.scrollY - ${shot.margin}), true`
      )
    );
  }
  // Fonts and the scroll both settle a frame late, and a screenshot taken
  // between the two catches the page mid-jump.
  await sleep(400);

  await stage.screenshot(file);
  const size = pngSize(file);
  if (size[0] !== FRAME.width || size[1] !== FRAME.height) {
    throw new Error(`${name} came out ${size.join("×")}`);
  }
  return size;
}

/** Width and height out of a PNG's IHDR, as `tests/assets.test.js` reads them. */
export function pngSize(file) {
  const head = fs.readFileSync(file).subarray(16, 24);
  return [head.readUInt32BE(0), head.readUInt32BE(4)];
}
