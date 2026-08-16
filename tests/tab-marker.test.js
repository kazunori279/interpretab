/**
 * The tab-strip mark, run rather than read.
 *
 * `content/tab-marker.js` is a classic script injected into someone else's
 * page, so it cannot be imported — but unlike the subtitle overlay it needs no
 * shadow DOM and no layout, only a `document.title` to write and a
 * `MutationObserver` to be poked. That fits in a `vm` context, and it is worth
 * the trouble: everything this file gets wrong shows up in the user's tab strip
 * and stays there — a doubled glyph, a title never given back, a mark from a
 * previous run that nothing will ever remove.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = fs.readFileSync(path.join(ROOT, "content", "tab-marker.js"), "utf8");
const worker = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");

/** A page: a title, a head to observe, and the one chrome API this file uses. */
function page(title) {
  const listeners = new Set();
  const observers = [];
  const context = {
    document: { title, head: {}, documentElement: {} },
    window: {},
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        this.live = true;
        observers.push(this);
      }
      observe(target, options) {
        this.target = target;
        this.options = options;
      }
      disconnect() {
        this.live = false;
      }
    },
    chrome: {
      runtime: {
        onMessage: {
          addListener: (fn) => listeners.add(fn),
          removeListener: (fn) => listeners.delete(fn),
        },
      },
    },
  };
  vm.createContext(context);
  const inject = () => vm.runInContext(SOURCE, context);
  inject();
  return {
    context,
    inject,
    observers,
    send: (msg) => [...listeners].forEach((fn) => fn(msg)),
    // What the page itself does between our writes: a route change, a clock in
    // the title, an unread count.
    rewrite: (next) => {
      context.document.title = next;
      for (const o of observers) if (o.live) o.callback();
    },
    get title() {
      return context.document.title;
    },
    get listeners() {
      return listeners.size;
    },
  };
}

test("marking prefixes the title and re-applies it when the site rewrites", () => {
  const p = page("Example");
  p.send({ target: "tabMark", type: "mark", prefix: "💬🔴 " });
  assert.equal(p.title, "💬🔴 Example");

  p.rewrite("Example — 2 new");
  assert.equal(p.title, "💬🔴 Example — 2 new");

  // The re-apply is itself a title write, so the observer runs again on it. If
  // that were not a no-op the mark would grow by a glyph per mutation.
  for (const o of p.observers) o.callback();
  assert.equal(p.title, "💬🔴 Example — 2 new");
});

test("the whole of head is watched, not the title element", () => {
  const p = page("Example");
  p.send({ target: "tabMark", type: "mark", prefix: "🔴 " });
  const [observer] = p.observers;
  assert.equal(observer.target, p.context.document.head);
  // A site that replaces its <title> rather than editing the text inside it is
  // only caught by childList; one that edits the text, only by characterData.
  // Spread into this realm: an object built inside the vm has a different
  // Object.prototype, which strict deepEqual counts as a difference.
  const options = { ...observer.options };
  assert.deepEqual(options, { childList: true, subtree: true, characterData: true });
});

test("teardown gives the title back and stops watching", () => {
  const p = page("Example");
  p.send({ target: "tabMark", type: "mark", prefix: "💬 " });
  p.rewrite("Example — playing");
  p.send({ target: "tabMark", type: "teardown" });

  assert.equal(p.title, "Example — playing");
  assert.equal(p.listeners, 0, "the message listener outlived the mark");
  assert.ok(!p.observers.some((o) => o.live), "the observer outlived the mark");
  assert.equal(p.context.window.__liveTranslatorTabMark, undefined);

  // And the page is its own again: a later rewrite is not re-marked.
  p.context.document.title = "Example — paused";
  for (const o of p.observers) o.callback();
  assert.equal(p.title, "Example — paused");
});

test("a second injection takes over, whatever the first one left in the title", () => {
  const p = page("Example");
  p.send({ target: "tabMark", type: "mark", prefix: "💬🔴 " });
  p.inject();
  // The old instance is torn down by the new one, so the title is clean before
  // the new mark goes on — and the new mark is not the old one, which is the
  // case that would double up if stripping went by the prefix in hand rather
  // than by the set of glyphs this file can write.
  assert.equal(p.title, "Example");
  p.send({ target: "tabMark", type: "mark", prefix: "🔴 " });
  assert.equal(p.title, "🔴 Example");
  assert.equal(p.listeners, 1, "the replaced instance left a listener behind");
});

test("an orphaned mark from a previous extension is stripped, not stacked", () => {
  // What a reload leaves behind: a marked title and a dead instance whose
  // teardown throws on its first `chrome.*` call.
  const p = page("💬🔴 Example");
  p.context.window.__liveTranslatorTabMark = {
    teardown() {
      throw new Error("Extension context invalidated.");
    },
  };
  p.inject();
  p.send({ target: "tabMark", type: "mark", prefix: "💬 " });
  assert.equal(p.title, "💬 Example");
});

test("the service worker writes only glyphs the page knows how to remove", () => {
  // Two copies of the same pair — the content script cannot import anything —
  // so a glyph changed on one side and not the other would leave a mark in the
  // title that nothing strips, for as long as that tab is open.
  const marks = worker.match(/TAB_MARKS = \{([^}]*)\}/)[1];
  const glyphs = [...marks.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(glyphs.length >= 2, "no glyphs found in TAB_MARKS");
  const stripper = SOURCE.match(/MARK_RE = (\/[^\n]+\/u)/)[1];
  const pattern = new RegExp(stripper.slice(1, -2), "u");
  for (const glyph of glyphs) {
    assert.match(`${glyph} Example`, pattern, `${glyph} is written but never stripped`);
  }
});
