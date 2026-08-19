/**
 * Shared machinery for the scripts here that drive a real Chrome:
 * `onboarding.mjs` so far. Not part of `npm test` — it needs a Chrome binary on
 * the machine and a few seconds per run — and nothing in the extension imports
 * it.
 *
 * Three things are worth knowing before reading further.
 *
 * **The extension is installed over the protocol, not the command line.**
 * `--load-extension` is ignored by current Chrome, so the unpacked directory
 * goes in through `Extensions.loadUnpacked`. That turns out to be the better
 * door anyway: the browser is already attached when the install happens, so
 * whatever `chrome.runtime.onInstalled` does is observable from the first
 * moment, which is the one thing a command-line load cannot offer.
 *
 * **There is no dependency.** Chrome speaks the DevTools Protocol over a
 * WebSocket, Node has had a `WebSocket` global for several releases now, and
 * the whole of what a UI test needs — make a tab, run an expression in it, take
 * a picture, set a permission — is four commands. A driver library would be
 * more machinery than the thing it drives.
 *
 * **Every run is a new profile.** A temporary `--user-data-dir`, deleted on the
 * way out. That is what makes the install-time behaviour testable more than
 * once, and it keeps the tests away from the browser the user is signed in to:
 * nothing here touches a real profile, a real key, or a real quota.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

/** Where Chrome is, overridable for a Canary or a non-mac layout. */
export const CHROME_PATH =
  process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** How long any `waitFor` waits before it calls the thing it wanted absent. */
const TIMEOUT_MS = 15000;

/**
 * A Chrome process and the one WebSocket that drives all of it.
 *
 * Sessions are flat: attaching to a target returns a session id that goes in
 * the envelope of every later command, so pages, workers and the browser itself
 * share a single connection and a single id sequence.
 */
export class Chrome {
  #ws;
  #next = 0;
  #pending = new Map();
  #child;
  #profile;

  static async launch({ headed = false } = {}) {
    const chrome = new Chrome();
    chrome.#profile = fs.mkdtempSync(path.join(os.tmpdir(), "interpretab-ui-"));
    chrome.#child = spawn(
      CHROME_PATH,
      [
        `--user-data-dir=${chrome.#profile}`,
        // 0 asks for a free port, which Chrome then writes into the profile.
        // A fixed one would collide with whatever the last run left behind.
        "--remote-debugging-port=0",
        "--no-first-run",
        "--no-default-browser-check",
        // Nothing here signs in, and the sign-in machinery is a second source
        // of tabs and dialogs in a test that counts tabs.
        "--disable-sync",
        ...(headed ? [] : ["--headless=new"]),
        "about:blank",
      ],
      { stdio: "ignore" }
    );

