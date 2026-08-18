/**
 * Options: the API key, the voice, the audio devices, and the glossary.
 *
 * All of it lives in `chrome.storage.local`, which is the only store the side
 * panel, the service worker and the offscreen document can all read. Nothing
 * here is uploaded anywhere — there is no server to upload it to.
 */

import {
  CAPTION_SIZE_MAX,
  CAPTION_SIZE_MIN,
  DEFAULTS,
  loadSettings,
  saveSettings,
} from "./lib/settings.js";
import { DEFAULT_VOICE, VOICES } from "./lib/languages.js";
import {
  MAX_GLOSSARY_BYTES,
  ensureGlossary,
  loadDefaultGlossary,
  normalizeEntry,
  parseGlossaryCsv,
} from "./lib/glossary.js";

const el = (id) => document.getElementById(id);
let settings = { ...DEFAULTS };

init();

async function init() {
  settings = await loadSettings();
  el("apiKey").value = settings.apiKey;
  el("apiTier").value = settings.apiTier;
  loadVoices();
  loadCaptionSize();
  bind();
  renderKeyStatus();
  await refreshMicStatus();
  await loadDevices();
  renderGlossary(await ensureGlossary());
}

function bind() {
  // `change` rather than `input`: saving on every keystroke would write a
  // trail of truncated keys through storage on the way to the real one.
  el("apiKey").addEventListener("change", saveKey);
  el("toggleKey").addEventListener("click", toggleKey);
  // The side panel redraws its meter from a storage change, so this applies to
  // a run already going — the answer to "why am I being shown a price" should
  // not be "press Stop first".
  el("apiTier").addEventListener("change", () => saveSettings({ apiTier: el("apiTier").value }));
  el("grantMic").addEventListener("click", grantMic);
  el("voice").addEventListener("change", () => saveSettings({ voice: el("voice").value }));
  // `input`, not `change`: the overlay follows the store, so writing on every
  // drag step is what makes the size adjustable against the live video.
  el("captionSize").addEventListener("input", () => {
    const px = Number(el("captionSize").value);
    renderCaptionSize(px);
    saveSettings({ captionSize: px });
  });
  el("micInput").addEventListener("change", () => saveDevice(INPUT));
  el("micOutput").addEventListener("change", () => saveDevice(OUTPUT));
  // Plugging in the headset or the virtual cable is often the step before
  // opening this page, and a device list that needed a reload to notice would be
  // the first thing to go wrong in a workflow whose whole point is a device that
  // appears.
  navigator.mediaDevices?.addEventListener?.("devicechange", loadDevices);
  el("uploadGlossary").addEventListener("click", uploadGlossary);
  el("resetGlossary").addEventListener("click", resetGlossary);
}

async function saveKey() {
  settings.apiKey = el("apiKey").value.trim();
  el("apiKey").value = settings.apiKey;
  await saveSettings({ apiKey: settings.apiKey });
  renderKeyStatus();
}

/**
 * There is no way to check a key short of opening a session, and doing that
 * here would bill the user for a connection they did not ask for. So this
 * reports what it can see — a key is present and looks like one — and leaves
 * the real verdict to the first Start, where a rejection is already reported.
 */
function renderKeyStatus() {
  const node = el("apiKeyStatus");
  if (!settings.apiKey) {
    setStatus(node, "No key yet. Interpretab cannot start without one.");
  } else if (!/^AIza[\w-]{30,}$/.test(settings.apiKey)) {
    setStatus(node, "Saved, but this does not look like a Google API key.");
  } else {
    setStatus(node, "Key saved in this browser.", true);
  }
}

function toggleKey() {
  const field = el("apiKey");
  const hidden = field.type === "password";
  field.type = hidden ? "text" : "password";
  el("toggleKey").textContent = hidden ? "Hide" : "Show";
}

/**
 * Ask for the microphone from a page that can show a prompt.
 *
 * The offscreen document where capture actually happens has no UI, so a
 * refusal there is unrecoverable from inside it. Chrome grants the microphone
 * per extension rather than per page, so a grant obtained here is the grant
 * the offscreen document will use.
 */
async function grantMic() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
  } catch (err) {
    el("micStatus").textContent = `Denied: ${err.name}`;
    el("micStatus").className = "note";
    return;
  }
  await refreshMicStatus();
  // Device labels arrive with the grant, so the list built before it is a set of
  // anonymous ids until this runs.
  await loadDevices();
}

async function refreshMicStatus() {
  try {
    const status = await navigator.permissions.query({ name: "microphone" });
    const granted = status.state === "granted";
    el("micStatus").textContent = granted ? "Granted." : `Not granted (${status.state}).`;
    el("micStatus").className = granted ? "note ok" : "note";
    el("grantMic").hidden = granted;
  } catch {
    el("micStatus").textContent = "";
  }
}

/**
 * The two device pickers: which microphone is captured, and where the
 * microphone direction's translated voice is played.
 *
 * They are the same list-building problem twice, so they are one function and
 * two descriptions. Both exist for the same reason, from opposite ends: Chrome
 * resolves "the default device" on its own and tells nobody which one it chose,
 * and being wrong about either is silent — a microphone that carries nothing, or
 * a translated voice a meeting cannot hear.
 */
const INPUT = {
  kind: "audioinput",
  select: "micInput",
  status: "micInputStatus",
  key: "micInput",
  systemLabel: "System default — whichever microphone your computer is using",
  anonymous: "Microphone",
  none: "No microphones visible.",
  missing: "That microphone is not connected, so the system default will be used.",
  saved: "Saved. Applies the next time you press Start.",
  cleared: "Saved. The system default microphone will be used.",
};

