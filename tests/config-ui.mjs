/**
 * The update notice and its opt-out, in a real Chrome, with pictures.
 *
 *     node tests/config-ui.mjs [--headed] [--keep] [--lang=ja]
 *
 * `tests/remote-config.test.js` proves what the config file is allowed to say.
 * What it cannot reach is the half of the feature that only exists in a browser:
 * whether the service worker's verdict actually arrives at a panel that has
 * already finished rendering, whether the banner is legible at the 400 px the
 * panel opens at, and whether the Options switch really does both of the things
 * it promises — stop the request *and* forget what was learned. Those are three
 * separate contexts, and the wiring between them is exactly where a feature like
 * this rots without anyone noticing, because a working extension and a broken
 * one look identical until the day the notice is needed.
 *
 * It costs nothing. Every state is set by seeding the cache the way a fetch
 * would have, with a timestamp inside the TTL, so `ensureConfig` answers from
 * storage rather than opening a socket — bar the very first read, which a
 * profile this new has nothing to answer from and which the walk waits out
 * before it seeds anything. The key it types is `not-a-real-key` and nothing
 * here presses Start.
 *
 * As in `onboarding.mjs`, the side panel is opened as an ordinary tab: it is the
 * same document and the same script, in a frame the protocol can photograph.
 */

import fs from "node:fs";
import path from "node:path";
import { Chrome, catalogueFor, plainMessage } from "./chrome-harness.mjs";
import { MODEL, SIMUL_MODEL } from "../lib/languages.js";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "tests", "config-ui");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

const headed = process.argv.includes("--headed");
const keepOpen = process.argv.includes("--keep");

/**
 * `--lang=ja` runs the whole walk in another of the ten catalogues.
 *
 * Every assertion below compares what is on screen against `_locales/<that
 * language>`, so this is the difference between "all ten catalogues have the
 * key" — which `tests/i18n.test.js` already says — and "the notice renders in
 * the language the browser is set to".
 */
const lang = (process.argv.find((a) => a.startsWith("--lang=")) || "").slice(7);

const PANEL_VIEW = { width: 400, height: 780 };
const OPTIONS_VIEW = { width: 860, height: 780 };

/** A version far above anything that will ever ship, so the block is unambiguous. */
const IMPOSSIBLE = "99.0.0";

const LEARN_MORE = "https://kazunori279.github.io/interpretab/";

/**
 * A file that has moved on since this build: the simultaneous model it ships
 * with, dated and with an end, and a successor that is only a name so far.
 *
 * The conversation half deliberately does not list the bundled name, so that
 * the picker has to show `modelCandidates` keeping it as the last resort.
 */
const SIMUL_NEXT = "gemini-4-live-translate-preview";
const CHAT_NOW = "gemini-3.2-flash-live-preview";

/** A parsed config, as `ensureConfig` would have returned it. */
const config = (patch) =>
  JSON.stringify({
    schemaVersion: 1,
    models: { simul: null, conversation: null },
    rates: null,
    blockBelowVersion: "",
    learnMoreUrl: "",
    ...patch,
  });

/**
 * Put *patch* in the cache as a fetch that has just succeeded would have.
 *
 * `Date.now()` keeps it inside both TTLs, which is what stops the worker going
 * to the network — the point being to test the UI, not GitHub's uptime.
 */
const seed = (page, patch) =>
  page.eval(
    `chrome.storage.local.set({ remoteConfig: { at: Date.now(), data: ${config(patch)} } }).then(() => true)`
  );

/** Everything the notice shows, in the one shape all three states are read in. */
const NOTICE = `(() => {
  const banner = document.getElementById("updateRequired");
  const steps = document.getElementById("updateSteps");
  const link = document.getElementById("updateLink");
  return {
    hidden: banner.hidden,
    title: banner.querySelector("p").textContent,
    steps: steps.textContent,
    code: [...steps.querySelectorAll("code")].map((e) => e.textContent),
    bold: steps.querySelectorAll("b").length,
    linkHidden: link.parentElement.hidden,
    linkText: link.textContent,
    href: link.getAttribute("href"),
    startDisabled: document.getElementById("toggle").disabled,
  };
})()`;

/** What the worker itself says, which is what Start consults. */
const VERDICT = `chrome.runtime
  .sendMessage({ target: "sw", type: "config" })
  .then((r) => ({ ok: r.ok, blocked: r.blocked, learnMoreUrl: r.config?.learnMoreUrl ?? null }))`;

/** The labels on one dropdown, in order — what a reader of that menu sees. */
const MENU = (id) => `[...document.getElementById(${JSON.stringify(id)}).options].map((o) => o.textContent)`;

