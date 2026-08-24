/**
 * The catalogues, and the rendering of a message into a page.
 *
 * A translation goes wrong quietly. Chrome falls back to `default_locale` for a
 * key a locale is missing, so a half-finished Japanese catalogue is an
 * extension that reads Japanese with English sentences in the middle of it and
 * no error anywhere. A placeholder dropped in translation is worse: `{1}` is
 * where the tab title or the price goes, and a message that lost one renders a
 * sentence with a hole in it. Neither shows up in any other test, because every
 * other test runs against English.
 *
 * The renderer is here for a different reason. It builds elements out of a
 * string, which is the shape of every markup-injection bug ever written, and
 * the guarantee it makes — a closed tag alphabet, destinations supplied by the
 * host and never by the catalogue, substituted values never scanned — is worth
 * exactly as much as the tests that hold it in place.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readCatalogue } from "./messages.mjs";
import { setMessage, t } from "../lib/i18n.js";
import { VOICES, voiceToneKey } from "../lib/languages.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = fs.readdirSync(path.join(ROOT, "_locales"));

const en = readCatalogue("en");

/** `{1}`…`{9}`, as a sorted list. The set is what has to survive a translation. */
function placeholders(message) {
  return [...new Set([...message.matchAll(/\{([1-9])\}/g)].map(([, n]) => n))].sort();
}

/** `<b>`, `<code>`, `<aN>` — opening tags only, sorted, duplicates kept. */
function tags(message) {
  return [...message.matchAll(/<(b|code|a[1-9])>/g)].map(([, tag]) => tag).sort();
}

test("every locale carries every key, and only keys English has", () => {
  const expected = Object.keys(en).sort();
  for (const locale of LOCALES) {
    if (locale === "en") continue;
    // Chrome falls back per key, so a missing one is invisible until a user
    // reads an English sentence in a Japanese panel. An extra one is dead
    // weight that survives the English key being renamed.
    assert.deepEqual(Object.keys(readCatalogue(locale)).sort(), expected, `_locales/${locale}`);
  }
});

test("a translation keeps every placeholder and every tag", () => {
  for (const locale of LOCALES) {
    if (locale === "en") continue;
    const other = readCatalogue(locale);
    for (const [key, { message }] of Object.entries(en)) {
      // The order is the translator's to change — that is most of the point of
      // numbering them — but the set is not: a dropped `{1}` is a sentence with
      // the tab title missing, and a dropped `<a1>` is a link that is gone.
      assert.deepEqual(
        placeholders(other[key].message),
        placeholders(message),
        `${locale}/${key} changed which placeholders it uses`
      );
      assert.deepEqual(
        tags(other[key].message),
        tags(message),
        `${locale}/${key} changed which markup it uses`
      );
    }
  }
});

test("a catalogue cannot introduce a destination of its own", () => {
  // `<aN>` carries a label and nothing else; where it points is `data-linkN` on
  // the element in the page. So a catalogue — the one file in this extension a
  // translator with no review would touch — has no way to add a link, and this
  // is what keeps it that way.
  for (const locale of LOCALES) {
    for (const [key, { message }] of Object.entries(readCatalogue(locale))) {
      assert.doesNotMatch(message, /https?:\/\//, `${locale}/${key} carries a URL`);
      assert.doesNotMatch(message, /<\s*(a|img|script|iframe)[\s>]/i, `${locale}/${key} has HTML`);
    }
  }
});

/**
 * Every source file that could name a message, walked from the repo root.
 *
 * `tests` is left out on purpose. A key named only by a test is not a key the
 * extension shows, and the tests below name several that deliberately do not
 * exist.
 */
function sources(dir = ROOT) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", "_locales", "tests"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(full));
    else if (/\.(js|mjs|html|json)$/.test(full)) out.push(full);
  }
  return out;
}

