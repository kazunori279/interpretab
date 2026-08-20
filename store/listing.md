# Chrome Web Store listing copy

Paste-ready text for the developer dashboard. Field limits are the store's own.

---

## Name (45 chars max)

```
Interpretab
```

## Short description (132 chars max)

```
Hear any tab in your language, spoken and subtitled in real time. Your own Gemini API key — no server in between.
```

*(113 characters.)*

Not a field you type into: the dashboard shows it as **パッケージの概要** and takes it from
`manifest.json`'s `description`, so the two have to be kept identical. Changing it means
re-packaging and re-uploading the ZIP.

## Category

Communication. The store defines it as extensions that enable communications, and names "video
conferencing apps and enhancements" in the list — which is what this is.

This said Workflow & Planning until the categories were read rather than guessed at. That came from
picking Productivity and following the 2023 split, but what Workflow & Planning inherited is time
trackers, to-do lists, calendars and document editors; the half of the old Social & Communications
bucket a meeting tool belongs in is Communication. (Secondary consideration: Accessibility, which
fits the one-way listening case but not the two-way one.)

## Languages

Ten: `en` (default), `ar de es fr hi ja ko pt_BR zh_CN`.

The dashboard's 言語 field is single-select and links to the `chrome.i18n` docs for a reason —
per-locale listings are a property of the *package*, not of anything you can type into the form.
Ship `_locales/<code>/messages.json` with `default_locale` and `__MSG_*__` in the manifest, and a
locale selector appears at the top of 商品の詳細; until you do, the store has no locale data and
serves English to everyone. 1.0.0 was published before the `_locales` work landed, which is why
the listing was English-only for its first days.

Title and summary come from the package on every locale, so they are fixed by `_locales`. The
description is a dashboard field per locale, and it starts as a copy of the English one — filling
it is a separate step from uploading the package. The small tile and the marquee tile cannot be
localized at all, and the screenshots here are attached as 全言語向け (all-languages) rather than
per-locale, so one set covers every language.

---

## Detailed description (16,000 chars max)

One file per locale in [`descriptions/`](descriptions/), named for the `_locales` code:
`en.txt` is the copy the other nine are translated from, and each is pasted verbatim into that
locale's 説明 field. Keep them in step — a change to `en.txt` that isn't carried across leaves nine
listings describing an older extension.

---

## Screenshots — 1280×800, up to 5

Shoot against a real page, not a mock. Order matters: the first is the tile most people judge
it by, so it must show the differentiator, not the settings.

1. **A foreign-language talk playing, subtitle across the bottom, side panel open with the
   transcript.** The one image that says "spoken *and* subtitled". Pick a video whose speaker is
   visibly mid-sentence.
2. **Both directions on, two subtitle lines on the page** — the tab's, and the microphone's with
   its blue edge. This is the two-way story in one frame; nothing else in the category can take
   this screenshot.
3. **The Options page, glossary table filled** with terms that are obviously domain jargon, and
   a visible difference between the pronunciation column and the transcript column.
4. **The side panel alone**, close, showing the two direction cards, the language pickers, the
   ducking slider, and Start. Set the microphone to **Two-way conversation** for this one, so the
   `en ⇄ ja` pair and the mode dropdown are both legible — it is the only frame in the set where
   the second mode is visible at all, and nothing in the category has an equivalent.
5. **The API key field on Options**, with the "no server, your key, goes only to Google" note
   legible. The privacy claim is a selling point; make it readable rather than leaving it to the
   description.

Avoid: a key that is real (type an obvious fake, or leave the field on its placeholder), any
identifiable meeting participant,
and any copyrighted video frame that is recognisable enough to be a problem. A conference talk on a
public channel or a Creative Commons clip is the safe choice.

The five, in order: `screenshot-1-subtitles.png`, `screenshot-2-microphone.png`,
`screenshot-3-glossary.png`, `screenshot-4-panel.png`, `screenshot-5-api-key.png`. Two more that
did not make the cut are kept as `spare-*.png`: the same tab-audio frame translated into Brazilian
Portuguese, and the options page with the panel beside it.

