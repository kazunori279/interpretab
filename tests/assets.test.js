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
  assert.match(panel, /el\("usageTime"\)\.textContent = formatDuration\(elapsedSeconds\)/);
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
  // The licence and the privacy policy are documents users are entitled to, and
  // they are two files and a few KB.
  assert.ok(zipped.has("LICENSE"));
  assert.ok(zipped.has("PRIVACY.md"));

  // The developer README is 24 KB — a quarter of the package — and it is the one
  // file no user or reviewer opens. index.md is the GitHub Pages front page, which
  // is the same thing for a different audience: it links to images under store/,
  // which the ZIP does not carry. The rest is repository furniture.
  for (const excluded of ["README.md", "index.md", "package.json", ".gitignore"]) {
    assert.ok(!zipped.has(excluded), `${excluded} does not belong in the ZIP`);
  }
  // ja/ is the translated Pages front page, and the same reasoning applies.
  for (const dir of ["ja", "tests", "store", ".git", "node_modules"]) {
    const leaked = [...zipped].filter((file) => file.startsWith(`${dir}/`));
    assert.deepEqual(leaked, [], `${dir}/ leaked into the ZIP`);
  }
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
  // The guide pages' lead image is a frame lifted out of the promo video rather
  // than one of the five, and is deliberately outside the `screenshot-` set so
  // it cannot be miscounted into an upload. Same size, so it can be promoted
  // into that set by renaming and nothing else.
  assert.deepEqual(pngSize(path.join(dir, "hero-tab-ja-en.png")), [1280, 800]);
});

test("the cost figure disclaims itself where the user can actually see it", () => {
  // A dollar figure printed next to "on your key" reads as a bill. It is not
  // one: the tokens are the server's count but the prices are a hardcoded table
  // that goes stale silently, and a free-tier key is charged nothing at all.
  // The disclaimer therefore has to be in the string itself — a tooltip is not
  // where a number disclaims itself, because nobody hovers. Both guide pages
  // quote that string, so they are checked with it rather than left to drift.
  const DISCLAIMER = "an estimate, not your actual bill.";
  // The sentence is static, so it lives in the markup with the other notes; only
  // the figure is written from script. Whitespace is normalised because the
  // markup hard-wraps it.
  const markup = fs
    .readFileSync(path.join(ROOT, "sidepanel.html"), "utf8")
    .replace(/\s+/g, " ");
  const note = markup.slice(markup.indexOf('id="usageNote"'), markup.indexOf("</p>", markup.indexOf('id="usageNote"')));
  assert.ok(
    note.includes(DISCLAIMER),
    "the visible usage note must carry the disclaimer, not only note.title"
  );
  for (const page of ["index.md", path.join("ja", "index.md")]) {
    // Hard-wrapped prose, so the quote can carry a newline where the panel has
    // a space.
    const text = fs.readFileSync(path.join(ROOT, page), "utf8").replace(/\s+/g, " ");
    assert.ok(text.includes(DISCLAIMER), `${page} quotes an out-of-date usage note`);
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
  const at = meter.indexOf("if (paid)");
  assert.ok(at > 0, "the meter no longer branches on the tier");
  assert.doesNotMatch(meter.slice(0, at), /formatCost|usageAmount/);

  // And the free sentence in the markup carries no price of its own.
  const panel = read("sidepanel.html").replace(/\s+/g, " ");
  const from = panel.indexOf('id="usageFree"');
  assert.ok(from > 0, "the free tail is gone from the meter");
  assert.doesNotMatch(panel.slice(from, panel.indexOf("</span", from)), /\$|cost|bill/i);
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
