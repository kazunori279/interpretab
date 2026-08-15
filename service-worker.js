/**
 * Switchboard. Owns no audio and no socket.
 *
 * An MV3 service worker is torn down after ~30s idle and restarted on the next
 * event, so nothing here may hold state in a module variable across events —
 * `chrome.storage.session` is the only memory it has. Everything with a
 * lifetime (streams, AudioContexts, WebSockets) lives in the offscreen
 * document instead, whose lifetime is independent of this one.
 *
 * What this file does own is the two things only a service worker can do:
 * minting a tab-capture stream id, and creating the offscreen document.
 */

import { loadSettings, requireApiKey } from "./lib/settings.js";
import { ensureGlossary } from "./lib/glossary.js";

const OFFSCREEN_URL = "offscreen.html";

// The action click is what grants `activeTab` on the current tab, and
// `tabCapture` is gated on exactly that grant. Opening the side panel has to
// happen inside the click handler too — `sidePanel.open()` requires a user
// gesture and a message from the panel is not one.
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (err) {
    console.warn("Could not open the side panel:", err);
  }
  // Remember which tab the user invoked us on. The side panel's Start button
  // needs a target tab, and by then the active tab may well be a different one
  // — the user clicks through to the panel, or switches away while it loads.
  await chrome.storage.session.set({ invokedTabId: tab.id });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target !== "sw") return false;
  handle(msg, sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true; // keep the channel open for the async reply
});

async function handle(msg, sender) {
  switch (msg.type) {
    case "start":
      return start();
    case "stop":
      return stop();
    case "getState":
      return getState();
    case "caption":
      // Relayed from the offscreen document, which has no tab of its own.
      await sendToCaptions(msg.payload);
      return {};
    case "live":
      // Relayed to the offscreen document, which cannot read storage for
      // itself — see `applyLive` there.
      if (await hasOffscreen()) await toOffscreen({ type: "live", patch: msg.patch });
      return {};
    default:
      throw new Error(`Unknown message type: ${msg.type}`);
  }
}

async function getState() {
  const { running = false, capturedTabId = null } = await chrome.storage.session.get([
    "running",
    "capturedTabId",
  ]);
  return { running, capturedTabId };
}

async function targetTab() {
  const { invokedTabId } = await chrome.storage.session.get("invokedTabId");
  if (invokedTabId != null) {
    try {
      return await chrome.tabs.get(invokedTabId);
    } catch {
      // The tab closed since the icon was clicked; fall through to the active
      // one, which will simply fail the activeTab check with a clear message.
    }
  }
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!active) throw new Error("No tab to capture.");
  return active;
}

async function start() {
  const settings = await loadSettings();
  if (!settings.tabEnabled && !settings.micEnabled) {
    throw new Error("Enable at least one direction first.");
  }
  // Checked before anything is captured, so a missing key costs the user a
  // message rather than a tab-capture prompt followed by silence.
  const apiKey = requireApiKey(settings);

  let streamId = null;
  let tabId = null;
  if (settings.tabEnabled) {
    const tab = await targetTab();
    tabId = tab.id;
    try {
      streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
    } catch (err) {
      // The one failure users actually hit: the extension was never invoked on
      // this tab, or the invocation lapsed when the tab navigated.
      throw new Error(
        `Click the Interpretab toolbar icon on the tab you want to translate, ` +
          `then press Start again. (${err.message})`
      );
    }
  }

  const glossary = await ensureGlossary();

  await ensureOffscreen();
  const started = await toOffscreen({
    type: "start",
    apiKey,
    streamId,
    settings,
    glossary,
  });
  if (!started.ok) throw new Error(started.error);

  // captionStatus is cleared so this run re-announces it rather than being
  // deduplicated against whatever the last one ended on.
  await chrome.storage.session.set({ running: true, capturedTabId: tabId, captionStatus: null });
  await ensureCaptionTab(settings);
  return { capturedTabId: tabId };
}

/** Are subtitles wanted by either of the directions that are actually running? */
function wantsCaptions(settings) {
  return (
    (settings.tabEnabled && settings.tabCaptions) || (settings.micEnabled && settings.micCaptions)
  );
}

