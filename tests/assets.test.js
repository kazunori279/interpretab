/**
 * Every path the extension names has to resolve, and the manifest has to keep
 * its promises.
 *
 * Chrome reports a bad path as a blank side panel, a worklet that never
 * registers, or a fetch that quietly returns the extension's own 404 page —
 * none of which points at the typo. And the host permission list is the whole
 * privacy claim in the store listing: one extra origin there and the claim that
 * audio only ever goes to Google stops being true.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

/** Everything the extension cannot function without, whatever else changes. */
const REQUIRED_PERMISSIONS = [
  "tabCapture", // the reason this extension exists
  "offscreen", // the only context that outlives the service worker
  "sidePanel",
  "storage",
  "activeTab", // captions are injected under this rather than <all_urls>
  "scripting",
];

/**
 * Packaged-app permissions Chrome flags as warnings on an extension. The
 * microphone one is the tempting mistake: it reads like the way to let the
 * offscreen document capture without a prompt, does nothing, and earns a
 * "only allowed for packaged apps" warning on the extensions page.
 */
const FORBIDDEN_PERMISSIONS = ["audioCapture", "videoCapture"];

/**
 * Quoted relative paths, in HTML attributes and in JS strings alike. The
 * leading-scheme guard keeps absolute and chrome-extension:// URLs out.
 */
const PATH_RE = /["'](?!\w+:|\/\/|#)([\w./-]+\.(?:js|css|html|png|csv))["']/g;

/** Source files that can name an asset, walked from the repo root. */
function sources(dir = ROOT) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "tests") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(full));
    else if (full.endsWith(".js") || full.endsWith(".html")) out.push(full);
  }
  return out;
}

test("the manifest is v3 and declares every permission the code uses", () => {
  assert.equal(manifest.manifest_version, 3);
  for (const permission of REQUIRED_PERMISSIONS) {
    assert.ok(manifest.permissions.includes(permission), `missing permission: ${permission}`);
  }
  for (const permission of FORBIDDEN_PERMISSIONS) {
    assert.ok(
      !manifest.permissions.includes(permission),
      `${permission} is packaged-apps-only and warns on an extension`
    );
  }
});

test("the Chrome floor covers tabCapture from a service worker", () => {
  // `getMediaStreamId({targetTabId})` from a service worker is Chrome 116+;
  // without the floor the extension installs and then fails at Start.
  const floor = parseInt(String(manifest.minimum_chrome_version || "0").split(".")[0], 10);
  assert.ok(floor >= 116, `declared ${floor}, need 116+`);
});

test("the only host the extension may reach is the Gemini API", () => {
  assert.deepEqual(manifest.host_permissions, ["https://generativelanguage.googleapis.com/*"]);
  // Optional hosts would let a later build widen this without a manifest diff
  // anyone reviewing the listing would notice.
  assert.equal(manifest.optional_host_permissions, undefined);
  assert.equal(manifest.optional_permissions, undefined);
});

