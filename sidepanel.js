/**
 * Side panel: controls and the running transcript.
 *
 * It holds no audio and no socket, so closing it does not stop a capture — it
 * reads the current state from the service worker on open and then follows the
 * offscreen document's broadcasts. Every control writes straight to
 * `chrome.storage.local`, which is what the service worker reads when Start is
 * pressed, so the panel never has to hand its state over.
 */

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
    ["micEnabled", "micEnabled"],
    ["micCaptions", "micCaptions"],
  ]) {
    el(id).addEventListener("change", () => update({ [key]: el(id).checked }));
  }
  for (const id of ["tabTarget", "micSource", "micTarget"]) {
    el(id).addEventListener("change", () => update({ [id]: el(id).value }));
  }
  el("micMode").addEventListener("change", async () => {
    // The two modes run different models with different language tables, so the
    // target list is rebuilt — and the stored code moved into the new space —
    // before `update` restarts the session with it.
    settings.micMode = el("micMode").value;
    await fillMicTarget();
    await update({ micMode: settings.micMode });
  });
  el("duckLevel").addEventListener("input", () => {
    // Applied live by the offscreen document via storage.onChanged, so the
    // slider can be dragged while listening.
    update({ duckLevel: Number(el("duckLevel").value) / 100 });
  });
  el("toggle").addEventListener("click", onToggle);
  for (const id of ["openOptions", "keyNoteOptions"]) {
    el(id).addEventListener("click", (event) => {
      event.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }
}

async function update(patch) {
  Object.assign(settings, patch);
  await saveSettings(patch);
  render();
  // Languages, direction and mode are all baked into the Live session's setup
  // frame, so a change to any of them only takes effect on reconnect. The duck
  // level and the two subtitle switches are not part of that frame — they are
  // read live from storage — and cutting the audio to apply a checkbox would be
  // worse than the checkbox.
  const live = ["duckLevel", "tabCaptions", "micCaptions"];
  if (running && !Object.keys(patch).every((key) => live.includes(key))) {
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
  el("micSource").hidden = micSimul;
  el("micArrow").hidden = micSimul;
  el("micNoteConversation").hidden = micSimul;

  el("tabEnabled").closest(".direction").classList.toggle("off", !settings.tabEnabled);
  el("micEnabled").closest(".direction").classList.toggle("off", !settings.micEnabled);
  el("costNote").hidden = !(settings.tabEnabled && settings.micEnabled);

  const hasKey = !!(settings.apiKey || "").trim();
  el("keyNote").hidden = hasKey;

  el("toggle").textContent = running ? "Stop" : "Start";
  el("toggle").classList.toggle("running", running);
  el("toggle").disabled = (!settings.tabEnabled && !settings.micEnabled) || !hasKey;
  if (!running) setStatus("disconnected", "Idle");
}

async function onToggle() {
  el("toggle").disabled = true;
  clearError();
  try {
    if (running) {
      await send({ type: "stop" }, true);
      running = false;
    } else {
      await send({ type: "start" }, true);
      running = true;
      el("transcript").innerHTML = "";
      openLines.clear();
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

// The key is entered on the Options page, which is a different document, so the
// panel only learns about it through storage.
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
  }
});

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