/**
 * Put the overlay on a page and remember which one, so the offscreen document's
 * transcripts have somewhere to go.
 *
 * The captured tab is the obvious target, but the microphone direction can run
 * on its own, with nothing captured. Its subtitles still have to land
 * somewhere, and the tab the toolbar icon was clicked on is both the sensible
 * choice and the only one `activeTab` lets us inject into.
 */
async function ensureCaptionTab(settings) {
  if (!wantsCaptions(settings)) return reportCaptions("off");
  const existing = (await chrome.storage.session.get("captionTabId")).captionTabId;
  if (existing != null) return;
  const { capturedTabId } = await chrome.storage.session.get("capturedTabId");
  const tabId = capturedTabId ?? (await targetTab().catch(() => null))?.id ?? null;
  if (tabId == null) {
    return reportCaptions(
      "unavailable",
      "No page to put them on. Open a website, click the Interpretab toolbar " +
        "icon there, and press Start again."
    );
  }
  await chrome.storage.session.set({ captionTabId: tabId });
  await injectCaptions(tabId);
}

/**
 * Tell the side panel whether subtitles are actually being delivered.
 *
 * Every way this path fails is silent by construction: injection is refused in
 * a `catch` that only reaches the service worker's own console, and a delivery
 * to a tab with no listener rejects with the same "Receiving end does not
 * exist" whether the overlay was never injected or has since been torn out.
 * Meanwhile the audio keeps translating and the side panel keeps filling, so
 * the extension looks entirely healthy while doing none of what the checkbox
 * says. Three separate causes hid behind that, one after another. Nothing is
 * allowed to fail invisibly here again.
 *
 * Deduplicated through session storage rather than a module variable, because
 * this worker is torn down between transcripts and would otherwise re-announce
 * the same state forever.
 */
async function reportCaptions(status, detail = "") {
  const line = detail ? `${status}: ${detail}` : status;
  const { captionStatus } = await chrome.storage.session.get("captionStatus");
  if (captionStatus === line) return;
  await chrome.storage.session.set({ captionStatus: line });
  chrome.runtime.sendMessage({ target: "ui", type: "captions", status, detail }).catch(() => {});
}

// Both subtitle switches apply mid-session — the offscreen document just stops
// forwarding — but turning one on when neither was on at Start means there is
// no overlay to forward to yet. A storage change wakes this worker, so the
// injection can happen then rather than costing a reconnect.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || (!changes.tabCaptions && !changes.micCaptions)) return;
  const { running } = await chrome.storage.session.get("running");
  if (running) await ensureCaptionTab(await loadSettings());
});

/**
 * Message the offscreen document, tolerating a document that exists but whose
 * module has not finished evaluating.
 *
 * `createDocument()` resolves once the document is created, which is a moment
 * earlier than its module script registering the message listener — and until
 * it does, `sendMessage` rejects with "Receiving end does not exist".
 */
async function toOffscreen(message, attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await chrome.runtime.sendMessage({ target: "offscreen", ...message });
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}

async function stop() {
  if (await hasOffscreen()) {
    await toOffscreen({ type: "stop" }).catch(() => {});
    await chrome.offscreen.closeDocument();
  }
  await sendToCaptions({ type: "teardown" }).catch(() => {});
  await chrome.storage.session.set({
    running: false,
    capturedTabId: null,
    captionTabId: null,
    captionRetryAt: 0,
    captionStatus: null,
  });
  return {};
}

async function hasOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
  });
  return contexts.length > 0;
}

async function ensureOffscreen() {
  if (await hasOffscreen()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    // USER_MEDIA covers both the tab stream and the microphone; AUDIO_PLAYBACK
    // covers the translated voice and the passthrough that makes the captured
    // tab audible again. Both reasons keep the document alive indefinitely,
    // which is the whole point of putting the engine there.
    reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"],
    justification:
      "Capture tab and microphone audio, stream it to the Gemini Live API, " +
      "and play the translated speech back.",
  });
}

async function injectCaptions(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/captions.js"],
    });
    await reportCaptions("ok");
    return true;
  } catch (err) {
    // Chrome's own pages, the Web Store, and PDF viewers refuse injection, and
    // so does any tab the toolbar icon was not clicked on. Captions are a
    // nicety — the side panel still shows the transcript — but which of those
    // it was is the user's business, so it goes on screen and not just here.
    console.warn("Captions unavailable on this page:", err.message);
    await reportCaptions("unavailable", explainInjection(err.message));
    return false;
  }
}

