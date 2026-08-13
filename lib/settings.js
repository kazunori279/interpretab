/**
 * Extension settings, in `chrome.storage.local`.
 *
 * `chrome.storage.local` is the one store every extension context can read — a
 * service worker cannot see `localStorage`, and an offscreen document does not
 * share one with the side panel — so everything lives here, including the
 * glossary and the API key.
 *
 * The key is the user's own, on their own machine, and is sent to exactly one
 * place: the `key` query parameter of the Gemini Live WebSocket. Nothing in this
 * extension transmits it anywhere else, and there is no server to transmit it
 * to.
 */

export const DEFAULTS = {
  // Bring your own: https://aistudio.google.com/apikey
  apiKey: "",
  voice: "", // "" means the Live API's own default, Puck
  glossary: null, // null = not seeded yet; [] = deliberately emptied
  // tab → you. Always the simultaneous-translation model: a tab plays whoever
  // it plays, and naming a source language up front is a promise the listener
  // cannot keep. Auto-detect is the only setting that fits, so it is not
  // offered as a choice — which is also why there is no tab source language.
  tabEnabled: true,
  tabTarget: "en",
  tabCaptions: true,
  // you → them. One-way agent mode: the source is known (it is you), so the
  // glossary applies, which it cannot in simul.
  micEnabled: false,
  micSource: "en",
  micTarget: "ja",
  // Off by default: with both directions running, subtitling your own speech as
  // well as theirs puts two rolling lines on the page at once, which is a
  // deliberate choice rather than something to walk into.
  micCaptions: false,
  // Subtitle height in CSS pixels, deliberately absolute: the overlay lives on
  // someone else's page, and anything relative would be resized by whatever that
  // page does to its root font size. Sized for a video watched from across a
  // desk rather than for reading distance.
  captionSize: 32,
  // Original tab audio while a translation is speaking. 1.0 disables ducking.
  duckLevel: 0.15,
  duplexGate: true,
};

/**
 * Bounds for `captionSize`, shared by the Options slider and the overlay.
 *
 * The floor is where the subtitles stop being readable over video at all; the
 * ceiling is where three wrapped rows start covering the picture they are
 * subtitling. `content/captions.js` clamps to the same numbers with its own
 * copy — it is injected as a classic script and cannot import this file.
 */
export const CAPTION_SIZE_MIN = 16;
export const CAPTION_SIZE_MAX = 64;

export async function loadSettings() {
  const stored = await chrome.storage.local.get([...Object.keys(DEFAULTS), "captions"]);
  // Subtitles used to be one switch for both directions. Carry that choice over
  // to the tab direction instead of silently turning them back on for someone
  // who had switched them off.
  if ("captions" in stored && !("tabCaptions" in stored)) stored.tabCaptions = stored.captions;
  delete stored.captions;
  return { ...DEFAULTS, ...stored };
}

export async function saveSettings(patch) {
  await chrome.storage.local.set(patch);
}

/** The one precondition for starting: an API key has been entered. */
export function requireApiKey(settings) {
  if (settings.apiKey && settings.apiKey.trim()) return settings.apiKey.trim();
  throw new Error(
    "No Gemini API key yet. Open Options and paste one from aistudio.google.com/apikey."
  );
}