const OUTPUT = {
  kind: "audiooutput",
  select: "micOutput",
  status: "micOutputStatus",
  key: "micOutput",
  systemLabel: "System default — the speakers you are using",
  anonymous: "Output",
  none: "No output devices visible.",
  missing: "That device is not connected, so the speakers will be used instead.",
  saved: "Saved. Applies on next Start — and whatever listens to that device has to be told to.",
  cleared: "Saved. The translated voice will play on the speakers.",
};

async function loadDevices() {
  let devices = [];
  let failure = "";
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch (err) {
    failure = `Could not list audio devices: ${err.name}.`;
  }
  for (const spec of [INPUT, OUTPUT]) {
    fillDevices(
      spec,
      devices.filter((device) => device.kind === spec.kind),
      failure
    );
  }
}

/**
 * Two things make this less straightforward than it looks. Labels are withheld
 * until the origin has a media permission, so before the microphone is granted
 * this is a list of anonymous ids and worth saying so rather than showing
 * "Device 2". And a saved device that is no longer connected simply is not in
 * the list: dropping it silently would reset the setting to the default without
 * telling anyone, so it is kept, marked, and left selected.
 */
function fillDevices(spec, devices, failure) {
  const select = el(spec.select);
  const status = el(spec.status);

  select.innerHTML = "";
  select.appendChild(new Option(spec.systemLabel, ""));
  for (const device of devices) {
    // "default" is the same thing as the empty option above under a name that
    // invites the user to wonder what the difference is, and "communications" is
    // a second alias for it that Windows adds.
    if (!device.deviceId || device.deviceId === "default") continue;
    if (device.deviceId === "communications") continue;
    const label = device.label || `${spec.anonymous} ${device.deviceId.slice(0, 8)}…`;
    select.appendChild(new Option(label, device.deviceId));
  }
  const saved = settings[spec.key] || "";
  const missing = saved && !devices.some((device) => device.deviceId === saved);
  if (missing) select.appendChild(new Option("Saved device — not connected right now", saved));
  select.value = saved;

  if (failure) {
    setStatus(status, failure);
  } else if (!devices.length) {
    setStatus(status, spec.none);
  } else if (devices.every((device) => !device.label)) {
    setStatus(status, "Grant the microphone above to see device names.");
  } else if (missing) {
    setStatus(status, spec.missing);
  } else {
    setStatus(status, "");
  }
}

async function saveDevice(spec) {
  settings[spec.key] = el(spec.select).value;
  await saveSettings({ [spec.key]: settings[spec.key] });
  setStatus(el(spec.status), settings[spec.key] ? spec.saved : spec.cleared, true);
}

/** The voice list is bundled — it is a whitelist the API enforces, not a menu. */
function loadVoices() {
  const select = el("voice");
  const chosen = settings.voice || DEFAULT_VOICE;
  select.innerHTML = "";
  for (const [name, tone] of Object.entries(VOICES)) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = `${name} — ${tone}`;
    if (name === chosen) opt.selected = true;
    select.appendChild(opt);
  }
}

function loadCaptionSize() {
  const slider = el("captionSize");
  slider.min = CAPTION_SIZE_MIN;
  slider.max = CAPTION_SIZE_MAX;
  const px = Math.min(
    CAPTION_SIZE_MAX,
    Math.max(CAPTION_SIZE_MIN, Number(settings.captionSize) || DEFAULTS.captionSize)
  );
  slider.value = px;
  renderCaptionSize(px);
}

/**
 * The preview is the point of the slider: a pixel count means nothing until it
 * is a line of text, and the same numbers are used here as in the overlay's own
 * stylesheet so what is shown is what lands on the page.
 */
function renderCaptionSize(px) {
  el("captionSizeOut").textContent = `${px} px`;
  el("captionPreview").querySelector("span").style.fontSize = `${px}px`;
}

async function uploadGlossary() {
  const file = el("glossaryFile").files[0];
  const status = el("glossaryStatus");
  if (!file) return setStatus(status, "Pick a .csv file first.");
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return setStatus(status, "File must have a .csv extension.");
  }
  if (file.size > MAX_GLOSSARY_BYTES) {
    return setStatus(status, `File exceeds ${MAX_GLOSSARY_BYTES} bytes.`);
  }
  try {
    const pairs = parseGlossaryCsv(await file.text()).map(normalizeEntry).filter(Boolean);
    await chrome.storage.local.set({ glossary: pairs });
    renderGlossary(pairs);
    setStatus(status, `Replaced with ${pairs.length} entries. Applies on next Start.`, true);
    el("glossaryFile").value = "";
  } catch (err) {
    setStatus(status, "Load failed: " + err.message);
  }
}

async function resetGlossary() {
  const pairs = await loadDefaultGlossary();
  await chrome.storage.local.set({ glossary: pairs });
  renderGlossary(pairs);
  setStatus(el("glossaryStatus"), `Reset to ${pairs.length} default entries.`, true);
}

function renderGlossary(pairs) {
  const host = el("glossaryList");
  host.innerHTML = "";
  if (!pairs.length) {
    host.innerHTML = '<p class="note" style="padding:0.5rem">No glossary entries.</p>';
    return;
  }
  const table = document.createElement("table");
  const head = document.createElement("tr");
  for (const label of ["Source", "Pronunciation", "Transcript"]) {
    const th = document.createElement("th");
    th.textContent = label;
    head.appendChild(th);
  }
  table.appendChild(head);
  for (const { source, target, transcription } of pairs) {
    const tr = document.createElement("tr");
    for (const value of [source, target, transcription || target]) {
      const td = document.createElement("td");
      td.textContent = value;
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  host.appendChild(table);
}

function setStatus(node, text, ok = false) {
  node.textContent = text;
  node.className = ok ? "note ok" : "note";
}
