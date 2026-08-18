/**
 * Side panel: controls and the running transcript.
 *
 * It holds no audio and no socket, so closing it does not stop a capture — it
 * reads the current state from the service worker on open and then follows the
 * offscreen document's broadcasts. Every control writes straight to
 * `chrome.storage.local`, which is what the service worker reads when Start is
 * pressed, so the panel never has to hand its state over.
 */

import { LIVE_KEYS } from "./lib/live-session.js";
import { DEFAULTS, loadSettings, saveSettings } from "./lib/settings.js";
import { formatCost, formatDuration } from "./lib/usage.js";
import {
  agentLanguageCode,
  LANGUAGES,
  POPULAR_LANGUAGES,
  SIMUL_LANGUAGES,
  SIMUL_POPULAR_LANGUAGES,
  simulLanguageCode,
} from "./lib/languages.js";

const AGENT_LANGUAGES = { langs: LANGUAGES, popular: POPULAR_LANGUAGES };
const SIMUL = { langs: SIMUL_LANGUAGES, popular: SIMUL_POPULAR_LANGUAGES };

const el = (id) => document.getElementById(id);

/**
 * Everything that would edit a run, for the panels that are not the run's.
 *
 * There is one engine and one run, and the settings behind these controls are
 * global — so a checkbox pressed on a tab that is not the running one would
 * silently reconfigure and reconnect a translation the user is not looking at.
 * The Stop button is deliberately not in this list: stopping from any tab is
 * what the toolbar icon is for.
 */
const RUN_CONTROLS = [
  "tabEnabled",
  "tabCaptions",
  "tabTarget",
  "duckLevel",
  "micEnabled",
  "micCaptions",
  "micMode",
  "micSource",
  "micTarget",
];

let settings = { ...DEFAULTS };
let running = false;
// The last token tally the offscreen document sent, per direction and in total,
// or null before the first one. Kept so a redraw for any other reason does not
// wipe it, and so `render` knows the live figure has taken over from the static
// cost warning.
let usage = null;
// The bubble currently being appended to, per direction and side, so streamed
// increments extend a line instead of starting a new one.
const openLines = new Map();
/**
 * The tab this panel belongs to, and the tab the current run belongs to.
 *
 * They are usually the same one and the panel is then an ordinary control
 * panel. When they differ, this panel is a bystander: the run is somebody
 * else's page, and all it may do is show it and stop it.
 *
 * Asked for once, on the way in. The panel is scoped to its tab — Chrome
 * destroys this document when the user switches away and builds a fresh one on
 * the way back — so the active tab at init is always this panel's own, and a
 * tab id does not change under a navigation.
 */
let myTabId = null;
let runTabId = null;
let runTabTitle = "";

init();

