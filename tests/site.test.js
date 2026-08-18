/**
 * The user guide's language routing.
 *
 * The guide is ten translations of one page on GitHub Pages, which serves static
 * files and never sees `Accept-Language`. So the decision is a script in the head
 * of every page, and the ways it can go wrong are all quiet ones: a redirect on a
 * page that should not have had one is a reader who cannot reach English; a
 * history entry instead of a replacement is a Back button that bounces; a
 * forgotten choice is a reader sent somewhere else on every visit.
 *
 * `_includes/lang-redirect.js` is plain JavaScript with its window passed in for
 * exactly this reason. What Jekyll wraps it in is checked in `assets.test.js`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(ROOT, "_includes", "lang-redirect.js"), "utf8");

/** The include as the browser gets it: a bare function declaration, no exports. */
const interpretabLanguage = new Function(`${source}\nreturn interpretabLanguage;`)();

const PAGES = ["en", "ja", "zh", "es", "fr", "de", "pt", "ko", "hi", "ar"];
const HOME = "/interpretab/";

/**
 * A window with as much of one as the script touches, and a record of what it was
 * asked to do. `storage` set to null is a browser that throws on `localStorage`,
 * which is what private mode and some managed profiles do.
 */
function fakeWindow({ path: pathname = "/interpretab/", search = "", languages, storage = {} }) {
  const calls = { replaced: [], history: [] };
  const map = new Map(Object.entries(storage || {}));
  return {
    calls,
    stored: map,
    location: {
      pathname,
      search,
      hash: "",
      replace: (url) => calls.replaced.push(url),
    },
    history: {
      replaceState: (_state, _title, url) => calls.history.push(url),
    },
    navigator: { languages, language: languages && languages[0] },
    get localStorage() {
      if (storage === null) throw new Error("access denied");
      return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => map.set(k, v),
      };
    },
  };
}

/** The English page, which is the only one that redirects. */
function english(options) {
  const win = fakeWindow(options);
  const to = interpretabLanguage({ home: HOME, pages: PAGES, redirect: true }, win);
  return { win, to };
}

test("a reader with no stated choice gets the page their browser asks for", () => {
  assert.equal(english({ languages: ["ja", "en"] }).to, "/interpretab/ja/");
  assert.equal(english({ languages: ["ko-KR"] }).to, "/interpretab/ko/");
  // A region is not a translation, and the region is the part we drop.
  assert.equal(english({ languages: ["de-AT", "de"] }).to, "/interpretab/de/");
  assert.equal(english({ languages: ["pt-PT"] }).to, "/interpretab/pt/");
});

test("English readers, and readers of the seventy we have no page for, stay put", () => {
  assert.equal(english({ languages: ["en-GB"] }).to, null);
  assert.equal(english({ languages: ["is", "fo"] }).to, null);
  // English later in the list still wins over a language further down it: the
  // list is in the reader's order of preference and so is this.
  assert.equal(english({ languages: ["is", "en", "ja"] }).to, null);
  // And a browser that reports nothing at all is not a reason to go anywhere.
  assert.equal(english({ languages: undefined }).to, null);
});

test("the first page a reader lands on is left in the history, not skipped past", () => {
  // `assign` would put this page in the history, and Back from the translated
  // page would land here and be redirected out of it again — a trapped reader.
  const { win } = english({ languages: ["fr"] });
  assert.deepEqual(win.calls.replaced, ["/interpretab/fr/"]);
});

test("a language chosen from the bar is remembered, and overrules the browser", () => {
  // The bar tags every link with `?lang=`, so this is what a click looks like on
  // the page it arrives at.
  const win = fakeWindow({ path: "/interpretab/ja/", search: "?lang=ja", languages: ["de"] });
  const to = interpretabLanguage({ home: HOME, pages: PAGES, redirect: false }, win);
  assert.equal(to, null, "no page but the English one may redirect");
  assert.equal(win.stored.get("interpretab.lang"), "ja");

  // And the next bare visit to the English page honours it over the browser's own
  // list, which is the whole point of remembering.
  assert.equal(english({ languages: ["de"], storage: { "interpretab.lang": "ja" } }).to, "/interpretab/ja/");
});

test("a German reader who asks for English gets English, now and on every visit", () => {
  // The trap this avoids: the bar's English link goes to the page that redirects,
  // so without a stated choice a German reader is bounced straight back.
  const { win, to } = english({ search: "?lang=en", languages: ["de"] });
  assert.equal(to, null);
  assert.equal(win.stored.get("interpretab.lang"), "en");
  assert.equal(english({ languages: ["de"], storage: { "interpretab.lang": "en" } }).to, null);
});

test("the bookkeeping is wiped out of the address bar", () => {
  // Nobody should be able to copy a link to the guide and paste our query string
  // along with it, and no `?lang=` should reach a search engine's index.
  const { win } = english({ search: "?lang=en", languages: ["de"] });
  assert.deepEqual(win.calls.history, ["/interpretab/"]);
  // A page nobody asked anything of is left alone.
  assert.deepEqual(english({ languages: ["en"] }).win.calls.history, []);
});

test("a browser that refuses storage still routes", () => {
  // Private mode throws on `localStorage` rather than returning null. Forgetting
  // the reader is acceptable; failing to route them is not.
  assert.equal(english({ languages: ["hi"], storage: null }).to, "/interpretab/hi/");
  const { win, to } = english({ search: "?lang=ar", languages: ["en"], storage: null });
  assert.equal(to, "/interpretab/ar/", "an explicit ask works without anywhere to record it");
  assert.deepEqual(win.calls.history, ["/interpretab/"]);
});

test("a hand-typed ?lang= on the English page is honoured like a click", () => {
  // The bar never produces this — its German link points at /de/ directly — but a
  // URL is a thing people write, and the answer should not depend on who wrote it.
  assert.equal(english({ search: "?lang=de", languages: ["en"] }).to, "/interpretab/de/");
  // Nonsense is not a language, and the browser's own answer is better than none.
  const { win, to } = english({ search: "?lang=xx", languages: ["ja"] });
  assert.equal(to, "/interpretab/ja/");
  assert.equal(win.stored.has("interpretab.lang"), false, "a choice we cannot honour is not stored");
});
