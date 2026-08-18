/**
 * The one place a key becomes a sentence in the user's language (#10).
 *
 * Chrome expands `__MSG_name__` in the manifest and in CSS and nowhere else, so
 * the two pages and every message written from script have to ask for their
 * text. `chrome.i18n.getMessage` is where it comes from inside the extension;
 * `useMessages` is the same seam for Node, where the tests and the live scripts
 * read `_locales/en/messages.json` off disk so an assertion can still be about
 * the sentence a user reads rather than about a key.
 *
 * Two things here are deliberately not Chrome's own:
 *
 * **Substitution is `{1}`…`{9}`, not `$1`.** Chrome's placeholders have to be
 * declared per message in the catalogue, and `$` is meaningful to `getMessage`
 * whether or not they are. Braces mean nothing to it, so one catalogue behaves
 * identically through both sources and a translator has one syntax to learn.
 *
 * **A message may carry emphasis and links.** Most of the prose in this
 * extension is a paragraph with a `<b>` or a link in the middle of it, and
 * where that lands is the translator's decision — splitting the sentence around
 * the tag is how English word order gets baked into every other language. So a
 * message may use `<b>`, `<code>` and `<a1>`…`<a9>`, and `render` builds those
 * as real elements.
 *
 * It is a closed alphabet with no attributes in it. The destination behind
 * `<a1>` is read from `data-link1` on the element being filled, so a catalogue
 * cannot introduce a URL; anything else that looks like a tag, including a `<`
 * a translator leaves in, stays text; and substituted values go in as text
 * nodes and are never scanned for markup. `t()` is the same message with the
 * tags taken off, for the places that hold text and not elements — a `title`,
 * an `Error`, a message posted to another document.
 */

/** `<b>x</b>`, `<code>x</code>`, `<a1>x</a1>`. Nothing else is markup. */
const MARKUP = /<(b|code|a[1-9])>([\s\S]*?)<\/\1>/g;

let source = null;

/**
 * Read messages from *fn* instead of `chrome.i18n`.
 *
 * For Node, which has neither. Passing null hands it back to Chrome.
 */
export function useMessages(fn) {
  source = fn || null;
}

/** The raw catalogue entry, markup and placeholders intact. "" if unknown. */
function lookup(key) {
  if (source) return source(key) || "";
  const i18n = globalThis.chrome?.i18n;
  return (i18n && i18n.getMessage(key)) || "";
}

function fill(message, subs) {
  if (!subs?.length) return message;
  return message.replace(/\{([1-9])\}/g, (whole, index) => {
    const value = subs[Number(index) - 1];
    return value === undefined || value === null ? whole : String(value);
  });
}

/**
 * One message as plain text.
 *
 * A missing key returns the key itself rather than an empty string: a visible
 * `panelStartButton` is a bug report, and a button with no label is a mystery.
 */
export function t(key, subs) {
  const message = lookup(key);
  if (!message) return key;
  // Markup off first, values in second. The other order lets a value that looks
  // like a tag be taken for one — see `setMessage`.
  return fill(message.replace(MARKUP, "$2"), subs);
}

/**
 * One message rendered into *host*, replacing whatever was there.
 *
 * `host` is also where the links come from — `data-link1` for `<a1>` — so the
 * element that shows a sentence owns the destinations in it.
 *
 * The message is scanned for markup *before* the values go in, and every value
 * lands inside a piece that has already been scanned. Filling first would mean
 * a value that happens to look like a tag is read as one, and one of the values
 * here is a tab title — which is a remote page's to choose.
 */
export function setMessage(host, key, subs) {
  const message = lookup(key);
  host.textContent = "";
  if (!message) {
    host.textContent = key;
    return;
  }
  let at = 0;
  MARKUP.lastIndex = 0;
  let found;
  while ((found = MARKUP.exec(message))) {
    if (found.index > at) host.append(fill(message.slice(at, found.index), subs));
    host.appendChild(node(host, found[1], fill(found[2], subs)));
    at = found.index + found[0].length;
  }
  if (at < message.length) host.append(fill(message.slice(at), subs));
}

/** One `<b>`, `<code>` or `<aN>` from the alphabet above, as an element. */
function node(host, tag, label) {
  if (tag !== "b" && tag !== "code") return anchor(host, tag.slice(1), label);
  const element = document.createElement(tag);
  element.textContent = label;
  return element;
}

/**
 * `<aN>` against `data-linkN`.
 *
 * An `https:` destination opens in a tab of its own. Anything else is a name
 * for something this extension does — `options` is the only one so far — and
 * becomes a `data-action` for a click handler to pick up, because
 * `chrome.runtime.openOptionsPage()` is not a URL. A link with no `data-linkN`
 * behind it renders as text: a dangling anchor looks clickable and is not.
 */
function anchor(host, index, label) {
  const target = host.dataset[`link${index}`] || "";
  if (!target) return document.createTextNode(label);
  const element = document.createElement("a");
  element.textContent = label;
  if (target.startsWith("https://")) {
    element.href = target;
    element.target = "_blank";
    element.rel = "noreferrer";
  } else {
    element.href = "#";
    element.dataset.action = target;
  }
  return element;
}

/**
 * Fill every `data-i18n*` in *root* from the catalogue.
 *
 * Called once per page, before anything else runs: a page that painted English
 * and then corrected itself would flash. Attributes are separate because the
 * `title` on a control and the sentence inside it are two different messages —
 * and because a `title` cannot hold elements, so it goes through `t()`.
 */
export function localize(root = document) {
  // Neither page declares a `lang`, because neither knows which one it will be
  // served as until Chrome has resolved a locale. Left off, a screen reader
  // reads Japanese with English pronunciation.
  const i18n = globalThis.chrome?.i18n;
  const ui = i18n?.getUILanguage?.();
  if (ui && root === document) document.documentElement.lang = ui;
  // `@@bidi_dir` is Chrome's own, and it answers for the locale it actually
  // resolved rather than for the one this code guessed from `ui`. One of the
  // ten catalogues is Arabic, and without this the panel lays out left to right
  // with Arabic in it: the switches end up on the wrong side of their labels
  // and every sentence ending in a period puts the period at the far left.
  const dir = i18n?.getMessage?.("@@bidi_dir");
  if (dir && root === document) document.documentElement.dir = dir;
  for (const element of root.querySelectorAll("[data-i18n]")) {
    setMessage(element, element.dataset.i18n);
  }
  for (const [attribute, name] of [
    ["data-i18n-title", "title"],
    ["data-i18n-placeholder", "placeholder"],
  ]) {
    for (const element of root.querySelectorAll(`[${attribute}]`)) {
      element.setAttribute(name, t(element.getAttribute(attribute)));
    }
  }
}