test("every key the code asks for exists", () => {
  // Asked for by name, which is the shape a typo takes: `t("panelSttop")` shows
  // its own key on the button and nothing anywhere says why.
  const missing = new Set();
  for (const file of sources()) {
    const text = fs.readFileSync(file, "utf8");
    const named = [
      ...text.matchAll(/\bt\(\s*"([a-zA-Z]\w*)"/g),
      ...text.matchAll(/\bsetMessage\([^,]+,\s*"([a-zA-Z]\w*)"/g),
      ...text.matchAll(/data-i18n(?:-\w+)?="(\w+)"/g),
      // Chrome expands `__MSG_…__` in the manifest and in CSS and nowhere
      // else, so anywhere else it is prose about the mechanism.
      ...(file.endsWith(".json") ? text.matchAll(/__MSG_(\w+)__/g) : []),
    ];
    for (const [, key] of named) if (!(key in en)) missing.add(`${path.relative(ROOT, file)}: ${key}`);
  }
  assert.deepEqual([...missing], []);
});

test("every message in the catalogue is shown by something", () => {
  // A message nobody reaches is a message nobody notices going stale, and the
  // translators are paying for it twice. Matched loosely — as any quoted token
  // anywhere in the source — because half the keys here are chosen at runtime,
  // out of a ternary or off a table like `INPUT`/`OUTPUT` in options.js. Loose
  // is the right side to err on: this is the check that finds dead weight, and
  // the strict one above is what finds typos.
  const quoted = new Set();
  for (const file of sources()) {
    const text = fs.readFileSync(file, "utf8");
    for (const [, key] of text.matchAll(/["'](\w+)["']/g)) quoted.add(key);
    for (const [, key] of text.matchAll(/__MSG_(\w+)__/g)) quoted.add(key);
  }

  // The tone words are derived — "Easy-going" becomes `voiceEasygoing` — so no
  // grep finds them. Asking the real function is also the check that the
  // catalogue holds a key for every tone `VOICES` names.
  const derived = new Set(Object.values(VOICES).map(voiceToneKey));
  for (const key of derived) assert.ok(key in en, `no message for the ${key} voice tone`);

  const orphans = Object.keys(en).filter((key) => !quoted.has(key) && !derived.has(key));
  assert.deepEqual(orphans, [], "the catalogue carries messages nothing shows");
});

test("a link that is not a URL names something the page handles", () => {
  // Where an `<aN>` points is `data-linkN`, and a destination that is not a URL
  // is the name of something this extension does, bound by hand in a click
  // handler. A name with nothing behind it is worse than the dangling anchor
  // below: that one renders as text, this one renders as a link, takes the
  // click and does nothing. Matched as any quoted token in the page's own
  // script, because the handler compares the name against a variable and there
  // is nothing tighter to match on.
  for (const file of sources()) {
    if (!file.endsWith(".html")) continue;
    const script = file.replace(/\.html$/, ".js");
    const handlers = fs.existsSync(script) ? fs.readFileSync(script, "utf8") : "";
    for (const [, target] of fs.readFileSync(file, "utf8").matchAll(/data-link\d="([^"]+)"/g)) {
      if (target.startsWith("https://")) continue;
      assert.match(
        handlers,
        new RegExp(`"${target}"`),
        `${path.relative(ROOT, file)}: nothing handles the ${target} link`
      );
    }
  }
});

test("t strips the markup and fills the placeholders", () => {
  // `t` is for the places that hold text and not elements — a `title`, an
  // `Error`, a message posted to another document — so the tags come off rather
  // than being printed at the user.
  assert.equal(t("panelStart"), "Start");
  assert.match(t("panelUsagePaid", ["12 min", "$0.31"]), /^12 min so far, \$0\.31 of Gemini/);
  assert.doesNotMatch(t("panelUsagePaid", ["12 min", "$0.31"]), /<b>/);
  // A key with nothing behind it renders as itself: a visible `panelStartButton`
  // is a bug report, and a button with no label is a mystery.
  assert.equal(t("noSuchKey"), "noSuchKey");
  // An argument that was not supplied leaves its placeholder alone rather than
  // printing "undefined" in the middle of a sentence.
  assert.match(t("panelUsagePaid", ["12 min"]), /\{2\}/);
});

/** Enough of a DOM for `setMessage`: elements, text nodes, and a dataset. */
function fakeDocument() {
  const make = (tag) => ({
    tagName: tag.toUpperCase(),
    childNodes: [],
    dataset: {},
    set textContent(value) {
      this.childNodes = value === "" ? [] : [{ text: String(value) }];
    },
    get textContent() {
      return this.childNodes.map((n) => n.text ?? n.textContent).join("");
    },
    append(...nodes) {
      for (const node of nodes) {
        this.childNodes.push(typeof node === "string" ? { text: node } : node);
      }
    },
    appendChild(node) {
      this.childNodes.push(node);
      return node;
    },
  });
  globalThis.document = {
    createElement: make,
    createTextNode: (text) => ({ text }),
  };
  return make("p");
}

test("setMessage builds the tags the catalogue asked for and nothing else", () => {
  const host = fakeDocument();
  setMessage(host, "panelUsagePaid", ["12 min", "$0.31"]);
  const bolds = host.childNodes.filter((n) => n.tagName === "B");
  assert.deepEqual(
    bolds.map((n) => n.textContent),
    ["12 min", "$0.31"]
  );
  // And the whole sentence survived, disclaimer included.
  assert.match(host.textContent, /an estimate, not your actual bill\.$/);
});

test("a link goes where the element says, not where the message does", () => {
  const host = fakeDocument();
  host.dataset.link1 = "https://aistudio.google.com/apikey";
  host.dataset.link2 = "options";
  setMessage(host, "panelStepKey");
  const links = host.childNodes.filter((n) => n.tagName === "A");
  assert.equal(links.length, 2);
  // An https destination opens in a tab of its own; anything else names
  // something the extension does, and a click handler picks it up.
  assert.equal(links[0].href, "https://aistudio.google.com/apikey");
  assert.equal(links[0].target, "_blank");
  assert.equal(links[0].rel, "noreferrer");
  assert.equal(links[1].href, "#");
  assert.equal(links[1].dataset.action, "options");
});

test("an anchor with no destination behind it is text, not a dead link", () => {
  // A link that looks clickable and is not is worse than a plain word, and this
  // is reachable: `data-linkN` is on the element, so a message that gains an
  // `<a2>` in translation would otherwise render one.
  const host = fakeDocument();
  host.dataset.link1 = "https://aistudio.google.com/apikey";
  setMessage(host, "panelStepKey");
  assert.equal(host.childNodes.filter((n) => n.tagName === "A").length, 1);
  assert.match(host.textContent, /Options/);
});

test("a substituted value is never read as markup", () => {
  // The values that go into these messages include a tab title, which is a
  // remote page's to choose. It lands as a text node and is not scanned.
  const host = fakeDocument();
  setMessage(host, "panelRunningOn", ["<b>evil</b> <a1>click</a1>"]);
  assert.equal(host.childNodes.filter((n) => n.tagName !== undefined).length, 0);
  assert.match(host.textContent, /<b>evil<\/b> <a1>click<\/a1>/);
});
