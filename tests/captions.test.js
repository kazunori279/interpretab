/**
 * The subtitle overlay, checked as text.
 *
 * `content/captions.js` is injected as a classic script into someone else's
 * page, so it can neither import `lib/settings.js` nor be imported here — it
 * builds a shadow root the moment it is evaluated. That leaves two things worth
 * asserting without a DOM: that its private copies of the size constants still
 * agree with the ones the Options page writes, and that nothing in its
 * stylesheet is sized in a unit the host page can move.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CAPTION_SIZE_MAX, CAPTION_SIZE_MIN, DEFAULTS } from "../lib/settings.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const captions = fs.readFileSync(path.join(ROOT, "content", "captions.js"), "utf8");
const optionsHtml = fs.readFileSync(path.join(ROOT, "options.html"), "utf8");

const constant = (name) => Number(captions.match(new RegExp(`${name} = (\\d+)`))[1]);

// The file explains at length what it deliberately no longer does, so a test
// that asserts an absence has to read the code rather than the prose about it.
const code = captions.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the overlay's copy of the size constants matches lib/settings.js", () => {
  assert.equal(constant("DEFAULT_SIZE_PX"), DEFAULTS.captionSize);
  assert.equal(constant("MIN_SIZE_PX"), CAPTION_SIZE_MIN);
  assert.equal(constant("MAX_SIZE_PX"), CAPTION_SIZE_MAX);
});

test("the stylesheet's own default is that same size", () => {
  // What the captions look like for the fraction of a second before the storage
  // read comes back, and for the whole session if it ever fails.
  const declared = captions.match(/--caption-size:\s*(\d+)px/);
  assert.ok(declared, "the host element declares no --caption-size fallback");
  assert.equal(Number(declared[1]), DEFAULTS.captionSize);
});

test("nothing in the overlay is sized in rem", () => {
  // `all: initial` does not isolate `rem`: it resolves against the page's own
  // <html>, so `html { font-size: 62.5% }` — which plenty of sites set — would
  // silently shrink every subtitle by a third.
  const style = captions.match(/<style>([\s\S]*?)<\/style>/)[1];
  const offenders = [...style.matchAll(/[\d.]+rem/g)].map((m) => m[0]);
  assert.deepEqual(offenders, [], "use px for fixed lengths and em for text-relative ones");
});

test("a second injection replaces the first instead of standing down", () => {
  // Reloading the extension orphans the content script in every page it was
  // injected into: the marker and the overlay survive, the link back to the
  // extension does not. A guard that returns when the marker is set therefore
  // hands the tab to a corpse — Start after a reload produced no subtitles at
  // all, on that tab, forever, with nothing logged anywhere.
  assert.doesNotMatch(
    code,
    /if\s*\(\s*window\[MARK\]\s*\)\s*return/,
    "the marker must trigger a takeover, not a bail-out"
  );
  assert.match(code, /window\[MARK\]\?\.teardown\?\.\(\)/);
  // A bare `true` has no teardown to call, so the handle has to carry one.
  assert.match(code, /window\[MARK\]\s*=\s*\{\s*teardown\s*\}/);
  // And an orphan from a build that stored `true` leaves an overlay behind that
  // no teardown will ever remove.
  assert.match(code, /getElementById\(HOST_ID\)\?\.remove\(\)/);
});

test("teardown drops the marker before anything that can throw", () => {
  // An orphan's teardown dies on its first `chrome.*` call. Whatever has to
  // happen for a replacement to take over cleanly has to happen before that.
  const body = code.match(/function teardown\(\) \{([\s\S]*?)\n  \}/)[1];
  const marker = body.indexOf("delete window[MARK]");
  const firstChrome = body.indexOf("chrome.");
  assert.ok(marker >= 0 && marker < firstChrome, "clear the marker first");
  assert.ok(body.indexOf("host.remove()") < firstChrome, "remove the overlay first");
});

test("the Options slider offers exactly the range the overlay accepts", () => {
  // The slider is re-bounded from the constants at load, so this only catches
  // the markup drifting — but the markup is what renders before that runs.
  const slider = optionsHtml.match(/<input type="range" id="captionSize"[^>]*>/)[0];
  assert.match(slider, new RegExp(`min="${CAPTION_SIZE_MIN}"`));
  assert.match(slider, new RegExp(`max="${CAPTION_SIZE_MAX}"`));
});
