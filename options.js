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
import { DEFAULT_VOICE, VOICES, voiceToneKey } from "./lib/languages.js";
import {
  MAX_GLOSSARY_BYTES,
  ensureGlossary,
  loadDefaultGlossary,
  normalizeEntry,
  parseGlossaryCsv,
} from "./lib/glossary.js";
import { localize, t } from "./lib/i18n.js";

const el = (id) => document.getElementById(id);
let settings = { ...DEFAULTS };

init();

// `openOptionsPage()` does not always load a page. If this one is already open
// it is focused as it stands, `init` does not run again, and a request that
// only `init` reads would do nothing at all — and then sit in session storage
// until some later visit scrolled a reader who came for the glossary down to
// the microphone. Right after the install-time open, an Options tab is exactly
// what is already open, so this is the common path rather than the odd one.
chrome.storage.session.onChanged.addListener((changes) => {
  if (changes.optionsFocus?.newValue) focusRequestedSection();
});

async function init() {
  // First, and before the first `await`: the page ships with empty elements, so
  // until this runs there is nothing on it to read.
  localize();
  settings = await loadSettings();
  el("apiKey").value = settings.apiKey;
  el("apiTier").value = settings.apiTier;
  el("configUpdates").checked = settings.configUpdates !== false;
  loadVoices();
  loadCaptionSize();
  bind();
  renderKeyStatus();
  await refreshMicStatus();
  await loadDevices();
  renderGlossary(await ensureGlossary());
  await focusRequestedSection();
}

/**
 * Land on the section the panel sent the reader here for.
 *
 * `chrome.runtime.openOptionsPage()` takes no fragment, so the panel leaves the
 * destination in `chrome.storage.session` and this reads it. Cleared on the way
 * past: it describes one navigation, and a flag still set on the next visit
 * would scroll a reader who came here for the glossary down to the microphone.
 *
 * Last in `init`, after the sections above it have been filled — scrolling to
 * an element whose siblings are still empty scrolls to the wrong place, because
 * they are about to grow. The change listener above calls it a second way, for
 * the page that was already open when the request arrived; whichever call gets
 * there first takes the value away from the other.
 */