async function init() {
  settings = await loadSettings();
  myTabId = (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id ?? null;
  await populateLanguages();
  bind();
  render();
  const state = await send({ type: "getState" });
  running = !!state?.running;
  restore(state);
  render();
}

/**
 * Redraw what arrived while this panel did not exist.
 *
 * Opening the panel is no longer a once-per-session event: it belongs to the
 * tab it was opened on, so every switch to another tab destroys this document
 * and every switch back builds a fresh one. The two things that were otherwise
 * only ever broadcast come back with the running state — the transcript from
 * the offscreen document, the subtitle warning from session storage — and the
 * lines still being streamed into are adopted as open, so the next increment of
 * a half-finished sentence extends it instead of printing it again underneath.
 */
function restore(state) {
  runTabId = state?.runTabId ?? null;
  runTabTitle = state?.runTabTitle || "";
  // Why the last run ended by itself, for a panel that was not there to be told
  // — it is kept in session storage until the next Start for exactly this.
  if (state?.lastError) showError(state.lastError);
  for (const line of state?.lines || []) {
    const node = appendLine(line);
    if (line.open) openLines.set(`${line.direction}:${line.side}`, node);
  }
  el("transcript").scrollTop = el("transcript").scrollHeight;
  if (state?.usage) {
    usage = state.usage;
    renderUsage();
  }
  // One string, `${status}: ${detail}`, the shape the service worker
  // deduplicates on.
  const stored = state?.captionStatus;
  if (!stored) return;
  const at = stored.indexOf(": ");
  if (at < 0) onCaptionStatus({ status: stored, detail: "" });
  else onCaptionStatus({ status: stored.slice(0, at), detail: stored.slice(at + 2) });
}

/** The lists are bundled, so the dropdowns fill before the first paint. */
async function populateLanguages() {
  await fillTabTarget();
  await fillMicTarget();
  // Only conversation mode reads it, and conversation mode is the agent model.
  fill(el("micSource"), AGENT_LANGUAGES, settings.micSource);
}

/**
 * The tab target is a simultaneous-translation code, which for a few languages
 * is not the code the agent model uses. Map before filling so a stored `zh`
 * lands on Chinese rather than silently resetting to the top of the list.
 */
async function fillTabTarget() {
  let code = settings.tabTarget;
  if (!(code in SIMUL_LANGUAGES)) code = simulLanguageCode(code);
  fill(el("tabTarget"), SIMUL, code);
  if (el("tabTarget").value !== settings.tabTarget) {
    settings.tabTarget = el("tabTarget").value;
    await saveSettings({ tabTarget: settings.tabTarget });
  }
}

/**
 * The same problem as `fillTabTarget`, except the microphone changes code space
 * under the user: its two modes run different models, and the two models name a
 * handful of languages differently — `zh` against `zh-Hans`, `pt` against
 * `pt-BR`, `iw` against `he`. One stored `micTarget` serves both, so it is
 * translated into whichever space the current mode needs and written back, on
 * load and on every mode change.
 *
 * A language one model has and the other does not — Welsh in conversation mode,
 * Javanese in simultaneous — has nowhere to land and falls back to the top of
 * the list, which is at least visible in the dropdown rather than a target the
 * server would reject at connect.
 */
async function fillMicTarget() {
  const simul = settings.micMode !== "conversation";
  const table = simul ? SIMUL : AGENT_LANGUAGES;
  let code = settings.micTarget;
  if (!(code in table.langs)) code = simul ? simulLanguageCode(code) : agentLanguageCode(code);
  fill(el("micTarget"), table, code);
  if (el("micTarget").value !== settings.micTarget) {
    settings.micTarget = el("micTarget").value;
    await saveSettings({ micTarget: settings.micTarget });
  }
}

/**
 * Ten popular languages first, then all of them alphabetically — the same
 * shape the web app's custom dropdown uses, expressed as `<optgroup>`s so the
 * side panel can stay on a native select. The popular codes appear twice on
 * purpose, once in each group, exactly as they do in the web app.
 */
function fill(select, { langs, popular }, selected) {
  select.innerHTML = "";
  const codes = Object.keys(langs).sort((a, b) => langs[a].localeCompare(langs[b]));
  const top = popular.filter((code) => code in langs);
  if (top.length) {
    select.appendChild(optgroup("Popular", top, langs));
    select.appendChild(optgroup("All languages", codes, langs));
  } else {
    // A flat select reads better than one group holding everything.
    for (const code of codes) select.appendChild(option(code, langs[code]));
  }
  // Assigning `value` picks the first option with that code, which is the
  // popular copy where there is one; per-option `selected` would leave the
  // duplicate at the bottom of the list highlighted instead.
  select.value = codes.includes(selected) ? selected : top[0] || codes[0] || "";
}

function optgroup(label, codes, langs) {
  const group = document.createElement("optgroup");
  group.label = label;
  for (const code of codes) group.appendChild(option(code, langs[code]));
  return group;
}

function option(value, text) {
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = text;
  return opt;
}

function bind() {
  for (const [id, key] of [
    ["tabEnabled", "tabEnabled"],
    ["tabCaptions", "tabCaptions"],
    ["micCaptions", "micCaptions"],
  ]) {
    el(id).addEventListener("change", () => update({ [key]: el(id).checked }));
  }
  el("micEnabled").addEventListener("change", () => {
    const on = el("micEnabled").checked;
    update({ micEnabled: on, ...soundDefault(on, settings.micMode) });
  });
  for (const id of ["tabTarget", "micSource", "micTarget"]) {
    el(id).addEventListener("change", () => update({ [id]: el(id).value }));
  }
  el("micMode").addEventListener("change", async () => {
    // The two modes run different models with different language tables, so the
    // target list is rebuilt — and the stored code moved into the new space —
    // before `update` restarts the session with it.
    settings.micMode = el("micMode").value;
    await fillMicTarget();
    await update({
      micMode: settings.micMode,
      ...soundDefault(settings.micEnabled, settings.micMode),
    });
  });
  el("duckLevel").addEventListener("input", () => {
    // A live key, so the slider can be dragged while listening.
    update({ duckLevel: Number(el("duckLevel").value) / 100 });
  });
  el("toggle").addEventListener("click", onToggle);
  for (const [id, key] of [
    ["micMute", "micMuted"],
    ["soundMute", "soundMuted"],
  ]) {
    el(id).addEventListener("click", () => update({ [key]: !settings[key] }));
  }
  for (const id of ["openOptions", "keyNoteOptions"]) {
    el(id).addEventListener("click", (event) => {
      event.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }
}

/**
 * What the Sound button should be set to on the way into a microphone mode.
 *
 * The speakers mean opposite things in the two of them. Simultaneous cannot
 * gate the microphone while it talks — that is what simultaneous means — so its
 * own voice, played out loud, is heard again on the next frame and the
 * translation degrades from there. Two-way conversation is the other way round:
 * it is two people in one room sharing a microphone, and its whole point is
 * that both of them hear it.
 *
 * Applied when entering a mode, and never re-applied while the user stays in
 * it: this is a default, not a rule, and an unmute has to survive the next
 * checkbox. Switching the microphone off unmutes, because the reason for the
 * mute went with it — the tab direction's translation is nobody's echo.
 */
function soundDefault(micEnabled, micMode) {
  return { soundMuted: micEnabled && micMode !== "conversation" };
}

async function update(patch) {
  Object.assign(settings, patch);
  await saveSettings(patch);
  render();
  if (!running) return;
  // Languages, direction and mode are all baked into the setup frame, so a
  // change to any of them only takes effect on reconnect. Cutting the audio to
  // apply a checkbox would be worse than the checkbox, so the rest are handed
  // over as a message instead — the offscreen document has no access to
  // `chrome.storage` and cannot pick them up on its own.
  if (Object.keys(patch).every((key) => LIVE_KEYS.includes(key))) {
    await send({ type: "live", patch });
  } else {
    await restart();
  }
}

function render() {
  el("tabEnabled").checked = settings.tabEnabled;
  el("tabCaptions").checked = settings.tabCaptions;
  el("micEnabled").checked = settings.micEnabled;
  el("micCaptions").checked = settings.micCaptions;
  el("tabTarget").value = settings.tabTarget;
  el("micMode").value = settings.micMode;
  el("micSource").value = settings.micSource;
  el("micTarget").value = settings.micTarget;
  el("duckLevel").value = Math.round(settings.duckLevel * 100);
  el("duckLevelOut").textContent = `${Math.round(settings.duckLevel * 100)}%`;

  // Simultaneous detects the source, so naming one would be a control with
  // nothing behind it; conversation needs both halves of the pair.
  const micSimul = settings.micMode !== "conversation";
  el("micInto").hidden = !micSimul;
  el("micDetected").hidden = !micSimul;
  el("micNoteSimul").hidden = !micSimul;
  // The rest of that note is the headphones warning, which is true either way.
  el("micNoteSimulMuted").hidden = !settings.soundMuted;
  el("micSource").hidden = micSimul;
  el("micArrow").hidden = micSimul;
  el("micNoteConversation").hidden = micSimul;

  renderDirection("tabEnabled", settings.tabEnabled);
  renderDirection("micEnabled", settings.micEnabled);
  // The warning is an estimate of a doubling; once the tally is running it says
  // the same thing in dollars, and both at once is one sentence too many.
  el("costNote").hidden = !(settings.tabEnabled && settings.micEnabled) || !!usage;

  const hasKey = !!(settings.apiKey || "").trim();
  el("keyNote").hidden = hasKey;

  // One engine, one run, one tab. This panel is on a different tab from the
  // run when the user has switched away and clicked the icon somewhere else —
  // or when the run's tab has since been closed, which leaves it owned by
  // nobody and every panel a bystander. Either way the controls here are wired
  // to global settings and would reach into that run, so they come off; the
  // note says where it is, and Stop stays.
  const elsewhere = running && runTabId !== myTabId;
  el("elsewhereNote").textContent = runTabTitle
    ? `Interpretab is running on “${runTabTitle}”, and it runs on one tab at a time. ` +
      `Its controls are on that tab — Stop works from here.`
    : `Interpretab is running on another tab, and it runs on one tab at a time. ` +
      `Its controls are on that tab — Stop works from here.`;
  el("elsewhereNote").hidden = !elsewhere;
  for (const id of RUN_CONTROLS) el(id).disabled = elsewhere;

  // Nothing to mute when the direction behind the button is switched off. The
  // sound button stops every translated voice there is, wherever it is being
  // played, so the only state that leaves it with nothing to do is both
  // directions off — which is also when Start itself is disabled.
  renderMute(
    "micMute",
    settings.micMuted,
    settings.micEnabled && !elsewhere,
    "the microphone",
    elsewhere ? "The run is on another tab." : "The microphone direction is off."
  );
  renderMute(
    "soundMute",
    settings.soundMuted,
    (settings.tabEnabled || settings.micEnabled) && !elsewhere,
    "the translated voice",
    elsewhere ? "The run is on another tab." : "Neither direction is on."
  );

  el("toggle").textContent = running ? "Stop" : "Start";
  el("toggle").classList.toggle("running", running);
  // Stop is the exception to the paragraph above: it is the whole reason the
  // icon opens this panel on a tab that was never translating.
  el("toggle").disabled = elsewhere
    ? false
    : (!settings.tabEnabled && !settings.micEnabled) || !hasKey;
  if (!running) setStatus("disconnected", "Idle");
}

/**
 * What this run has spent: how long, and how much, against a dial.
 *
 * Money is what the user is being asked about — the key is theirs and the bill
 * is theirs — so money is most of it. The token count and the per-direction
 * split were both here and are both gone: the tokens are the thing measured
 * rather than the thing wanted, and the split answered "which direction costs
 * more" in a line that has to be read at a glance while a translation is
 * running. The run total already carries the warning the split was standing in
 * for, because two sessions make it visibly twice as big.
 *
 * What earns the second number is that the first one is not always about
 * anybody: a free-tier key is charged nothing, so the dollars are a rate card
 * rather than a bill, and "how long have I had this running" is the question
 * left. It is also the only figure here that is measured rather than estimated,
 * and it moves whether or not the rate table is still right.
 *
 * The figure is prefixed with a tilde and the sentence after it says "an
 * estimate, not your actual bill", in the markup rather than in the title
 * attribute. The prices behind it are a hardcoded table in `lib/usage.js` that
 * goes stale silently, and Interpretab cannot see which usage tier the key is
 * on — a free-tier key is charged nothing at all. A figure in dollars reads as
 * a bill unless it says otherwise, and a tooltip is not where a number
 * disclaims itself: nobody hovers. What is left for the tooltip is the
 * arithmetic, including the two audio times it is derived from — the thing that
 * would have made #16 legible from the panel instead of from a stopwatch.
 */
function renderUsage() {
  const note = el("usageNote");
  if (!usage?.total) {
    note.hidden = true;
    return;
  }
  const cost = formatCost(usage.total.cost);
  // "<$0.01" is already an approximation and says so; "~<$0.01" is noise.
  el("usageAmount").textContent = cost.startsWith("<") ? cost : `~${cost}`;
  const { inSeconds = 0, outSeconds = 0, elapsedSeconds = 0 } = usage.total;
  // Wall clock since Start, and the only figure on this line that is not a
  // guess. It is what the sentence is worth reading for on the free tier, where
  // the dollars are charged to nobody.
  el("usageTime").textContent = formatDuration(elapsedSeconds);
  note.title =
    `Started ${formatDuration(elapsedSeconds)} ago. In that time it has sent ` +
    `${formatDuration(inSeconds)} of audio and been sent ` +
    `${formatDuration(outSeconds)} back. The Live API charges both at 25 ` +
    "tokens a second, and those are priced at Google's published rates for " +
    "the model, read from the pricing page in August 2026 rather than from " +
    "your account. Interpretab cannot see which usage tier your key is on — " +
    "on the free tier you are charged nothing at all — and rates change. " +
    "Your Google account is the only place your real bill exists.";
  note.hidden = false;
  // The live figure covers what the static warning was there to say.
  el("costNote").hidden = true;
}

/**
 * A direction's own switch, and the settings that only mean anything once it is
 * on.
 *
 * The switch keeps its full weight and stays clickable whatever the state; the
 * languages, the slider and the subtitle checkbox under it go grey and are
 * really disabled, not merely faded. Dimming the whole box was the version
 * before this one, and a greyed-out checkbox is how a browser says "you cannot
 * have this" — the wrong sentence for the one control that turns the rest back
 * on.
 */
function renderDirection(checkboxId, on) {
  const section = el(checkboxId).closest(".direction");
  section.classList.toggle("off", !on);
  for (const control of section.querySelectorAll("input, select")) {
    if (control.id !== checkboxId) control.disabled = !on;
  }
}

/**
 * One mute button: the slash, the pressed state and the tooltip that names it.
 *
 * The tooltip is the whole label — the buttons carry an icon and no text — so it
 * says what pressing will do rather than what the state is, and `aria-pressed`
 * carries the state for anything reading the panel out. A greyed button says why
 * it is greyed instead: both of the reasons are settings on another surface, and
 * a control disabled by something the user cannot see reads as a broken one.
 */
function renderMute(id, muted, applies, what, why) {
  const button = el(id);
  button.classList.toggle("off", muted);
  button.setAttribute("aria-pressed", String(muted));
  button.disabled = !applies;
  button.title = !applies ? why : muted ? `Unmute ${what}` : `Mute ${what}`;
}

async function onToggle() {
  el("toggle").disabled = true;
  clearError();
  try {
    if (running) {
      await send({ type: "stop" }, true);
      running = false;
      runTabId = null;
      runTabTitle = "";
    } else {
      // Cleared before the run, not after it. `start()` reports the subtitle
      // status from inside itself — a page that refuses injection is known
      // before it returns — so clearing on the way out raced that message and
      // usually won, wiping the one note the user needed. Nothing re-sends it:
      // the report is deduplicated against session storage, so every later
      // attempt on the same page is suppressed as a repeat of what was, by
      // then, already hidden.
      el("transcript").innerHTML = "";
      el("captionNote").hidden = true;
      el("outputNote").hidden = true;
      el("micNote").hidden = true;
      // Cleared on the way in, not on the way out: what the last run cost is
      // worth reading after Stop, and this run has not spent anything yet.
      usage = null;
      renderUsage();
      openLines.clear();
      // Claimed before the run exists, not after it: the offscreen document
      // broadcasts `state` from inside Start, well before the service worker
      // has written down whose run it is, and a panel that had not claimed it
      // by then would draw its own run as a stranger's for as long as that took.
      runTabId = myTabId;
      // This panel's own tab, named rather than left to be guessed: the service
      // worker's other candidate is the last tab the icon was clicked on, which
      // is a different tab as soon as the user has switched between two that
      // both have a panel.
      await send({ type: "start", tabId: myTabId }, true);
      running = true;
    }
  } catch (err) {
    showError(err.message);
    running = false;
    runTabId = null;
    runTabTitle = "";
  }
  render();
  el("toggle").disabled = false;
}

async function restart() {
  await send({ type: "stop" }, true).catch(() => {});
  // The run comes back on this tab, which is the tab it was on: only the
  // owner's panel has controls to change, so only the owner gets here.
  await send({ type: "start", tabId: myTabId }, true);
  runTabId = myTabId;
}

async function send(message, throwOnError = false) {
  const reply = await chrome.runtime.sendMessage({ target: "sw", ...message });
  if (throwOnError && reply && !reply.ok) throw new Error(reply.error);
  return reply;
}

// The key is set on the Options page, which is a different document, so the
// panel only learns about it through storage — and it gates the Start button.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.apiKey) return;
  settings.apiKey = changes.apiKey.newValue;
  if (settings.apiKey) clearError();
  render();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.target !== "ui") return;
  if (msg.type === "state") {
    running = msg.running;
    render();
  } else if (msg.type === "run") {
    // Whose run this is. It arrives separately from `state`, which the
    // offscreen document broadcasts and which cannot name a tab because that
    // document has none. Until this lands, a panel that did not press Start
    // itself has a run and no owner, which is drawn as somebody else's — the
    // safe way round.
    runTabId = msg.runTabId;
    runTabTitle = msg.runTabTitle || "";
    render();
  } else if (msg.type === "status") {
    onStatus(msg);
  } else if (msg.type === "transcript") {
    onTranscript(msg);
  } else if (msg.type === "turnComplete") {
    for (const key of [...openLines.keys()]) {
      if (key.startsWith(msg.direction)) openLines.delete(key);
    }
  } else if (msg.type === "usage") {
    usage = msg.usage;
    renderUsage();
  } else if (msg.type === "captions") {
    onCaptionStatus(msg);
  } else if (msg.type === "output") {
    // The translated voice went somewhere other than where it was sent. Nothing
    // else in the panel would show it: the session is connected and the
    // transcript keeps filling, and the only symptom is at the far end of a call.
    el("outputNote").textContent = msg.detail;
    el("outputNote").hidden = false;
  } else if (msg.type === "error") {
    // A run ending on its own, which until now it never did: a session loop
    // that has given up takes the whole run down with it, and the banner is
    // where the reason and what to do about it go. The Idle state arrives
    // separately, as the `state` message behind the stop this triggered.
    showError(msg.detail);
  } else if (msg.type === "micNote") {
    // The opposite case, and the one that reads as a broken extension: the
    // microphone is open and connected and carrying nothing, so the panel is
    // green and empty. Everything the user needs to fix it is in the message.
    //
    // An empty one takes the last one back down — the microphone has since
    // carried something, and a stale "no sound has reached the microphone"
    // sitting above a filling transcript is worse than never having said it.
    el("micNote").textContent = msg.detail;
    el("micNote").hidden = !msg.detail;
  }
});