/**
 * Chrome's refusals, in words the user can act on.
 *
 * "Cannot access contents of the page. Extension manifest must request
 * permission to access the respective host." is what a missing `activeTab`
 * grant looks like, and read literally it asks the user to edit a manifest they
 * do not have. The grant is per tab and is dropped the moment that tab
 * navigates, so the common way to see this is entirely ordinary: click the
 * icon, press Start, follow a link. What the user has to do about it — click
 * the icon again — appears nowhere in the message.
 *
 * The same string also comes back for pages no click can ever unlock, so both
 * possibilities are named rather than guessed between: `chrome.tabs.get` cannot
 * tell them apart either, since the URL it would need is withheld by the very
 * permission that is missing.
 *
 * Chrome's own pages are the exception, and worth separating because the most
 * ordinary start there is: open a new tab, click the icon, press Start. That
 * run works — the microphone is translating and the panel is filling — and the
 * subtitles have nowhere to go, forever, no matter how many times the icon is
 * clicked. Chrome says so in a different string, which is the only signal
 * available: the URL is withheld here too.
 */
function explainInjection(message) {
  if (/chrome:\/\/ URL|chrome-untrusted|extensions gallery/i.test(message)) {
    return (
      "It is one of Chrome's own — a new tab, the settings, or the Web Store — " +
      "and they need an ordinary web page to draw on. Open any website, click " +
      "the Interpretab toolbar icon there, and press Start again. The translation " +
      "itself carries on either way, and the transcript is here in the panel."
    );
  }
  if (!/cannot access|request permission|cannot be scripted/i.test(message)) return message;
  return (
    "Click the Interpretab toolbar icon on that tab and press Start again — " +
    "Chrome only lets an extension draw on a page it was invoked on, and drops " +
    "that the moment the page navigates. Some pages never allow it: chrome:// " +
    "pages, the Web Store, and PDFs."
  );
}

// A page that refuses injection refuses every attempt, and transcripts arrive
// several times a second — so a failed delivery may only put the overlay back
// this often.
const REINJECT_INTERVAL_MS = 3000;

async function sendToCaptions(payload) {
  const { captionTabId } = await chrome.storage.session.get("captionTabId");
  if (captionTabId == null) return;
  const message = { target: "captions", ...payload };
  try {
    await chrome.tabs.sendMessage(captionTabId, message);
  } catch {
    // Nothing is listening on that tab. Mid-session the cause is almost always
    // that the page was reloaded or navigated, which takes the content script
    // with it while this worker goes on addressing the same tab id — quietly,
    // for the rest of the session, because the side panel transcript keeps
    // filling and nothing else looks wrong. Put the overlay back and deliver.
    //
    // A same-origin reload keeps the `activeTab` grant, so this usually works;
    // a cross-origin navigation revokes it and the injection below fails, which
    // is the honest answer — the user granted access to a page that is gone.
    if (!(await reinjectDue())) return;
    if (!(await injectCaptions(captionTabId))) return;
    try {
      await chrome.tabs.sendMessage(captionTabId, message);
    } catch (err) {
      // Injected, and still nothing listening. The overlay's own script threw
      // before it registered its listener — the one failure mode that leaves
      // no trace anywhere else at all.
      await reportCaptions("undelivered", err.message);
    }
  }
}

async function reinjectDue() {
  const { captionRetryAt = 0 } = await chrome.storage.session.get("captionRetryAt");
  const now = Date.now();
  if (now - captionRetryAt < REINJECT_INTERVAL_MS) return false;
  await chrome.storage.session.set({ captionRetryAt: now });
  return true;
}

// A captured tab that goes away takes its stream with it, and the offscreen
// document would sit there holding a dead MediaStream.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { capturedTabId, captionTabId } = await chrome.storage.session.get([
    "capturedTabId",
    "captionTabId",
  ]);
  // A microphone-only run outlives the page it was subtitling; forget the
  // overlay and keep going.
  if (tabId === captionTabId) await chrome.storage.session.set({ captionTabId: null });
  if (tabId === capturedTabId) await stop();
});
