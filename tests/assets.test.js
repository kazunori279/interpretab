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

import { readCatalogue } from "./messages.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

/**
 * The user guide, which is a Jekyll site and lives apart from the extension.
 *
 * Not because the ZIP wanted it — an exclude list handled that — but because
 * Chrome reserves every top-level name beginning with `_` except `_locales`,
 * and refuses to load an unpacked extension from a directory containing one.
 * `_config.yml`, `_data`, `_includes` and `_layouts` are all names Jekyll
 * insists on, so the two cannot share a root. GitHub Pages is set to build from
 * `/docs`, which keeps every published URL exactly as it was.
 */
const SITE = path.join(ROOT, "docs");

/**
 * The translated guide pages, and the catalogue each one is the guide to.
 *
 * A page is named for the language picker's code, because that is what a reader
 * types; a `_locales` directory is named for what Chrome will match, which is
 * region-qualified for two of them. `docs/index.md` is English and has no
 * directory of its own.
 */
const GUIDES = {
  ja: "ja",
  zh: "zh_CN",
  es: "es",
  fr: "fr",
  de: "de",
  pt: "pt_BR",
  ko: "ko",
  hi: "hi",
  ar: "ar",
};

/** Directories in the site holding a guide page, whether or not GUIDES knows. */
function guideDirs() {
  return fs
    .readdirSync(SITE, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(SITE, e.name, "index.md")))
    .map((e) => e.name);
}

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

/** Directories the extension is not made of. */
const SKIP = new Set([".git", "node_modules", "tests", "docs"]);

/** Source files that can name an asset, walked from the repo root. */
function sources(dir = ROOT) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    // `docs/` is HTML and JavaScript by extension and a Jekyll site by nature:
    // it is the user guide's markup, it never enters the ZIP, and its paths and
    // script tags are the theme's rather than the extension's.
    if (SKIP.has(entry.name)) continue;
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

test("nothing at the root is named in a way Chrome refuses to load", () => {
  // `Cannot load extension with file or directory name _includes. Filenames
  // starting with "_" are reserved for use by the system. Could not load
  // manifest.` — which is what Load unpacked says, and the only place it is
  // ever said. `npm run package` excluded the offending directories, so the
  // ZIP was correct, every other test passed, and the extension could not be
  // run from a checkout at all.
  //
  // `_locales` and `_metadata` are the two names Chrome exempts; `_metadata` is
  // the signature directory it writes into a packed extension itself.
  const reserved = fs
    .readdirSync(ROOT)
    .filter((name) => name.startsWith("_") && !["_locales", "_metadata"].includes(name));
  assert.deepEqual(reserved, [], "Load unpacked will refuse this directory");
});

