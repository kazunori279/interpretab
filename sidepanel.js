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

let settings = { ...DEFAULTS };
let running = false;
// The bubble currently being appended to, per direction and side, so streamed
// increments extend a line instead of starting a new one.
const openLines = new Map();

init();

async function init() {
  settings = await loadSettings();
  await populateLanguages();
  bind();
  render();
  const state = await send({ type: "getState" });
  running = !!state?.running;
  render();
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
  el("costNote").hidden = !(settings.tabEnabled && settings.micEnabled);

  const hasKey = !!(settings.apiKey || "").trim();
  el("keyNote").hidden = hasKey;

  // Nothing to mute when the direction behind the button is switched off. The
  // sound button stops every translated voice there is, wherever it is being
  // played, so the only state that leaves it with nothing to do is both
  // directions off — which is also when Start itself is disabled.
  renderMute(
    "micMute",
    settings.micMuted,
    settings.micEnabled,
    "the microphone",
    "The microphone direction is off."
  );
  renderMute(
    "soundMute",
    settings.soundMuted,
    settings.tabEnabled || settings.micEnabled,
    "the translated voice",
    "Neither direction is on."
  );

  el("toggle").textContent = running ? "Stop" : "Start";
  el("toggle").classList.toggle("running", running);
  el("toggle").disabled = (!settings.tabEnabled && !settings.micEnabled) || !hasKey;
  if (!running) setStatus("disconnected", "Idle");
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
      openLines.clear();
      await send({ type: "start" }, true);
      running = true;
    }
  } catch (err) {
    showError(err.message);
    running = false;
  }
  render();
  el("toggle").disabled = false;
}

async function restart() {
  await send({ type: "stop" }, true).catch(() => {});
  await send({ type: "start" }, true);
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
  } else if (msg.type === "status") {
    onStatus(msg);
  } else if (msg.type === "transcript") {
    onTranscript(msg);
  } else if (msg.type === "turnComplete") {
    for (const key of [...openLines.keys()]) {
      if (key.startsWith(msg.direction)) openLines.delete(key);
    }
  } else if (msg.type === "captions") {
    onCaptionStatus(msg);
  } else if (msg.type === "output") {
    // The translated voice went somewhere other than where it was sent. Nothing
    // else in the panel would show it: the session is connected and the
    // transcript keeps filling, and the only symptom is at the far end of a call.
    el("outputNote").textContent = msg.detail;
    el("outputNote").hidden = false;
  } else if (msg.type === "micNote") {
    // The opposite case, and the one that reads as a broken extension: the
    // microphone is open and connected and carrying nothing, so the panel is
    // green and empty. Everything the user needs to fix it is in the message.
    el("micNote").textContent = msg.detail;
    el("micNote").hidden = false;
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
}

function setStatus(cls, text) {
  el("statusDot").className = `dot ${cls}`;
  el("statusText").textContent = text;
}

function onTranscript({ direction, side, text, finished }) {
  const key = `${direction}:${side}`;
  let line = openLines.get(key);
  if (!line) {
    line = document.createElement("div");
    line.className = `line ${side}`;
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = side === "input" ? `heard (${direction})` : `translation (${direction})`;
    line.appendChild(tag);
    line.appendChild(document.createElement("span"));
    el("transcript").appendChild(line);
    openLines.set(key, line);
  }
  line.lastChild.textContent = text;
  if (finished) openLines.delete(key);
  el("transcript").scrollTop = el("transcript").scrollHeight;
}

function showError(message) {
  el("error").textContent = message;
  el("error").hidden = false;
}

function clearError() {
  el("error").hidden = true;
}
