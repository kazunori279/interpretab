/**
 * The meeting layout: both directions at once, aimed in opposite languages.
 *
 * A call is the case the two directions were built for and the one they are
 * least obvious in. The tab is the remote participants, so it is interpreted
 * *into* your language and subtitled. The microphone is you, so it is
 * interpreted *into* theirs — and that half only reaches them if the translated
 * voice is routed somewhere the meeting is listening.
 *
 * **A Chrome extension cannot create a microphone.** Meet, Zoom-web and
 * Teams-web all take whatever `getUserMedia` hands them, and there is no
 * extension API that registers an audio *input* device. So the last hop is the
 * user's: a virtual audio device (BlackHole, VB-Cable), this extension playing
 * the translated voice into it, and the meeting told to listen to it. Everything
 * here exists to make that arrangement selectable and to say plainly when it is
 * half-configured — which is the failure people would otherwise discover by
 * being inaudible for ten minutes.
 *
 * See #9 for the approaches that would remove the virtual device, and what each
 * one costs.
 */

import { SIMUL_LANGUAGES, simulLanguageCode } from "./languages.js";

/**
 * What "set up for a meeting" writes.
 *
 * Deliberately not the languages: which language you want to hear and which one
 * they should hear are the two things a preset cannot guess, and guessing them
 * wrong is worse than leaving the dropdowns alone. `meetingIssues` checks the
 * result instead.
 *
 * Simultaneous rather than Two-way conversation, because in a call the two
 * speakers are not sharing one microphone — the remote side arrives on the tab,
 * already handled by the other direction. Conversation mode here would wait for
 * turns, interpret the remote voice a second time if it leaked into the room,
 * and gate the microphone while it spoke.
 */
export const MEETING_PRESET = {
  tabEnabled: true,
  tabCaptions: true,
  micEnabled: true,
  micMode: "simul",
  // Your own words, subtitled back to you over the meeting window, on top of the
  // remote side's subtitles. Two rolling lines is a choice, not a default.
  micCaptions: false,
};

/** Both directions running is what makes it a meeting rather than a video. */
export function isMeetingLayout(settings) {
  return !!(settings?.tabEnabled && settings?.micEnabled);
}

/**
 * Everything about the current settings that would make a call go wrong, in the
 * order it would bite.
 *
 * Each entry is `{id, text}`; the id is what the tests pin and what the panel
 * keys on, the text is what the user reads. Nothing here is an error — every one
 * of these configurations starts and runs — so the panel shows them as a note
 * rather than refusing to start.
 */
export function meetingIssues(settings = {}) {
  const issues = [];
  if (!isMeetingLayout(settings)) return issues;

  // Aimed at the same language, which is the single easiest mistake to make:
  // both dropdowns default to sensible values and neither knows about the other.
  // The remote side would hear their own language paraphrased back at them.
  const tab = simulLanguageCode(settings.tabTarget);
  const mic = simulLanguageCode(settings.micTarget);
  if (tab && tab === mic) {
    const name = SIMUL_LANGUAGES[tab] || tab;
    issues.push({
      id: "same-language",
      text:
        `Both directions are aimed at ${name}. In a call they should point ` +
        `opposite ways: the tab into your language, the microphone into theirs.`,
    });
  }

  if (settings.micMode === "conversation") {
    issues.push({
      id: "conversation-mode",
      text:
        "Two-way conversation is for two people at one microphone. In a call " +
        "the other side arrives on the tab, so use Simultaneous.",
    });
  }

  // Without this the microphone direction is interpreting you for the benefit of
  // whoever is standing in the room. It is the whole point of the layout and the
  // one part the extension cannot do by itself.
  if (!(settings.micOutput || "").trim()) {
    issues.push({
      id: "no-virtual-output",
      text:
        "Your translated voice is playing on your own speakers, so the call " +
        "cannot hear it. Pick a virtual audio device under Audio output in " +
        "Options, and select the same device as the microphone in the meeting.",
    });
  }

  return issues;
}