    const portFile = path.join(chrome.#profile, "DevToolsActivePort");
    const deadline = Date.now() + TIMEOUT_MS;
    let lines = null;
    while (Date.now() < deadline) {
      // The file is written in two parts and read whole, so a read can catch it
      // with the port in and the path not yet.
      const text = fs.existsSync(portFile) ? fs.readFileSync(portFile, "utf8") : "";
      lines = text.trim().split("\n");
      if (lines.length === 2) break;
      await sleep(100);
    }
    if (!lines || lines.length !== 2) throw new Error(`Chrome did not start: no ${portFile}`);

    chrome.port = Number(lines[0]);
    const version = await (await fetch(`http://127.0.0.1:${chrome.port}/json/version`)).json();
    chrome.version = version.Browser;
    chrome.#ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      chrome.#ws.onopen = resolve;
      chrome.#ws.onerror = () => reject(new Error("could not attach to Chrome"));
    });
    chrome.#ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      const settle = chrome.#pending.get(message.id);
      if (!settle) return; // an event, and nothing here subscribes to events
      chrome.#pending.delete(message.id);
      settle(message);
    };
    return chrome;
  }

  /** One command. Rejects on a protocol error rather than returning one. */
  async send(method, params = {}, sessionId) {
    const id = ++this.#next;
    const reply = await new Promise((resolve) => {
      this.#pending.set(id, resolve);
      this.#ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
    if (reply.error) throw new Error(`${method}: ${reply.error.message}`);
    return reply.result;
  }

  /**
   * Install the unpacked extension, as "Load unpacked" would.
   *
   * Returns the id, which is also the origin every later command needs. The
   * install fires `chrome.runtime.onInstalled` with reason `install`, so
   * anything the extension does on a first run has already started by the time
   * this resolves.
   */
  async loadExtension(dir) {
    const { id } = await this.send("Extensions.loadUnpacked", { path: dir });
    return id;
  }

  async targets() {
    const { targetInfos } = await this.send("Target.getTargets");
    return targetInfos;
  }

  /** The first target whose url contains *fragment*, waited for. */
  async waitForTarget(fragment, { timeout = TIMEOUT_MS } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const found = (await this.targets()).find((t) => t.url.includes(fragment));
      if (found) return found;
      await sleep(150);
    }
    return null;
  }

  /** Every open target whose url contains *fragment*. */
  async targetsMatching(fragment) {
    return (await this.targets()).filter((t) => t.url.includes(fragment));
  }

  /** Close all of them, for a step that needs the page it wants to be new. */
  async closeTargets(fragment) {
    for (const target of await this.targetsMatching(fragment)) {
      await this.send("Target.closeTarget", { targetId: target.targetId });
    }
  }

  async newPage(url, viewport) {
    const { targetId } = await this.send("Target.createTarget", { url });
    return this.attach({ targetId }, viewport);
  }

  async attach(target, viewport) {
    const { sessionId } = await this.send("Target.attachToTarget", {
      targetId: target.targetId,
      flatten: true,
    });
    const page = new Page(this, sessionId, target.targetId);
    await this.send("Page.enable", {}, sessionId);
    await this.send("Runtime.enable", {}, sessionId);
    if (viewport) await page.setViewport(viewport);
    await page.ready();
    return page;
  }

  /**
   * Chrome's microphone permission for *origin*, without a prompt.
   *
   * The prompt is the thing under test elsewhere and cannot be clicked from
   * here, so the two states either side of it are set directly. `granted` is
   * what the Grant button on the Options page would leave behind, and reset
   * puts it back to `prompt` — which is a state a real user can also reach, via
   * the site settings for the extension.
   */
  grantMic(origin) {
    return this.send("Browser.grantPermissions", { origin, permissions: ["audioCapture"] });
  }

  resetPermissions() {
    return this.send("Browser.resetPermissions");
  }

  async close({ keepOpen = false } = {}) {
    if (keepOpen) return;
    try {
      await this.send("Browser.close");
    } catch {
      this.#child.kill();
    }
    this.#ws.close();
    // Chrome writes on its way out; give it a moment before the directory goes.
    await sleep(300);
    fs.rmSync(this.#profile, { recursive: true, force: true });
  }
}

/** One attached target: a tab, in every use here. */
class Page {
  constructor(chrome, sessionId, targetId) {
    this.chrome = chrome;
    this.sessionId = sessionId;
    this.targetId = targetId;
  }

  /**
   * Run *expression* in the page and bring the value back.
   *
   * Promises are awaited, so an expression can be a `chrome.storage` call. An
   * exception comes back as a string rather than throwing: half of what this is
   * used for is asking a page a question it may not be able to answer yet, and
   * the caller polling on the answer reads better than the caller catching.
   */
  async eval(expression) {
    const result = await this.chrome.send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      this.sessionId
    );
    if (result.exceptionDetails) {
      return `[error] ${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`;
    }
    return result.result?.value;
  }

  /**
   * Poll a boolean *expression* until it holds. Returns whether it ever did.
   *
   * Strictly `true`, so that the `[error]` string `eval` returns while a page
   * is still building — every id in these expressions is null for a moment
   * after a reload — is waited through rather than read as a result.
   */
  async waitFor(expression, { timeout = TIMEOUT_MS } = {}) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if ((await this.eval(expression)) === true) return true;
      await sleep(100);
    }
    return false;
  }

  /**
   * Wait until the document is parsed and localized.
   *
   * Every page in this extension ships with empty elements and fills them in
   * `init`, so `readyState` alone would let a screenshot catch a blank page.
   * The title is filled by `localize()`, which is the first thing every `init`
   * here does, and is therefore the cheapest sign that one has started.
   */
  ready() {
    return this.waitFor(`document.readyState === 'complete' && document.title.length > 0`);
  }

  /** The permission state the page itself sees, which is what the panel reads. */
  micPermission() {
    return this.eval(`navigator.permissions.query({name:'microphone'}).then(s => s.state)`);
  }

  setViewport({ width, height }) {
    return this.chrome.send(
      "Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 1, mobile: false },
      this.sessionId
    );
  }

  async reload() {
    await this.chrome.send("Page.reload", {}, this.sessionId);
    await this.ready();
  }

  async screenshot(file) {
    const { data } = await this.chrome.send("Page.captureScreenshot", { format: "png" }, this.sessionId);
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    return file;
  }

  close() {
    return this.chrome.send("Target.closeTarget", { targetId: this.targetId });
  }
}

/**
 * The catalogue Chrome is actually rendering from.
 *
 * The assertions compare what is on screen against the message on disk, so they
 * have to read the same locale the browser picked — otherwise a machine set to
 * Japanese fails an English test on a page that is perfectly correct. Chrome's
 * `en-US` is this directory's `en`, and its `zh-CN` is `zh_CN`.
 */
export function catalogueFor(uiLanguage, root) {
  const tag = String(uiLanguage || "en").replace("-", "_");
  const candidates = [tag, tag.split("_")[0], "en"];
  for (const name of candidates) {
    const file = path.join(root, "_locales", name, "messages.json");
    if (fs.existsSync(file)) return { locale: name, messages: JSON.parse(fs.readFileSync(file, "utf8")) };
  }
  throw new Error(`no catalogue for ${uiLanguage}`);
}

/** A catalogue message as the DOM will read it: the markup alphabet removed. */
export function plainMessage(catalogue, key) {
  const message = catalogue.messages[key]?.message;
  if (message === undefined) throw new Error(`no such message: ${key}`);
  return message.replace(/<(b|code|a[1-9])>([\s\S]*?)<\/\1>/g, "$2");
}
