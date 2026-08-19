/**
 * The first run, in a real Chrome, with a picture of every step.
 *
 *     node tests/onboarding.mjs [--headed] [--keep]
 *
 * What a new user meets before anything works is spread across four contexts —
 * the install, the panel's banner, the Options page it links to, and Chrome's
 * own permission — and `lib/next-step.js` is the only part of that a unit test
 * can reach. Everything else is browser behaviour: whether the install really
 * opens a tab, whether the link really lands on the right one of eight
 * sections, whether the banner really goes away when the permission arrives
 * from somewhere else. This walks all of it and writes the screenshots into
 * `tests/onboarding/`, so the result is something to look at rather than a
 * count of passing assertions.
 *
 * It costs nothing and needs no key: the key it types is the string
 * `not-a-real-key`, and nothing here opens a socket to the Live API.
 *
 * **Three things it cannot reproduce, and does not claim to.** The side panel
 * is browser UI, so the panel is opened as an ordinary tab — same document,
 * same script, in a frame the protocol can photograph. Chrome's permission
 * prompt cannot be clicked from the protocol, so the two states either side of
 * it are set directly, which is also why this says nothing about the finding
 * that the prompt cannot be raised from a panel at all. And there is no
 * microphone in a headless browser: the permission is granted, never used.
 */

import fs from "node:fs";
import path from "node:path";
import { Chrome, catalogueFor, plainMessage } from "./chrome-harness.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "tests", "onboarding");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

const headed = process.argv.includes("--headed");
const keepOpen = process.argv.includes("--keep");

/** As wide as the side panel opens, and as wide as the Options page is set. */
const PANEL_VIEW = { width: 400, height: 780 };
const OPTIONS_VIEW = { width: 860, height: 780 };

/** Everything in `#nextStep`, in the one shape all four banner steps are read in. */
const BANNER = `(() => {
  const note = document.getElementById("nextStep");
  return {
    hidden: note.hidden,
    text: note.textContent,
    bold: note.querySelectorAll("b").length,
    links: [...note.querySelectorAll("a")].map((a) => ({
      href: a.getAttribute("href"),
      action: a.dataset.action || "",
    })),
    startDisabled: document.getElementById("toggle").disabled,
  };
})()`;

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

const chrome = await Chrome.launch({ headed });
console.log(`${chrome.version} — Interpretab ${MANIFEST.version}`);