async function focusRequestedSection() {
  let focus;
  try {
    ({ optionsFocus: focus } = await chrome.storage.session.get("optionsFocus"));
    if (focus) await chrome.storage.session.remove("optionsFocus");
  } catch {
    return;
  }
  if (focus !== "mic") return;
  el("micHeading").scrollIntoView({ block: "start" });
  // The button is hidden once the permission is granted, in which case the
  // reader has come for a thing that already happened and the heading with
  // "Granted." under it is the whole answer.
  if (!el("grantMic").hidden) el("grantMic").focus();
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
  // Unticking this is also what deletes the cached copy — the service worker
  // does it on the next read, so the switch means "and forget what you were
  // told" rather than only "stop asking".
  el("configUpdates").addEventListener("change", () =>
    saveSettings({ configUpdates: el("configUpdates").checked })
  );
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
 * reports what it can see — a key is present — and leaves the real verdict to
 * the first Start, where a rejection is already reported.
 *
 * What it does not do is guess at the format. This used to require
 * `^AIza[\w-]{30,}$`, which was true of every key Google issued for years and
 * is false of the `AQ.Ab8RN6…` ones it issues now — a different prefix and a
 * dot, rejected twice over — so it told people holding a working key that it
 * did not look like one. The shape is Google's to change and it changed;
 * `endpointUrl` already escapes the key on the assumption that its characters
 * are not ours to predict, and this is that assumption applied where the user
 * can see it. A warning that fires on a key that works is worse than no
 * warning, because the next thing to go wrong gets read as its consequence.
 *
 * So the check is narrowed to pastes that cannot be a key under any format:
 * something with a space in the middle, an address rather than a credential, or
 * too few characters to be a secret. Those are the actual mistakes — half a
 * selection, the URL of the page the key is on, the account it belongs to.
 */
function renderKeyStatus() {
  const node = el("apiKeyStatus");
  const key = settings.apiKey;
  if (!key) {
    setStatus(node, t("optKeyNone"));
  } else if (/\s/.test(key) || key.includes("://") || key.includes("@")) {
    setStatus(node, t("optKeyStray"));
  } else if (key.length < 20) {
    setStatus(node, t("optKeyShort"));
  } else {
    setStatus(node, t("optKeySaved"), true);
  }
  // The install card, shown to whoever has not got past the step it is about.
  // Chrome opens this page by itself on install, so that is everybody once, and
  // the card goes the moment a key is saved rather than at the next reload —
  // this runs on both paths, which is why it lives here and not in `init`.
  el("setupCard").hidden = Boolean(key);
}

function toggleKey() {
  const field = el("apiKey");
  const hidden = field.type === "password";
  field.type = hidden ? "text" : "password";
  el("toggleKey").textContent = t(hidden ? "optHide" : "optShow");
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
    el("micStatus").textContent = t("optMicDenied", [err.name]);
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
    // `denied` is the state the button cannot get out of — Chrome will not
    // prompt a second time — so it gets a message that says where to go
    // instead of one that says to press the button again. The state name
    // itself stays out of both: "prompt" means nothing to the reader.
    el("micStatus").textContent = granted
      ? t("optMicGranted")
      : t(status.state === "denied" ? "optMicBlocked" : "optMicNotGranted");
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
 *
 * The six differing sentences are message keys rather than text, so the pair
 * stays a table of what is different between the two lists.
 */
const INPUT = {
  kind: "audioinput",
  select: "micInput",
  status: "micInputStatus",
  key: "micInput",
  systemLabel: "optInputSystem",
  anonymous: "optInputAnonymous",
  none: "optInputNone",
  missing: "optInputMissing",
  saved: "optInputSaved",
  cleared: "optInputCleared",
};

const OUTPUT = {
  kind: "audiooutput",
  select: "micOutput",
  status: "micOutputStatus",
  key: "micOutput",
  systemLabel: "optOutputSystem",
  anonymous: "optOutputAnonymous",
  none: "optOutputNone",
  missing: "optOutputMissing",
  saved: "optOutputSaved",
  cleared: "optOutputCleared",
};

async function loadDevices() {
  let devices = [];
  let failure = "";
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch (err) {
    failure = t("optDeviceListFailed", [err.name]);
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
  select.appendChild(new Option(t(spec.systemLabel), ""));
  for (const device of devices) {
    // "default" is the same thing as the empty option above under a name that
    // invites the user to wonder what the difference is, and "communications" is
    // a second alias for it that Windows adds.
    if (!device.deviceId || device.deviceId === "default") continue;
    if (device.deviceId === "communications") continue;
    const label = device.label || t(spec.anonymous, [device.deviceId.slice(0, 8)]);
    select.appendChild(new Option(label, device.deviceId));
  }
  const saved = settings[spec.key] || "";
  const missing = saved && !devices.some((device) => device.deviceId === saved);
  if (missing) select.appendChild(new Option(t("optDeviceSavedMissing"), saved));
  select.value = saved;

  if (failure) {
    setStatus(status, failure);
  } else if (!devices.length) {
    setStatus(status, t(spec.none));
  } else if (devices.every((device) => !device.label)) {
    setStatus(status, t("optDeviceNamesHidden"));
  } else if (missing) {
    setStatus(status, t(spec.missing));
  } else {
    setStatus(status, "");
  }
}

async function saveDevice(spec) {
  settings[spec.key] = el(spec.select).value;
  await saveSettings({ [spec.key]: settings[spec.key] });
  setStatus(el(spec.status), t(settings[spec.key] ? spec.saved : spec.cleared), true);
}

/** The voice list is bundled — it is a whitelist the API enforces, not a menu. */
function loadVoices() {
  const select = el("voice");
  const chosen = settings.voice || DEFAULT_VOICE;
  select.innerHTML = "";
  for (const [name, tone] of Object.entries(VOICES)) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = t("optVoiceOption", [name, t(voiceToneKey(tone))]);
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
  el("captionSizeOut").textContent = t("optSizePx", [px]);
  el("captionPreview").querySelector("span").style.fontSize = `${px}px`;
}

async function uploadGlossary() {
  const file = el("glossaryFile").files[0];
  const status = el("glossaryStatus");
  if (!file) return setStatus(status, t("optGlossaryPickFile"));
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return setStatus(status, t("optGlossaryNotCsv"));
  }
  if (file.size > MAX_GLOSSARY_BYTES) {
    return setStatus(status, t("optGlossaryTooBig", [MAX_GLOSSARY_BYTES]));
  }
  try {
    const pairs = parseGlossaryCsv(await file.text()).map(normalizeEntry).filter(Boolean);
    await chrome.storage.local.set({ glossary: pairs });
    renderGlossary(pairs);
    setStatus(status, t("optGlossaryReplaced", [pairs.length]), true);
    el("glossaryFile").value = "";
  } catch (err) {
    setStatus(status, t("optGlossaryLoadFailed", [err.message]));
  }
}

async function resetGlossary() {
  const pairs = await loadDefaultGlossary();
  await chrome.storage.local.set({ glossary: pairs });
  renderGlossary(pairs);
  setStatus(el("glossaryStatus"), t("optGlossaryWasReset", [pairs.length]), true);
}

function renderGlossary(pairs) {
  const host = el("glossaryList");
  host.innerHTML = "";
  if (!pairs.length) {
    const empty = document.createElement("p");
    empty.className = "note";
    empty.style.padding = "0.5rem";
    empty.textContent = t("optGlossaryEmpty");
    host.appendChild(empty);
    return;
  }
  const table = document.createElement("table");
  const head = document.createElement("tr");
  const columns = ["optGlossaryColSource", "optGlossaryColPronunciation", "optGlossaryColTranscript"];
  for (const key of columns) {
    const th = document.createElement("th");
    th.textContent = t(key);
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
