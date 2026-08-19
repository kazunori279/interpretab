/**
 * The one thing a user has to do before anything is translated (#18).
 *
 * Three things must be true before Start does anything: a key, a direction
 * switched on, and — if that direction is the microphone — Chrome's permission
 * to open one. Before this file they were treated three different ways. The key
 * was prevented with an explanation and two links, which is the right answer.
 * Both directions off disabled Start and said nothing, which is a dead button.
 * The microphone was not prevented at all: Start ran the whole opening
 * sequence — preflight, tab capture, a socket — and then failed on
 * `getUserMedia`, so the user paid for the round trip to learn something that
 * was knowable before they pressed it.
 *
 * So: one ordered list, and the panel shows the first unmet entry. The order is
 * the feature, and it is not the order they fail in — it is the order they are
 * worth mentioning in:
 *
 * 1. **The key**, because nothing works without it and it is the only one that
 *    sends the user somewhere else entirely.
 * 2. **A direction**, because that is what Start is actually waiting on once
 *    there is a key.
 * 3. **The microphone**, last, because it is the only one of the three that
 *    depends on a choice the user has just made. Raised before they have
 *    switched the microphone on, it answers a question nobody asked.
 *
 * A pure function of four values, so the ordering is testable without a DOM.
 * The panel supplies the state; what a step *says* is a catalogue key, and
 * where its links point is returned alongside, because `setMessage` reads
 * destinations from the host element and never from the message.
 *
 * The fourth precondition is not here: the toolbar click that grants
 * `activeTab`, which tab capture is gated on. It is the only one that cannot be
 * checked in advance — nothing can ask whether the grant is live except the
 * capture that needs it — so it stays where it is, as a failure with an error
 * message and a line in bold on the guide pages.
 */

/**
 * The first thing left to do, or null when there is nothing.
 *
 * `micPermission` is the state from
 * `navigator.permissions.query({ name: "microphone" })`, or null when the query
 * is unavailable or has not answered yet. Null means unknown, and unknown does
 * not raise the step: a banner that cannot be dismissed by doing what it says is
 * worse than no banner, and the failure path with its own error message is
 * still there behind Start.
 *
 * The microphone step links to the Options page rather than asking for the
 * microphone itself, which would be the obvious shape — press it, allow, Start.
 * It is not available. `getUserMedia` is permission-aware, and Chrome will not
 * raise its prompt from a popup or a side panel; the promise rejects as though
 * the user had clicked Deny. Confirmed by the Chrome team on
 * chromium-extensions — "request web permission will also fail in the popup
 * page and side panel page" — which is also why the Options page has a Grant
 * button at all. A prompt needs a document Chrome will anchor one to, and that
 * means a tab. `optionsMic` rather than plain `options` because that page has
 * eight sections and the grant button is under the fifth: landing at the top of
 * it is most of the detour that is left.
 */
export function nextStep({ hasKey, tabEnabled, micEnabled, micPermission }) {
  if (!hasKey) {
    return {
      key: "panelStepKey",
      link1: "https://aistudio.google.com/apikey",
      link2: "options",
    };
  }
  if (!tabEnabled && !micEnabled) {
    return { key: "panelStepDirection", link1: "", link2: "" };
  }
  if (micEnabled && micPermission && micPermission !== "granted") {
    return { key: "panelStepMic", link1: "optionsMic", link2: "" };
  }
  return null;
}
