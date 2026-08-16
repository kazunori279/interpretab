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
  // you → them, in one of two modes.
  //
  // "simul" is the same simultaneous-translation model the tab direction runs:
  // the source is detected, only the target is declared, and there are no turns
  // — the lowest-latency way to be interpreted while you talk. It is the default
  // because it is what most people mean by interpretation.
  //
  // "conversation" is the agent model with a bidirectional instruction, for two
  // people sharing one microphone: whichever of the pair it hears, it speaks the
  // other. It is the slower of the two — the model waits for a turn to end — but
  // it is the only one that can take a glossary, because a system instruction is
  // the only place to put one and the simultaneous model accepts none.
  //
  // `micSource` is the language you speak and is only consulted in
  // "conversation"; `micTarget` is used by both, and is stored in the code space
  // the current mode needs (see `agentLanguageCode` / `simulLanguageCode`).
  micEnabled: false,
  micMode: "simul",
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
  // The two buttons beside Start, and the only settings in here about the
  // current minute rather than how the extension is set up. Both are applied to
  // a running session without reopening it, and neither closes anything: muting
  // is not stopping, and a muted run still holds its sockets.
  //
  // `micMuted` drops the microphone's frames before they are sent, so what is
  // said while it is on is not heard, translated, or charged for. `soundMuted`
  // drops the translated audio before it is played, in every direction and
  // whatever it is being played into — including the device named by
  // `micOutput`. That was briefly narrower, silencing only what reached the
  // speakers, and the result was a button greyed out for anyone who had ever
  // set an output device: a mute that is off in states the user cannot see is
  // worse than a mute that stops more than they meant.
  micMuted: false,
  soundMuted: false,
  // Which microphone is captured: an `enumerateDevices` audioinput id, or "" for
  // whatever the system has as its default input.
  //
  // Worth a setting rather than deferring to the system, because the failure is
  // silent and looks like a broken extension: Chrome takes the default input and
  // names it nowhere, so a machine pointing at a virtual cable, a disconnected
  // headset or an HDMI display connects, goes green, and transcribes nothing.
  micInput: "",
  // Where the *microphone* direction's translated voice is played: an
  // `enumerateDevices` audiooutput id, or "" for whatever the system is using.
  //
  // This is the meeting feature, and it is only half a feature by itself: an
  // extension cannot register a microphone, so the way the translated voice
  // reaches a call is a virtual audio device the user installs, plays into from
  // here, and selects as the microphone in Meet or Zoom (see README § Meetings).
  //
  // The microphone's voice only. The tab direction's translation has to stay on
  // the speakers — it is the one you are listening to — and the two share a
  // player context until this is set, at which point the microphone gets its own.
  micOutput: "",
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
