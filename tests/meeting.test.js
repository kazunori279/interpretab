/**
 * The meeting layout is the one configuration where being wrong is invisible
 * from this side of the call: the session connects, the transcript fills, the
 * panel says Connected — and the far end hears their own language, or silence.
 * These pin the checks that say so before the call starts.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { MEETING_PRESET, isMeetingLayout, meetingIssues } from "../lib/meeting.js";
import { DEFAULTS } from "../lib/settings.js";

/** A correctly set up call: they arrive in English, you go out in Japanese. */
const READY = {
  ...DEFAULTS,
  ...MEETING_PRESET,
  tabTarget: "en",
  micTarget: "ja",
  micOutput: "cable-id",
};

test("the preset turns on both directions and leaves the languages alone", () => {
  assert.equal(MEETING_PRESET.tabEnabled, true);
  assert.equal(MEETING_PRESET.micEnabled, true);
  // Simultaneous: in a call the other side is on the tab, not sharing the
  // microphone, so conversation mode's turn-taking buys nothing and costs
  // latency and a duplex gate.
  assert.equal(MEETING_PRESET.micMode, "simul");
  assert.equal(MEETING_PRESET.tabCaptions, true);
  assert.equal(MEETING_PRESET.micCaptions, false);
  // Which language you want to hear and which one they should hear cannot be
  // guessed, and guessing wrong is worse than not touching the dropdowns.
  for (const key of ["tabTarget", "micTarget", "micSource"]) {
    assert.ok(!(key in MEETING_PRESET), `the preset must not set ${key}`);
  }
});

test("a meeting is both directions at once, and nothing else is", () => {
  assert.equal(isMeetingLayout(READY), true);
  assert.equal(isMeetingLayout({ ...READY, micEnabled: false }), false);
  assert.equal(isMeetingLayout({ ...READY, tabEnabled: false }), false);
  assert.equal(isMeetingLayout({}), false);
});

test("a correctly aimed call with a virtual output reports nothing", () => {
  assert.deepEqual(meetingIssues(READY), []);
});

test("one direction on is not a call, so it is not warned about", () => {
  // The defaults are tab-only with no output device chosen, which is a perfectly
  // good way to watch a video and must not produce a wall of meeting warnings.
  assert.deepEqual(meetingIssues(DEFAULTS), []);
  assert.deepEqual(meetingIssues({ ...READY, tabEnabled: false, micOutput: "" }), []);
});

const ids = (settings) => meetingIssues(settings).map((issue) => issue.id);

test("both directions aimed at one language is caught across both code spaces", () => {
  assert.deepEqual(ids({ ...READY, micTarget: "en" }), ["same-language"]);
  // The two dropdowns store their targets in different models' code spaces, and
  // the microphone's changes space when its mode does. `zh` and `zh-Hans` are
  // the same language pointed at twice, and comparing the raw strings misses it.
  assert.deepEqual(ids({ ...READY, tabTarget: "zh-Hans", micTarget: "zh" }), ["same-language"]);
  assert.deepEqual(ids({ ...READY, tabTarget: "he", micTarget: "iw" }), ["same-language"]);
  assert.deepEqual(ids({ ...READY, tabTarget: "pt-BR", micTarget: "pt" }), ["same-language"]);
  // Two genuinely different languages, one of which needs mapping, is not.
  assert.deepEqual(ids({ ...READY, tabTarget: "zh-Hans", micTarget: "ja" }), []);
});

test("conversation mode in a call is flagged, not blocked", () => {
  assert.deepEqual(ids({ ...READY, micMode: "conversation" }), ["conversation-mode"]);
});

test("no output device means the call cannot hear you at all", () => {
  assert.deepEqual(ids({ ...READY, micOutput: "" }), ["no-virtual-output"]);
  assert.deepEqual(ids({ ...READY, micOutput: "   " }), ["no-virtual-output"]);
  // The default is "": nobody is opted into a device they never picked.
  assert.equal(DEFAULTS.micOutput, "");
});

test("every issue carries text a user can act on", () => {
  const all = meetingIssues({ ...READY, micTarget: "en", micMode: "conversation", micOutput: "" });
  assert.deepEqual(all.map((issue) => issue.id), [
    "same-language",
    "conversation-mode",
    "no-virtual-output",
  ]);
  for (const issue of all) {
    assert.ok(issue.text.length > 40, `${issue.id} needs a sentence, not a label`);
  }
});