/**
 * Whether the subtitles are reaching the page, in the panel rather than in a
 * console nobody has open.
 *
 * The checkbox says subtitles are on; whether Chrome let us put them there is a
 * different question, and until now the answer was only ever visible to
 * whoever thought to open the service worker's console.
 */
function onCaptionStatus({ status, detail }) {
  const note = el("captionNote");
  if (status === "ok" || status === "off") {
    note.hidden = true;
    return;
  }
  const lead =
    status === "unavailable"
      ? "Subtitles can't be shown on this page."
      : "Subtitles stopped reaching this page.";
  note.textContent = detail ? `${lead} ${detail}` : lead;
  note.hidden = false;
}

function onStatus({ status, detail }) {
  if (status === "connected") setStatus("", "Connected");
  else if (status === "connecting") setStatus("connecting", "Connecting…");
  else if (status === "error") setStatus("disconnected", detail || "Error");
  else if (status === "disconnected") setStatus("disconnected", "Reconnecting…");
  // The detail of a `failed` is a paragraph and goes to the banner, not into
  // the one line of the header. This says only that the retrying has stopped.
  else if (status === "failed") setStatus("disconnected", "Stopped");
}

function setStatus(cls, text) {
  el("statusDot").className = `dot ${cls}`;
  el("statusText").textContent = text;
}

function onTranscript({ direction, side, text, finished }) {
  const key = `${direction}:${side}`;
  let line = openLines.get(key);
  if (!line) {
    line = appendLine({ direction, side, text });
    openLines.set(key, line);
  }
  line.lastChild.textContent = text;
  if (finished) openLines.delete(key);
  el("transcript").scrollTop = el("transcript").scrollHeight;
}

/** One bubble, appended. Shared by the live feed and by `restore`. */
function appendLine({ direction, side, text }) {
  const line = document.createElement("div");
  line.className = `line ${side}`;
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = side === "input" ? `heard (${direction})` : `translation (${direction})`;
  line.appendChild(tag);
  const body = document.createElement("span");
  body.textContent = text;
  line.appendChild(body);
  el("transcript").appendChild(line);
  return line;
}

function showError(message) {
  el("error").textContent = message;
  el("error").hidden = false;
}

function clearError() {
  el("error").hidden = true;
}
