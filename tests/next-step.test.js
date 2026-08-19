/**
 * The order the panel raises unmet preconditions in.
 *
 * Ordering is the whole of what `lib/next-step.js` does, and it is the kind of
 * logic that reads as obviously right and is obviously wrong the first time
 * somebody adds a fourth entry. The cases here are the states a new user is
 * actually in, in the order they pass through them: nothing set up, a key and
 * nothing switched on, the microphone switched on before Chrome has been asked.
 *
 * The last test is about the sentences rather than the order: a step returns
 * the destinations for the links in its own message, and the message is in a
 * catalogue that ten translators can edit. A step that supplies one link for a
 * sentence with two in it renders the second as plain text — which is the exact
 * failure `i18n.js` chose over a dangling anchor, and is silent.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { nextStep } from "../lib/next-step.js";
import { readCatalogue } from "./messages.mjs";

/** A user with everything done: a key, a direction, a granted microphone. */
const READY = {
  hasKey: true,
  tabEnabled: true,
  micEnabled: true,
  micPermission: "granted",
};

test("nothing is left to say once all three preconditions are met", () => {
  assert.equal(nextStep(READY), null);
  // And the microphone's state stops mattering the moment that direction is
  // off, which is the default a new install starts on.
  assert.equal(nextStep({ ...READY, micEnabled: false, micPermission: "prompt" }), null);
});

test("the key comes first, whatever else is also unmet", () => {
  // A user with no key, no direction and no microphone has three problems and
  // one of them is the only one worth mentioning: the other two are settings on
  // a panel that cannot do anything yet either way.
  const step = nextStep({
    hasKey: false,
    tabEnabled: false,
    micEnabled: false,
    micPermission: "prompt",
  });
  assert.equal(step.key, "panelStepKey");
});

test("a key with nothing switched on says so, where Start used to just be dead", () => {
  const step = nextStep({ ...READY, tabEnabled: false, micEnabled: false });
  assert.equal(step.key, "panelStepDirection");
  // No links: both directions are checkboxes on this same panel, and a sentence
  // that sends the reader somewhere else to press one would be wrong.
  assert.equal(step.link1, "");
  assert.equal(step.link2, "");
});

test("the microphone is raised before Start, and only once it has been asked for", () => {
  for (const state of ["prompt", "denied"]) {
    const step = nextStep({ ...READY, micPermission: state });
    assert.equal(step.key, "panelStepMic", `permission state ${state}`);
    // To the Options page and not to a button here: Chrome will not raise its
    // microphone prompt from a side panel, so the grant needs a tab.
    assert.equal(step.link1, "optionsMic");
  }
});

test("an unknown permission state says nothing rather than something undismissable", () => {
  // `permissions.query` is asynchronous and can also reject outright. Until it
  // has answered, the panel does not know, and a banner telling the user to
  // grant a permission they may already have — which pressing Grant again would
  // not take down — is worse than the error behind Start.
  assert.equal(nextStep({ ...READY, micPermission: null }), null);
});

test("the microphone waits its turn behind the direction it belongs to", () => {
  // Both unmet: the microphone is off *and* ungranted. Naming the permission
  // first would be answering a question nobody has asked yet — the user has not
  // said they want the microphone.
  const step = nextStep({
    hasKey: true,
    tabEnabled: false,
    micEnabled: false,
    micPermission: "prompt",
  });
  assert.equal(step.key, "panelStepDirection");
});

test("every step supplies a destination for every link in its sentence", () => {
  const en = readCatalogue("en");
  const states = [
    { hasKey: false, tabEnabled: true, micEnabled: false, micPermission: "granted" },
    { hasKey: true, tabEnabled: false, micEnabled: false, micPermission: "granted" },
    { hasKey: true, tabEnabled: false, micEnabled: true, micPermission: "prompt" },
  ];
  const seen = new Set();
  for (const state of states) {
    const step = nextStep(state);
    assert.ok(step, `no step for ${JSON.stringify(state)}`);
    seen.add(step.key);
    const message = en[step.key].message;
    for (const index of [1, 2]) {
      // `<aN>` in the message and `linkN` on the step are two halves of one
      // link, and `i18n.js` renders half of one as plain text.
      assert.equal(
        message.includes(`<a${index}>`),
        !!step[`link${index}`],
        `panelStep${index}: ${step.key} and its message disagree about <a${index}>`
      );
    }
  }
  // The three states above are meant to reach all three steps; if a reordering
  // makes one of them unreachable, the loop passes while checking it twice.
  assert.equal(seen.size, 3);
});
