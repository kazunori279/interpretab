# Interpretab

User guide — what it does, what it costs, and how to turn it on:
**[English](https://kazunori279.github.io/interpretab/)** ·
**[日本語](https://kazunori279.github.io/interpretab/ja/)** ·
**[中文](https://kazunori279.github.io/interpretab/zh/)** ·
**[Español](https://kazunori279.github.io/interpretab/es/)** ·
**[Français](https://kazunori279.github.io/interpretab/fr/)** ·
**[Deutsch](https://kazunori279.github.io/interpretab/de/)** ·
**[Português](https://kazunori279.github.io/interpretab/pt/)** ·
**[한국어](https://kazunori279.github.io/interpretab/ko/)** ·
**[हिन्दी](https://kazunori279.github.io/interpretab/hi/)** ·
**[العربية](https://kazunori279.github.io/interpretab/ar/)**. What follows is the engineering side
of the same thing.

A Chrome extension that interprets **whatever a tab is playing** — a video, a webinar, the
remote side of a Meet call — into your language, spoken out loud and subtitled on the page. It
also works the other way: your microphone, into theirs.

There is no server. The extension opens a WebSocket straight to the [Gemini Live
API](https://ai.google.dev/gemini-api/docs/live) with your own API key. Your audio and your key
go to Google and nowhere else.

| Direction | What it hears | Model | You choose |
|---|---|---|---|
| **Tab audio** | whatever the current tab is playing | `gemini-3.5-live-translate-preview` — simultaneous translation, source auto-detected | the target language only |
| **Microphone** — *Simultaneous* (default) | you, as you speak | the same simultaneous model | the target language only |
| **Microphone** — *Two-way conversation* | two people sharing one microphone | `gemini-3.1-flash-live-preview` with a bidirectional instruction, so the [glossary](#glossary) applies | both languages of the pair |

Either direction can be switched off; both can run at once.

The tab direction is fixed to the simultaneous model rather than offered as a choice. A tab
plays whoever it plays — a video cuts to a second speaker, a call hands over to someone else —
so naming a source language up front is a promise the listener cannot keep. Auto-detect is the
only setting that survives contact with real tab audio, which is why there is no source-language
picker on that side.

### The microphone's two modes

**Simultaneous** is the default and the same model the tab direction runs: you talk, it
interprets over you into one target language, and it never waits for you to finish a sentence.
The source is detected rather than declared, so there is nothing to set but the target.

**Two-way conversation** is for one microphone between two people — a desk, a counter, a taxi.
Declare both languages and it routes each utterance to the other one: it hears English, it says
Japanese; it hears Japanese, it says English. That needs a system instruction, which is what
makes it the only mode a [glossary](#glossary) can reach — and also what makes it the slower of
the two, because the agent model waits for a turn to end before it speaks.

Switching modes reopens the session, so do it between utterances rather than mid-sentence. The
target language is remembered across the switch where the two models agree on a name for it; the
handful they disagree about (`zh` against `zh-Hans`, `pt` against `pt-BR`, `iw` against `he`) are
mapped, and a language only one of them has falls back to the top of the list.

## Install

Submitted to the Chrome Web Store and
[waiting for review](https://chromewebstore.google.com/detail/johnocemcoemdhiogfgmphjmlghgdnbm);
until it is through, load it unpacked.

1. Clone this repo.
2. Open `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked**
   and pick this directory.
3. Get a Gemini API key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) —
   the free tier is enough to try it — and paste it into the extension's **Options** page.
4. Open the page you want to translate and **click the Interpretab toolbar icon on that tab**.
   This is not optional: the click is what grants access to that tab, and Start fails without
   it.
5. Pick your languages in the side panel and click **Start**.

The panel belongs to the tab you opened it on. Switch to another tab and it is not there —
Interpretab is translating *that* page, and its controls have no business following you onto
your mail. Switch back and it returns with its transcript. Clicking the toolbar icon on any
other tab brings the panel there too, so **Stop** is always one click away, and it hands the
subtitles to that tab while it is at it.

There is one engine, so there is one run, and it belongs to one tab. Pressing Start on a second
tab used to take the engine over in silence: the first tab kept its 💬, its subtitles and its
Connected light while nothing arrived at any of them. Now the run records the tab it belongs to,
and a panel on any other tab says which tab that is, offers **Stop**, and turns its own controls
off — one settings object serves every panel, so a checkbox pressed on a bystander tab would
reconfigure and reconnect a translation on a page the user is not looking at. Start from there is
refused in the same words.

Closing that tab ends the run, and not only when it was the captured one. A microphone-only run
has no stream to lose when its page goes, but everything that says it is running went with it —
the panel, the mark in the tab strip, the subtitles, the meter counting the money — and a session
nobody can see is still billed by the second. The subtitle overlay is the exception, because a
click can move it to any page: losing that page loses the overlay and nothing else.

While a run is going, that tab says so in the tab strip: **💬** in front of its title for the tab
audio being interpreted, **🔴** for the microphone being recorded, both when both are on. The
title is the only part of a tab an extension can write — the strip is browser UI — and it is put
back at Stop. A navigation takes the mark with the document it was written into; clicking
the icon on that tab again restores it, the same click that brings the subtitles back.

Chrome 116 or newer.

### About the key

The key is kept in `chrome.storage.local` and is sent to exactly one host,
`generativelanguage.googleapis.com`, as the `key` query parameter of the Live API WebSocket. It
is never logged, never synced, and there is no server of ours for it to reach.

Usage is billed to whichever Google Cloud project the key belongs to, so treat it like a
password and [restrict
it](https://cloud.google.com/docs/authentication/api-keys#api_key_restrictions) to the Gemini
API — which is what the Cloud console now calls `generativelanguage.googleapis.com`, and the
only place the restriction can be set: AI Studio's key page offers nothing but rename and
delete. Two directions at once means two concurrent Live sessions and roughly
double the cost — and rather than only warning about that, the side panel counts what the run has
actually spent as it runs. See [What a run costs](#what-a-run-costs).

## What you hear

Capturing a tab mutes it for you, so the extension plays the original back itself — and because
it owns that playback, it can **duck** it: the original drops to the level set by the *Original
volume while speaking* slider (15% by default) while the translated voice is talking, and
returns to full volume when it stops. It is speech-activated, not constant, so a film's score is
not held at 15% through every silence.

Subtitles go on the page itself, bottom-centre, three lines rolling, and they follow the video
into fullscreen. Each direction has its own *Subtitles on the page* checkbox — on for tab audio,
off for the microphone — so you can subtitle the video without also subtitling yourself. With
both on, the two share the page but not a line: each keeps its own rolling sentence, and the
microphone's is marked with a blue edge. Toggling either applies immediately, without dropping
the session; the side panel keeps the full transcript either way.

**Options → Subtitle size** sets how tall they are, 16–64 px, with a preview against a dark
background. It applies while a session is running — the overlay follows the stored value rather
than being told once at Start — so the way to set it is to drag the slider while watching the
video. The size is in pixels rather than `rem` on purpose: `all: initial` on the shadow host does
not stop `rem` resolving against the *page's* root font size, so on any site that sets
`html { font-size: 62.5% }` the subtitles used to come out a third smaller than everywhere else.

In **Two-way conversation** mode the microphone is **gated while its own translation is
playing** — its audio is dropped rather than sent, so the interpreter never interprets itself.
That mode declares both languages, so its own voice coming back off the speakers is a
well-formed utterance in a language it interprets, and following it round is an endless loop:
A becomes B, B becomes A. The gate is the hard stop; the instruction's echo guard is the soft
one.

**Nothing else is gated**, and both exceptions are deliberate. The tab feed is a digital tap and
never hears the speakers. The simultaneous microphone is *supposed* to be answered while it is
still talking — that is what simultaneous means — so a gate on its own voice would shut the
microphone on the first phrase and hold it shut for as long as the speaker kept going. Both of
those were learned the hard way: gating the microphone on the tab direction's voice produced no
speech at all with both directions on, and gating simultaneous mode on its own voice translated
the first word and then nothing. What stands in place of a gate is browser echo cancellation —
and headphones, which are the real answer in every mode.

**Which microphone**, if the default is the wrong one, is **Options → Audio input**. Left unset,
Chrome resolves "the default input" itself and names the result nowhere the user can see, so a
machine pointing at a virtual cable, an unplugged headset or an HDMI display connects, goes
green, and transcribes nothing — a failure with no symptom other than the absence of one. Eight
seconds from Start with nothing above the noise floor now puts the device actually being captured
on screen, by name, and points at that setting. Only the opening stretch: the first sound of any
kind ends the watch for the rest of the run, or a pause after a few translated words would be
reported as the wrong microphone. **And the first sound takes the warning back down**, which is
the other half of it — eight seconds is a guess, and the sound that disproves it usually arrives
afterwards, from someone slow to start talking or from someone who did what the warning said and
switched device. Left up, the guess sits over a filling transcript calling a working extension
broken. So the sample scan outlives the warning it raised, and an empty `micNote` is what clears
one in the panel. A device named there and then unplugged falls back to the default and says so,
rather than resurrecting the silence the setting exists to end.

**Two mute buttons** sit beside Start. The microphone one drops its frames before they are sent,
so what is said while it is on is not heard, not translated, and not charged for. The sound one
drops the translated voice before it is played — including what the player had already buffered,
which is usually seconds ahead of what you are hearing, so it stops mid-sentence rather than
after it. Both apply to a running session without reopening it: a mute that reconnected would
let through the sentence it was pressed for. Neither touches the transcript — with the sound off
the translation still arrives in the panel and in the subtitles.

The sound button stops both directions and every destination, including a microphone voice that
**Options → Audio output** has routed to a device of its own — so while it is on, a call
listening to that device hears nothing either. Only the microphone button is greyed out, and
only when that direction is off.

**Switching the microphone into Simultaneous mutes it**, and switching into Two-way conversation
unmutes it. The speakers mean opposite things in the two modes: simultaneous cannot gate the
microphone while it talks, so its own voice out loud is heard again on the next frame and the
translation degrades from there, while two-way is two people in one room and being heard is the
whole point. It is a default and not a rule — it is applied on the way into a mode and never
re-applied while you stay in it, so unmuting simultaneous to listen on headphones sticks.

## Glossary

Product names, people's names, and jargon are what a general model gets wrong, and getting them
wrong is what makes a translation sound unreliable. **Options → Glossary** takes a CSV:

```
source,pronunciation,transcript
Kubernetes,クバネティス,Kubernetes
Cloud Run,クラウドラン,Cloud Run
```

The second column is what the model is *told to say*; the optional third is what the **captions
show instead**. Without that split, forcing the pronunciation also forces it into the subtitles,
and a reader who knows the term sees it spelled phonetically.

The glossary applies to the **microphone in Two-way conversation mode only**. Everything else —
tab audio, and the microphone's default Simultaneous mode — runs the simultaneous-translation
model, which supports neither a glossary nor system instructions. If a glossary is the reason
you are here, that is the trade the mode switch is making.

## Meetings

A call wants both directions at once, aimed in opposite languages: **Tab audio** on with
subtitles, pointed at your language, and **Microphone** on in Simultaneous mode, pointed at
theirs. Two things to get right, because nothing checks them for you. Both dropdowns aimed at the
same language is the one the defaults hand you, and it means the remote side hears their own
words paraphrased back. And Two-way conversation is the wrong microphone mode here — it is for
two people at one microphone, and in a call the other side arrives on the tab, already
interpreted by the other direction.

**Hearing them works out of the box. Being heard needs a virtual audio device.** An extension has
no API that registers an audio *input*, and Manifest V3 has nothing planned, so the translated
voice cannot be handed to Meet as a microphone — it can only be played somewhere Meet is already
listening:

1. Install a virtual cable: [BlackHole](https://existential.audio/blackhole/) (macOS),
   [VB-Cable](https://vb-audio.com/Cable/) (Windows).
2. **Options → Audio output** → pick it. This routes the *microphone* direction's translated voice
   there and nothing else; the tab direction's translation stays on your speakers, because that is
   the one you are listening to. The panel says so loudly if the device has gone away since.
3. In the meeting, select the same device as your microphone.
4. Headphones. On speakers the microphone hears the call, the call hears the room, and the two
   directions interpret each other — three hops, and browser echo cancellation is not looking at
   the synthetic side of it.

You will not hear your own translated voice while it is going down the cable. Route it through a
macOS Multi-Output Device or VB-Cable's repeater if you want to monitor it.

**Native Zoom and Teams clients are out of reach entirely** — a separate process with no tab to
capture and no page to inject into, and `getDisplayMedia` captures system audio only on Windows
and ChromeOS. The virtual-device recipe above is the only thing that reaches them, and it reaches
them completely.

### A microphone the page can pick — prototype, off by default

The sentence above is true of the *system*: no extension can register an audio input, and nothing
in Manifest V3 is going to change that. It is not quite true of a single web page. A page asks
`navigator.mediaDevices` what microphones exist and then asks it for one, and both of those are
functions living in that page's own JavaScript world — so a script injected into that world can
add a device to the answer and hand back a stream of its own when the page picks it. That is
[#9](https://github.com/kazunori279/interpretab/issues/9), and this is the plumbing for it, behind
a flag and with no UI, because the issue asks for a measurement on a real call before anything is
designed around it. From the extension's own console:

```js
chrome.storage.local.set({ micToCall: true })
```

Then start a run with **Microphone** on, from a `https://meet.google.com/` tab, and pick
**Interpretab (translated)** in Meet's microphone list. **Turn Studio Sound off** while you are
in there: it is a second of latency on a path that has too much of it already, and what it
removes is background noise from a microphone this device is not. Nothing to install, and your
own voice is mixed in underneath at `micToCallOwnVoice` (0.15, the same level the passthrough
ducks to) so the room hears you as well as the interpreter.

Three files, and each does the half the other cannot. `content/mic-shim.js` goes into the page's
world with `world: "MAIN"` — a content script's `navigator.mediaDevices` is a *different object*
from the page's, so wrapping ours would fool nobody — where it has no `chrome.runtime` and cannot
hear from the extension. `content/mic-bridge.js` goes into the isolated world, where it can, and
the two meet on `window.postMessage`. The audio itself is the same Int16 PCM the player gets,
base64'd in `offscreen.js` because extension messages are JSON and an `ArrayBuffer` serialises to
`{}` without complaining, relayed by the service worker because an offscreen document has no
`chrome.tabs`. Both scripts go in under `activeTab`, so this adds no host permission and can only
ever reach the tab the run was started on.

What the code already decides, and why: a bare `{ audio: true }` — which is what Meet asks on the
way in — is **not** substituted, so the device has to be chosen in Meet's own picker and there is
exactly one place to choose; every `getUserMedia` gets its own destination node, because Meet
re-acquires and stopping one track must not silence the next; frames are scheduled end to end
120 ms ahead of the clock, with the lead reset on a gap and no ceiling above it; and teardown
puts back the very functions the page started with and
fires `devicechange`, or the picker goes on offering a microphone that will never carry another
word. `tests/mic-shim.test.js` covers all of that against a fake window.

**Measured so far, in Chrome 151.** The mechanics hold up:
`getUserMedia` and `enumerateDevices` live on `MediaDevices.prototype` and are both writable and
configurable, so assigning to the instance shadows them and the page sees the replacement; a
`devicechange` we dispatch ourselves is delivered to the page's own listeners; a 24 kHz
`AudioBuffer` plays correctly on the 44.1 kHz context Chrome gives you; and the resulting
`MediaStreamTrack` is `live` and unmuted, which is the object Meet would put on the wire.

Two things that measurement changed. The first is a bug this file shipped for about an hour: the
lead on the playhead used to be capped at 600 ms, on the reasonable-sounding grounds that a
playhead running ever further ahead of the clock is latency nobody asked for. The Live API does
not deliver a sentence in real time — it delivers it as fast as the socket allows — so the cap
fired constantly, and rewinding the playhead does not shed latency, it schedules the rest of the
sentence on top of the part already queued. Two seconds of test tone came out as 600 ms of
clipping and then silence, at four times the amplitude it went in at. Without the cap the same
two seconds come out once, at the level they went in. There is no ceiling now, and the comment in
`content/mic-shim.js` explains why there must not be one.

The second is a risk worth knowing before the call: the synthetic track reports
`label: "MediaStreamAudioDestinationNode"` and `getSettings().deviceId: "WebAudio-<uuid>"` — not
the id Meet asked for. Anything in Meet that checks that the device it got is the device it chose
will disagree with itself, and neither field can be forged from here.

**And then, on meet.google.com itself.** Meet lists it. **Settings → 音声 → マイク** shows
*Interpretab (translated)* alongside the three real inputs, selects it, keeps it selected, and
asks for it by name: the constraints it passes are
`{ audio: { deviceId: { exact: "interpretab-translated" }, echoCancellation: true,
autoGainControl: true, noiseSuppression: true, voiceIsolation: false }, video: false }`, and it
gets back the synthetic track. So the first two worries above are answered — a `deviceId` that is
not a 64-hex string is fine, and the `devicechange` we dispatch is enough to rebuild a picker that
had already been built. The mismatched `label` and `getSettings().deviceId` do not disturb it
either: switching away to a real microphone and back leaves the menu showing our entry ticked,
which means Meet trusts the id it asked for rather than the one the track reports.

**And then the far end heard nothing.** Two people on a call, the panel filling with
`TRANSLATION (MIC)`, Meet holding the synthetic track, and not one frame of audio reaching the
page. The relay was fine; the tap was in the wrong place. `sendToCall` used to be called *after*
the `soundMuted` gate in `onEvent`, deliberately, on the reasoning that mute should silence the
translation wherever it is going. That reasoning was written for the virtual cable, where a
muted machine really does mean a silent call. It is exactly wrong here: **on a call, muting the
speakers is the setting you want on** — otherwise the interpreter comes out of the room's
speakers, into the microphone, and back through the translation — and someone who mutes for that
reason has said nothing about what the other end should hear. The tap is above the gate now.
`micMuted` remains the switch that means the call hears nothing, and it stops the audio going up
rather than coming down.

**With that moved, the other party heard the translation.** Two participants, Meet on both ends,
the speaker on this end muted, no virtual cable installed anywhere: someone speaks English into
the microphone and the far end hears it in Japanese. That is the whole of what
[#9](https://github.com/kazunori279/interpretab/issues/9) asked for, and the questions left below
are about how well it does it rather than whether it does it.

Worth knowing while the flag has no UI: `micToCall` is read once, at `start()`, and it is not in
`LIVE_KEYS`. Setting it during a run does nothing at all — not in the offscreen document, which
keeps the settings it was handed, and not in the service worker, where `ensureCallTab()` is only
called from `start()`. Set it, then Start.

What that first call answered, and what it did not:

- **Latency: four seconds mouth to far-ear, and two of them are ours.** The split was measured by
  timing the local translated voice against the far end's, and it did not come out the way the
  paragraph above this one predicted: half the delay is added *after* the audio has been
  translated and played on this machine. Two seconds is not what three contexts and a base64
  round trip cost. It is spent either in this file — the queue running ahead of the clock, which
  `LEAD_S` permits on purpose — or somewhere in Meet. The shim reports its lead every two seconds
  of scheduled audio (`console.info` from the service worker, `state: "lead"`) to separate the
  two.

  It reports a **range**, `0.12..2.12`, and the first version of it did not, which cost a
  measurement. One number here cannot be read: a frame scheduled four seconds ahead of the clock
  is either a queue four seconds behind or a sentence that takes four seconds to say, and the
  reading of "4.2, all of them" from the second call was the second thing while looking exactly
  like the first. The low end is the shortest wait any frame in the window had, taken before its
  own duration is counted, and a run of speech that starts from a drained queue starts at
  `LEAD_S`. So read the stream of reports rather than one of them: `0.12..` coming back at the
  start of each sentence means the audio is leaving here on time and the delay is Meet's, however
  high the inside of a sentence climbs. `0.12` never reappearing is the queue being the delay.

  Read that number before reaching for `chrome://webrtc-internals`. The obvious hypothesis about
  Meet's half — that its jitter buffer inflates because a synthetic track arrives in bursts —
  does not survive being written down: a `MediaStreamAudioDestinationNode` renders continuously
  for as long as its context runs, so the track carries silence between phrases rather than
  nothing at all, which is what a real microphone carries too. And `chrome://webrtc-internals`
  itself is not free — it graphs every statistic of every stream as they arrive, and opening it
  on a live call hung the browser here. If it is needed, the field is
  `jitterBufferDelay / jitterBufferEmittedCount` on the far end's inbound audio track.
- **A second of it was Studio Sound**, and turning that off is the whole fix for that second.
  Which settles part of the question above: at least half of the two seconds was Meet's, not the
  queue's. Three seconds is still too many, and where the last one lives — the queue, or Meet's
  jitter buffer — is still open, pending a reading of the range described above.
- **Meet did not take the microphone back.** Not once, across the call. The silent failure that
  would have sunk this did not happen, which is a weaker statement than "cannot happen" and worth
  re-checking on a reconnection and a network drop.
- **The own voice sits well under the translation** at 0.15, which is what the number asks for.
  Whether that is the right balance is a judgement nobody has made yet with a room listening.
- **Echo cancellation: unmeasured, and the call gave no way to measure it.** The speakers were
  muted, so there was nothing for the microphone to hear itself through. It becomes a real
  question the moment someone runs this unmuted on speakers, which the mute fix above makes an
  unusual thing to do.
- **Studio Sound carries a synthetic voice happily, and charges a second for it.** It never
  obstructed anything — Meet's noise processing has no objection to speech that came out of an
  `AudioContext` — but it is a neural denoiser in the path, and the path cannot afford one. The
  setup instructions above now say to switch it off.

The prototype's only instrumentation is `console.info` from the service worker, which is the
correct amount for something with no UI and this many open questions.

## Limitations

- **The microphone direction's translated speech reaches a call only through a virtual audio
  device.** No extension can register a microphone, so the last hop is the user's: install
  [BlackHole](https://existential.audio/blackhole/) or
  [VB-Cable](https://vb-audio.com/Cable/), point **Options → Audio output** at it, and select it
  as the microphone in the meeting. See [Meetings](#meetings), which also covers the flagged
  prototype that skips the cable on Meet by offering the page a microphone of our own
  ([#9](https://github.com/kazunori279/interpretab/issues/9)).
- **Running the microphone on speakers invites an echo loop.** Echo cancellation is what handles
  it in Simultaneous mode, because the duplex gate deliberately does not run there — nor on the
  tab direction's voice. Headphones are the real answer. Two-way conversation mode is the awkward
  case — the whole point is that the room hears the interpretation out loud — so it keeps the
  gate and the instruction's echo guard, and still wants distance between the microphone and the
  speakers.
- **Only Two-way conversation mode takes a glossary**, for the reason above.
- **Two directions means two concurrent Live sessions**, so roughly double the API cost. The side
  panel prices the run as it goes; see [What a run costs](#what-a-run-costs).
- **Quality depends on the language pair, not just the model.** An hour of tab audio scored 64%
  translating Japanese into English and 92% going the other way. See [Soak
  results](#soak-results--1-hour-tab-audio-ja--en).
- Chrome refuses script injection on its own pages, the Web Store, and PDFs, so subtitles do not
  appear there — starting from a new tab is the everyday way to meet this. Capture and the
  side-panel transcript still work, and the panel says to open an ordinary page and start again.
- **One run at a time, on one tab.** There is one offscreen document and it holds the whole
  engine. Start on a second tab is refused rather than served, and the panel there is a
  bystander's: what is running, where, and Stop.
- **A session cutover is short, not lossless.** See [Session expiry](#session-expiry).

## How it works

```
service-worker.js     switchboard only. Action click → tabCapture.getMediaStreamId(),
                      create the offscreen document, open the side panel, inject
                      the caption script. Holds no audio and no socket.
offscreen.js          the engine. Owns every MediaStream, AudioContext and WebSocket.
sidepanel.js          controls and the transcript. Scoped to one tab; closing it,
                      or leaving that tab, does not stop capture.
content/captions.js   subtitles in a closed shadow root, injected on demand.
content/tab-marker.js a glyph per running direction in front of the tab's title.
options.js            API key, voice, subtitle size, audio devices, glossary CSV.
lib/live-session.js   one WebSocket to the Live API: framing in, framing out.
lib/session-loop.js   the succession — GoAway, pre-open, drain, preroll replay.
lib/languages.js      language and voice tables for both models.
lib/instructions.js   the system instruction Two-way conversation mode sends.
```

**Why an offscreen document.** An MV3 service worker is torn down after ~30 seconds idle, and a
side panel dies when it is closed — neither can hold a live capture. An offscreen document
created with `USER_MEDIA` + `AUDIO_PLAYBACK` has a lifetime independent of both, so putting the
engine there removes the need for any keepalive hack. The service worker keeps what little state
it has in `chrome.storage.session`, never in a module variable.

**Why the offscreen document keeps the transcript.** Scoping the panel to a tab —
`sidePanel.setOptions({enabled: false})` globally, enabled per tab in the action click — means
its document is destroyed and rebuilt every time the user looks at something else, several times
in a session that used to build it once. Anything only ever *broadcast* is therefore lost, so the
transcript is also held by the offscreen document, the one context that lives for the whole run,
capped at the last 200 lines and handed over on a `history` message when a panel comes back. The
lines still being streamed into are marked as open in that reply, or the next increment of a
half-finished sentence would print it a second time underneath the first.

**An offscreen document gets `chrome.runtime` and nothing else.** It looks like an extension page
and it is not one: every other namespace is `undefined` there, `chrome.storage` included. That is
worth stating plainly because of how the mistake presents. `chrome.storage.onChanged` at module
scope is a TypeError, thrown *after* the message listener above it is registered and with every
function below it already hoisted — so the document is created, `start` and `stop` are delivered,
the whole audio graph runs, and the only thing lost is the statements after the throw. The
extension works. What it stops doing is whatever that listener was for: here, the three settings
that are supposed to apply without a reconnect (`duckLevel`, `tabCaptions`, `micCaptions`), so
ticking *Subtitles on the page* mid-session did nothing whatsoever and nothing anywhere said so.
Chrome logs it on `chrome://extensions` under the extension's **Errors** button, which is the
first place to look when a feature is missing rather than broken; nothing surfaces in the side
panel or in a page console. Those three now arrive as a `live` message, panel → worker →
offscreen, and `tests/assets.test.js` fails the build if anything in `offscreen.js` reaches past
`chrome.runtime` again.

**Three AudioContexts, shared by sample rate rather than by direction.** Chrome caps contexts
per document at around six and the per-direction layout needs five:

```
tabStream ─┬─► ctxPass (native rate) ─► duckGain ─► speakers
           └─► ctxUp (16 kHz) ─► pcm-recorder-processor ─► tab session
micStream ───► ctxUp (16 kHz) ─► pcm-recorder-processor ─► mic session
both sessions' audio ─► ctxDown (24 kHz) ─► pcm-player-processor ─► speakers
```

`ctxPass` runs at the stream's native rate on purpose: pushing 48 kHz tab audio through the
24 kHz player context would resample it down and audibly dull anything musical.

A fourth appears only when **Options → Audio output** names a device — the meeting case, where
the microphone's translated voice goes to a virtual cable instead of the speakers. It cannot be a
second output of `ctxDown`, because a sink belongs to the context and not to the node, and the
tab direction's translation has to keep playing where you can hear it. So the microphone gets
`ctxMicOut` (24 kHz, `setSinkId`), built at Start and closed at Stop rather than kept like the
other three: it holds a device the user chose, and an ended session should not keep a cable busy.

**Ducking and the duplex gate share a mechanism, not a deadline.** Model audio arrives far
faster than realtime, so "is a voice speaking right now" cannot be answered by "did a frame just
arrive". Each arriving buffer extends a play-out deadline by `byteLength / 2 / 24000` seconds,
and both features read a deadline plus a 400 ms release — but there is one deadline *per
direction*, and they read different ones. Ducking wants either voice: whichever direction is
speaking, it is speaking over the tab. The gate wants only the microphone's own, and only in
conversation mode, for the reasons in [What you hear](#what-you-hear); `usesDuplexGate` in
`lib/live-session.js` is where that question is answered, so it is answered in one place and
covered by a test. `duckGain` moves on a `setTargetAtTime` ramp so it does not click.

**Transcripts are segmented by a silence gap, not by a turn.** Simultaneous translation never
sends `turnComplete` — there are no turns in a continuous feed — so the accumulator that joins
streamed increments has no natural end and would run for the whole session, leaving one caption
line that grows until it covers the video. A 2 s gap in the increments closes the sentence
instead. Independently, a caption line is capped at three wrapped rows and bottom-aligned inside
the clip, so a long sentence loses its already-read head rather than its newest words.

**Two directions are two independent sessions, all the way down.** Different setup frames, no
shared state, the API cost of both, and — unless the microphone is left on Simultaneous —
different models too. They share exactly one page overlay, so
the caption path carries a `direction` and everything downstream is keyed by it: the offscreen
document filters the fan-out against that direction's *Subtitles on the page* switch, and the
content script keeps one open line per direction rather than a single current line. Without that
key, whichever direction spoke last would overwrite the other's sentence mid-word. A
microphone-only run has no captured tab, so the overlay goes on the tab the toolbar icon was
clicked on — `activeTab` covers that one either way.

**Permissions are kept small.** No content script is declared and there is no `<all_urls>`:
subtitles are injected with `chrome.scripting.executeScript` under `activeTab`, which the
toolbar click already grants. The one host permission is the Gemini API, and there are no
optional ones — widening the reach would require a manifest change anyone can see in the diff.

**An injected overlay outlives the extension that injected it.** Reloading the extension — which
is every second minute during development, and what a Web Store update does to everyone else —
orphans the content script in every page it was ever injected into. The overlay and its
`window.__liveTranslatorCaptions` marker stay in the page; the link back to the extension does
not, so that copy will never be handed another transcript. The marker used to make the next
injection stand down in favour of it, and the symptom was as quiet as it is misleading: audio
translated fine, the side-panel transcript filled, every message send *succeeded*, and that tab
simply never showed a subtitle again no matter how many times Start was pressed. So the marker
now carries a teardown handle and a fresh injection takes the old one's place, catching the
`chrome.runtime`-is-gone throw on the way — plus a plain `getElementById` sweep, because an
orphan from a build that stored a bare `true` has no teardown to call.

The same silence covers the other way to lose the content script, a page reload or a navigation
mid-session: the tab id in `chrome.storage.session` stays valid, `chrome.tabs.sendMessage` starts
rejecting, and the catch swallowed it. A failed send now puts the overlay back and re-delivers,
at most once every 3 s so a page that genuinely refuses injection is not re-attempted for every
increment. A same-origin reload keeps the `activeTab` grant and recovers; a cross-origin
navigation revokes it and the re-injection fails, which is the correct answer — the page the user
granted access to is gone.

**Getting them back costs a click, not a restart.** Both of the ways subtitles end up with
nowhere to go — a run started from a new tab, and a caption tab navigated away from — are fixed
by the same thing, an `activeTab` grant, and that is exactly what a toolbar click is. So a click
during a running session moves the subtitles onto the tab clicked, rather than only being read as
"open the side panel". Stop-and-Start would have done it too, at the price of a reconnect and a
gap in the translation, to repair something that only draws. A click on a page that still cannot
take them leaves a working overlay where it is: reopening the panel from a chrome:// page is a
click as well.

**Bundled worklets.** MV3 forbids remote code, so `audio/` carries the two AudioWorklet
processors rather than fetching them. They are 16 and 50 lines.

### Talking to the Live API directly

Most examples of the Live API are written against the Python SDK, which flattens several fields
onto its own connect config, so the wire shape has to be reconstructed — and the documentation
contradicts itself about it. The live-translate guide shows `inputAudioTranscription` and
`outputAudioTranscription` nested inside `generationConfig`; the WebSockets API reference lists
them as fields of `setup`. The reference is right, and the guide's version is not merely
ignored, it is fatal:

```
Invalid JSON payload received. Unknown name "inputAudioTranscription"
at 'setup.generation_config': Cannot find field.
```

`translationConfig`, meanwhile, really does belong inside `generationConfig`. So the frame is
split, and the split is load-bearing:

```json
{"setup": {
  "model": "models/gemini-3.5-live-translate-preview",
  "generationConfig": {
    "responseModalities": ["AUDIO"],
    "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": "Puck"}}},
    "translationConfig": {"targetLanguageCode": "ja", "echoTargetLanguage": false}
  },
  "inputAudioTranscription": {},
  "outputAudioTranscription": {}
}}
```

`systemInstruction` is a sibling of `generationConfig` too, and the microphone direction adds
it. `echoTargetLanguage: false` matters for the tab direction specifically: the translation
comes out of the same speakers the tab is playing through, and echoing the source language back
as well would put two voices over one video.

`tests/setup-frame.test.js` pins that shape, but a unit test can only pin what someone already
knew — the error above came from `tests/live-smoke.mjs`, which opens a real session with a real
key and streams real speech through it. Anything about this protocol that was inferred rather
than observed is worth distrusting until that script has run.

Three more things it turned up, none of them in the docs:

- **The agent model ends a turn with `generationComplete`, not `turnComplete`.** Twenty-odd
  seconds of speech, a full spoken answer, `{"serverContent": {"generationComplete": true}}`, and
  no `turnComplete` at any point. Keying only on the documented frame leaves the caption open for
  ever and the session swap waiting on something that never comes, so `live-session.js` treats
  `generationComplete`, `turnComplete` and `interrupted` as one event.
- **Silence is input.** End-of-turn is the server's own voice-activity detection, and it detects
  it in the audio you send. Stop sending when the speaker stops and the model waits indefinitely
  — a microphone that streams its pauses is not padding, it is the signal.
- **`sessionResumptionUpdate` arrives unasked.** The server volunteers resumption handles every
  few seconds without `sessionResumption` in the setup frame.

Uplink audio is base64 inside JSON, not the raw binary a socket of one's own would take:

```json
{"realtimeInput": {"audio": {"data": "<base64>", "mimeType": "audio/pcm;rate=16000"}}}
```

The recorder worklet emits 128 samples at a time — 8 ms, 125 times a second — and wrapping each
of those would spend more bytes on the envelope than on the audio, so `live-session.js`
coalesces to 32 ms frames. That costs at most 32 ms of latency, far below anything audible next
to the model's own response time.

### One HTTP request in front of the sockets

`GET /v1beta/models` goes out at Start from the service worker, next to the key check that was
already there and for the same reason — ahead of the tab capture, so a run that cannot work costs
a message rather than a capture prompt followed by silence. It is there for two things a WebSocket
cannot do.

**It identifies the client.** Google's [partner integration
guide](https://ai.google.dev/gemini-api/docs/partner-integration) asks anything that sits between
it and an end user to send `x-goog-api-client: company-product/version`, so traffic can be
segmented and a client producing a distinctive error pattern can be found. `new WebSocket(url)`
takes a URL and a subprotocol list and nothing else, and `BidiGenerateContentSetup` has no field
for a client identifier, so the header has nowhere else to go. Without it the only thing reaching
Google that says "Interpretab" is the `Origin: chrome-extension://<id>` on the handshake — every
session runs on the user's own key, so none of the usage rolls up to this extension anywhere.

**It gets an answer that means something.** A refused WebSocket upgrade closes with 1006 and no
reason, deliberately: telling a page why would make it a cross-origin oracle. A rejected key, an
exhausted quota and a captive portal are indistinguishable at that point, which is why
`closeReason` had to name all three (#13). The REST call is the same key, the same host and the
same API over a protocol that answers in status codes. Two shapes, both observed against the live
API rather than inferred:

| Key | Status | `error.status` | `reason` |
|---|---|---|---|
| A bad `AIza…` one | 400 | `INVALID_ARGUMENT` | `API_KEY_INVALID` |
| A bad `AQ.…` one | 401 | `UNAUTHENTICATED` | `ACCESS_TOKEN_TYPE_UNSUPPORTED` |

The second is Google failing to recognise the newer key format as a key at all and answering as
though it had been handed an OAuth token. Neither `reason` is worth matching on its own; the gRPC
status is.

What the preflight deliberately does not do is decide a run on a maybe. A 500, a body that will
not parse, a timeout, a network that is not there — none of those are about the key, so the run
goes ahead and tries the socket. The asymmetry is the whole design: refusing a session that would
have worked is worse than opening one that fails a second later with the message it would have
shown anyway.

The verdict outlives the call. When the key checks out clean, a `closeHint` rides the `start`
message into the offscreen document and from there into every `LiveSession` the run opens, so a
later 1006 stops saying "usually the API key" — because it demonstrably is not. That is the half
of #13 no amount of rewording the guess could have fixed.

`tests/live-smoke.mjs` runs the same preflight before its session, which is where the two error
shapes above came from.

### Session expiry

Live sessions do not last indefinitely. Measured, rather than assumed: a continuous tab
translation ran **9 min 50 s**, was warned at 9 minutes with `{"goAway": {"timeLeft": "50s"}}`,
and was closed on code **1008** exactly 50.4 seconds after that. Hour-long soaks of the
[server-based version](https://github.com/kazunori279/live-translator) saw about 30 of these an
hour. Reacting with a reconnect would mean a gap in the middle of a sentence every few minutes,
so `lib/session-loop.js` does this instead:

1. **On `goAway`, open the replacement immediately** — it is warm in ~200 ms — while the dying
   session keeps speaking and keeps receiving audio.
2. **Swap** when the dying session sends `turnComplete`, or after 5 s of silence, or one second
   before the `goAway` deadline, whichever comes first. Waiting out the whole deadline would be
   dead air the listener hears in full — and, for tab audio, the deadline is the only one of the
   three that ever fires: simultaneous translation answers continuously, so it neither completes
   a turn nor falls silent while the tab is playing. The one-second margin is there because the
   server means the deadline literally; swapping level with it is a race against a close already
   in flight.
3. **Replay what was never answered.** A bounded ring keeps recent PCM frames with their arrival
   times; on a silent cutover, everything captured since the outgoing session last said anything
   is replayed into the replacement. Nothing was relayed after that point, so none of it has been
   translated — and anything older has been, so replaying that too would translate the same words
   twice.
4. **Close the abandoned caption.** A turn that was cut off will never report itself complete, so
   the loop emits a synthetic `turnComplete` to the UI.

Connect failures back off from 200 ms to 4 s rather than spinning — and, after ten in a row, stop.

**Retrying for ever is a bug when the answer is not going to change**
([#13](https://github.com/kazunori279/interpretab/issues/13)). The backoff was written for a flaky
socket, which it fits; a key that has run out of free-tier quota is the case it does not. That
quota comes back at midnight Pacific, so the extension used to knock on a rate-limited endpoint
every four seconds, for hours, showing the same sentence, until the user noticed and pressed Stop.
Ten attempts is about twenty-two seconds on that curve.

What clears the tally is a session doing something — any relayed event, or simply one that stayed
up for a minute. Deliberately **not** a successful `open()`: a rejection can arrive after the
handshake, and a loop that took connecting as proof of life would cycle for ever with a clean
counter at every turn. The minute is there so that an hour on bad Wi-Fi, which can drop ten times
during silences, is not mistaken for a rejection.

Giving up is a state the UI had no way of reaching before, because until now nothing ever stopped
on its own: the loop reports `failed`, `offscreen.js` asks the service worker to take the whole run
down — it owns the `running` flag, the caption overlay and the offscreen document's lifetime, so a
document that shut its own sessions down would leave all three claiming a run that no longer exists
— and the reason goes to the side panel's banner and to session storage, so a panel that was on
another tab when it happened still finds out why the run ended.

**The reason itself is two guesses, and says so.** A browser is not handed the HTTP status of a
failed WebSocket upgrade, by design; a 429 `RESOURCE_EXHAUSTED` and a rejected key both arrive as a
bare 1006 with an empty reason. `closeReason()` used to name the key alone, which sent a user whose
quota had run out to check the one thing that was fine. It now names both, and the give-up message
adds where each is checked: the Options page for the key, AI Studio for the quota.

**Measured against the real server**, twelve minutes of continuous tab audio through
`tests/live-smoke.mjs`: the warning arrived at 9 min 00 s carrying `"50s"`, the replacement was
ready 0.3 s later, and the swap fired 49.2 s after the warning — the deadline less the
one-second margin, which is the path this direction always takes. The outgoing session was
retired before the server ever got to close it: one `goAway`, one handover, zero server closes,
and the stream carried on for another three minutes on the replacement. The longest silence
anywhere in the translated audio was 3.6 s, which is within the range the simultaneous model
leaves between sentences on its own.

**Known limitation.** The server version also tees the microphone into the replacement while a
drain has stalled, and discards that replacement if the drain then recovers — about 120 lines
whose job is to make a cutover *lossless* rather than merely *short*. That is not ported here;
preroll replay covers the common case. The Python implementation is in
[`app/main.py`](https://github.com/kazunori279/live-translator/blob/main/app/main.py) if you
want it back.

Session resumption would be the better mechanism still, and is not used in v1.0 — though the
argument against it got weaker once a real session was watched: the server sends
`sessionResumptionUpdate` handles unprompted, so they cost nothing to collect and the only
untested part is whether reconnecting with one actually restores the conversation. That is a
worthwhile v1.1. It would not remove `session-loop.js`, which also has to cover the case where
the socket dies without warning.

### What a run costs

The extension spends the user's own money and, until v1.0, told them so only in the abstract: a
static line saying two directions cost roughly double. The side panel replaces that warning with a
meter — a dial, a clock and a figure: *12 min so far, ~$0.31 of Gemini usage this run — an
estimate, not your actual bill.* The dollars appear only for a key declared paid on the Options
page; a free-tier key gets its audio time instead, for the reasons at the end of this section.

**The figure is the audio clock, not the server's token count**, and getting there took a wrong
turn worth writing down. The Live API attaches `usageMetadata` to its server messages and the
extension was dropping every one of them, so the first version read them instead and summed them
— the documented reading, and the one every SDK that surfaces `usageMetadata` in a live session
takes. In use the meter climbed a cent every few seconds in Simultaneous mode, three to five times
what Google's own per-minute prices allow ([#16](https://github.com/kazunori279/interpretab/issues/16)).

A real session says what the frames are, and the answer settles the design rather than the bug.
`tests/live-smoke.mjs` against 18 s of Japanese speech:

| Model | Frames | Summed | Audio clock |
|---|---|---|---|
| `gemini-3.5-live-translate-preview` — tab, Simultaneous | 25, rising and falling | 1550 | 1632 |
| `gemini-3.1-flash-live-preview` — microphone, conversation | **none at all** | — | 1275 |

So the frames really are per-turn increments, and summed they come out five percent *low* rather
than several times high — one candidate ruled out, not the report explained; a 35-second run
cannot see a drift that takes an hour to show. The second row is what decides it. The conversation
model sends no `usageMetadata` whatsoever, so a meter built on the field would print nothing for
half the runs this extension makes, and a figure that works in one mode and blanks in the other is
worse than not using the field.

There is nothing to guess at. Google states the basis in as many words — *billing is based on
total input and output audio token consumption, calculated at a rate of 25 tokens per second of
audio* — and this extension owns both ends of that audio. `lib/usage.js` counts the seconds
instead:

- **Uplink is counted after the duplex gate and the mute**, at the one line that hands PCM to
  `SessionLoop`, so a frame that was dropped is a frame not charged for. Downlink is counted
  *before* the sound mute, because the server sent that audio and is charging for it whether or
  not it reaches a speaker.
- **The tally lives above the session.** It sits on each direction's accumulator in
  `offscreen.js`, so the half-dozen session swaps in an hour do not reset it, and it survives a
  tab switch — the side panel is destroyed and rebuilt on every one of those, so it asks for the
  figure in `getState` as well as receiving it broadcast. Posts are coalesced to one a second;
  the uplink path alone runs every 32 ms.
- **`SessionLoop` forwards a usage frame without treating it as speech.** Every other event
  updates `_lastRelayAt`, which is how a drain decides the dying session has fallen silent. A
  tally is bookkeeping, not an answer, so letting it count would hold a cutover open to its
  deadline and shorten the preroll owed to the replacement.
- **Both directions are priced separately, then added**, because they can be two different models
  at two different rates.
- **Rates are per million tokens, in one table, with the date they were read.** Only the audio
  rates are used now: Live Translate publishes nothing else, and leaving out Flash Live's cheaper
  text understates a conversation-mode run by a few percent — the direction to be wrong in is not
  the one that invents a charge.
- **`usageMetadata` is swallowed, not read.** It still arrives and `SessionLoop` still forwards
  it, because `tests/live-smoke.mjs` is where those frames get looked at — it prints the summed,
  largest and last frame next to the audio clock, which is how the table above was measured.
  Nothing carries them into the panel: a number nobody can see is not worth threading through
  three layers.

The unit test that would have caught this in the first place is now in `tests/usage.test.js`: a
cent takes sixteen seconds of continuous audio in both directions, and the arithmetic is asserted
against the per-minute column of the same pricing page the per-token column came from.

**Two numbers, against a dial.** The first version of this line also printed the token count and,
when both directions were running, what each of them had spent — three figures and a breakdown, in
a 12px grey line, while a translation was playing. All of it went. The tokens are the thing
measured rather than the thing wanted, and the per-direction split was standing in for the
doubling warning that the run total already makes visible by being twice as large. What is left is
a gauge glyph, which says "meter" before the sentence is read, and one figure with a tilde on it.
Removing the breakdown did cost something, though: it was also the only thing that would have made
a meter running at five times the rate legible from the panel. The two audio times are back in the
tooltip for that reason.

What came back into the line itself is **how long the run has been going**, and it earns the space
the breakdown lost because the money does not always mean anything: on the free tier nobody is
charged, so the dollars are a rate card rather than a bill, and *how long have I had this running*
is the question left over. It is also the only figure here that is measured rather than estimated
— it keeps moving whether or not the price table is still right. The clock is a wall clock stamped
in `offscreen.js` at Start, not a sum of audio and not a timer in the panel: the panel is destroyed
and rebuilt on every tab switch, and one counting for itself would report the run as having begun
when the user last looked at it. It rides in on the same snapshot as the cost, so it advances with
the same once-a-second post.

**The disclaimer is in the sentence, not only in the tooltip.** A figure in dollars reads as a bill
unless it says otherwise, and nobody hovers over a line of text to find out that it is not one. So
the sentence carries *an estimate, not your actual bill* — as part of the same catalogue message
as the figure, so no code path can print the one without the other — and the tooltip has the
arithmetic:
how much audio went each way, and that the Live API charges both at 25 tokens a second against a
hardcoded price table that goes stale silently.

**And the dollars are only shown to a key that is being charged.** A free-tier key is charged
nothing at all, so a price there is a bill that does not exist, and the natural reading of one is
that a bill is accruing — the exact anxiety the meter was added to remove
([#17](https://github.com/kazunori279/interpretab/issues/17)). Nothing in a Gemini API response
says which tier a key is on, and the model list does not either, so the only way to know is to
ask: **Options → Gemini API plan**, under the key field, because pasting the key is the moment the
user was last in AI Studio and knows which project they made it in. It defaults to free, since
that is what the install steps tell people to get and since a price shown to someone who is not
paying is the worse of the two mistakes.

The free tail counts the audio instead — *12 min so far, 18 min of Gemini audio. The free tier is
charged nothing for it.* — and that is not a consolation figure. The free tier is limited by rate
rather than by money, so seconds of audio are what its limits are actually spent on, and the
number that predicts a run failing to reconnect
([#13](https://github.com/kazunori279/interpretab/issues/13)). Both tails are whole messages —
`panelUsagePaid` and `panelUsageFree` — rather than markup assembled around a number, so which of
the two to use is the only choice `renderUsage` makes and the disclaimer cannot fall off the paid
one. The clock is shared: it is the question either tier is asking.

If the wording of either sentence changes, `README.md` and all ten guide pages quote them, and
`tests/assets.test.js` fails until they agree — each page against the catalogue of the language it
is written in, since what a reader of that page sees in the panel is that language's sentence and
not the English one.

### Ten languages, one catalogue

Every string the user reads comes from `_locales/<lang>/messages.json` through `lib/i18n.js`
([#10](https://github.com/kazunori279/interpretab/issues/10)). English is `default_locale`, so a
key a locale has not translated falls back to it rather than disappearing. The other nine are the
ones the language picker calls popular, which is the set most likely to be someone's *browser*
language too: `ja`, `zh_CN`, `es`, `fr`, `de`, `pt_BR`, `ko`, `hi`, `ar`. Two of those names are
Chrome's rather than the picker's — a directory called `zh` or `pt` is not a locale Chrome will
match, so the catalogues sit under the region-qualified names. `chrome.i18n.getUILanguage()`
decides which is used, and there is deliberately no picker — the browser already knows, and a
second place to set the language is a second place for it to be wrong.

**Chrome expands `__MSG_name__` in the manifest and in CSS and nowhere else.** Not in HTML, which
is where most of the text is. So both pages ship with their labels empty and carry a `data-i18n`
attribute naming the key, and `localize()` fills them — first thing in `init()`, before the first
`await`, because a page that painted English and corrected itself afterwards would flash.
`data-i18n-title` and `data-i18n-placeholder` do the same for the two attributes that hold text.
`<html lang>` is set there too rather than declared: neither page knows which locale it will be
served as, and a hardcoded `lang="en"` has a screen reader read Japanese aloud with English
pronunciation.

**One of the ten is Arabic**, so `localize()` also sets `<html dir>` from `@@bidi_dir` — Chrome's
own message, which answers for the locale it actually resolved rather than for the one this code
guessed. Everything downstream of it is a logical CSS property instead of a physical one: the
indent under a switch is `padding-inline-start`, a slider's readout is `text-align: end`, the mic
line's rule is `border-inline-start`. The transcript bubbles need no variant — in a column flex box
the cross axis is the inline one, so `align-self: flex-start` is already the right edge under
`dir="rtl"` — but the tag above each one does: `text-transform: uppercase` has nothing to change in
a script with no case, and letter-spacing on a cursive one just pulls the joins apart.

**Content direction is not interface direction.** A transcript bubble and an on-page subtitle are
in the languages being translated, which have nothing to do with the language the panel is in:
Arabic in an English panel, English in an Arabic one, both at once in conversation mode. Those
carry `dir="auto"` and take their direction from their own first strong character. The subtitle
`<span>` and the bubble body are `display: block` so that `dir` decides their alignment and not
just their glyph order. Both font stacks name a Noto face per script — Latin, CJK, Devanagari,
Arabic — because a stack that finds a Latin face first renders Hindi and Arabic in whatever the
system substitutes; absent faces cost nothing, the list falls through.

Two things in the catalogue are deliberately not Chrome's own:

**Substitution is `{1}`…`{9}`, not `$1`.** Chrome's placeholders have to be declared per message
in a `placeholders` block, and `$` is meaningful to `getMessage` whether or not they are. Braces
mean nothing to it, so the same catalogue behaves identically read through `chrome.i18n` in the
browser and off disk in Node — which is what `tests/messages.mjs` does, so that an assertion is
still about the sentence a user reads rather than about a key.

**A message may carry emphasis and links.** Most of the prose here is a paragraph with a `<b>` or
a link in the middle of it, and where that lands is the translator's decision: splitting the
sentence around the tag bakes English word order into every other language. So a message may use
`<b>`, `<code>` and `<a1>`…`<a9>`, and `setMessage` builds those as real elements. It is a closed
alphabet with no attributes in it — the destination behind `<a1>` is read from `data-link1` on the
element being filled, so a catalogue cannot introduce a URL, and `tests/i18n.test.js` fails on one
that tries. Markup is matched *before* the values go in, so a substituted value is never read as
markup; one of those values is a tab title, which is a remote page's to choose. `t()` is the same
message with the tags stripped, for a `title`, an `Error`, or anything posted to another document.

What is not translated: the language names in `lib/languages.js`, which are already in their own
language and should stay that way — a Japanese speaker looking for Japanese wants 日本語, not
whatever the current UI language calls it — and the 30 voice names, which are the values sent over
the wire. The tone word beside each voice *is* translated, through a key derived from the English
adjective (`voiceToneKey`: "Easy-going" → `voiceEasygoing`), so there is no second table to keep in
step with `VOICES`. The two buttons stay `Start` and `Stop` in all ten, and so do `Free` and `Paid`
and the two mode names: the buttons because a sentence elsewhere in the panel tells you to press
one of them by name, the plan words because they are what Google's own console shows next to the
key, and the mode names because they are followed by a translated gloss anyway.

`_locales/ja` is the author's. The other eight are machine translation that no native speaker has
read, which is worth knowing before quoting a sentence from one of them back at a user.

`tests/i18n.test.js` holds the rest in place: every locale carries exactly the keys English does,
a translation keeps the same set of placeholders and the same markup as its English original
(order is the translator's to change, which is most of the point of numbering them), every key the
code names exists, and every message in the catalogue is reachable from somewhere.

### Ten languages, one guide

The user guide is the same ten languages, and it is a different problem: not one page that
localises itself but ten pages that a reader has to be *routed* to. GitHub Pages serves static
files and never sees `Accept-Language`, so nothing on the way out can make that decision.

The whole site is under `docs/`, and Pages is set to build from there. It began at the repository
root, which cost nothing until someone tried to reload the unpacked extension: **Chrome reserves
every top-level name beginning with `_`** — `_locales` and `_metadata` are the two exceptions —
and refuses to load an extension from a directory containing one, with `Could not load manifest.`
`_config.yml`, `_data`, `_includes` and `_layouts` are all names Jekyll insists on, so the two
cannot share a root. Nothing published moved: with the source at `/docs`, `docs/ja/index.md` is
still `/interpretab/ja/`. What did move is the exclude list in `npm run package`, which was eleven
globs for the same reason and is now one.

`PRIVACY.md` is the one file in both places, and the duplication is deliberate. The store
listing's privacy policy URL is `https://kazunori279.github.io/interpretab/PRIVACY.html`, which
requires the file inside the Jekyll source; the copy a user can read in the extension they
installed requires it at the root of the ZIP; and after the above those cannot be the same
directory. A policy that says two different things depending on where it is read would be worse
than either, so `tests/assets.test.js` asserts the two copies are byte-identical.

`docs/_data/languages.yml` is the list — code, name, path, and `dir` for the one that needs it. The
language bar, the `hreflang` alternates and the redirect are all built from it, so an eleventh
language is an entry there plus a directory with an `index.md` in it. The page directories are
named for the picker's codes and not Chrome's, which is the same `zh`/`zh_CN` split as above,
pointing the other way: nobody types `pt_BR` into an address bar. `tests/assets.test.js` is where
the list, the directories on disk and the front matter that names each page's language are checked
against each other.

`docs/_layouts/default.html` is jekyll-theme-primer's own layout with two things added, because before
this repository had a layout at all that theme was what Pages rendered it with. `<html dir>`, since
the direction of a document belongs on its root element where the bidi algorithm and every logical
CSS property can see it — the Arabic page used to set `direction` on `body` from inside its own
markdown, which worked and was in the wrong place. And the language bar, which was a line of
markdown repeated ten times with a different entry bold in each.

`docs/_includes/head-custom.html` is the hook the theme leaves in `<head>`, and it holds the
`hreflang` alternates — which have to be in the head, since the same markup in the body is ignored
— and the routing script. The script is `docs/_includes/lang-redirect.js`, plain JavaScript with its
window passed in so that `tests/site.test.js` can hand it a fake one.

What it does is two things. Every page records an explicit choice: the bar tags its links with
`?lang=`, which is stored and then wiped out of the address bar, so no reader copies a link with
our bookkeeping in it. And the English page — the only one that redirects, which is what keeps
this loop-free — sends a reader who has expressed no choice to the language `navigator.languages`
asks for. That is the same setting `chrome.i18n` reads, so the guide and the extension's interface
agree about a reader without being told to. The trap it is built around is the bar's English link:
it points at the page that redirects, so without the stored choice a German reader could never
reach English.

## Development

```bash
npm test    # node --test, no dependencies and no build step
```

The suite covers the parts that are painful to test by hand: the exact `setup` wire shape, the
GoAway cutover against a fake session and a settable clock, socket lifecycle against a stub
WebSocket, glossary CSV parsing, the ten message catalogues against each other, and a walk over
every asset path the manifest and the HTML name.

Anything that asserts about a sentence rather than a key imports `tests/messages.mjs`, which wires
`lib/i18n.js` to `_locales/en/messages.json` off disk — `chrome.i18n` does not exist in Node, and
without it every message is its own key.

None of that talks to Google. Two scripts do, and both sit outside `npm test` because they need
a key and spend quota.

**`tests/live-smoke.mjs` — does the wire format work?**

```bash
say -v Kyoko -o /tmp/ja.wav --data-format=LEI16@16000 "こんにちは。本日は東京で…"
node tests/live-smoke.mjs /tmp/key.txt /tmp/ja.wav --direction tab --raw
node tests/live-smoke.mjs /tmp/key.txt /tmp/ja.wav --direction mic
node tests/live-smoke.mjs /tmp/key.txt /tmp/ja.wav --direction mic --mic-mode conversation
node tests/live-smoke.mjs /tmp/key.txt /tmp/ja.wav --minutes 12    # to see a real goAway
```

It prints what the model heard, what it said, and how much audio came back, so a wrong `setup`
field or a mishandled frame shows up as an empty transcript rather than as a bug report. The key
is read from a file so it stays out of the shell history and the process list. There are three
setup frames, not two, and one passing says nothing about the others: the two simultaneous ones
differ only in which language they aim at, but conversation mode is a different model carrying a
system instruction and a glossary.

It drives `SessionLoop`, not a bare `LiveSession`, which is what makes `--minutes 12` worth the
twelve minutes: the cutover path can only be exercised by a server that decides on its own that a
session has had enough. The run reports how many sessions it opened, how many `goAway`s it saw,
and the longest gap between two pieces of translated audio — that last number is what a listener
would actually hear at a handover, and it is the one that fails the run if the machinery is
broken. A run past eleven minutes that sees no `goAway` fails too, on the grounds that the expiry
assumption has moved and someone should know.

**`tests/soak.mjs` — does it still work an hour later?**

```bash
node tests/soak.mjs /tmp/key.txt --direction mic --mic-mode conversation \
  --duration 3600 --log soak_mic.jsonl
node tests/soak.mjs /tmp/key.txt --direction tab --duration 3600 --target en --voice Kyoko \
  --source ja --log soak_tab.jsonl
```

An hour of sentences, each one generated by a model, spoken by `say`, streamed in at the speed of
speech, and scored 0–10 against the original by a model. Every third sentence in a run that can
carry a glossary — which is conversation mode and nothing else — is built around a term from
`tests/soak-glossary.csv`, and the transcript is checked both for the pronunciation the glossary
asked for and for the spelling the caption is supposed to show: two different questions, and a
model that ignores the glossary and says the English term verbatim passes the second while
failing the first. `--mic-mode` defaults to what ships, which is `simul`; the run above names
`conversation` explicitly because the microphone has been soaked in both modes and they are
reported separately below.

It is a port of `tests/test_long.py` from the [server version](https://github.com/kazunori279/live-translator),
and writes the same report format on purpose, so that repo's `tests/chart_soak.py` charts a run
from here against the relay's old ones. Three things changed in the port, all to keep this repo
dependency-free: macOS `say` replaces Cloud Text-to-Speech, `generateContent` over REST replaces
the Python client library, and Cloud speech-to-text on the returned audio is gone — it fed one
metric, an independent reading of the spoken translation, and the translation itself was always
scored from the model's own `outputTranscription` because Cloud STT mishears correctly-spoken
Japanese often enough to be the less reliable witness. Everything else remains comparable.

What the original could not report, this does: the session count and the handovers, because
`SessionLoop` runs in-process. Iterations that straddled a handover are marked in the log.

**Two tabs, by hand.** One thing `npm test` cannot reach: two live side panels. The suite checks
the invariants in the source — Start refuses before it captures, every control in the markup is
in the panel's disabled list, the mark and the subtitles read the one recorded tab — but the
behaviour itself needs two tabs and a person. Six checks, a couple of minutes:

1. Click the icon on tab A, Start. Switch to tab B, click the icon there. The panel says
   *Interpretab is running on “A”*, its checkboxes and dropdowns are dead, and **Stop** is live.
2. Press Start on B anyway — you cannot, the button says Stop. Press Stop instead: A's 💬 goes,
   A's subtitles go, and B can now Start.
3. With a run on A, switch A → B → A. A's panel comes back with its controls, its transcript and
   its meter — not as a bystander.
4. With a run on A, change a language on A. It reconnects onto A, not onto whichever tab the
   icon was clicked on last.
5. Microphone only, started from A: A carries 🔴, and closing A stops the run — the voice stops,
   and B's panel is back to Start.
6. Tab audio on A: closing A stops the run. Subtitles handed to C by a click there: closing C
   loses the overlay and nothing else.

### Soak results — 1 hour, microphone, the conversation model, en → ja

Taken before the microphone gained a mode switch, so it measures the agent model under the
one-way instruction that Two-way conversation grew out of: same model, same glossary handling,
same session machinery, a differently worded system instruction. The numbers stand for that
lineage and not for the Simultaneous mode that now ships as the microphone's default, which is
soaked separately below.

`tests/soak_mic.report` is the run in full. The summary:

```
Duration: 3608s | Iterations: 281 | Passed: 279/281 (99.3%) | Avg score: 9.8/10 | Errors: 0
Sessions: 7 opened, 7 ready, 0 failed | goAway: 6 | server closes: 0 | handovers mid-sentence: 5
```

Six `goAway`s, at 9:00, 18:00, 27:00, 36:00, 45:00 and 54:01 — the cadence does not drift, which
means each replacement was adopted promptly enough to start its own nine minutes on time. **Not
one session was closed by the server**: every one was retired by the loop before the deadline it
had been given. Five iterations were speaking across a handover, and all five passed — 10, 9, 10,
10, 10.

Both failures were the grader marking translation quality, neither was infrastructure: `ACID
transactions` heard as "asset transactions", and one sentence rendered in the desiderative where
the original was flat.

```
Translation Score                Turn Complete (speech-end to full translation)
      n=281                             n=281
 0-2  ······················   0.0%    <2s  ███████████████████···  85.1%
 3-4  ······················   0.7%   2-3s  ███···················  13.5%
 5-6  ······················   0.0%   3-4s  ······················   1.1%
 7-8  ······················   2.1%   4-5s  ······················   0.4%
9-10  █████████████████████·  97.2%   5-7s  ······················   0.0%
      avg=9.85  p50=10.00              avg=1.60  p50=1.53  p90=2.10  max=4.03
```

Against the relay's own hour on its non-simultaneous path — what *that* project called
conversation mode, no relation to the one in this side panel: 201 iterations, 99.5% pass, average
score 9.9 — quality is unchanged. Latency is not: turn-complete went from
**5.52 s average to 1.60 s**, and first response has a p50 of 0.10 s. Two things changed at once,
though: the relay hop is gone, and the microphone direction runs a newer model than that soak
did. These numbers cannot apportion the credit between them.

**The glossary result is the one worth reading carefully.** Of 94 sentences built around a term:
72 (77%) were captioned with the configured spelling, but only 28 (30%) were *spoken* with the
configured pronunciation. The gap is not all failure. A term whose display column is its English
spelling is captioned correctly by a model that ignored the glossary and simply said the English
word, and several entries in `tests/soak-glossary.csv` are ordinary English words the sentence
generator used in their ordinary sense — "the swift bird", "terraforming Mars", "people react",
"the angle of the building" — where there is no term to render at all. What the numbers do
support is narrower and still useful: the pronunciation instruction is a suggestion the model
often declines, and the display-map column is what actually guarantees the caption.

### Soak results — 1 hour, microphone, Simultaneous, en → ja

The mode that actually ships as the microphone's default, soaked after the duplex gate was taken
off it. `tests/soak_mic_simul.report` is the run in full:

```
node tests/soak.mjs /tmp/key.txt --direction mic --mic-mode simul --duration 3600 \
  --source en --target ja --voice Samantha --log soak_mic_simul.jsonl
```

```
Duration: 3611s | Iterations: 198 | Passed: 183/198 (92.4%) | Avg score: 9.3/10 | Errors: 0
Sessions: 7 opened, 7 ready, 0 failed | goAway: 6 | server closes: 0 | handovers mid-sentence: 4
```

The session machinery behaves exactly as it does on the other model: `goAway` at 9:00, 18:00,
27:00, 36:00, 45:00 and 54:00, not one second of drift across the hour, no session closed by the
server, no errors. Four iterations spoke across a handover and three of them scored 9 or 10; the
fourth scored 2, having lost most of its sentence at the seam. One in four is a small sample and
the conversation run's five-for-five is a small sample too, so the honest reading is that a
mid-sentence handover is usually invisible and occasionally is not.

**First response is 0.00 s in all 198 iterations**, which is the metric hitting its floor rather
than a measurement: it is clocked from the end of the spoken sentence, and this mode had already
started answering. That is the whole point of the mode, and it is also the regression witness for
the duplex-gate bug — under that bug the microphone shut after the first phrase and the rest of
the sentence was never sent.

Quality is the cost. 92.4% against the conversation model's 99.3%, average 9.3 against 9.8, and
the failures are not a long tail of near-misses: three iterations scored 2. They divide into
mis-hearings that were already wrong in the input transcription — "garlic" as "coffee", "diverse
landscapes" as "diverse languages" — and content the translation simply dropped or swapped with
the input transcribed correctly: "art and music" arriving as dance and music, "a balanced diet"
gone from the sentence. Five of the fifteen failures were the former, ten the latter. Input
transcription scored 9.86 on average and was below 9 seven times, so this model hears about as
well as the other one and translates less carefully — which is the trade a simultaneous model
makes, and it is worth knowing that the default mode makes it.

```
Translation Score                Turn Complete (speech-end to full translation)
      n=198                             n=198
 0-2  ······················   1.5%    <2s  █████████████████████·  93.4%
 3-4  ······················   2.0%   2-3s  █·····················   6.6%
 5-6  █·····················   2.5%   3-4s  ······················   0.0%
 7-8  █·····················   5.1%   4-5s  ······················   0.0%
9-10  ████████████████████··  88.9%   5-7s  ······················   0.0%
      avg=9.33  p50=10.00              avg=0.98  p50=0.94  p90=1.85  max=2.51
```

No glossary line here: the simultaneous model takes no system instruction, so the harness skips
glossary sentences for every simul run.

### Soak results — 1 hour, tab audio, ja → en

The direction most people will use, and the first hour run on it. `tests/soak_tab.report` is the
run in full:

```
node tests/soak.mjs /tmp/key.txt --direction tab --source ja --target en --voice Kyoko \
  --duration 3600 --log soak_tab.jsonl
```

```
Duration: 3600s | Iterations: 200 | Passed: 128/200 (64.0%) | Avg score: 7.8/10 | Errors: 0
Sessions: 7 opened, 7 ready, 0 failed | goAway: 6 | server closes: 0 | handovers mid-sentence: 3
```

**The session machinery is the same on this path as on the other two.** `goAway` at 9:00, 18:00,
27:00, 36:00, 45:00 and 54:00 — no drift across the hour, no session closed by the server, no
errors. Three iterations spoke across a handover and scored 8, 3 and 10. Latency is the best of
the three runs: turn-complete averages **0.23 s** against the microphone's 0.98 s, and first
response is 0.00 s in all 200 iterations, which is this mode answering before the sentence ends
rather than a stopwatch failing to start.

**Quality is not.** 64.0% and 7.76 average, against 92.4% and 9.33 for the same simultaneous model
on the microphone. Nothing about the shape of the hour explains it: pass rate by ten-minute block
runs 68, 45, 62, 73, 65, 72 — noise, not decay — and the handovers are three iterations out of
two hundred. The failures are ordinary wrong translations. Causation reversed: 自然の法則は科学の
探求によって解き明かされる ("the laws of nature are revealed by scientific inquiry") came back as
"the laws of nature are the foundation of scientific inquiry", twice. Words swapped for
near-neighbours: 適度な運動 (moderate exercise) as "handmade exercise". Input transcription
averaged 9.52, and split by outcome it was 9.88 on the sentences that passed against 8.86 on the
ones that failed — mishearing contributes, but most failures were heard correctly and translated
loosely. One iteration was transcribed as a sentence from earlier in the same session rather than
the one being spoken, which is the only cross-turn contamination in the hour.

**This is the language pair, not the tab path.** A 15-minute control on the same direction with
the pair reversed — `--source en --target ja --voice Samantha`, `tests/soak_tab_control.report` —
scored 92.2% over 51 iterations, average 9.31: the microphone's simultaneous hour to two decimal
places. So the tab direction's code costs nothing, and Japanese into English is simply harder for
this model than English into Japanese. Two caveats on how far that reading goes. The Japanese
input is `say -v Kyoko`, synthetic speech with flat prosody, which is a harder listen than the
human speech in a video; and 200 sentences of one pair is one sample of one direction, not a
ranking of the fifty-odd languages the picker offers.

```
Translation Score                Turn Complete (speech-end to full translation)
      n=200                             n=200
 0-2  █·····················   5.0%    <2s  ██████████████████████ 100.0%
 3-4  ██····················   8.5%   2-3s  ······················   0.0%
 5-6  ██····················   9.0%   3-4s  ······················   0.0%
 7-8  ██████················  26.0%   4-5s  ······················   0.0%
9-10  ███████████···········  51.5%   5-7s  ······················   0.0%
      avg=7.76  p50=9.00               avg=0.23  p50=0.03  p90=0.73  max=1.32
```

There is no build. The extension directory is what ships.

```bash
npm run package    # interpretab.zip, ready for the Web Store dashboard
```

Verified 2026-08-17: 26 files, 184 KB unpacked and 79 KB zipped, `manifest.json` at the root,
nothing from `.git`, `tests/`, `store/`, `docs/` or `package.json`. This file is excluded too —
37 KB of developer documentation that no user or reviewer opens, and it was a quarter of the
package. `LICENSE` and `PRIVACY.md` do ship: two files, a few KB, and both are documents a user is
entitled to. `tests/assets.test.js` works the list out from the script's own `-x` globs and
asserts both halves of it, so a new top-level file is either deliberately in the ZIP or
deliberately out of it.

The sentence above is the invariant, and it is worth stating as one because it was briefly untrue.
For a day the user guide sat at the repository root, excluded from the ZIP by eleven globs, and
the packaged extension was correct while the *unpacked* one would not load at all — Chrome
reserves top-level names beginning with `_`, and Jekyll needs four of them. Nothing in the ZIP
noticed, and neither did the tests, because everything they check about the package was still
true. The guide now lives in `docs/`; see [Ten languages, one guide](#ten-languages-one-guide).

## The store submission

Submitted on 17 August 2026 and waiting for review, with auto-publish on approval left on.
Everything that blocked it is closed:
[the five screenshots](https://github.com/kazunori279/interpretab/issues/1),
[the manual checklist in Chrome](https://github.com/kazunori279/interpretab/issues/2),
[the hour-long tab soak](https://github.com/kazunori279/interpretab/issues/3) — the third of the
three hours above, next to [Simultaneous](#soak-results--1-hour-microphone-simultaneous-en--ja)
and [the conversation model](#soak-results--1-hour-microphone-the-conversation-model-en--ja) —
and [registration and submission](https://github.com/kazunori279/interpretab/issues/5).

`store/listing.md` and `store/justifications.md` hold the copy that was pasted into the dashboard
and the answers to its permission questions. They are the source for the *next* version rather
than a record of the last one, so the two can drift: the API-key advice in `listing.md` has been
corrected here and not on the dashboard, which is the sort of thing that only goes in with an
update.

Left for the day it goes live: the install instructions, which tell the reader to download a ZIP
and load it unpacked, and which are now on ten pages rather than two; the dashboard's homepage
URL, which still points at this repo rather than at
[the user guide](https://kazunori279.github.io/interpretab/)
([#11](https://github.com/kazunori279/interpretab/issues/11)); and the detailed description,
which needs that API-key correction. The listing's own text is localised in the dashboard and not
from `_locales`, so the ten catalogues here buy nothing there.

Beyond the listing, [#9](https://github.com/kazunori279/interpretab/issues/9) is the interesting
one: getting the microphone's translated voice into a call without asking the user to install a
virtual audio device first. [Meetings](#meetings) is what ships instead, and it is the whole
feature apart from that one hop.

A soak spends an hour of real quota, so handle the key the way every run here has: write it to a
temp file, never echo it, delete it afterwards — the Live API takes the key as a query parameter,
so anything that dumps a handshake URL leaks it.

## Privacy

See [PRIVACY.md](PRIVACY.md). The short version: audio, transcripts and your API key go from
your browser to Google's Gemini API and nowhere else. Nothing is collected, stored off-device,
or sent to the author.

## Relation to live-translator

Interpretab began as the `extension/` directory of
[kazunori279/live-translator](https://github.com/kazunori279/live-translator), a Gemini Live
translator with a FastAPI relay, an ADK agent and a web app. That version's extension was a
client of the relay, which held the API key. Interpretab drops the relay entirely and carries
the server's session-management logic into the browser; the git history here starts from that
split.

## License

Apache 2.0. See [LICENSE](LICENSE).
