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
 * It costs nothing and reaches no network. Every state is set by seeding the
 * cache the way a fetch would have, with a timestamp inside the TTL, so
 * `ensureConfig` answers from storage and never opens a socket. The key it types
 * is `not-a-real-key` and nothing here presses Start.
 *
 * As in `onboarding.mjs`, the side panel is opened as an ordinary tab: it is the
 * same document and the same script, in a frame the protocol can photograph.
 */

import fs from "node:fs";
import path from "node:path";
import { Chrome, catalogueFor, plainMessage } from "./chrome-harness.mjs";

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
  console.log(`   (Chrome's UI language is ${uiLanguage}; reading _locales/${catalogue.locale})`);

  // A configured extension, so that the only thing left able to disable Start
  // is the notice itself. Nothing here presses it.
  await panel.eval(
    `chrome.storage.local.set({ apiKey: "not-a-real-key", tabEnabled: true, micEnabled: false })`
  );

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

  // ------------------------------------------------------------- the opt-out
  const optOut = step(
    "Turning the switch off stops the request and forgets the answer",
    "Both halves matter. Leaving a cached block behind would mean a user who opted out of the file stayed blocked by the last thing it said, with nothing left that could ever lift it — the one way this feature could strand somebody for good."
  );
  await seed(panel, { blockBelowVersion: IMPOSSIBLE, learnMoreUrl: LEARN_MORE });
  check(optOut, "there is something cached to forget", await panel.eval(CACHED), 1);

  const options = await chrome.newPage(`${origin}/options.html`, OPTIONS_VIEW);
  await options.waitFor(`document.getElementById("configUpdates") !== null`);
  check(optOut, "the switch is on to begin with", await options.eval(`document.getElementById("configUpdates").checked`), true);
  await options.eval(`document.getElementById("configUpdates").click()`);
  check(
    optOut,
    "and off once clicked",
    await options.waitFor(`chrome.storage.local.get("configUpdates").then((v) => v.configUpdates === false)`),
    true
  );
  // Eight sections down the page, so the picture has to be told where to look.
  await options.eval(`document.getElementById("configUpdates").scrollIntoView({ block: "center" }); true`);
  await shot(optOut, options, "04-options-off.png");

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
  await shot(optOut, panel, "05-opted-out.png");

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