const CACHED = `chrome.storage.local.get("remoteConfig").then((v) => Object.keys(v).length)`;

const steps = [];
let failures = 0;

function step(title, what) {
  const entry = { title, what, checks: [], shot: null };
  steps.push(entry);
  console.log(`\n${steps.length}. ${title}`);
  return entry;
}

/** One assertion, by value. Recorded whether it holds or not — the run goes on. */
function check(entry, what, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  entry.checks.push({ what, actual, expected, pass });
  if (!pass) failures++;
  console.log(`   ${pass ? "ok  " : "FAIL"} ${what}`);
  if (!pass) console.log(`        expected ${show(expected)}\n        actual   ${show(actual)}`);
}

const show = (value) => (typeof value === "string" ? value : JSON.stringify(value));

async function shot(entry, page, name) {
  entry.shot = name;
  await page.screenshot(path.join(OUT, name));
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const chrome = await Chrome.launch({ headed, lang });
console.log(`${chrome.version} — Interpretab ${MANIFEST.version}`);

try {
  const extensionId = await chrome.loadExtension(ROOT);
  const origin = `chrome-extension://${extensionId}`;
  await chrome.closeTargets("options.html"); // the install opens one; not this walk

  const panel = await chrome.newPage(`${origin}/sidepanel.html`, PANEL_VIEW);
  const uiLanguage = await panel.eval(`chrome.i18n.getUILanguage()`);
  const catalogue = catalogueFor(uiLanguage, ROOT);
  const message = (key) => plainMessage(catalogue, key);
  /** The same, with {1}… filled in, for the messages that name a model. */
  const fill = (key, ...args) => message(key).replace(/\{(\d)\}/g, (_, n) => args[n - 1]);
  console.log(`   (Chrome's UI language is ${uiLanguage}; reading _locales/${catalogue.locale})`);

  // A configured extension, so that the only thing left able to disable Start
  // is the notice itself. Nothing here presses it.
  await panel.eval(
    `chrome.storage.local.set({ apiKey: "not-a-real-key", tabEnabled: true, micEnabled: false })`
  );

  // The one read this walk cannot seed around: the panel asks the worker for
  // the file as it opens, and on a profile this new that is a real fetch of the
  // published config. Waiting for it to land is what makes everything below
  // deterministic — a fetch still in flight overwrites the next seed from
  // under the scenario that seeded it, which showed up as the published
  // `learnMoreUrl` turning up in a step that had asked for none. Offline it
  // writes nothing and this waits its fifteen seconds for a copy that will
  // never arrive, which is slow and still correct.
  await panel.waitFor(`${CACHED}.then((n) => n === 1)`);

  // ------------------------------------------------------------- not blocked
  const quiet = step(
    "A file that blocks nothing is not visible at all",
    "The ordinary case, and the one that has to stay silent: the extension reads this file a few times a day for the rest of its life, and the user should never learn that it exists."
  );
  await seed(panel, { blockBelowVersion: "" });
  await panel.reload();
  await panel.waitFor(`document.getElementById("toggle") !== null`);
  let notice = await panel.eval(NOTICE);
  check(quiet, "the notice stays hidden", notice.hidden, true);
  check(quiet, "Start is available", notice.startDisabled, false);
  check(quiet, "and the worker agrees", await panel.eval(VERDICT), {
    ok: true,
    blocked: false,
    learnMoreUrl: "",
  });
  await shot(quiet, panel, "01-not-blocked.png");

  // ----------------------------------------------------------------- blocked
  const blocked = step(
    "A block reaches a panel that has already finished rendering",
    "The verdict is fetched after `init()` returns, because holding the panel's first paint on a network call would make every ordinary open slower for a notice almost nobody will ever see. So the banner has to arrive late and re-run `render()` behind itself."
  );
  await seed(panel, { blockBelowVersion: IMPOSSIBLE, learnMoreUrl: LEARN_MORE });
  await panel.reload();
  check(
    blocked,
    "the banner appears without a second reload",
    await panel.waitFor(`document.getElementById("updateRequired").hidden === false`),
    true
  );
  notice = await panel.eval(NOTICE);
  check(blocked, "the first line says the build cannot translate", notice.title, message("updateRequiredTitle"));
  check(blocked, "the second says how to update", notice.steps, message("updateRequiredSteps"));
  check(blocked, "the address is set in code type", notice.code, ["chrome://extensions"]);
  check(blocked, "and Chrome's own two labels are in bold", notice.bold, 2);
  check(blocked, "Start is refused", notice.startDisabled, true);
  check(blocked, "the worker refuses it too, which is what a Start would hit", await panel.eval(VERDICT), {
    ok: true,
    blocked: true,
    learnMoreUrl: LEARN_MORE,
  });
  await shot(blocked, panel, "02-blocked.png");

  // ------------------------------------------------------------------- link
  const link = step(
    "The link is the file's to offer, and only within this project",
    "`learnMoreUrl` exists so the notice can point at a page written after the build shipped. `parseConfig` drops any destination outside this project's own site, and the panel shows nothing at all rather than guessing when it is left with none."
  );
  check(link, "a link the file gave is shown", notice.linkHidden, false);
  check(link, "with its own wording, not the file's", notice.linkText, message("updateRequiredMore"));
  check(link, "pointing where the file said", notice.href, LEARN_MORE);
  check(link, "and it opens outside the panel", await panel.eval(`document.getElementById("updateLink").target`), "_blank");

  await seed(panel, { blockBelowVersion: IMPOSSIBLE, learnMoreUrl: "" });
  await panel.reload();
  await panel.waitFor(`document.getElementById("updateRequired").hidden === false`);
  notice = await panel.eval(NOTICE);
  check(link, "no destination, no link", notice.linkHidden, true);
  check(link, "and the notice itself is unaffected", notice.title, message("updateRequiredTitle"));
  await shot(link, panel, "03-blocked-no-link.png");

  // -------------------------------------------------------------- the picker
  const picker = step(
    "The successor is offered months before it is compulsory",
    "A new Live model appears long before the one in use is switched off, and the recommended order deliberately does not move on the day it appears — nothing here has run a translation through it yet. So the file's other names are a menu in Options, per mode, and with no telemetry the people who take it early are the only compatibility signal this project gets."
  );
  await seed(panel, {
    models: { simul: [SIMUL_MODEL, SIMUL_NEXT], conversation: [CHAT_NOW] },
    modelInfo: {
      [SIMUL_MODEL]: { since: "2026-05-01", retiring: "2026-12-01" },
      [SIMUL_NEXT]: { since: "2026-08-20" },
    },
  });

  const options = await chrome.newPage(`${origin}/options.html`, OPTIONS_VIEW);
  await options.waitFor(`document.getElementById("simulModel").options.length > 0`);
  check(picker, "the file's names are on the menu, the recommendation first", await options.eval(MENU("simulModel")), [
    fill("optModelAuto", SIMUL_MODEL),
    // The one in use carries the date it goes away, which is the whole notice a
    // user gets that they will be moved.
    fill("optModelRetiring", SIMUL_MODEL, "2026-12-01"),
    fill("optModelNew", SIMUL_NEXT),
  ]);
  check(picker, "and nothing is chosen until somebody chooses it", await options.eval(`document.getElementById("simulModel").value`), "");
  // The bundled name, which `modelCandidates` keeps whatever the file says, and
  // which this file does not list.
  check(picker, "the other mode has its own list, and its own build fallback", await options.eval(MENU("conversationModel")), [
    fill("optModelAuto", CHAT_NOW),
    CHAT_NOW,
    MODEL,
  ]);

  await options.eval(`(() => {
    const select = document.getElementById("simulModel");
    select.value = ${JSON.stringify(SIMUL_NEXT)};
    select.dispatchEvent(new Event("change"));
  })(); true`);
  await options.waitFor(
    `chrome.storage.local.get("simulModel").then((v) => v.simulModel === ${JSON.stringify(SIMUL_NEXT)})`
  );
  check(
    picker,
    "a choice is saved, and only for the mode it was made in",
    // Read as two strings rather than as the object: an untouched setting is
    // not in storage at all, so comparing shapes would be a test of which
    // defaults have been written rather than of what was chosen.
    await options.eval(
      `chrome.storage.local
         .get(["simulModel", "conversationModel"])
         .then((v) => [v.simulModel ?? "", v.conversationModel ?? ""].join(" / "))`
    ),
    `${SIMUL_NEXT} / `
  );
  await options.eval(`document.getElementById("simulModel").scrollIntoView({ block: "center" }); true`);
  await shot(picker, options, "04-model-picked.png");

  // ------------------------------------------------------------- the opt-out
  const optOut = step(
    "Turning the switch off stops the request and forgets the answer",
    "Both halves matter. Leaving a cached block behind would mean a user who opted out of the file stayed blocked by the last thing it said, with nothing left that could ever lift it — the one way this feature could strand somebody for good."
  );
  await seed(panel, { blockBelowVersion: IMPOSSIBLE, learnMoreUrl: LEARN_MORE });
  check(optOut, "there is something cached to forget", await panel.eval(CACHED), 1);

  await options.reload();
  await options.waitFor(`document.getElementById("configUpdates") !== null`);
  check(optOut, "the switch is on to begin with", await options.eval(`document.getElementById("configUpdates").checked`), true);
  await options.eval(`document.getElementById("configUpdates").click()`);
  check(
    optOut,
    "and off once clicked",
    await options.waitFor(`chrome.storage.local.get("configUpdates").then((v) => v.configUpdates === false)`),
    true
  );
  // The menu above is that file's, so switching it off has to collapse it in
  // front of the person who switched it off — and say what became of the choice
  // they had made, rather than showing a name that will not be run.
  check(optOut, "the model menu collapses to the name this build shipped with", await options.eval(MENU("simulModel")), [
    fill("optModelAuto", SIMUL_MODEL),
    SIMUL_MODEL,
  ]);
  check(optOut, "and says what happened to the choice", await options.eval(`document.getElementById("modelStatus").textContent`), fill("optModelReverted", SIMUL_NEXT));
  // Eight sections down the page, so the picture has to be told where to look.
  await options.eval(`document.getElementById("configUpdates").scrollIntoView({ block: "center" }); true`);
  await shot(optOut, options, "05-options-off.png");

  await panel.reload();
  await panel.waitFor(`document.getElementById("toggle") !== null`);
  check(optOut, "the worker now has no opinion", await panel.eval(VERDICT), {
    ok: true,
    blocked: false,
    learnMoreUrl: null,
  });
  check(optOut, "the cached copy is gone", await panel.eval(CACHED), 0);
  notice = await panel.eval(NOTICE);
  check(optOut, "so the notice is not shown", notice.hidden, true);
  check(optOut, "and Start works again", notice.startDisabled, false);
  await shot(optOut, panel, "06-opted-out.png");

  writeReport({ chrome: chrome.version, uiLanguage, locale: catalogue.locale, extensionId });
} finally {
  await chrome.close({ keepOpen });
}

/** The run, as something to read — the same shape `onboarding.mjs` writes. */
function writeReport({ chrome: version, uiLanguage, locale, extensionId }) {
  const total = steps.reduce((n, s) => n + s.checks.length, 0);
  const lines = [];
  lines.push("# The update notice, walked");
  lines.push("");
  lines.push(
    `Interpretab ${MANIFEST.version} · ${version} · headless · UI language ${uiLanguage} (\`_locales/${locale}\`) · ${new Date().toISOString()}`
  );
  lines.push("");
  lines.push(
    failures === 0
      ? `**${total} checks over ${steps.length} steps, all passing.**`
      : `**${failures} of ${total} checks failed, over ${steps.length} steps.**`
  );
  lines.push("");
  lines.push(
    "Written by `node tests/config-ui.mjs`, which installs the unpacked extension into a throwaway " +
      "Chrome profile over the DevTools Protocol and drives the three states of the update notice. No " +
      "key, no quota and no network: every state is seeded into the cache the way a successful fetch " +
      "would have left it, inside the TTL, so nothing is downloaded."
  );
  lines.push("");
  lines.push("| # | Step | Checks |");
  lines.push("| --- | --- | --- |");
  steps.forEach((s, i) => {
    const bad = s.checks.filter((c) => !c.pass).length;
    lines.push(`| ${i + 1} | ${s.title} | ${bad ? `❌ ${bad} failed` : `✅ ${s.checks.length}`} |`);
  });

  steps.forEach((s, i) => {
    lines.push("");
    lines.push(`## ${i + 1}. ${s.title}`);
    lines.push("");
    lines.push(s.what);
    lines.push("");
    lines.push("| | Check | Expected | Actual |");
    lines.push("| --- | --- | --- | --- |");
    for (const c of s.checks) {
      const cell = (v) => "`" + show(v).replaceAll("|", "\\|") + "`";
      lines.push(`| ${c.pass ? "✅" : "❌"} | ${c.what} | ${cell(c.expected)} | ${cell(c.actual)} |`);
    }
    if (s.shot) {
      lines.push("");
      lines.push(`![${s.title}](${s.shot})`);
    }
  });
  lines.push("");
  lines.push(`<!-- extension id in this run: ${extensionId} -->`);

  const file = path.join(OUT, "report.md");
  fs.writeFileSync(file, lines.join("\n") + "\n");
  console.log(
    `\n${failures ? `${failures} of ${total} checks FAILED` : `${total} checks passed`} — ${path.relative(ROOT, file)}`
  );
}

process.exit(failures === 0 ? 0 : 1);
