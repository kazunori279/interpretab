/**
 * Read AI Studio's own button labels, in every language the guide is written
 * in, and check `docs/_data/install.yml` still agrees with them.
 *
 *     node tools/aistudio-strings.mjs         # compares, exits 1 on drift
 *     node tools/aistudio-strings.mjs --all   # prints everything it found
 *
 * The guide's pictures are drawings of AI Studio, and the sentence under each
 * one tells the reader which button to press. Both used to say `Create API
 * key` whatever language the page was in, which is a picture of a button that
 * is not on the reader's screen. The labels have to come from Google, and
 * Google does not publish them — but it ships them.
 *
 * `aistudio.google.com/apikey` is behind a sign-in. `/welcome` is not, and it
 * names the JavaScript bundle for whatever `Accept-Language` asked for. The
 * route table in that bundle maps `api-keys` to a lazy module, `N168Pd`, and
 * asking for the module by name gets it with no account attached. The strings
 * are inside, `\uXXXX`-escaped — which is why grepping the bundle for Japanese
 * finds nothing until it is decoded — in each Angular component's array of
 * template constants, at the same index in every locale.
 *
 * So this is reading someone else's build output, and it will break the day
 * Google reshuffles it. That is the trade: an index that moves is a loud
 * failure here, and a stale label is a quiet failure in front of the reader.
 * Nothing is written automatically; the tool reports and a person decides.
 *
 * Two of the ten languages get English back. AI Studio serves `en_US` for
 * Hindi and Arabic — it has no Hindi or Arabic UI — so English in `install.yml`
 * for those two is not an oversight, it is what the reader sees.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const INSTALL = path.join(ROOT, "docs", "_data", "install.yml");
const ALL = process.argv.includes("--all");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

/** The guide's ten languages, as the `Accept-Language` a browser would send. */
const LANGS = {
  en: "en-US,en;q=0.9",
  ja: "ja-JP,ja;q=0.9",
  zh: "zh-CN,zh;q=0.9",
  es: "es-ES,es;q=0.9",
  fr: "fr-FR,fr;q=0.9",
  de: "de-DE,de;q=0.9",
  pt: "pt-BR,pt;q=0.9",
  ko: "ko-KR,ko;q=0.9",
  hi: "hi-IN,hi;q=0.9",
  ar: "ar-EG,ar;q=0.9",
};

/**
 * Where each label sits: an Angular component's selector, and the slot in its
 * `la:()=>[...]` array of template constants. The slots were read off the
 * English bundle and hold across locales, because the array is generated from
 * one template.
 */
const WANTED = {
  createApiKey: ["ms-api-keys-header", 2],
  createKey: ["ms-api-key-creation-form", 5],
  createProject: ["ms-project-creation-dialog", 3],
  copyKey: ["ms-apikey-details-dialog", 9],
};

/**
 * The two strings the guide leaves in English on purpose. They are English in
 * all ten bundles — hard-coded, not translated — so a reader in any language
 * really is looking at these words, and a translation here would be a lie.
 */
const UNTRANSLATED = ["No Cloud Projects Available", "Select a Cloud Project"];

const decode = (text) => text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

/** One module of the makersuite bundle, in one language, decoded. */
async function bundle(lang, module) {
  let base = null;
  for (let attempt = 1; attempt <= 5 && !base; attempt++) {
    if (attempt > 1) await new Promise((resume) => setTimeout(resume, 3000 * attempt));
    const welcome = await fetch("https://aistudio.google.com/welcome", {
      headers: { "user-agent": UA, "accept-language": LANGS[lang] },
    });
    base = (await welcome.text()).match(/https:\/\/www\.gstatic\.com\/_\/mss\/boq-makersuite\/[^"]+m=_b/)?.[0];
    if (!base) console.warn(`${lang}: attempt ${attempt} got a /welcome that names no bundle`);
  }
  if (!base) throw new Error(`${lang}: /welcome never named a bundle`);
  const js = await fetch(base.replace(/\/m=_b$/, `/m=${module}`), { headers: { "user-agent": UA } });
  return {
    // The locale Google picked, which is not always the one that was asked for.
    locale: base.match(/MakerSuite\.([A-Za-z0-9_-]+)\./)[1],
    text: decode(await js.text()),
  };
}

/** The top-level entries of one component's `la:()=>[...]`, split on its own commas. */
function slots(text, selector) {
  const found = text.indexOf(`[["${selector}"]]`);
  if (found < 0) throw new Error(`${selector}: not in this bundle any more`);
  const open = text.indexOf("la:()=>[", found);
  if (open < 0) throw new Error(`${selector}: no la array any more`);
  const entries = [];
  let depth = 0;
  let start = open + "la:()=>[".length;
  let quote = null;
  for (let i = start - 1; i < text.length; i++) {
    const character = text[i];
    if (quote) {
      if (character === "\\") i++;
      else if (character === quote) quote = null;
    } else if (character === '"' || character === "'" || character === "`") quote = character;
    else if (character === "[") depth++;
    else if (character === "]" && --depth === 0) return [...entries, text.slice(start, i)];
    else if (character === "," && depth === 1) {
      entries.push(text.slice(start, i));
      start = i + 1;
    }
  }
  throw new Error(`${selector}: unterminated la array`);
}

/** The `ui:` block each language already has in `install.yml`. */
function written() {
  const text = fs.readFileSync(INSTALL, "utf8");
  const out = {};
  for (const part of text.split(/^(?=[a-z]{2}:$)/m)) {
    const lang = part.match(/^([a-z]{2}):$/m)?.[1];
    const block = part.match(/^ {2}ui:\n((?: {4}\w+: .*\n)+)/m);
    if (!lang || !block) continue;
    out[lang] = Object.fromEntries(
      block[1].trim().split("\n").map((line) => line.trim().split(/:\s+/))
    );
  }
  return out;
}

const have = written();
let drift = 0;

for (const lang of Object.keys(LANGS)) {
  const keys = await bundle(lang, "N168Pd");
  const row = {};
  for (const [name, [selector, index]] of Object.entries(WANTED)) {
    const raw = (slots(keys.text, selector)[index] ?? "").trim();
    if (!/^".*"$/.test(raw)) throw new Error(`${lang}: ${selector}[${index}] is not a string: ${raw.slice(0, 60)}`);
    row[name] = raw.slice(1, -1).trim();
  }
  for (const english of UNTRANSLATED) {
    if (!keys.text.includes(`"${english}"`)) {
      console.warn(`${lang}: "${english}" is no longer in the bundle — the guide leaves it in English`);
      drift++;
    }
  }
  console.log(`\n${lang} (served ${keys.locale})`);
  for (const [name, label] of Object.entries(row)) {
    const written = have[lang]?.[name];
    if (written === label) {
      if (ALL) console.log(`  ${name.padEnd(14)} ${label}`);
    } else {
      console.log(`  ${name.padEnd(14)} ${label}\n  ${"".padEnd(14)} install.yml says ${written ?? "nothing"}`);
      drift++;
    }
  }
}

console.log(drift ? `\n${drift} label(s) have moved. Update docs/_data/install.yml.` : "\ninstall.yml matches AI Studio.");
process.exit(drift ? 1 : 0);
