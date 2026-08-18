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

Productivity → Workflow & Planning. (Secondary consideration: Accessibility. Productivity is the
better fit because the two-way direction is a meeting tool, not only an assistive one.)

## Language

English.

---

## Detailed description (16,000 chars max)

```
Interpretab translates what your browser is playing — a video, a webinar, a conference stream, the remote side of a Meet call — into your language, out loud and on the page, as it happens.

It is not a captioning tool bolted onto a player, and not a dubbing tool that hides the words. It gives you both, and it goes both ways.

▍ SUBTITLES ON THE PAGE, NOT JUST A VOICE

The translation is spoken over the video AND written on it — bottom-centre, three lines rolling, following the video into fullscreen. Read the terms you didn't catch, hear the rest. Each direction has its own subtitle switch, so you can subtitle the video without subtitling yourself, and toggle either mid-session without dropping the connection.

▍ BOTH DIRECTIONS, AT THE SAME TIME

Tab audio into your language, and your microphone into theirs. Speak English, be heard in Japanese by the people in the room with you; hear their Japanese back in English. The two run as independent sessions, so either can be switched off. In Two-way conversation mode the microphone is muted while its own translation plays, so the interpreter never interprets itself; Simultaneous mode answers while you are still talking — that is what makes it simultaneous — so wear headphones.

▍ MEET, ZOOM AND TEAMS

Turn both directions on and point them opposite ways: the meeting tab interpreted into your language with subtitles, your microphone interpreted into theirs. Hearing the remote side works immediately. Being heard by them needs a virtual audio device (see WHAT IT CANNOT DO), which Interpretab plays your translated voice into while the remote side's translation stays on your speakers.

▍ ONE MICROPHONE, TWO PEOPLE

The microphone has a second mode. Set English ⇄ Japanese, put the laptop between you, and Interpretab interprets whichever of the two it hears into the other — no button to press, no switching sides. A desk, a counter, a hotel front desk, a taxi. Simultaneous mode, the default, interprets you alone and doesn't wait for you to finish a sentence.

▍ A GLOSSARY THAT GETS YOUR TERMS RIGHT

Product names, people's names and jargon are exactly what a general model mangles, and mangling them is what makes a translation feel unreliable. Upload a CSV and Interpretab is told how to pronounce each term — with a separate column for how it should be spelled in the subtitles, so forcing a pronunciation doesn't force phonetic spelling on your readers.

▍ THE ORIGINAL DUCKS, IT DOESN'T DISAPPEAR

Interpretab plays the tab's own audio back to you and lowers it while the translated voice is speaking, then brings it straight back. Speech-activated, not constant, so a film's score isn't held down through every silence. The level is a slider.

▍ NO SERVER. YOUR KEY. YOUR AUDIO.

Interpretab connects directly to Google's Gemini Live API using an API key you supply. There is no middleman service, because there is no service at all: the developer runs nothing, sees nothing, and stores nothing. Your audio goes from your browser to Google and nowhere else, and the extension is allowed to reach exactly one host — no other destination is even possible.

Get a free key at aistudio.google.com/apikey and paste it into Options.

▍ LANGUAGES

Tab audio: source auto-detected — a tab plays whoever it plays, and a video that cuts to a second speaker shouldn't need you to change a setting. 78 target languages.

Microphone: in Simultaneous mode, the source is detected too and you choose from the same 78 targets. In Two-way conversation mode you name both languages of the pair, from 97. 30 voices to pick from, either way.

▍ HOW TO USE IT

1. Paste your Gemini API key into Options.
2. Open the page you want translated and click the Interpretab toolbar icon ON THAT TAB. The click is what grants access to it.
3. Choose your languages in the side panel and press Start.

Closing the side panel does not stop the translation.

▍ WHAT IT CANNOT DO

Honest limits, up front:

• The translation of YOUR voice reaches a Meet or Zoom microphone only through a virtual audio device (BlackHole, VB-Cable) — no extension can register itself as a microphone. Options → Audio output plays it into one; installing the device and selecting it in the meeting is still on you.
• Running both directions on speakers invites an echo loop. Use headphones. In Two-way conversation mode, where speaking out loud is the point, keep the microphone away from the speakers instead.
• The glossary applies to the microphone's Two-way conversation mode only. Everything else uses Google's simultaneous-translation model, which accepts no glossary.
• Two directions means two concurrent Gemini sessions, so roughly double the API usage on your key.
• Chrome does not allow extensions to draw on its own pages, the Web Store, or PDFs, so subtitles won't appear there. The audio and the side-panel transcript still work.

▍ COST

Interpretab is free and open source. Gemini API usage is billed to your own Google account, at Google's rates; the free tier is enough to try it properly. Treat the key like a password: don't share it, and if it ever gets out, delete it at aistudio.google.com/apikey and paste a new one into Options.

▍ OPEN SOURCE

Source, privacy policy and issue tracker: https://github.com/kazunori279/interpretab
Apache 2.0.

Requires Chrome 116 or newer.
```

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

The three that are pure extension UI were taken by loading the page into a 1280×800 iframe on an
extension page and setting `zoom` on it: the window is whatever size it is, and a screenshot of it
is neither the right shape nor legible once the store scales it down. The key in 5 is a fake
written into the field, never saved — `saveKey` runs on `change`, which a script setting `.value`
does not fire. `tests/assets.test.js` checks the dimensions of everything in here.

## Promotional tile — 440×280

Required for any chance at featuring. No screenshot content — it renders too small. `promo-440x280.png`
is the icon plus the name and "Live speech translation, spoken and subtitled.", and comes out of
`store/icon-source.html` along with the four extension icons, so the wording is one edit away if
"Hear any tab in your language" turns out to sell it better. It is stored without an alpha
channel: the upload form asks for 24-bit PNG, and the canvas export was RGBA over an opaque
background, which is the same picture with a channel nobody needs.

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
