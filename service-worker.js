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
const PANEL_URL = "sidepanel.html";

/**
 * The glyph each direction puts in front of the translating tab's title.
 *
 * A speech balloon for the tab being interpreted, a red dot for the microphone
 * being recorded — the two say different things, and a run with both says both.
 * `content/tab-marker.js` carries the same pair in the pattern it strips them
 * with; `tests/tab-marker.test.js` keeps the two in step.
 */
const TAB_MARKS = { tab: "💬", mic: "🔴" };

/**
 * The panel belongs to the tab it was opened on, not to the window.
 *
 * Chrome's default is the other one: a side panel with a `default_path` is
 * offered on every tab and, once opened, stays open across tab switches — so
 * the controls for a translation of *this* tab follow the user onto their mail
 * and their calendar. Disabling the global default and enabling the panel per
 * tab in the click handler below turns it into what it is: a thing attached to
 * a page. The toolbar icon still summons it anywhere, which is what keeps Stop
 * reachable from a tab that was never translating.
 *
 * Run at module scope, so it is re-applied on every wake of this worker rather
 * than trusted to survive in whatever Chrome persists. It is idempotent, and a
 * per-tab enable set by an earlier click wins over it.
 */
chrome.sidePanel.setOptions({ enabled: false }).catch(() => {});

// The action click is what grants `activeTab` on the current tab, and
// `tabCapture` is gated on exactly that grant. Opening the side panel has to
// happen inside the click handler too — `sidePanel.open()` requires a user
// gesture and a message from the panel is not one.
chrome.action.onClicked.addListener((tab) => {
  // Nothing may be awaited before `open()`. A service worker's user gesture is
  // not the page's transient activation — it lasts for the synchronous run of
  // this listener and no longer — so the first `await` here spends it and the
  // click stops opening anything at all. That is exactly what an awaited
  // `setOptions` in front of it did.
  //
  // The enable still has to come first, because with the global default off
  // this tab has no panel to open yet. So it is issued and not awaited: both
  // calls leave this worker in the order they are written and the browser
  // handles them in that order, which is enough for `open` to find a panel.
  chrome.sidePanel
    .setOptions({ tabId: tab.id, path: PANEL_URL, enabled: true })
    .catch((err) => console.warn("Could not enable the side panel here:", err));
  chrome.sidePanel.open({ tabId: tab.id }).catch((err) => {
    console.warn("Could not open the side panel:", err);
  });
  onIconClick(tab.id).catch((err) => console.warn("Icon click:", err));
});

async function onIconClick(tabId) {
  // Remember which tab the user invoked us on. The side panel's Start button
  // needs a target tab, and by then the active tab may well be a different one
  // — the user clicks through to the panel, or switches away while it loads.
  await chrome.storage.session.set({ invokedTabId: tabId });
  await remarkTab(tabId);
  await adoptCaptionTab(tabId);
}

/**
 * Move a running session's subtitles onto the tab just clicked.
 *
 * Subtitles that had nowhere to go — started from a new tab, or from a page that
 * has since navigated — used to need a Stop and a Start to come back, which is a
 * reconnect and a gap in the translation to fix something that is only drawing.
 * The click that grants `activeTab` is the whole of what was missing, so it is
 * also the whole of the fix: from the user's side, click the icon on the page
 * they want subtitles on and they appear there.
 *
 * A click is not always a request to move them, though — the icon is also how
 * the side panel is reopened. So subtitles that are working stay where they are
 * unless the clicked tab can actually take them, and a refusal is swallowed
 * rather than replacing "they are on that page over there" with a failure.
 */
async function adoptCaptionTab(tabId) {
  const { running, captionTabId, captionStatus } = await chrome.storage.session.get([
    "running",
    "captionTabId",
    "captionStatus",
  ]);
  if (!running || !wantsCaptions(await loadSettings())) return;
  const working = captionStatus === "ok";
  if (working && tabId === captionTabId) return;
  if (!(await injectCaptions(tabId, !working))) return;
  // Whatever was on the old page stops there rather than sitting in the corner
  // of it for the rest of the session, frozen on the last line it received.
  if (captionTabId != null && captionTabId !== tabId) {
    await chrome.tabs
      .sendMessage(captionTabId, { target: "captions", type: "teardown" })
      .catch(() => {});
  }
  await chrome.storage.session.set({ captionTabId: tabId });
}

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