test("no code names a server other than the Gemini API", () => {
  const offenders = [];
  for (const file of sources()) {
    const text = fs.readFileSync(file, "utf8");
    for (const [, url] of text.matchAll(/["'](?:https?|wss?):\/\/([\w.-]+)[^"']*["']/g)) {
      // Documentation links the user clicks are fine; a socket or fetch target
      // is not. Anything not obviously a doc link has to be the API itself.
      if (url.endsWith("googleapis.com") || url.endsWith("google.com") || url.endsWith("google.dev")) {
        continue;
      }
      offenders.push(`${path.relative(ROOT, file)} -> ${url}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("every referenced asset path resolves", () => {
  const broken = [];
  let checked = 0;

  // Manifest entries are all relative to the extension root.
  const declared = [
    manifest.background?.service_worker,
    manifest.side_panel?.default_path,
    manifest.options_page,
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action?.default_icon || {}),
    ...(manifest.web_accessible_resources || []).flatMap((entry) => entry.resources || []),
  ].filter(Boolean);
  for (const reference of declared) {
    checked++;
    if (!fs.existsSync(path.join(ROOT, reference))) broken.push(`manifest.json -> ${reference}`);
  }

  // ES imports resolve against the importing file; `addModule`, `executeScript`
  // file lists and `getURL` arguments resolve against the root. A bare path is
  // tried both ways rather than guessed at.
  for (const file of sources()) {
    const text = fs.readFileSync(file, "utf8");
    for (const reference of new Set([...text.matchAll(PATH_RE)].map((m) => m[1]))) {
      checked++;
      const candidates = reference.startsWith(".")
        ? [path.resolve(path.dirname(file), reference)]
        : [path.join(ROOT, reference), path.resolve(path.dirname(file), reference)];
      if (!candidates.some((c) => fs.existsSync(c))) {
        broken.push(`${path.relative(ROOT, file)} -> ${reference}`);
      }
    }
  }

  assert.deepEqual(broken, [], `${checked} paths checked`);
  assert.ok(checked > 20, "the walk found suspiciously few paths to check");
});

test("every element the panel and the options page reach for exists", () => {
  // Both documents are entirely id-driven, and `el()` hands back null for a
  // name that is not there. The failure is a TypeError inside `render()`, which
  // aborts the rest of it — so one typo in a checkbox id blanks the panel from
  // that line down, with nothing on screen to say why.
  const missing = [];
  for (const [script, markup] of [
    ["sidepanel.js", "sidepanel.html"],
    ["options.js", "options.html"],
  ]) {
    const code = fs.readFileSync(path.join(ROOT, script), "utf8");
    const html = fs.readFileSync(path.join(ROOT, markup), "utf8");
    const declared = new Set([...html.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));
    // Literal `el("x")` only. The handful of ids the bind loops reach through a
    // variable are not covered here — every one of them is also named literally
    // in `render()`, which is what keeps the gap from mattering.
    for (const [, id] of code.matchAll(/\bel\(\s*"([\w-]+)"\s*\)/g)) {
      if (!declared.has(id)) missing.push(`${script} -> #${id}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("the side panel is scoped to a tab, and to the path the manifest names", () => {
  // Two halves of one behaviour, and either alone is broken: without the global
  // `enabled: false` the panel follows the user onto every other tab, and
  // without the per-tab enable the toolbar icon opens nothing at all. The path
  // is passed again there because a per-tab `setOptions` replaces the whole
  // option set — a copy of `default_path`, and a blank panel when it drifts.
  const code = fs.readFileSync(path.join(ROOT, "service-worker.js"), "utf8");
  assert.match(code, /sidePanel\.setOptions\(\{\s*enabled:\s*false\s*\}\)/);
  const perTab = code.match(/sidePanel\.setOptions\(\{\s*tabId[^}]*path:\s*(\w+)/);
  assert.ok(perTab, "no per-tab setOptions with a path");
  const url = code.match(new RegExp(`${perTab[1]}\\s*=\\s*"([^"]+)"`));
  assert.equal(url?.[1], manifest.side_panel.default_path);
});

test("the offscreen document reaches for no extension API but chrome.runtime", () => {
  // An offscreen document is granted the messaging API and nothing else. Every
  // other namespace is `undefined` there, so `chrome.storage.onChanged` is not
  // a no-op — it is a TypeError at module scope. And it is a uniquely quiet
  // one: it throws *after* the message listener is registered, and every
  // function below it is hoisted, so start, stop and the whole audio graph go
  // on working and only the statements after the throw are lost. That cost a
  // long hunt for a caption bug that was really this.
  const code = fs
    .readFileSync(path.join(ROOT, "offscreen.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const used = new Set([...code.matchAll(/\bchrome\.(\w+)/g)].map((m) => m[1]));
  assert.deepEqual([...used].sort(), ["runtime"]);
});

/**
 * What `npm run package` would put in the ZIP, worked out from the script's own
 * `-x` list rather than by running `zip`.
 *
 * The globs are matched the way zip matches them, which is the part worth
 * stating: its `*` crosses directory separators, so `store/*` takes the whole
 * subtree and `.*` takes every dotfile and dot-directory at once.
 */
function packagedFiles() {
  const script = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts
    .package;
  const excludes = [...script.matchAll(/'([^']+)'/g)].map(
    ([, glob]) =>
      new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`)
  );
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = path.relative(ROOT, path.join(dir, entry.name));
      if (excludes.some((re) => re.test(rel))) continue;
      if (entry.isDirectory()) walk(path.join(dir, entry.name));
      else out.push(rel);
    }
  };
  walk(ROOT);
  return new Set(out);
}

test("the package script ships the extension and nothing else", () => {
  const zipped = packagedFiles();

  // Everything Chrome loads has to be in there, named exactly as the manifest
  // names it. A missing entry here is an extension that installs and is broken.
  for (const reference of [
    "manifest.json",
    manifest.background?.service_worker,
    manifest.side_panel?.default_path,
    manifest.options_page,
    ...Object.values(manifest.icons || {}),
    ...(manifest.web_accessible_resources || []).flatMap((entry) => entry.resources || []),
  ].filter(Boolean)) {
    assert.ok(zipped.has(reference), `the ZIP is missing ${reference}`);
  }
  // The licence and the privacy policy are documents users are entitled to, and
  // they are two files and a few KB.
  assert.ok(zipped.has("LICENSE"));
  assert.ok(zipped.has("PRIVACY.md"));

  // The developer README is 24 KB — a quarter of the package — and it is the one
  // file no user or reviewer opens. The rest is repository furniture.
  for (const excluded of ["README.md", "package.json", ".gitignore"]) {
    assert.ok(!zipped.has(excluded), `${excluded} does not belong in the ZIP`);
  }
  for (const dir of ["tests", "store", ".git", "node_modules"]) {
    const leaked = [...zipped].filter((file) => file.startsWith(`${dir}/`));
    assert.deepEqual(leaked, [], `${dir}/ leaked into the ZIP`);
  }
});

test("the bundled glossary the options page resets to is parseable", async () => {
  const { parseGlossaryCsv } = await import("../lib/glossary.js");
  const csv = fs.readFileSync(path.join(ROOT, "data", "default-glossary.csv"), "utf8");
  assert.ok(parseGlossaryCsv(csv).length > 0);
});
