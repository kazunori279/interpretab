---
title: Interpretab
description: Hear any tab in your language, spoken and subtitled in real time. Your own Gemini API key — no server in between.
---

**English** · [日本語](ja/)

# Interpretab

**Hear any tab in your language — spoken out loud and subtitled on the page, as it happens.**
And the other way too: your microphone, into theirs.

A video, a webinar, a conference stream, the remote side of a call. Interpretab interprets what
your browser is playing, plays the translation over it, and subtitles it across the bottom of the
page at the same time.

[![Interpretab interpreting a talk, with subtitles on the page and the transcript in the side panel](store/screenshot-1-subtitles.png)](store/screenshot-1-subtitles.png)

<p><a href="https://www.youtube.com/watch?v=jiY8WJgeKCA">▶ Watch it run (2:45)</a></p>

## Install

Interpretab has been submitted to the Chrome Web Store and is **waiting for review**. Once it is
through, it will live at
[chromewebstore.google.com/detail/johnocemcoemdhiogfgmphjmlghgdnbm](https://chromewebstore.google.com/detail/johnocemcoemdhiogfgmphjmlghgdnbm).

Until then, load it yourself — it is the same code:

1. Download or clone [the repository](https://github.com/kazunori279/interpretab).
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, pick that
   folder.
3. Get a free Gemini API key at
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and paste it into the
   extension's **Options** page.
4. Open the page you want translated and **click the Interpretab toolbar icon on that tab**. That
   click is how you give permission to listen to the tab — skip it and Start comes back with an
   error.
5. Pick your language in the side panel and press **Start**.

Chrome 116 or newer. Closing the side panel does not stop the translation — the **Stop** button is
always one click on the toolbar icon away, from any tab.

## About the key, and what it costs

Interpretab has **no server**. It connects from your browser straight to Google's
[Gemini Live API](https://ai.google.dev/gemini-api/docs/live) with a key you supply (a Gemini API
key). Nothing goes anywhere except between your browser and Google.

**Usage is billed to your own Google account**, at Google's rates. Both models Interpretab uses
have a free tier, which is enough to try it properly. The key is kept safely on your own device.

### Roughly what it costs

The Live API bills audio by the minute, in and out. At the paid rates
[Google publishes](https://ai.google.dev/gemini-api/docs/pricing) as of August 2026:

| What is running | Audio in | Audio out | **Per hour** |
|---|---|---|---|
| Tab audio, or the microphone in Simultaneous mode | $0.0053/min | $0.0315/min | **≈ $2.20** |
| The microphone in Two-way conversation mode | $0.005/min | $0.018/min | **≈ $1.40** |

Turning tab audio and the microphone on together bills them as two separate sessions, so the price
is the sum of the two rows. Two-way conversation has "two-way" in its name but runs as a single
session, so it is not affected.

Those are hours of *continuous* audio, which is the pessimistic reading: almost all of the money is
on the output side, and the output side only runs while somebody is speaking. A recorded talk is
close to continuous. A meeting where you are mostly listening is not.

## Choosing a mode

Interpretab has two modes, tab audio and microphone. Either on its own, or both at once.

[![The Interpretab side panel: two mode cards, language pickers, the original-volume slider, Start](store/screenshot-4-panel.png)](store/screenshot-4-panel.png)

**Tab audio** interprets whatever the current tab is playing. You pick the target language and
nothing else — the source is detected as it goes, because a tab plays whoever it plays and a video
that cuts to a second speaker should not need you to change a setting. 78 languages to choose from.

**Microphone** interprets you, and it has two modes:

- **Simultaneous** interprets you into one language and does not wait for you to finish a sentence
  — that is what makes it simultaneous. Source detected, 78 targets. Wear headphones: it will
  answer over you.
- **Two-way conversation** is for one microphone shared by two people. Name both languages, put the
  laptop on the desk between you, and it routes each utterance to the other side — set English and
  Japanese, and it hears English, it says Japanese; it hears Japanese, it says English. No button
  to press, no switching sides. 97 languages, 30 voices, and it is the only mode a
  [glossary](#glossary) reaches.

## Subtitles

Subtitles appear bottom-centre of the page, three lines at a time, and they follow the video into
fullscreen. When both modes are on, the microphone's line is marked with a blue edge. **Options →
Subtitle size** sets how tall they are, 16–64 px, live while you watch.

The tab's own audio does not disappear behind the translation — it **keeps playing underneath, at a
lower volume**. It drops to 15% (a slider) while the translated voice is speaking and comes
straight back when it stops. Speech-activated rather than constant, so a film's music and effects
are still there to hear.

Next to Start are two mute buttons, one for the microphone and one for the translated voice.
Neither of them affects the subtitles.

The translation model can also misfire, and subtitles can come out with the wrong content, or in the
wrong language.

## Glossary

Product names, people's names and jargon are what a general model most often gets wrong, in both
pronunciation and spelling. **Options → Glossary** takes a CSV like this:

```
source,pronunciation,transcript
Kubernetes,クバネティス,Kubernetes
Cloud Run,クラウドラン,Cloud Run
```

The second column is the *pronunciation* the model is told to use; the third is what you want the
**subtitles to show**.

[![The Options page with a glossary table filled in](store/screenshot-3-glossary.png)](store/screenshot-3-glossary.png)

The glossary works in the **microphone's Two-way conversation mode only**. The model can also
misfire here, and a registered pronunciation or spelling may not come through.

## Using it in Meet, Zoom and Teams

**Hearing the other side is what this tool does out of the box.** Open the meeting in a tab, turn
tab audio on, pick your language and press Start. Everything they say arrives in your language,
spoken and subtitled.

For them to hear your voice translated, they need Interpretab installed in their browser too. And
because this is a Chrome extension, it only works with the browser versions of these services —
desktop apps and native clients are out of reach.

## Things to know

- **Use earphones or headphones with microphone mode.** On speakers, the microphone picks its own
  translated voice back up — an echo loop — and translation quality drops badly. If you have to use
  speakers, use a microphone with a mute button and open it only while you are speaking.
- **Tab audio and the microphone at the same time means two billed sessions.** Two-way conversation
  is a single session, so it is not affected.
- **Chrome does not let extensions draw on its own pages, the Web Store, or PDFs**, so subtitles will
  not appear there. The audio and the side-panel transcript still work.

## When it gets things wrong

This tool uses an AI model developed by Google. It can translate inaccurately, and it can produce
speech that is not a translation at all.

## Privacy

Your audio, your subtitles and your key go from your browser to Google's Gemini API and reach
nowhere else. Nothing is sent to any analytics or data-collection server.

Full text: [Privacy policy](PRIVACY.html).

## Open source

Apache 2.0. Source, the engineering notes behind all of the above, and the issue tracker:

- [github.com/kazunori279/interpretab](https://github.com/kazunori279/interpretab)
- [Report a problem or ask for a feature](https://github.com/kazunori279/interpretab/issues)