try {
  // ---------------------------------------------------------------- install
  const installing = step(
    "Installing the extension opens Options",
    "`chrome.runtime.onInstalled` with reason `install` calls `openOptionsPage()`, so the key has somewhere to be pasted before anything else is tried."
  );
  const extensionId = await chrome.loadExtension(ROOT);
  const origin = `chrome-extension://${extensionId}`;
  const installed = await chrome.waitForTarget("options.html");
  check(installing, "an Options tab opens by itself", !!installed, true);
  if (!installed) throw new Error("nothing to walk: the install opened no page");
  check(installing, "it belongs to this extension", installed.url, `${origin}/options.html`);
  const options = await chrome.attach(installed, OPTIONS_VIEW);
  await shot(installing, options, "01-install-options.png");

  // The permission a real first run starts from. A fresh profile is already
  // here, but saying so is cheaper than depending on it.
  await chrome.resetPermissions();

  // ------------------------------------------------------------------- key
  const forKey = step(
    "The panel asks for the key first",
    "With nothing configured, the panel names the one thing that has to happen before any other step matters, and links to both halves of it."
  );
  const panel = await chrome.newPage(`${origin}/sidepanel.html`, PANEL_VIEW);
  const uiLanguage = await panel.eval(`chrome.i18n.getUILanguage()`);
  const catalogue = catalogueFor(uiLanguage, ROOT);
  const message = (key) => plainMessage(catalogue, key);
  console.log(`   (Chrome's UI language is ${uiLanguage}; reading _locales/${catalogue.locale})`);

  await panel.waitFor(`document.getElementById("nextStep").hidden === false`);
  let banner = await panel.eval(BANNER);
  check(forKey, "the banner is the key step", banner.text, message("panelStepKey"));
  check(forKey, "it links to AI Studio and to Options", banner.links, [
    { href: "https://aistudio.google.com/apikey", action: "" },
    { href: "#", action: "options" },
  ]);
  check(forKey, "Start is disabled", banner.startDisabled, true);
  await shot(forKey, panel, "02-step-key.png");

  // ------------------------------------------------------------- direction
  const forDirection = step(
    "With a key and nothing switched on, it asks for a direction",
    "The second precondition. Start is disabled here for the same reason, and the sentence says which two switches undo it."
  );
  await panel.eval(
    `chrome.storage.local.set({ apiKey: "not-a-real-key", tabEnabled: false, micEnabled: false })`
  );
  await panel.reload();
  await panel.waitFor(`document.getElementById("nextStep").hidden === false`);
  banner = await panel.eval(BANNER);
  check(forDirection, "the banner is the direction step", banner.text, message("panelStepDirection"));
  check(forDirection, "it names both switches in bold", banner.bold, 2);
  check(forDirection, "it has no links", banner.links, []);
  check(forDirection, "Start is disabled", banner.startDisabled, true);
  await shot(forDirection, panel, "03-step-direction.png");

  // ------------------------------------------------------------------- mic
  const forMic = step(
    "Switching the microphone on asks for Chrome's permission",
    "The third precondition, and the only one the panel cannot resolve itself: Chrome will not raise its prompt in a side panel, so the banner links to the Options page instead."
  );
  await panel.eval(`chrome.storage.local.set({ micEnabled: true })`);
  await panel.reload();
  await panel.waitFor(`document.getElementById("nextStep").hidden === false`);
  banner = await panel.eval(BANNER);
  check(forMic, "Chrome has not granted the microphone", await panel.micPermission(), "prompt");
  check(forMic, "the banner is the microphone step", banner.text, message("panelStepMic"));
  check(forMic, "its link goes to the Options microphone section", banner.links, [
    { href: "#", action: "optionsMic" },
  ]);
  // The banner is advice, not a block: a run with the tab direction alone would
  // work, and stopping Start over a direction the user can still switch off
  // would be the panel refusing to do a thing it can do.
  check(forMic, "Start is not disabled by it", banner.startDisabled, false);
  await shot(forMic, panel, "04-step-mic.png");

  // --------------------------------------------- the link, into a new page
  const intoOptions = step(
    "The link lands on the microphone section, not the top of the page",
    "`openOptionsPage()` takes no fragment, so the panel leaves the destination in session storage and the Options page reads it. Eight sections down, the difference is the whole point."
  );
  await chrome.closeTargets("options.html");
  await panel.eval(`document.querySelector("#nextStep a").click()`);
  const opened = await chrome.waitForTarget("options.html");
  check(intoOptions, "an Options page opens", !!opened, true);
  const fresh = await chrome.attach(opened, OPTIONS_VIEW);
  check(
    intoOptions,
    "the allow button has the focus",
    await fresh.waitFor(`document.activeElement?.id === "grantMic"`),
    true
  );
  check(
    intoOptions,
    "the Microphone heading is at the top of the viewport",
    await fresh.eval(`Math.round(document.getElementById("micHeading").getBoundingClientRect().top) <= 2`),
    true
  );
  check(
    intoOptions,
    "the request is consumed, not left for the next visit",
    await fresh.eval(`chrome.storage.session.get("optionsFocus").then((v) => JSON.stringify(v))`),
    "{}"
  );
  await shot(intoOptions, fresh, "05-options-mic.png");

  // ------------------------------------------- the link, into an open page
  const intoOpenOptions = step(
    "It lands there too when Options is already open",
    "`openOptionsPage()` focuses an existing tab rather than loading one, and after the install-time open that tab is exactly what is already there — so the page has to take the request as a storage change as well as on load."
  );
  await fresh.eval(`window.scrollTo(0, 0); document.activeElement?.blur(); true`);
  check(intoOpenOptions, "the page starts back at the top", await fresh.eval(`window.scrollY`), 0);
  await panel.eval(`document.querySelector("#nextStep a").click()`);
  check(
    intoOpenOptions,
    "the allow button takes the focus again",
    await fresh.waitFor(`document.activeElement?.id === "grantMic"`),
    true
  );
  check(
    intoOpenOptions,
    "the Microphone heading is at the top of the viewport",
    await fresh.eval(`Math.round(document.getElementById("micHeading").getBoundingClientRect().top) <= 2`),
    true
  );
  check(
    intoOpenOptions,
    "no second Options tab was opened",
    (await chrome.targetsMatching("options.html")).length,
    1
  );
  check(
    intoOpenOptions,
    "the request is consumed here too",
    await fresh.eval(`chrome.storage.session.get("optionsFocus").then((v) => JSON.stringify(v))`),
    "{}"
  );
  await shot(intoOpenOptions, fresh, "06-options-mic-again.png");

  // ----------------------------------------------------------- the grant
  const granting = step(
    "Granting the permission clears the banner where the user is not looking",
    "The grant happens on the Options page and the banner is in the panel. The panel subscribes to the permission rather than re-reading it on open, so this is the step that would silently rot."
  );
  await chrome.grantMic(origin);
  check(
    granting,
    "the banner goes away without a reload",
    await panel.waitFor(`document.getElementById("nextStep").hidden === true`),
    true
  );
  check(granting, "the panel sees the grant", await panel.micPermission(), "granted");
  banner = await panel.eval(BANNER);
  check(granting, "Start is available", banner.startDisabled, false);
  await shot(granting, panel, "07-ready.png");

  // ---------------------------------------------------------- and back
  const revoking = step(
    "Taking it away brings the banner back",
    "The same subscription, in the direction a user reaches through Chrome's site settings. Without this the panel would tell someone who has revoked the permission that they are ready to start."
  );
  await chrome.resetPermissions();
  check(
    revoking,
    "the banner returns without a reload",
    await panel.waitFor(`document.getElementById("nextStep").hidden === false`),
    true
  );
  banner = await panel.eval(BANNER);
  check(revoking, "and it is the microphone step again", banner.text, message("panelStepMic"));
  await shot(revoking, panel, "08-permission-revoked.png");

  writeReport({ chrome: chrome.version, uiLanguage, locale: catalogue.locale, extensionId });
} finally {
  await chrome.close({ keepOpen });
}