1 and 2 are off-screen captures of a live session — the side panel is browser UI, and nothing
inside a page can photograph it. A browser window is wider than 1.6:1, so they are scaled to the
full 1280 and the strips above and below are filled by stretching the capture's own edge rows,
which reads as more window rather than as a border. 2 ended up being the microphone direction
alone rather than both directions at once: the panel's `HEARD (MIC)` / `TRANSLATION (MIC)` pair
tells the two-way story more legibly than two subtitle lines stacked on one page.

The three that are pure extension UI — 3, 4 and 5 — are taken by `node tests/store-shots.mjs`,
which installs the unpacked extension into a throwaway Chrome profile and photographs the pages in
a 1280×800 iframe on an extension page with `zoom` set on it: the window is whatever size it is,
and a screenshot of it is neither the right shape nor legible once the store scales it down. They
were taken by hand until the plain-language rewrite aged all three at once, which is the argument
for the script — re-take them after any wording change rather than noticing later that the store
is showing sentences the extension no longer says. The key in 5 is the obvious fake
`NOT-A-REAL-KEY-only-a-placeholder-00000`, seeded into a profile that is deleted on the way out.
`tests/assets.test.js` checks the dimensions of everything in here.

The two `spare-*.png` are from the original manual sitting and have not been re-taken, so they show
the pre-rewrite wording. Neither is uploaded; promoting one into the set means shooting it again.

## Promotional tiles — 440×280 and 1400×560

Required for any chance at featuring, and the marquee is the one the carousel actually shows.
No screenshot content in either — a screenshot is illegible at 440 wide and no better stretched
to 1400. Both are the icon plus the name and "Live speech translation, spoken and subtitled.",
and both come out of `store/icon-source.html` along with the four extension icons, so the wording
is one edit away if "Hear any tab in your language" turns out to sell it better.

The marquee is indigo edge to edge with the words in white, and it took two tries to get there.
The first drew the same lockup as the small tile on a white-to-pale-indigo wash, which is legible
on its own and invisible in place: the carousel sits on the store's own white, so a near-white
tile has no edges and reads as a gap in the page. Filling the frame with the brand colour is the
whole fix. The mark changes with the background — the icon is an indigo plate, and a plate on an
indigo field is a hole, so the marquee knocks the speech bubble out in white and drops the plate.

Neither is stored with an alpha channel: the upload form asks for 24-bit PNG, and the canvas
export is RGBA over an opaque background, which is the same picture with a channel nobody needs.
`tests/assets.test.js` checks both the dimensions and the colour type, since the form rejects a
wrong one only after the rest of the listing has been filled in.

## Promotional video

The dashboard's 全言語向けプロモーション動画 field, one YouTube URL, optional:

```
https://www.youtube.com/watch?v=jiY8WJgeKCA
```

2:45, **unlisted** — a link the store can embed, but not something that shows up on the channel.
It is a screen recording of a real session rather than a montage: tab audio being interpreted with
subtitles on the page, then the microphone direction, then the glossary and the options page. Cut
from six clips shot in one sitting, concatenated and re-encoded CFR 30 (the concat demuxer's
`-c copy` path produced non-monotonic DTS at the splices), then levelled — the recorded voice sat
about 20 dB under the translated one, which `dynaudnorm` plus an RMS-detected `agate` and a
two-pass `loudnorm` to -16 LUFS fixed. Re-cut from the untouched concatenation each time rather
than from the previous render, so the edits never stack encoder generations.

Nothing in frame is a real API key: the options page shows the field masked throughout, and the
AI Studio sequence stops at the "Create a new key" dialog.

---

## Positioning note (not for submission)

The nearest thing on the store is
[livdub](https://chromewebstore.google.com/detail/livdub/egoacpkbpnnjfebaadejafadmocfhenp) —
40,000 users, 4.7★, same bring-your-own-key architecture, which is useful evidence that this
architecture passes review. Its own tagline is **"Not subtitles. Your language, spoken."** It has
no microphone direction and no glossary.

So the three things it deliberately does not do are precisely Interpretab's differentiators, and
the listing above is ordered accordingly: **subtitles, two-way, glossary** — before privacy,
before language counts, before anything about how it works. Leading with "translates tab audio
with Gemini" would describe the overlap and none of the difference.