test("the manifest's fallback locale is one that exists", () => {
  // Without `default_locale` Chrome refuses to load an extension that has a
  // `_locales` directory at all, and with one that names a missing directory it
  // refuses just as flatly — both at install time, with the name and the
  // description showing as `__MSG_extName__` in the store listing if it gets
  // that far.
  assert.ok(manifest.default_locale, "an extension with _locales must declare one");
  assert.ok(fs.existsSync(path.join(ROOT, "_locales", manifest.default_locale, "messages.json")));
  // And the two fields the store reads have to be the localised ones, because
  // they are what a user sees before anything is installed.
  for (const field of [manifest.name, manifest.description, manifest.action?.default_title]) {
    assert.match(field, /^__MSG_\w+__$/);
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
  assert.match(code, /setOptions\(\{\s*enabled:\s*false\s*\}\)/);
  const perTab = code.match(/setOptions\(\{\s*tabId[^}]*path:\s*(\w+)/);
  assert.ok(perTab, "no per-tab setOptions with a path");
  const url = code.match(new RegExp(`${perTab[1]}\\s*=\\s*"([^"]+)"`));
  assert.equal(url?.[1], manifest.side_panel.default_path);

  // And none of it may be awaited. A service worker's user gesture lasts for
  // the synchronous run of the click listener, not for a transient-activation
  // window, so the first `await` in there spends it and `sidePanel.open()`
  // starts refusing — the icon simply stops opening the panel, with the error
  // only in the worker's own console. Every sidePanel call in this file is
  // inside that listener or at module scope; none of them has anything to wait
  // for, and the enable in front of `open` is ordered by being issued first.
  assert.doesNotMatch(code, /await\s+chrome\.sidePanel/);
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

test("the microphone warning is taken back down by the first sound", () => {
  // The warning is a guess made eight seconds in, and the sound that disproves
  // it usually arrives later — from someone who was slow to start talking, or
  // who did what it said and switched device. Left up, it sits over a filling
  // transcript calling a working extension broken, which is the thing it was
  // written to prevent. Two halves hold that together and neither is visible in
  // the other's file: the sample scan has to outlive the warning it raised, and
  // an empty note has to mean "clear this" in the panel rather than an empty
  // warning box.
  const offscreen = fs.readFileSync(path.join(ROOT, "offscreen.js"), "utf8");
  const panel = fs.readFileSync(path.join(ROOT, "sidepanel.js"), "utf8");

  const scan = offscreen.match(/function noteMicLevel\([\s\S]*?\n\}/)?.[0];
  assert.ok(scan, "noteMicLevel is gone — the retraction went with it");
  assert.doesNotMatch(
    scan,
    /micSilenceTimer/,
    "the scan is gated on the countdown, which the warning itself clears"
  );
  assert.match(scan, /post\(\{\s*type:\s*"micNote",\s*detail:\s*""\s*\}\)/);
  assert.match(panel, /el\("micNote"\)\.hidden = !msg\.detail/);
});

/** One source file, as text. Every invariant below is a regex over one. */
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

/** A named top-level function's body, up to the `}` in the first column. */
function body(code, name) {
  const found = code.match(new RegExp(`(?:async )?function ${name}\\([\\s\\S]*?\\n\\}`));
  assert.ok(found, `${name} is gone`);
  return found[0];
}

test("one engine means one run, and a second tab is refused rather than served", () => {
  // Start on a second tab used to stop and restart the offscreen document
  // without telling anybody: the first tab was left with a mark in its title, a
  // subtitle overlay nothing was being sent to, and a panel still lit green.
  // Refusing is the honest version of the same one-engine limit, and it has to
  // come before anything is captured — a tab-capture prompt for a run that is
  // about to be refused is worse than the refusal.
  const sw = read("service-worker.js");
  assert.match(
    body(sw, "start"),
    /^async function start\(panelTabId[^)]*\) \{\s*\n\s*await refuseSecondRun\(panelTabId\);/
  );

  const refuse = body(sw, "refuseSecondRun");
  assert.match(refuse, /throw new Error/, "a second run has to be refused, not adopted");
  // Except on the run's own tab, where Start is the restart every setting that
  // needs a reconnect is applied with.
  assert.match(refuse, /runTabId === panelTabId/);

  // And the owner is written down where the mark, the subtitles and the panel
  // all read it from, then cleared with the run.
  assert.match(body(sw, "start"), /runTabId: tab\?\.id \?\? null/);
  assert.match(body(sw, "stop"), /runTabId: null/);

  // The run ends with that tab. Everything that shows a run is running lives on
  // it — the panel, the mark, the subtitles, the meter — so a run that outlived
  // it would be billed by the second with nothing on screen anywhere to say so.
  const removed = sw.match(/onRemoved\.addListener\([\s\S]*?\n\}\);/)?.[0];
  assert.ok(removed, "nothing watches for the tab going away");
  assert.match(removed, /if \(tabId === runTabId\) await stop\(\);/);
});

test("a panel that does not own the run may stop it and nothing else", () => {
  const panel = read("sidepanel.js");
  const html = read("sidepanel.html");

  assert.match(panel, /const elsewhere = running && runTabId !== myTabId;/);
  assert.match(panel, /for \(const id of RUN_CONTROLS\) el\(id\)\.disabled = elsewhere;/);
  // Stop is the one exemption: reaching it from a tab that was never
  // translating is what the toolbar icon is for.
  assert.match(panel, /el\("toggle"\)\.disabled = elsewhere\s*\n?\s*\?\s*false/);

  // Every control in the markup has to be in that list. The settings behind
  // them are global, so one that is left out is a checkbox that silently
  // reconfigures and reconnects a run on a page the user is not looking at —
  // and it would look like it had done nothing at all.
  const list = panel.match(/const RUN_CONTROLS = \[([\s\S]*?)\];/);
  assert.ok(list, "RUN_CONTROLS is gone");
  const listed = new Set([...list[1].matchAll(/"([\w-]+)"/g)].map((m) => m[1]));
  const controls = [...html.matchAll(/<(?:input|select)[^>]*\bid="([\w-]+)"/g)].map((m) => m[1]);
  assert.ok(controls.length > 5, "the markup scan found suspiciously few controls");
  assert.deepEqual(
    controls.filter((id) => !listed.has(id)),
    []
  );
});

test("the run belongs to the tab whose panel started it, not the last one clicked", () => {
  // `invokedTabId` is the last tab the toolbar icon was clicked on, and two tabs
  // that both have a panel are switched between without any click at all — so
  // Start on one of them would capture the other. The panel names its own tab.
  const panel = read("sidepanel.js");
  const starts = [...panel.matchAll(/send\(\{ type: "start"[^}]*\}/g)].map((m) => m[0]);
  assert.equal(starts.length, 2, "Start and the settings restart, and nothing else");
  for (const call of starts) assert.match(call, /tabId: myTabId/);

  // And the mark and the subtitles follow that one recorded tab rather than
  // each working out "the captured one, or else the clicked one" again — three
  // derivations were three chances to name three different tabs.
  const sw = read("service-worker.js");
  for (const fn of ["markTab", "ensureCaptionTab"]) {
    assert.match(body(sw, fn), /runTabId/);
    assert.doesNotMatch(body(sw, fn), /targetTab|invokedTabId/);
  }
});

test("the cost meter's clock is stamped where the run is", () => {
  // Not in the panel: it can be closed and reopened in the middle of a run, and
  // a timer that started with it would report the run as having begun when the
  // user last looked at it. The elapsed time rides in on the same snapshot as
  // the cost, from the document that has been open the whole time.
  const offscreen = fs.readFileSync(path.join(ROOT, "offscreen.js"), "utf8");
  const panel = fs.readFileSync(path.join(ROOT, "sidepanel.js"), "utf8");

  assert.match(offscreen, /elapsedSeconds:\s*\(performance\.now\(\) - state\.startedAt\)/);
  assert.match(body(panel, "renderUsage"), /formatDuration\(elapsedSeconds\)/);
  assert.doesNotMatch(panel, /setInterval/, "the panel counts nothing of its own");
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
  // Every locale, not just the default one: `npm run package` builds from an
  // exclude list, so a new `_locales` directory is carried automatically and
  // this is what notices if that ever stops being true.
  for (const locale of fs.readdirSync(path.join(ROOT, "_locales"))) {
    assert.ok(zipped.has(`_locales/${locale}/messages.json`), `the ZIP is missing ${locale}`);
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
  // Whole subtrees, and `docs/` is the one that used to be eleven separate globs
  // — the guide's front page, its nine translations, and the three Jekyll
  // directories that forced it out of the root in the first place.
  for (const dir of ["docs", "tests", "store", ".git", "node_modules"]) {
    const leaked = [...zipped].filter((file) => file.startsWith(`${dir}/`));
    assert.deepEqual(leaked, [], `${dir}/ leaked into the ZIP`);
  }
});

test("the privacy policy the extension ships is the one the store links to", () => {
  // Two copies of one document, which is a thing worth justifying. The store
  // listing's privacy policy URL is
  // `https://kazunori279.github.io/interpretab/PRIVACY.html`, which only exists
  // if the file is inside the Jekyll source; the copy users can read in the
  // extension they installed only exists if it is at the root of the ZIP; and
  // the root of the ZIP cannot be inside the Jekyll source, because Chrome will
  // not load a directory containing `_layouts`.
  //
  // A privacy policy that says two different things depending on where it is
  // read is worse than either of the alternatives, so the drift is what this
  // guards. Edit either copy and this fails.
  assert.equal(
    fs.readFileSync(path.join(ROOT, "PRIVACY.md"), "utf8"),
    fs.readFileSync(path.join(SITE, "PRIVACY.md"), "utf8"),
    "PRIVACY.md and docs/PRIVACY.md have drifted apart"
  );
});

test("the bundled glossary the options page resets to is parseable", async () => {
  const { parseGlossaryCsv } = await import("../lib/glossary.js");
  const csv = fs.readFileSync(path.join(ROOT, "data", "default-glossary.csv"), "utf8");
  assert.ok(parseGlossaryCsv(csv).length > 0);
});

/** Width and height out of a PNG's IHDR, which is always its first chunk. */
function pngSize(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.toString("ascii", 12, 16), "IHDR", `${path.basename(file)} is not a PNG`);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

test("the store artwork is the size the store demands", () => {
  // The upload form rejects anything else outright, and it rejects it after the
  // rest of the listing has been filled in. Cheaper to catch here.
  const dir = path.join(ROOT, "store");
  const shots = fs.readdirSync(dir).filter((f) => /^screenshot-.*\.png$/.test(f));
  assert.ok(shots.length > 0, "no store screenshots to check");
  assert.ok(shots.length <= 5, `the store takes five screenshots, not ${shots.length}`);
  for (const shot of shots) {
    assert.deepEqual(pngSize(path.join(dir, shot)), [1280, 800], `${shot} is the wrong size`);
  }
  assert.deepEqual(pngSize(path.join(dir, "promo-440x280.png")), [440, 280]);
  assert.deepEqual(pngSize(path.join(dir, "promo-1400x560.png")), [1400, 560]);
  // Both tiles come off a canvas, which exports RGBA, and the form asks for a
  // 24-bit PNG. Colour type lives in the byte after the bit depth: 4 and 6 are
  // the two that carry alpha.
  for (const tile of ["promo-440x280.png", "promo-1400x560.png"]) {
    const type = fs.readFileSync(path.join(dir, tile))[25];
    assert.ok(type !== 4 && type !== 6, `${tile} still has an alpha channel`);
  }
  // The guide pages' lead image is a frame lifted out of the promo video rather
  // than one of the five, so it lives with the site and not here. Checked to the
  // same size all the same: it can be promoted into the upload set by moving it
  // back and renaming, and nothing else.
  assert.deepEqual(pngSize(path.join(SITE, "assets", "hero-tab-ja-en.png")), [1280, 800]);
});

test("every image the guide pages ask for is somewhere Pages will serve it", () => {
  // Pages builds from `docs/`, and nothing above it is published. The guide was
  // written when it built from the repository root, so `store/…` and `icons/…`
  // resolved; the move to `docs/` was a pure rename and left every one of the
  // eight images in all ten languages pointing at a 404, which is what shipped.
  // A path is not a thing to check by eye across ten translations.
  const pages = ["index.md", ...fs.readdirSync(SITE).filter((f) => f.length === 2).map((l) => `${l}/index.md`)];
  let checked = 0;
  for (const page of pages) {
    const text = fs.readFileSync(path.join(SITE, page), "utf8");
    const refs = [
      ...[...text.matchAll(/<img[^>]+src="([^"]+)"/g)].map(([, src]) => src),
      ...[...text.matchAll(/\]\(([^)]+\.(?:png|svg|jpg|gif))\)/g)].map(([, src]) => src),
    ];
    assert.ok(refs.length > 0, `${page} references no images at all`);
    for (const ref of refs) {
      if (/^https?:/.test(ref)) continue;
      const resolved = path.resolve(path.dirname(path.join(SITE, page)), ref);
      assert.ok(
        resolved.startsWith(SITE + path.sep),
        `${page} points at ${ref}, which is above the published directory`
      );
      assert.ok(fs.existsSync(resolved), `${page} points at ${ref}, which does not exist`);
      checked++;
    }
  }
  // Ten pages that all lost their images together is the failure this exists
  // for, and a regex that quietly matched nothing would have passed it.
  assert.ok(checked >= 80, `only ${checked} image references found across ten pages`);
});

test("the images the site shares with the extension and the store are the same images", () => {
  // Jekyll cannot reach outside its source directory and GitHub Pages refuses to
  // follow symlinks, so the site keeps its own copy of the three images it does
  // not own: the icon belongs to the extension, and two of the screenshots are
  // store uploads that the guide happens to reuse. Copies drift, and a guide
  // showing last month's panel is the kind of wrong nobody reports.
  const shared = [
    ["icons/icon-128.png", "assets/icon-128.png"],
    ["store/screenshot-3-glossary.png", "assets/screenshot-3-glossary.png"],
    ["store/screenshot-4-panel.png", "assets/screenshot-4-panel.png"],
  ];
  for (const [original, copy] of shared) {
    assert.ok(
      fs.readFileSync(path.join(ROOT, original)).equals(fs.readFileSync(path.join(SITE, copy))),
      `docs/${copy} has drifted from ${original} — copy it across`
    );
  }
});

test("the cost figure disclaims itself where the user can actually see it", () => {
  // A dollar figure printed next to "on your key" reads as a bill. It is not
  // one: the tokens are the server's count but the prices are a hardcoded table
  // that goes stale silently, and a free-tier key is charged nothing at all.
  // The disclaimer therefore has to be in the string itself — a tooltip is not
  // where a number disclaims itself, because nobody hovers. Both guide pages
  // quote that string, so they are checked with it rather than left to drift.
  const DISCLAIMER = "an estimate, not your actual bill.";
  // The sentence and the figure are one message in the catalogue rather than
  // markup a `renderUsage` branch fills in, so there is no code path that can
  // print the number without it. Which is also why this reads the catalogue and
  // not the markup: since #10 the panel ships empty and is filled from here.
  assert.ok(
    readCatalogue("en").panelUsagePaid.message.endsWith(DISCLAIMER),
    "the paid usage message must carry the disclaimer, not only note.title"
  );
  // Hard-wrapped prose, so the quote can carry a newline where the panel has a
  // space. The English guide quotes the English panel; each translated one
  // quotes what a Chrome in that language actually shows, which is a different
  // sentence every time.
  const en = fs.readFileSync(path.join(SITE, "index.md"), "utf8").replace(/\s+/g, " ");
  assert.ok(en.includes(DISCLAIMER), "docs/index.md quotes an out-of-date usage note");

  assert.deepEqual(
    guideDirs().sort(),
    Object.keys(GUIDES).sort(),
    "a guide page exists that no catalogue is checked against"
  );
  for (const [dir, locale] of Object.entries(GUIDES)) {
    const page = fs.readFileSync(path.join(SITE, dir, "index.md"), "utf8").replace(/\s+/g, " ");
    const sentence = readCatalogue(locale).panelUsagePaid.message.replace(/<\/?b>/g, "");
    // Placeholders aside, so the guide is free to quote it with figures in.
    const [, tail] = sentence.split("{2}");
    assert.ok(page.includes(tail.trim()), `docs/${dir}/index.md quotes an out-of-date usage note`);
  }
});

test("the site knows about every guide page, and every page declares its language", () => {
  // `_data/languages.yml` is what the language bar, the `hreflang` alternates and
  // the redirect on the English page are all built from. A page missing from it
  // is a page nothing links to and no browser is ever sent to — reachable only by
  // typing the URL, which is indistinguishable from not having translated it.
  const yaml = fs.readFileSync(path.join(SITE, "_data", "languages.yml"), "utf8");
  const listed = [...yaml.matchAll(/^- code: ([a-z]{2})$/gm)].map(([, code]) => code);
  assert.deepEqual(
    listed.slice().sort(),
    ["en", ...guideDirs()].sort(),
    "docs/_data/languages.yml and the guide pages on disk disagree"
  );

  // And the front matter, which is where `<html lang>` comes from and how the
  // layout tells a guide page from `PRIVACY.md`. A page without it renders as
  // English to a screen reader and loses its language bar.
  for (const code of listed) {
    const file = code === "en" ? "index.md" : path.join(code, "index.md");
    const front = fs.readFileSync(path.join(SITE, file), "utf8").split("---")[1] || "";
    assert.match(front, new RegExp(`^lang: ${code}$`, "m"), `${file} does not declare its language`);
  }
});

test("the free tier is never shown a price", () => {
  // Google charges a free-tier key nothing, so a dollar figure there is a bill
  // that does not exist — and the natural reading of one is that a bill is
  // accruing, which is the anxiety the meter was added to remove. No API
  // response carries the tier, so it is asked for on the Options page; free is
  // the default, because showing a price to someone who is not being charged is
  // the worse of the two mistakes.
  assert.match(read("lib/settings.js"), /apiTier: "free"/);

  const select = read("options.html").match(/<select id="apiTier"[\s\S]*?<\/select>/)?.[0];
  assert.ok(select, "no plan selector on the Options page");
  for (const value of ["free", "paid"]) assert.match(select, new RegExp(`value="${value}"`));

  // The money is written in one branch of the meter, and that branch is paid.
  const meter = body(read("sidepanel.js"), "renderUsage");
  assert.match(meter, /const paid = settings\.apiTier === "paid";/);
  assert.match(meter, /paid \? "panelUsagePaid" : "panelUsageFree"/);

  // And the free sentence carries no price of its own, in either language. It
  // is a whole message rather than a shell the code fills, so this is the only
  // place a price could get in.
  for (const locale of ["en", "ja"]) {
    const free = readCatalogue(locale).panelUsageFree.message;
    assert.ok(!free.includes("$"), `the ${locale} free-tier message quotes a price`);
  }
  assert.doesNotMatch(readCatalogue("en").panelUsageFree.message, /cost|bill/i);
});

test("the key is asked about before the tab is captured, and the answer is kept", () => {
  // Order is the whole point of running the preflight in the service worker
  // rather than in the offscreen document. It has to land ahead of
  // `getMediaStreamId`, so a key the API has already rejected costs a message
  // instead of a capture prompt, and so a stream id is not left going stale
  // across an HTTP round trip.
  const sw = body(read("service-worker.js"), "start");
  const asked = sw.indexOf("await preflight(");
  const captured = sw.indexOf("getMediaStreamId");
  assert.ok(asked > 0, "nothing asks the API about the key");
  assert.ok(captured > 0, "the tab is no longer captured here");
  assert.ok(asked < captured, "the tab is captured before the key is checked");
  assert.match(sw, /if \(checked\.fatal\) throw/);

  // And the clean verdict has to reach the sessions, which is where the 1006
  // message that it corrects is written. Three hops, none of them optional.
  assert.match(sw, /closeHint,/, "the verdict never leaves the service worker");
  assert.match(read("offscreen.js"), /closeHint: state\.closeHint/);
  assert.match(read("lib/session-loop.js"), /closeHint: this\._closeHint/);
});

test("a key is judged by whether it could be one, not by this year's format", () => {
  // The Options page used to require `^AIza[\w-]{30,}$`, which held for every
  // key Google issued for years and does not hold for the `AQ.Ab8RN6…` ones it
  // issues now. The result was a working key told it did not look like a key,
  // which is worse than saying nothing: the next thing that goes wrong gets
  // read as a consequence of the warning. `endpointUrl` has always escaped the
  // key rather than assume its charset, and this is the same assumption where
  // the user can see it. So the real function is run here, against both
  // formats, rather than the pattern being asserted into place.
  const source = body(read("options.js"), "renderKeyStatus");
  const input = read("options.html").match(/<input[^>]*id="apiKey"[^>]*>/s)?.[0];
  assert.ok(input, "the key field is gone");
  for (const where of [source, input]) assert.doesNotMatch(where, /AIza/);

  // `t` goes in as a parameter for the same reason as `el` and `setStatus`: the
  // function is lifted out of its module, so everything it closes over has to
  // be handed to it. What it says is not what is under test here — which of the
  // four it says is.
  const run = new Function("settings", "el", "setStatus", "t", `${source}; renderKeyStatus();`);
  const accepted = (apiKey) => {
    let ok = false;
    run(
      { apiKey },
      () => ({}),
      (_node, _text, good = false) => (ok = good),
      (key) => key
    );
    return ok;
  };

  for (const key of [`AIzaSy${"x".repeat(33)}`, `AQ.Ab8RN6J${"x".repeat(60)}`])
    assert.ok(accepted(key), `a key Google issues was called suspicious: ${key.slice(0, 6)}…`);

  // What is left is the paste that went wrong, under any format Google picks.
  for (const bad of ["", "AIzaSy xYz", "https://aistudio.google.com/apikey", "me@example.com", "AQ.Ab8"])
    assert.ok(!accepted(bad), `${bad || "an empty field"} was accepted as a key`);
});

test("a class that sets display does not un-hide an element the panel hides", () => {
  // `[hidden]` is a UA rule, and any class rule that sets `display` outranks it.
  // The failure is silent and looks like a bug in the JavaScript: the element
  // shows itself, empty, from the moment the panel opens — which is exactly what
  // the usage meter did the day it was given `display: flex`. So every class
  // worn by an element that starts hidden has to take the attribute back.
  const html = fs.readFileSync(path.join(ROOT, "sidepanel.html"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "sidepanel.css"), "utf8");

  const hiddenClasses = new Set();
  for (const [tag] of html.matchAll(/<[a-z]+\b[^>]*\bhidden\b[^>]*>/g)) {
    const classes = /class="([^"]*)"/.exec(tag);
    for (const name of classes?.[1].split(/\s+/) ?? []) if (name) hiddenClasses.add(name);
  }
  assert.ok(hiddenClasses.size > 0, "no hidden elements found — has the markup moved?");

  const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selector, body]) => ({
    selector: selector.trim(),
    body,
  }));
  for (const { selector, body } of rules) {
    const display = /display:\s*([a-z-]+)/.exec(body);
    if (!display || display[1] === "none" || selector.includes("[hidden]")) continue;
    for (const name of hiddenClasses) {
      if (!new RegExp(`\\.${name}\\b`).test(selector)) continue;
      const undone = rules.some(
        (rule) =>
          rule.selector.includes("[hidden]") &&
          new RegExp(`\\.${name}\\b`).test(rule.selector) &&
          /display:\s*none/.test(rule.body)
      );
      assert.ok(undone, `\`${selector}\` gives .${name} a display but never [hidden] one back`);
    }
  }
});
