/**
 * The system instruction for the microphone direction's conversation mode.
 *
 * Descended from `build_system_instruction` in `app/translator_agent/agent.py`
 * in https://github.com/kazunori279/adk-live-translator, which interpreted one
 * way, from a declared source into a declared target. This is the two-way form —
 * two people sharing one microphone, either of whom may speak next — but every
 * paragraph it inherits was arrived at by watching the model misbehave, so the
 * comments explaining why are the valuable part and travel with the text.
 *
 * Nothing here reaches the simultaneous-translation model, which takes a target
 * language as configuration and accepts no system instruction at all. So the tab
 * direction, and the microphone in its default "simul" mode, use none of it —
 * which is also why the glossary can only apply in conversation mode.
 */

import { LANGUAGES } from "./languages.js";

/**
 * Send speech outside the session's two languages to *name*.
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
 * So this routes the case rather than forbidding it, and it routes to the
 * language of whoever is holding the microphone — they are the one who needs to
 * know what was said near them.
 */
function offLanguageRoute(nameA, nameB) {
  return (
    `Not every utterance will be in ${nameA} or ${nameB}. A bystander, a ` +
    `nearby conversation, or a speaker who switches to a third language still ` +
    `reaches your microphone. When you hear one, say it in ${nameA} — the ` +
    `person holding the microphone is the one who needs it. Do not repeat it ` +
    `back in the language it was spoken in. ` +
    `A name, a loanword, or a technical term shared with another language ` +
    `does not decide the matter — judge by the language the sentence as a ` +
    `whole is spoken in. `
  );
}

/**
 * The translation is played out loud, so a room without headphones can feed it
 * straight back into the mic. Browser AEC catches the same-device case; nothing
 * catches a PA system. This is the soft backstop for what gets through — a
 * hint, not a guarantee, since the model has no ground truth for what it emitted.
 *
 * It has to be stated more sharply than it was when this mode interpreted one
 * way. There, the model's own output was in the target language and
 * re-translating it was close to a no-op. Here it is one half of the pair, so an
 * echo off the speakers is a well-formed utterance in a language the session
 * interprets, and following it round produces a real loop: A becomes B, B
 * becomes A, without end. The duplex gate in `offscreen.js` is the hard stop;
 * this is the soft one.
 */
const ECHO_GUARD =
  "Your own interpreted speech is played through speakers, so the microphone " +
  "may pick it up again — and because it comes back in one of the two " +
  "languages you work in, interpreting it would start a loop that never ends. " +
  "If an utterance is your own output coming back — your voice, repeating what " +
  "you just said — ignore it and stay silent. Only interpret a human speaker.";

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
 * Build the interpreter instruction for a language pair and glossary.
 *
 * The routing rule is stated as a pair of explicit cases rather than as "swap
 * the languages", because the abstract phrasing leaves the model free to decide
 * a sentence is already in the right language and repeat it back — which is the
 * same failure the "never restate" sentence exists to prevent, arrived at the
 * long way round.
 *
 * The disclaimer about not being a participant is not decoration either: given
 * two languages and no stated role, a question in either of them is something
 * the model will cheerfully answer instead of interpret.
 *
 * @param {string} langA  the language you speak, agent-model code, e.g. "en"
 * @param {string} langB  the language the other person speaks, e.g. "ja"
 * @param {Array<{source: string, target: string}>} glossaryEntries
 */
export function buildConversationInstruction(langA = "en", langB = "ja", glossaryEntries = []) {
  const nameA = LANGUAGES[langA] || langA;
  const nameB = LANGUAGES[langB] || langB;
  return (
    `You are a real-time interpreter sitting between two people: one speaks ` +
    `${nameA}, the other speaks ${nameB}. Both of them talk into the same ` +
    `microphone, and you interpret in whichever direction the current ` +
    `utterance calls for. ` +
    `When you hear ${nameA}, say it in ${nameB}. When you hear ${nameB}, say ` +
    `it in ${nameA}. Never restate an utterance in the language it was already ` +
    `spoken in. ` +
    `Speak only the interpretation, in the speaker's own voice and register — ` +
    `no "he says", no naming who spoke, no commentary, and never answer a ` +
    `question yourself. You are not a participant in this conversation. ` +
    `Interpret only the current utterance. Do not repeat, reference, or ` +
    `prepend interpretations from previous turns. Each spoken segment should ` +
    `produce exactly one interpretation of that segment and nothing else. ` +
    offLanguageRoute(nameA, nameB) +
    ECHO_GUARD +
    glossarySection(glossaryEntries)
  );
}