/**
 * The run, as something to read.
 *
 * Markdown with the screenshots inline: the assertions say the banner was the
 * microphone step, and the picture underneath says what that looks like at the
 * width it will be seen at. The soaks in this directory write a `.report` next
 * to themselves for the same reason, and this is that with images.
 */
function writeReport({ chrome: version, uiLanguage, locale, extensionId }) {
  const total = steps.reduce((n, s) => n + s.checks.length, 0);
  const lines = [];
  lines.push("# Onboarding walkthrough");
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
    "Written by `node tests/onboarding.mjs`, which installs the unpacked extension into a throwaway " +
      "Chrome profile over the DevTools Protocol and walks a first run. The extension id below is that " +
      "profile's, not the store's. No key and no quota: the key it types is a placeholder and nothing " +
      "here reaches the Live API."
  );
  lines.push("");
  lines.push("| # | Step | Checks |");
  lines.push("| --- | --- | --- |");
  steps.forEach((s, i) => {
    const bad = s.checks.filter((c) => !c.pass).length;
    lines.push(`| ${i + 1} | ${s.title} | ${bad ? `❌ ${bad} failed` : `✅ ${s.checks.length}`} |`);
  });
  lines.push("");
  lines.push(
    "Not covered here: the real side panel, which is browser UI and is walked as a tab of the same " +
      "document; Chrome's permission prompt, which the protocol cannot click and whose two states are " +
      "therefore set directly; and any microphone, since a headless browser has none."
  );

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
