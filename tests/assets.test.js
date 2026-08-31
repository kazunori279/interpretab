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
import { MODEL, SIMUL_MODEL } from "../lib/languages.js";
import { parseConfig, SCHEMA_VERSION } from "../lib/remote-config.js";

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

test("the two version numbers are the same number", () => {
  // `package.json` is not in the ZIP, so a stale version there is invisible
  // until something reads it — and something does. `preflight` sends the
  // manifest's version to Google as `x-goog-api-client`, the harnesses stamp
  // their reports with it, and a release is tagged from the other one. Nothing
  // fails when they drift; the reports just start describing a version that was
  // never shipped, which is worse than failing.
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.version, manifest.version);
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

test("no code names a server other than the Gemini API and this project's own", () => {
  const offenders = [];
  for (const file of sources()) {
    const text = fs.readFileSync(file, "utf8");
    for (const [, url] of text.matchAll(/["'](?:https?|wss?):\/\/([\w.-]+)[^"']*["']/g)) {
      // Google is where the translation happens. `kazunori279.github.io` is this
      // project's own site — the guide, the privacy policy, and since 1.0.4 the
      // config file, which is the one thing here that is fetched rather than
      // linked; the test below is about that one. `github.com` is the source
      // repository, and is only ever a destination the user clicks.
      if (
        url.endsWith("googleapis.com") ||
        url.endsWith("google.com") ||
        url.endsWith("google.dev") ||
        url === "kazunori279.github.io" ||
        url === "github.com"
      ) {
        continue;
      }
      offenders.push(`${path.relative(ROOT, file)} -> ${url}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("the config file is fetched from one place, and it is a static file", () => {
  // The extension makes exactly one request to anywhere other than the Gemini
  // API, and everything users have been told about it — PRIVACY.md, the store
  // listing, the sentence in Options — rests on what that request is. So: one
  // URL, named in one file, on this project's own Pages site, with no query
  // string. A key on the end of it would be the whole claim gone.
  const source = fs.readFileSync(path.join(ROOT, "lib/remote-config.js"), "utf8");
  const [, url] = source.match(/^export const CONFIG_URL = "([^"]+)";$/m) || [];
  assert.equal(url, "https://kazunori279.github.io/interpretab/config.json");

  const named = sources().filter((file) => fs.readFileSync(file, "utf8").includes(url));
  assert.deepEqual(named.map((file) => path.relative(ROOT, file)), ["lib/remote-config.js"]);

  // And the file it points at is in the repository, valid, and readable by the
  // parser that will meet it. A published config that this build rejects is a
  // silent no-op; one that fails to parse is the same thing more loudly.
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/config.json"), "utf8"));
  assert.equal(config.schemaVersion, SCHEMA_VERSION);
  assert.ok(parseConfig(JSON.stringify(config)), "the published config does not survive parseConfig");

  // Whatever the file says, the models this build ships must still be reachable
  // — `modelCandidates` guarantees it, and this is the published file put
  // through the guarantee.
  const parsed = parseConfig(JSON.stringify(config));
  assert.ok(parsed.models.simul.includes(SIMUL_MODEL));
  assert.ok(parsed.models.conversation.includes(MODEL));
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
  // Every one of them, and from one line: a control disabled somewhere else in
  // `render` would be handed back the moment this ran.
  assert.match(panel, /for \(const id of RUN_CONTROLS\) \{\n\s*el\(id\)\.disabled = elsewhere \|\|/);
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
  // The step cards' radios are the exception, and they are marked as one: they
  // pick which drawing is showing, in CSS, and there is no setting behind them.
  // Greying them out because the run belongs to another tab would take the
  // instructions away at the one moment somebody is reading them.
  const controls = [...html.matchAll(/<(?:input|select)[^>]*\bid="([\w-]+)"/g)]
    .filter(([tag]) => !tag.includes("stepcard-pick"))
    .map((m) => m[1]);
  assert.ok(controls.length > 5, "the markup scan found suspiciously few controls");
  assert.deepEqual(
    controls.filter((id) => !listed.has(id)),
    []
  );
});

test("the translated microphone is offered on exactly the page it can be injected into", () => {
  // Two decisions that have to agree and are made in two files: the panel shows
  // the switch, the service worker injects the shim. A second copy of the
  // origin is how they come to disagree — the switch appears on a page the
  // injection would refuse, and the user is left with a checkbox that does
  // nothing and no way of knowing why. One exported constant, imported twice.
  const settings = read("lib/settings.js");
  assert.match(settings, /export const CALL_ORIGIN = "https:\/\/meet\.google\.com\/";/);
  for (const file of ["sidepanel.js", "service-worker.js", "offscreen.js"]) {
    const src = read(file);
    assert.equal(
      (src.match(/meet\.google\.com/g) || []).length,
      0,
      `${file} names meet.google.com itself instead of importing CALL_ORIGIN`
    );
  }
  assert.match(read("sidepanel.js"), /myTabUrl\.startsWith\(CALL_ORIGIN\)/);

  // The three conditions are one function, because four files now act on the
  // answer and two of them cannot work it out for themselves: the offscreen
  // document has neither tabs nor storage, and the panel is asking about a
  // different tab from the one the service worker is. A second copy of the rule
  // is how the switch comes to be on in one place and off in another — the
  // voice going into the call and out of the speakers at the same time, which
  // is the state this replaced.
  assert.match(settings, /export function callMicOn\(settings, url\)/);
  for (const file of ["sidepanel.js", "service-worker.js"]) {
    assert.match(read(file), /import \{[^}]*\bcallMicOn\b[^}]*\} from "\.\/lib\/settings\.js";/, file);
  }
  // And the offscreen document is told, once, at Start: it has to know before
  // the first translated frame, and by then it is too late to ask.
  assert.match(read("service-worker.js"), /const intoCall = callMicOn\(settings, tab\?\.url\);/);
  assert.match(read("offscreen.js"), /state\.intoCall = !!intoCall;/);
  // What hangs on it: the voice is not played here, and neither are its
  // subtitles. Both were the same complaint — an interpreter in your own ear,
  // saying what you have just said, over the person you are listening to.
  assert.match(read("offscreen.js"), /if \(direction === "mic" && state\.intoCall\) return;/);
  assert.match(read("offscreen.js"), /state\.settings\.micCaptions && !state\.intoCall/);
  assert.match(read("sidepanel.js"), /el\("micCaptions"\)\.checked = settings\.micCaptions && !intoCall;/);
  assert.match(read("sidepanel.js"), /id === "micCaptions" && intoCall/);

  // On by default. What it costs when it is not wanted is one more entry in
  // Meet's microphone list; what it saves when it is wanted is a kernel
  // extension and a reboot.
  assert.match(settings, /micToCall: true,/);

  // And when the injection fails the panel says so. The symptom is otherwise
  // invisible from here: the session connects, the transcript fills, and the
  // only evidence is a device that never appears in a menu in another window.
  const failure = body(read("service-worker.js"), "ensureCallTab");
  assert.match(failure, /target: "ui", type: "output"/);
  assert.doesNotMatch(failure, /console\./);
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

test("unticking a subtitle switch takes the subtitles off the page", () => {
  // Turning the switch off only ever stopped the *next* line: the offscreen
  // document checks `captionsOn` before forwarding, and everything already
  // drawn stayed where it was. A finished line fades after eight seconds, but a
  // line caught mid-sentence never does — the `turnComplete` that would start
  // its fade is the very thing that has stopped being forwarded — so the last
  // subtitle sat on the page with its dot blinking for the rest of the run.
  //
  // Three files have to agree for the box to mean what it says, and no two of
  // them are open at the same time.
  const sw = read("service-worker.js");
  const overlay = read("content/captions.js");

  // The worker notices which direction went off, and says so per direction:
  // the other one may still be running, and clearing both would wipe subtitles
  // the user is still watching.
  const listener = sw.match(/onChanged\.addListener\([\s\S]*?\n\}\);/)?.[0];
  assert.ok(listener, "nothing watches the subtitle switches any more");
  assert.match(listener, /!changes\[key\]\.newValue.*clearCaptions\(direction\)/s);
  for (const direction of ['"tab"', '"mic"']) assert.match(listener, new RegExp(direction));

  // And it goes direct rather than through `sendToCaptions`, which re-injects
  // when nobody is listening — installing an overlay in order to clear it is
  // how a switch that was just turned off puts something on screen.
  const clear = body(sw, "clearCaptions");
  assert.match(clear, /type: "clear", direction/);
  assert.doesNotMatch(clear, /injectCaptions|sendToCaptions/);

  // The overlay drops that direction's lines, and forgets the one it was still
  // extending — a stale open line would have the next sentence written into a
  // div that is no longer in the document.
  assert.match(overlay, /msg\.type === "clear"/);
  const handler = overlay.match(/function clear\(direction\) \{[\s\S]*?\n  \}/)?.[0];
  assert.ok(handler, "the overlay has no clear()");
  assert.match(handler, /classList\.contains\(direction\)/);
  assert.match(handler, /openLines\.delete\(direction\)/);
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
 * argument list rather than by running `zip`.
 *
 * The script names what goes in rather than what stays out. It used to be the
 * other way round, and the reason it changed is the reason this reads the list
 * at all: an exclude list ships anything nobody thought to exclude, and six
 * live-test artifacts had been riding along in the package for two releases
 * before anyone opened it. An include list can only be wrong in the direction
 * that breaks loudly, and the loop below is what makes it break here instead of
 * in the store listing.
 *
 * The one `-x` glob left is matched the way zip matches it: `*` crosses
 * directory separators, so `.*` takes every dotfile and dot-directory at once.
 */
function packagedFiles() {
  const script = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts
    .package;
  const [, list] = script.match(/zip -r interpretab\.zip (.+?) -x /) || [];
  assert.ok(list, "the package script is not the shape this test can read");
  const excludes = [...script.matchAll(/'([^']+)'/g)].map(
    ([, glob]) =>
      new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`)
  );
  const out = [];
  const walk = (start) => {
    for (const entry of fs.readdirSync(start, { withFileTypes: true })) {
      const rel = path.relative(ROOT, path.join(start, entry.name));
      if (excludes.some((re) => re.test(path.basename(rel)))) continue;
      if (entry.isDirectory()) walk(path.join(start, entry.name));
      else out.push(rel);
    }
  };
  for (const name of list.trim().split(/\s+/)) {
    const full = path.join(ROOT, name);
    assert.ok(fs.existsSync(full), `the package script names ${name}, which is not there`);
    if (fs.statSync(full).isDirectory()) walk(full);
    else out.push(name);
  }
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
  // Every locale, not just the default one.
  for (const locale of fs.readdirSync(path.join(ROOT, "_locales"))) {
    assert.ok(zipped.has(`_locales/${locale}/messages.json`), `the ZIP is missing ${locale}`);
  }

  // And every file any of them reaches for at runtime. This is the check the
  // include list needs and the old exclude list did not: adding a module to a
  // directory already in the list is free, but a *new* directory is a file that
  // resolves in the checkout, passes every other test here, and is not in the
  // package. The symptom would be an extension that works for its author and
  // 404s for everyone else.
  for (const file of sources()) {
    const text = fs.readFileSync(file, "utf8");
    for (const reference of new Set([...text.matchAll(PATH_RE)].map((m) => m[1]))) {
      const rel = reference.startsWith(".")
        ? path.relative(ROOT, path.resolve(path.dirname(file), reference))
        : reference;
      // Only what lives under the extension root; a `../tests/` seam is not shipped.
      if (rel.startsWith("..") || !fs.existsSync(path.join(ROOT, rel))) continue;
      assert.ok(zipped.has(rel), `${path.relative(ROOT, file)} loads ${rel}, which is not in the ZIP`);
    }
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
    const lang = page.includes("/") ? page.split("/")[0] : "en";
    const refs = [
      ...[...text.matchAll(/<img[^>]+src="([^"]+)"/g)].map(([, src]) => src),
      ...[...text.matchAll(/\]\(([^)]+\.(?:png|svg|jpg|gif))\)/g)].map(([, src]) => src),
      // The two page photographs name a picture and let `page-shot.html` work
      // out the file, so what is resolved here is what Jekyll will resolve —
      // including the language, which is the half of the name a page cannot
      // get wrong because it never writes it.
      ...[...text.matchAll(/{%\s*include page-shot\.html([^%]*)%}/g)].map(([, args]) => {
        const name = args.match(/name="([^"]+)"/);
        const alt = args.match(/alt="([^"]*)"/);
        assert.ok(name, `${page} includes page-shot.html without naming a picture`);
        // Alt text is prose, so it is the translation's and not the include's —
        // which also means a page can leave it out and nothing else would say so.
        assert.ok(alt && alt[1].trim(), `${page} includes ${name[1]} with no alt text`);
        return `${lang === "en" ? "" : "../"}assets/${name[1]}-${lang}.png`;
      }),
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

test("the images the site shares with the extension are the same images", () => {
  // Jekyll cannot reach outside its source directory and GitHub Pages refuses to
  // follow symlinks, so the site keeps its own copy of the icon. Copies drift.
  const shared = [["icons/icon-128.png", "assets/icon-128.png"]];
  for (const [original, copy] of shared) {
    assert.ok(
      fs.readFileSync(path.join(ROOT, original)).equals(fs.readFileSync(path.join(SITE, copy))),
      `docs/${copy} has drifted from ${original} — copy it across`
    );
  }
  // The guide used to keep a copy of two store uploads as well, and showed them
  // to all ten languages: an English panel over a Japanese sentence about it.
  // They are the guide's own pictures now, one per language, so a copy of either
  // sitting here again is the old arrangement coming back.
  for (const stale of ["screenshot-3-glossary.png", "screenshot-4-panel.png"]) {
    assert.ok(
      !fs.existsSync(path.join(SITE, "assets", stale)),
      `docs/assets/${stale} is a store upload — the guide takes its own, per language`
    );
  }
});

test("both page photographs exist in every language the guide is written in", () => {
  // `page-shot.html` builds a filename out of the page's own `lang`, so a
  // language that was added to the guide and never photographed renders a 404
  // on one page in ten — which is exactly how the English-everywhere version of
  // these two pictures survived as long as it did. Sized as well as counted:
  // the include reserves 1280×800 of column before the picture arrives, and it
  // is `tests/framed-shot.mjs` that decides that is true.
  const languages = fs.readFileSync(path.join(SITE, "_data", "languages.yml"), "utf8");
  const codes = [...languages.matchAll(/^- code: ([a-z]{2})$/gm)].map(([, code]) => code);
  assert.ok(codes.length === 10, `expected ten guide languages, found ${codes.length}`);
  for (const name of ["panel", "glossary"]) {
    for (const code of codes) {
      const file = path.join(SITE, "assets", `${name}-${code}.png`);
      assert.ok(fs.existsSync(file), `docs/assets/${name}-${code}.png is missing — run tests/guide-shots.mjs`);
      assert.deepEqual(pngSize(file), [1280, 800], `${name}-${code}.png is the wrong size`);
    }
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
  // Both sentences, because the free one is what most readers see — the plan
  // defaults to free — and it is the one that drifted, in ten languages at once,
  // while only the paid one was checked. Every word of each is checked, not the
  // tail: the label in front of a figure is where the wording moves, and a run
  // of guides kept "Gemini audio" for a panel that had stopped saying it.
  const quoted = (locale, key) =>
    readCatalogue(locale)
      [key].message.replace(/<\/?b>/g, "")
      // The bidi marks a catalogue needs around a Latin id are not in the prose.
      .replace(/[‎‏]/g, "")
      .split(/\{[12]\}/)
      .map((part) => part.trim())
      .filter(Boolean);
  for (const [dir, locale] of Object.entries({ ".": "en", ...GUIDES })) {
    const page = fs.readFileSync(path.join(SITE, dir, "index.md"), "utf8").replace(/\s+/g, " ");
    for (const key of ["panelUsagePaid", "panelUsageFree"]) {
      for (const part of quoted(locale, key)) {
        // Placeholders aside, so the guide is free to quote it with figures in.
        assert.ok(
          page.replace(/[‎‏]/g, "").includes(part),
          `docs/${dir}/index.md quotes an out-of-date ${key}: missing "${part}"`
        );
      }
    }
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

test("the install slideshow has its pictures, its steps and its ten translations", () => {
  // The install section is the one part of the guide that is markup rather than
  // markdown: `_includes/install-steps.html` is the slideshow, `_data/install.yml`
  // is its words in ten languages, `_data/shots.yml` is where the pictures and
  // their markers are, and the CSS that decides which pane is on screen is a
  // Liquid loop in `_includes/head-custom.html`. Four files that have to agree,
  // none of which mentions the others in a way a reader would notice, and the
  // failure is silent: a step added in one language only, or a language added to
  // `languages.yml` and not here, renders a blank pane or an English one on a
  // page that is not English.
  const include = fs.readFileSync(path.join(SITE, "_includes", "install-steps.html"), "utf8");
  const pictures = [...include.matchAll(/"(\/assets\/[^"]+)" \| relative_url/g)].map(([, p]) => p);
  for (const picture of pictures) {
    assert.ok(
      fs.existsSync(path.join(SITE, picture.slice(1))),
      `the slideshow points at ${picture}, which does not exist — run tests/guide-shots.mjs`
    );
  }

  // The photographs, which the include names by `figures` and finds in
  // `shots.yml` rather than spelling out. A name in one and not the other draws
  // a step with no picture in it.
  const shots = fs.readFileSync(path.join(SITE, "_data", "shots.yml"), "utf8");
  const figures = include.match(/assign figures = "([^"]+)"/)[1].split(",");
  // `shots.yml` is written wholesale by `guide-shots.mjs` and read by all three
  // slideshows, so a name in it has to belong to one of them, not to this one.
  const named = ["install-steps.html", "meet-steps.html", "slide-steps.html"].flatMap((file) =>
    fs
      .readFileSync(path.join(SITE, "_includes", file), "utf8")
      .match(/assign figures = "([^"]+)"/)[1]
      .split(",")
  );
  const photographed = [...shots.matchAll(/^([a-z]+):$/gm)].map(([, name]) => name);
  for (const name of photographed) {
    assert.ok(
      named.includes(name),
      `docs/_data/shots.yml has a picture called ${name} that no step in any slideshow uses`
    );
    // Each is a picture of something localized — Google's store
    // listing, or the extension's own UI out of `_locales` — so each is taken
    // once per guide language. A language missing here falls back to English
    // under the reader's own words, which is the thing the pictures are for.
    const block = shots.split(new RegExp(`^${name}:$`, "m"))[1].split(/^\S/m)[0];
    const taken = [...block.matchAll(/^ {2}([a-z]+):$/gm)].map(([, code]) => code);
    assert.deepEqual(
      taken.slice().sort(),
      ["en", ...guideDirs()].sort(),
      `docs/_data/shots.yml has no ${name} picture for every guide language`
    );
    for (const [, file] of block.matchAll(/^ {4}file: (\S+)$/gm)) {
      assert.ok(
        fs.existsSync(path.join(SITE, "assets", file)),
        `docs/_data/shots.yml points at ${file}, which does not exist — run tests/guide-shots.mjs`
      );
    }
  }
  for (const side of [...shots.matchAll(/^ {4}side: (\S+)$/gm)].map(([, s]) => s)) {
    assert.ok(
      include.includes("install-mark--{{ shot.side }}"),
      "the slideshow no longer takes the arrow's side from the data that measures it"
    );
    assert.match(
      fs.readFileSync(path.join(SITE, "_includes", "head-custom.html"), "utf8"),
      new RegExp(`\\.install-mark--${side} \\.install-arrow`),
      `docs/_data/shots.yml asks for an arrow on the ${side}, which head-custom.html cannot draw`
    );
  }

  // Blocks, because a real YAML parser is a dependency and this file is two
  // levels deep: a language, its steps, and a `tab` and a `body` on each.
  const yaml = fs.readFileSync(path.join(SITE, "_data", "install.yml"), "utf8");
  const languages = yaml.split(/^(?=[a-z]{2}:$)/m).slice(1);
  const translated = languages.map((block) => block.split(":")[0]);
  assert.deepEqual(
    translated.slice().sort(),
    ["en", ...guideDirs()].sort(),
    "docs/_data/install.yml and the guide pages on disk disagree"
  );
  // Every link in a step leaves the guide, and the slideshow's state is a radio
  // button — so a reader who follows one and comes back lands on step one again.
  // The `target` is added once, by the include, over bodies that are written
  // without one; a translation that wrote its own would end up with two.
  assert.match(
    include,
    /replace: '<a href=', '<a target="_blank" rel="noopener" href='/,
    "install-steps.html no longer opens the steps' links in a new tab"
  );
  for (const anchor of yaml.match(/<a [^>]*>/g) || []) {
    assert.match(anchor, /^<a href="https:/, `install.yml writes a link the include cannot retarget: ${anchor}`);
  }

  // English is the count everything else is measured against: it is the fallback
  // every page falls back to, and the one the CSS counts its panes from. A
  // language a step short renders a tab that opens onto nothing.
  const english = languages[translated.indexOf("en")];
  const count = [...english.matchAll(/^ {4}- tab: \S/gm)].length;
  assert.ok(count >= 4, `install.yml: English is down to ${count} steps`);

  // Which button labels the drawings need is not a list kept in two places: it
  // is whatever the include asks `ui` for. They are AI Studio's own words, kept
  // honest by `tools/aistudio-strings.mjs`; all this can check is that every
  // language has one, because a missing key draws a button with nothing on it.
  const drawn = [...new Set([...include.matchAll(/\{\{ ui\.(\w+) \}\}/g)].map(([, key]) => key))];
  assert.ok(drawn.length >= 4, "install-steps.html has gone back to English labels in the drawings");

  for (const [i, block] of languages.entries()) {
    const steps = [...block.matchAll(/^ {4}- tab: \S/gm)].length;
    const bodies = [...block.matchAll(/^ {6}body: \S/gm)].length;
    assert.equal(steps, count, `install.yml: ${translated[i]} has ${steps} steps, not ${count}`);
    assert.equal(bodies, count, `install.yml: ${translated[i]} has ${bodies} of its ${count} sentences`);
    // The Next button falls back to English rather than rendering blank, which
    // is the failure that would never be noticed on the one page anybody reads.
    assert.match(block, /^ {2}next: \S/m, `install.yml: ${translated[i]} has no word for Next`);
    for (const key of drawn) {
      const has = new RegExp(`^ {2}ui:\\n(?: {4}\\w+: .*\\n)* {4}${key}: \\S`, "m");
      assert.match(block, has, `install.yml: ${translated[i]} has no ${key} label for the drawings`);
    }
  }
  assert.match(
    include,
    /<label class="install-next" for="install-step-\{\{ forloop\.index \| plus: 1 \}\}"/,
    "install-steps.html no longer offers a way forward other than the tab strip"
  );
  assert.equal(
    figures.length,
    count,
    `install-steps.html names ${figures.length} pictures for ${count} steps`
  );

  // The CSS counts the panes rather than being told, so the only thing left to
  // check is that it is still counting the same list.
  const css = fs.readFileSync(path.join(SITE, "_includes", "head-custom.html"), "utf8");
  assert.match(css, /assign step_count = site\.data\.install\.en\.steps \| size/);
  assert.match(css, /for i in \(1\.\.step_count\)/);

  // And the pages, each of which is now a one-line call rather than its own copy
  // of the list. A page that lost the line lost its install section outright.
  for (const code of ["en", ...guideDirs()]) {
    const file = code === "en" ? "index.md" : path.join(code, "index.md");
    assert.match(
      fs.readFileSync(path.join(SITE, file), "utf8"),
      /\{%\s*include install-steps\.html\s*%\}/,
      `docs/${file} does not include the install slideshow`
    );
  }
});

test("the options page's install card says what the guide says", () => {
  // The same ten steps as the slideshow above, in the extension itself, for the
  // reader Chrome drops on the options page on install — which is everybody,
  // once, before they have a key. The words are the guide's, copied into the
  // catalogues: `install.yml` is Jekyll's and the extension does not ship it,
  // and a translation is not something to write twice. So this is the copy, and
  // it fails the moment either side is edited alone.
  //
  // What differs is only the markup a link is written in: the guide writes the
  // address, and a catalogue is not allowed to — `lib/i18n.js` takes the
  // destination off the element instead, so the body's `<a href="…">` is an
  // `<a1>` here. Everything else, bold included, is the same string.
  const yaml = fs.readFileSync(path.join(SITE, "_data", "install.yml"), "utf8");
  const guide = (code) => {
    const block = yaml.split(new RegExp(`^${code}:$`, "m"))[1].split(/^\S/m)[0];
    // Folded scalars, which is how the English block writes every one of them:
    // the value is the lines under `body: >-` joined by spaces.
    return [...block.matchAll(/^ {6}body: (>-\n(?: {8}.*\n)+|.*\n)/gm)].map(([, raw]) => {
      const text = raw.startsWith(">-")
        ? raw.split("\n").slice(1).map((line) => line.trim()).filter(Boolean).join(" ")
        : raw.trim();
      let n = 0;
      return text.replace(/<a href="[^"]*">/g, () => `<a${++n}>`).replace(/<\/a>/g, () => `</a${n}>`);
    });
  };

  // The card starts at the guide's second step. The first is installing the
  // extension, and a reader on the options page is inside it — so the card's
  // step N is the guide's step N + 1, and that offset is this one line.
  const SKIPPED = 1;
  const english = guide("en");
  assert.equal(english.length, 10, `install.yml is down to ${english.length} English steps`);
  const count = english.length - SKIPPED;
  for (const [dir, locale] of Object.entries({ en: "en", ...GUIDES })) {
    const messages = JSON.parse(fs.readFileSync(path.join(ROOT, "_locales", locale, "messages.json"), "utf8"));
    guide(dir).slice(SKIPPED).forEach((body, i) => {
      const key = `optStartStep${i + 1}`;
      assert.ok(messages[key], `_locales/${locale} has no ${key}`);
      assert.equal(
        messages[key].message,
        body,
        `_locales/${locale}/${key} and docs/_data/install.yml ${dir} step ${i + 1 + SKIPPED} have drifted apart`
      );
    });
    assert.ok(
      !messages[`optStartStep${count + 1}`],
      `_locales/${locale} has an optStartStep${count + 1} for a card of ${count} steps`
    );
  }

  // And the card that shows them. One pane per step, each reading its own
  // message: a pane short is a numbered tab that opens onto nothing, and the
  // radios are what the CSS matches on, so the ids are not free to change.
  const html = read("options.html");
  const card = html.match(/<section class="stepcard" id="setupCard"[\s\S]*?<\/section>/)?.[0];
  assert.ok(card, "the options page has no install card");
  const css = read("sidepanel.css");
  for (let n = 1; n <= count; n += 1) {
    assert.match(card, new RegExp(`id="setupstep-${n}"`), `the card has no radio for step ${n}`);
    assert.match(card, new RegExp(`for="setupstep-${n}">${n}</label>`), `the card has no tab for step ${n}`);
    assert.match(card, new RegExp(`data-i18n="optStartStep${n}"`), `the card does not show step ${n}`);
    assert.match(
      css,
      new RegExp(`#setupstep-${n}:checked ~ \\.stepcard-panes \\.stepcard-pane--${n}`),
      `nothing opens pane ${n} of the install card`
    );
  }
  assert.ok(!card.includes("setupstep-" + (count + 1)), `the card has a step ${count + 1} the guide does not`);
  // Its own group, so walking the install steps does not move the panel's cards.
  assert.match(card, /name="setupStep"/);

  // Opened for a reader with no key, and closed by the button on the last step
  // and by nothing else. Pasting a key is one of the steps, so hiding the card
  // on `renderKeyStatus` — which runs when one is saved — would fold the last
  // three away under whoever was following them.
  const js = read("options.js");
  assert.match(
    body(js, "init"),
    /el\("setupCard"\)\.hidden = Boolean\(settings\.apiKey\);/,
    "the install card is no longer opened for a reader without a key"
  );
  assert.doesNotMatch(
    body(js, "renderKeyStatus"),
    /setupCard/,
    "saving a key closes the install card again, taking the steps after it away"
  );
  assert.match(card, /id="setupClose"/, "the install card has no way to close it");
  assert.match(body(js, "bind"), /el\("setupClose"\)\.addEventListener/);
});

test("the card before the call walks all four steps, and asks for the microphone in the one place that can", () => {
  // The panel's own slideshow, and the only one of the three whose steps are not
  // the guide's: the permission step has no equivalent in `meet.yml`, because a
  // reader on the site is not the one Chrome is refusing. It is also the one
  // step this card cannot finish — Chrome raises the prompt for a page and a
  // side panel is not one — so it says the banner's sentence and points at the
  // options page's button, through the action the panel already handles.
  const html = read("sidepanel.html");
  const card = html.match(/<section class="stepcard" id="prepCard"[\s\S]*?<\/section>/)?.[0];
  assert.ok(card, "the panel has no card for what to do before the call");
  const css = read("sidepanel.css");
  const steps = ["panelPrepPhones", "panelStepMic", "panelPrepTheirs", "panelPrepYours"];
  steps.forEach((key, i) => {
    const n = i + 1;
    assert.match(card, new RegExp(`id="prepstep-${n}"`), `the card has no radio for step ${n}`);
    assert.match(card, new RegExp(`for="prepstep-${n}">${n}</label>`), `the card has no tab for step ${n}`);
    assert.match(card, new RegExp(`data-i18n="${key}"`), `the card does not show ${key}`);
    assert.match(
      css,
      new RegExp(`#prepstep-${n}:checked ~ \\.stepcard-panes \\.stepcard-pane--${n}`),
      `nothing opens pane ${n} of the card`
    );
  });
  assert.ok(!card.includes(`prepstep-${steps.length + 1}`), `the card has a step ${steps.length + 1} nothing opens`);
  // Its own group, so walking these does not move the Meet card underneath.
  assert.match(card, /name="prepStep"/);

  // The link out, and the drawing of what it lands on. `optionsMic` is the
  // panel's own action rather than an address, so `lib/i18n.js` needs it on the
  // element and `sidepanel.js` needs a branch for it; the guide's word for the
  // button is the real one, so the reader is looking for the same words.
  assert.match(
    card,
    /data-i18n="panelStepMic" data-link1="optionsMic"/,
    "the microphone step's link no longer opens the options page at its Microphone section"
  );
  assert.match(read("sidepanel.js"), /action === "optionsMic"/);
  assert.match(card, /data-i18n="optMicHeading"/, "the drawing no longer names the section to look for");
  assert.match(card, /data-i18n="optMicGrant"/, "the drawing no longer shows the button to press");
});

test("the Google Meet slideshow has its steps, its two phases and its ten translations", () => {
  // Same four files as the install slideshow, and the same silent failures, with
  // one more thing to keep straight: the tab strip is broken into two rows by the
  // `phase` written on the step each row starts at. Lose a phase and the strip is
  // one undivided run of seven; gain one and the rows stop matching the two
  // halves the section is written around, before the call and in it.
  const include = fs.readFileSync(path.join(SITE, "_includes", "meet-steps.html"), "utf8");
  const figures = include.match(/assign figures = "([^"]+)"/)[1].split(",");
  const yaml = fs.readFileSync(path.join(SITE, "_data", "meet.yml"), "utf8");
  const languages = yaml.split(/^(?=[a-z]{2}:$)/m).slice(1);
  const translated = languages.map((block) => block.split(":")[0]);
  assert.deepEqual(
    translated.slice().sort(),
    ["en", ...guideDirs()].sort(),
    "docs/_data/meet.yml and the guide pages on disk disagree"
  );

  // As in `install.yml`: the include adds the `target`, so a body that wrote its
  // own would end up with two.
  assert.match(
    include,
    /replace: '<a href=', '<a target="_blank" rel="noopener" href='/,
    "meet-steps.html no longer opens the steps' links in a new tab"
  );
  for (const anchor of yaml.match(/<a [^>]*>/g) || []) {
    assert.match(anchor, /^<a href="https:/, `meet.yml writes a link the include cannot retarget: ${anchor}`);
  }

  const english = languages[translated.indexOf("en")];
  const count = [...english.matchAll(/^ {4}- tab: \S/gm)].length;
  assert.ok(count >= 4, `meet.yml: English is down to ${count} steps`);
  for (const [i, block] of languages.entries()) {
    const steps = [...block.matchAll(/^ {4}- tab: \S/gm)].length;
    const bodies = [...block.matchAll(/^ {6}body: \S/gm)].length;
    const phases = [...block.matchAll(/^ {6}phase: \S/gm)].length;
    assert.equal(steps, count, `meet.yml: ${translated[i]} has ${steps} steps, not ${count}`);
    assert.equal(bodies, count, `meet.yml: ${translated[i]} has ${bodies} of its ${count} sentences`);
    assert.equal(phases, 2, `meet.yml: ${translated[i]} splits the steps into ${phases} phases, not two`);
    assert.match(block, /^ {2}next: \S/m, `meet.yml: ${translated[i]} has no word for Next`);
  }
  assert.equal(
    figures.length,
    count,
    `meet-steps.html names ${figures.length} pictures for ${count} steps`
  );

  // The three photographs, which `guide-shots.mjs` takes of the panel on a Meet
  // tab. Renaming one there and not here draws a step with no picture in it; the
  // install test checks the other direction, that nothing in `shots.yml` is
  // orphaned.
  for (const name of ["meettab", "meetmic", "meetstart"]) {
    assert.ok(figures.includes(name), `meet-steps.html no longer uses the ${name} photograph`);
  }

  // Which pane is on screen is decided by index classes rather than `nth-child`,
  // because the phase heading sits in the tab strip and makes the nth tab and the
  // nth child two different elements. The include writes them and the CSS loop
  // matches them, and neither half is any use alone.
  assert.match(include, /class="install-tab meet-tab--\{\{ forloop\.index \}\}"/);
  assert.match(include, /class="install-pane meet-pane--\{\{ forloop\.index \}\}"/);
  const css = fs.readFileSync(path.join(SITE, "_includes", "head-custom.html"), "utf8");
  assert.match(css, /assign meet_count = site\.data\.meet\.en\.steps \| size/);
  assert.match(css, /for i in \(1\.\.meet_count\)/);
  assert.match(css, /#meet-step-\{\{ i \}\}:checked ~ \.install-panes \.meet-pane--\{\{ i \}\}/);
  // Its own radio group, so a reader can be on step three of the install and step
  // six of this one without one slideshow moving the other.
  assert.match(include, /name="meet-step"/);

  for (const code of ["en", ...guideDirs()]) {
    const file = code === "en" ? "index.md" : path.join(code, "index.md");
    assert.match(
      fs.readFileSync(path.join(SITE, file), "utf8"),
      /\{%\s*include meet-steps\.html\s*%\}/,
      `docs/${file} does not include the Google Meet slideshow`
    );
  }
});

test("the slide-presentation slideshow has its steps, its two phases and its ten translations", () => {
  // The third of the three, and the same four files with the same silent
  // failures. What is particular to it is that one of its pictures belongs to
  // another section: the button row is `meetstart`, because the panel has one
  // Start in it and photographing it twice would be two pictures to re-take
  // every time the row changes. The install test's orphan check is what makes
  // that safe in the other direction.
  const include = fs.readFileSync(path.join(SITE, "_includes", "slide-steps.html"), "utf8");
  const figures = include.match(/assign figures = "([^"]+)"/)[1].split(",");
  const yaml = fs.readFileSync(path.join(SITE, "_data", "slides.yml"), "utf8");
  const languages = yaml.split(/^(?=[a-z]{2}:$)/m).slice(1);
  const translated = languages.map((block) => block.split(":")[0]);
  assert.deepEqual(
    translated.slice().sort(),
    ["en", ...guideDirs()].sort(),
    "docs/_data/slides.yml and the guide pages on disk disagree"
  );

  assert.match(
    include,
    /replace: '<a href=', '<a target="_blank" rel="noopener" href='/,
    "slide-steps.html no longer opens the steps' links in a new tab"
  );
  for (const anchor of yaml.match(/<a [^>]*>/g) || []) {
    assert.match(anchor, /^<a href="https:/, `slides.yml writes a link the include cannot retarget: ${anchor}`);
  }

  const english = languages[translated.indexOf("en")];
  const count = [...english.matchAll(/^ {4}- tab: \S/gm)].length;
  assert.ok(count >= 4, `slides.yml: English is down to ${count} steps`);
  for (const [i, block] of languages.entries()) {
    const steps = [...block.matchAll(/^ {4}- tab: \S/gm)].length;
    const bodies = [...block.matchAll(/^ {6}body: \S/gm)].length;
    const phases = [...block.matchAll(/^ {6}phase: \S/gm)].length;
    assert.equal(steps, count, `slides.yml: ${translated[i]} has ${steps} steps, not ${count}`);
    assert.equal(bodies, count, `slides.yml: ${translated[i]} has ${bodies} of its ${count} sentences`);
    assert.equal(phases, 2, `slides.yml: ${translated[i]} splits the steps into ${phases} phases, not two`);
    assert.match(block, /^ {2}next: \S/m, `slides.yml: ${translated[i]} has no word for Next`);
  }
  assert.equal(
    figures.length,
    count,
    `slide-steps.html names ${figures.length} pictures for ${count} steps`
  );

  // Two photographs of its own and one borrowed. Renaming any of them in
  // `guide-shots.mjs` and not here draws a step with no picture in it.
  for (const name of ["slidemic", "slidesize", "meetstart"]) {
    assert.ok(figures.includes(name), `slide-steps.html no longer uses the ${name} photograph`);
  }
  // The two drawings, which are the same slide twice and carry no words — a
  // slide with English lettering under a Japanese sentence is what the
  // photographs exist to avoid, and a drawing can make the same mistake.
  assert.match(include, /class="deck-card"/, "slide-steps.html no longer draws the deck in a tab");
  assert.match(include, /class="deck-stage"/, "slide-steps.html no longer draws the deck presenting");
  assert.match(include, /class="deck-subs"/, "the presenting drawing has lost the subtitles it is about");

  assert.match(include, /class="install-tab slide-tab--\{\{ forloop\.index \}\}"/);
  assert.match(include, /class="install-pane slide-pane--\{\{ forloop\.index \}\}"/);
  const css = fs.readFileSync(path.join(SITE, "_includes", "head-custom.html"), "utf8");
  assert.match(css, /assign slide_count = site\.data\.slides\.en\.steps \| size/);
  assert.match(css, /for i in \(1\.\.slide_count\)/);
  assert.match(css, /#slide-step-\{\{ i \}\}:checked ~ \.install-panes \.slide-pane--\{\{ i \}\}/);
  for (const name of ["deck-card", "deck-stage", "deck-subs"]) {
    assert.ok(css.includes(`.${name}`), `head-custom.html has no CSS for .${name}`);
  }
  assert.match(include, /name="slide-step"/);

  for (const code of ["en", ...guideDirs()]) {
    const file = code === "en" ? "index.md" : path.join(code, "index.md");
    assert.match(
      fs.readFileSync(path.join(SITE, file), "utf8"),
      /\{%\s*include slide-steps\.html\s*%\}/,
      `docs/${file} does not include the slide-presentation slideshow`
    );
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

  // The attribute itself, and not `aria-hidden`: a drawing hidden from a screen
  // reader is on screen, and its classes are supposed to give it a display.
  const hiddenClasses = new Set();
  for (const [tag] of html.matchAll(/<[a-z]+\b[^>]*\shidden(?=[\s>])[^>]*>/g)) {
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
      // `\b` would let `.stepcard-bar` answer for `.stepcard`, which is another
      // class on another element: a hyphen ends a word but does not end a name.
      const worn = new RegExp(`\\.${name}(?![\\w-])`);
      if (!worn.test(selector)) continue;
      const undone = rules.some(
        (rule) =>
          rule.selector.includes("[hidden]") &&
          worn.test(rule.selector) &&
          /display:\s*none/.test(rule.body)
      );
      assert.ok(undone, `\`${selector}\` gives .${name} a display but never [hidden] one back`);
    }
  }
});
