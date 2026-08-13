/**
 * The system instruction for the microphone direction.
 *
 * Ported from `build_system_instruction` in `app/translator_agent/agent.py` in
 * https://github.com/kazunori279/adk-live-translator. Every paragraph here was
 * arrived at by watching the model misbehave, so the comments explaining why are
 * the valuable part and travel with the text.
 *
 * The tab direction needs none of this: the simultaneous-translation model takes
 * a target language as configuration and accepts no system instruction at all.
 */

import { LANGUAGES } from "./languages.js";

// The translation is played out loud, so a room without headphones can feed it
// straight back into the mic. Browser AEC catches the same-device case; nothing
// catches a PA system. This is the soft backstop for what gets through — a
// hint, not a guarantee, since the model has no ground truth for what it emitted.
const ECHO_GUARD =
  "Your own translated speech is played through speakers, so the microphone " +
  "may pick it up again. If an utterance is your own earlier output coming " +
  "back — your voice, repeating what you just said — ignore it and stay " +
  "silent instead of translating it. Only translate a human speaker.";

/**
 * Send speech outside the session's languages to *targetName*.
 *
 * A booth, a lecture hall, or a meeting room carries speech the session was
 * never set up for — a bystander in a third language, a video playing nearby.
 *
 * Asking the model to stay silent on those does not work. Told to produce
 * nothing it either translates the utterance anyway or parrots it back verbatim,
 * and escalating the wording only shifted the mix between those two: measured
 * over ten attempts (French into an en/ja session, four successive phrasings
 * including an explicit "produce no output at all"), silence happened zero
 * times. The model is going to speak; the only thing actually under our control
 * is which language it speaks in.
 *
 * So this routes the case rather than forbidding it.
 */
function offLanguageRoute(targetName) {
  return (
    `Not every utterance will be in one of those languages. A bystander, a ` +
    `nearby conversation, or a speaker who switches to a third language ` +
    `still reaches your microphone. When you hear one, translate it into ` +
    `${targetName} — the same as you would for any other utterance that was ` +
    `not in ${targetName}. Do not repeat it back in the language it was ` +
    `spoken in. ` +
    `A name, a loanword, or a technical term shared with another language ` +
    `does not decide the matter — judge by the language the sentence as a ` +
    `whole is spoken in. `
  );
}

function glossarySection(entries) {
  if (!entries || !entries.length) return "";
  const lines = entries.map(({ source, target }) => `- ${source} → ${target}`).join("\n");
  return (
    `\n\nUse the following glossary for specific terms. Match the source ` +
    `term case-insensitively (e.g. "kubernetes", "Kubernetes", and ` +
    `"KUBERNETES" all match a "Kubernetes" entry). When you hear any ` +
    `of these terms, always use the paired translation:\n${lines}`
  );
}

/**
 * Build the translator system instruction for a language pair and glossary.
 *
 * @param {string} sourceLang  agent-model language code, e.g. "en"
 * @param {string} targetLang  agent-model language code, e.g. "ja"
 * @param {Array<{source: string, target: string}>} glossaryEntries
 */
export function buildSystemInstruction(sourceLang = "en", targetLang = "ja", glossaryEntries = []) {
  const sourceName = LANGUAGES[sourceLang] || sourceLang;
  const targetName = LANGUAGES[targetLang] || targetLang;
  return (
    `You are a real-time translator from ${sourceName} to ${targetName}. ` +
    `Listen to the incoming audio and immediately output the translated ` +
    `version in ${targetName}, maintaining the speaker's original tone ` +
    `and urgency. ` +
    `Translate only the current utterance. Do not repeat, reference, or ` +
    `prepend translations from previous turns. Each spoken segment should ` +
    `produce exactly one translation of that segment and nothing else. ` +
    offLanguageRoute(targetName) +
    ECHO_GUARD +
    glossarySection(glossaryEntries)
  );
}