/**
 * Everything the side panel cannot remember for itself.
 *
 * Now that the panel is scoped to one tab, its document is destroyed on every
 * tab switch and rebuilt on the way back — several times in a session that used
 * to build it once. So the transcript and the subtitle note cannot only be
 * broadcast, they have to be fetchable: the transcript from the offscreen
 * document, which lives for the whole run, and the note from session storage,
 * where it is already kept for deduplication.
 */
async function getState() {
  const {
    running = false,
    capturedTabId = null,
    captionStatus = null,
  } = await chrome.storage.session.get(["running", "capturedTabId", "captionStatus"]);
  let lines = [];
  if (running && (await hasOffscreen())) {
    lines = (await toOffscreen({ type: "history" }).catch(() => null))?.lines || [];
  }
  return { running, capturedTabId, captionStatus, lines };
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
  await markTab(settings);
  await ensureCaptionTab(settings);
  return { capturedTabId: tabId };
}

/**
 * Say in the tab strip which tab this run belongs to.
 *
 * The captured tab if there is one; otherwise the tab the icon was clicked on,
 * which for a microphone-only run is where the side panel lives — the same tab
 * and the same reasoning as the subtitles, and the same `activeTab` grant is
 * what allows either.
 */
async function markTab(settings) {
  const { capturedTabId } = await chrome.storage.session.get("capturedTabId");
  const tabId = capturedTabId ?? (await targetTab().catch(() => null))?.id ?? null;
  if (tabId == null) return;
  const prefix =
    (settings.tabEnabled ? TAB_MARKS.tab : "") + (settings.micEnabled ? TAB_MARKS.mic : "") + " ";
  await chrome.storage.session.set({ markedTabId: tabId, tabMarkPrefix: prefix });
  await applyTabMark(tabId, prefix);
}

async function applyTabMark(tabId, prefix) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content/tab-marker.js"] });
    await chrome.tabs.sendMessage(tabId, { target: "tabMark", type: "mark", prefix });
  } catch (err) {
    // Refused by the same pages that refuse subtitles, and unlike the subtitles
    // it is not reported: this is a signpost rather than a feature, and the run
    // it points at is running whether or not the tab says so.
    console.warn("Could not mark the tab:", err.message);
  }
}

/**
 * Put the mark back on the click that grants the access to do it.
 *
 * A navigation takes the mark with the document it was written into, and the
 * `activeTab` grant that would let us write it again went with it. So the mark
 * is restored the way the subtitles are: by clicking the icon on that tab. Only
 * on that tab — the grant is per tab, and the mark belongs to the one being
 * translated rather than to whichever one was clicked last.
 */
async function remarkTab(tabId) {
  const { running, markedTabId, tabMarkPrefix } = await chrome.storage.session.get([
    "running",
    "markedTabId",
    "tabMarkPrefix",
  ]);
  if (!running || tabId !== markedTabId || !tabMarkPrefix) return;
  await applyTabMark(tabId, tabMarkPrefix);
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
    return reportCaptions("unavailable", "Open a website and click the toolbar icon there.");
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
  const { markedTabId } = await chrome.storage.session.get("markedTabId");
  if (markedTabId != null) {
    await chrome.tabs
      .sendMessage(markedTabId, { target: "tabMark", type: "teardown" })
      .catch(() => {});
  }
  await chrome.storage.session.set({
    running: false,
    capturedTabId: null,
    captionTabId: null,
    captionRetryAt: 0,
    captionStatus: null,
    markedTabId: null,
    tabMarkPrefix: null,
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

async function injectCaptions(tabId, reportFailure = true) {
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
    if (reportFailure) await reportCaptions("unavailable", explainInjection(err.message));
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
 * subtitles have nowhere to go until the user is somewhere else entirely, which
 * "click the toolbar icon on that page" would never tell them. Chrome says so in
 * a different string, which is the only signal available: the URL is withheld
 * here too.
 *
 * Both instructions are a click and nothing more, because a click is now enough
 * — see `adoptCaptionTab`.
 */
function explainInjection(message) {
  if (/chrome:\/\/ URL|chrome-untrusted|extensions gallery/i.test(message)) {
    return "Chrome's own pages can't take them. Open a website and click the toolbar icon there.";
  }
  if (!/cannot access|request permission|cannot be scripted/i.test(message)) return message;
  return "Click the toolbar icon on that page.";
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
