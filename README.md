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

[On the Chrome Web
Store](https://chromewebstore.google.com/detail/interpretab/johnocemcoemdhiogfgmphjmlghgdnbm) —
**Add to Chrome**, and the [user guide](https://kazunori279.github.io/interpretab/) takes it from
there. To work on it, load it unpacked instead.

1. Clone this repo — or, without git, **Code → Download ZIP** on the repository page, and unzip
   it.
2. Open `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked**
   and pick this directory.
3. Get a Gemini API key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) —
   the free tier is enough to try it — and paste it into the extension's **Options** page.
4. Open the page you want to translate and **click the Interpretab toolbar icon on that tab**. A
   newly loaded extension has no icon there yet — it is behind Chrome's puzzle-piece button, with
   a pin beside it. The click is not optional: it is what grants access to that tab, and Start
   fails without it.
5. Pick your languages in the side panel and click **Start**. Play the video: the voice comes
   back in that language. If you hear no translation, pick a language other than the one the
   video is already in.

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

### The first run

Installing opens the Options page once, on `install` and not on `update` — the one moment a new
user is certainly looking, and Interpretab can do nothing at all until a key has been typed into
that page. Before this there was no first run of any kind: installing opened nothing and said
nothing, and whatever a new user learned they learned from whichever surface they clicked first.

After that the panel says what is left. Three things must be true before Start does anything — a
key, a direction switched on, and, if that direction is the microphone, Chrome's permission to
open one — and they used to be treated three different ways. The key was prevented with an
explanation and two links. Both directions off disabled Start and said nothing, which is a dead
button. The microphone was not prevented at all: Start ran preflight, captured the tab, opened a
socket, and *then* failed on `getUserMedia`, so the user paid for the whole round trip to learn
something knowable before they pressed it.

`lib/next-step.js` is one ordered list and the panel shows the first unmet entry. The order is
not the order they fail in; it is the order they are worth mentioning in. The key first, because
nothing works without it. A direction next, because that is what Start is waiting on once there
is a key. The microphone last, because it is the only one that depends on a choice the user has
just made — raised before they have switched the microphone on, it answers a question nobody
asked. A fourth precondition stays out of the list: the toolbar click that grants `activeTab` is
the only one nothing can check in advance, because nothing can ask whether the grant is live
except the capture that needs it.

**A side panel cannot show Chrome's microphone prompt.** This is why the microphone step is a
link to Options and not a button that just asks. `getUserMedia` is permission-aware, and Chrome
refuses to raise its prompt from a popup or a side panel: the promise rejects as though the user
had clicked Deny, with no prompt ever shown. It is [confirmed by the Chrome team on
chromium-extensions](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/V09VMCLzvWM)
— "request web permission will also fail in the popup page and side panel page" — and it is the
same constraint that put an allow button on the Options page in the first place, since the
offscreen document where capture actually happens has no UI either. A prompt needs a document
Chrome will anchor one to, which means a tab. `chrome.runtime.openOptionsPage()` takes no
fragment, so which section to land on goes through `chrome.storage.session`, read once and
cleared: without it the reader arrives at the top of a page with eight sections and has to find
the allow button among them.

**The Options page is three groups, and the microphone is in the first.** "Before you start"
holds the key, the plan and Microphone access; "Everything else" holds the three that already
have a default that works; "Microphone translation" holds the last two. The first split is the
same list `lib/next-step.js` walks,
minus the direction switch the panel owns — so what a first run is told to do and what the page
asks it to read through are one thing rather than two. The plan is in the first group despite
having a default because it is the only setting on the page whose right value is a fact about
the key rather than a preference, and getting it wrong fails silently in both directions: a free
key shown a dollar figure it will never be charged, or a billed key showing none. Microphone
access also sits above the rule, and third rather than last in its group, because the panel's
microphone step sends readers straight to it — a section that gets linked to should not be
somewhere a reader would only reach by scrolling past everything optional. It was called
"Microphone" until the page grew an "Audio input" section a few lines below asking *which*
microphone; "Microphone access" is what Chrome and macOS call the permission.

The third group is the two settings that are baked into a session's `setup` frame rather than
applied to a running one — the voice and the glossary — so both carry the same "next time you
press Start" caveat and neither belongs among the settings that take effect immediately. It is
last on the page because the glossary is a scrolling table, and anything under it would be below
the fold. The voice is the loose fit: it is sent for both directions, not only the microphone,
but it is the microphone's translation that anyone picks a voice for.

The permission is watched rather than sampled. The grant happens in a tab this panel cannot see,
so `navigator.permissions.query({ name: "microphone" })` is subscribed to and its `onchange`
takes the banner down the moment Allow is pressed over there. Until the query answers — and it
can also reject outright — the state is null, and null says nothing: a banner asking for
something the panel cannot confirm is unmet is a banner that will not go away when it is.

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
the session: turning one off wipes that direction's lines off the page rather than leaving the
last one there, and turning it on puts the overlay up even if neither was on at Start. The side
panel keeps the full transcript either way.

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

**Hearing them works out of the box everywhere. Being heard is where the meeting client matters.**

**On Google Meet, nothing to install.** Start a run from the `https://meet.google.com/` tab with
**Microphone** on, and the panel's microphone card grows a switch — **Send the translation into
this Meet call**, on by default and shown on no other site. Then, in Meet, **Settings → Audio →
Microphone → Interpretab (translated)**, and **turn Studio Sound off** while you are in there: it
is a second of latency on a path that has too much of it already, and what it removes is
background noise from a microphone this device is not. Your own voice is mixed in underneath at
`micToCallOwnVoice` (0.15, the same level the passthrough ducks to) so the call hears you as well
as the interpreter. How that is possible at all is [below](#the-translated-microphone).

While that switch is on, the microphone direction goes to the call *instead of* here: the
translated voice is not played out of this machine, and the microphone's subtitles are off — the
switch for them is disabled in the panel and says so. Both used to happen anyway, and both were
the same thing on screen and in the ear: an interpreter saying what you had just said, three
seconds late, over the person you were listening to. `callMicOn` in `lib/settings.js` is the one
copy of that rule; the panel, the service worker and the offscreen document all act on it, and
the offscreen document is handed the answer at Start because it has no way to ask.

**Everywhere else, being heard needs a virtual audio device.** An extension has no API that
registers an audio *input*, and Manifest V3 has nothing planned, so on any other site the
translated voice can only be played somewhere the meeting is already listening:

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

### The translated microphone

"No extension can register an audio input" is true of the *system*, and nothing in Manifest V3 is
going to change it. It is not quite true of a single web page. A page asks
`navigator.mediaDevices` what microphones exist and then asks it for one, and both of those are
functions living in that page's own JavaScript world — so a script injected into that world can
add a device to the answer and hand back a stream of its own when the page picks it. That is
[#9](https://github.com/kazunori279/interpretab/issues/9).

Meet only, and that is a decision rather than a first step. "How much of the plumbing does this
tolerate" was answered by running it against one application's device picker, and the answer does
not carry to Zoom or Teams without being asked again — so `CALL_ORIGIN` is one exported constant
in `lib/settings.js`, and the rule built on it, `callMicOn`, is one exported function. The panel
imports both, the origin to decide whether the switch exists and the rule to decide what the rest
of the card means; the service worker imports the rule to decide whether the shim goes in. Two
copies of that string is how the two come to disagree, which shows up as a checkbox that does
nothing.

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

`micToCall` is read once, at `start()`, and it is deliberately *not* in `LIVE_KEYS` — so the panel
toggling it restarts the run, which is exactly what applies it in both directions: Start injects
the shim, and the Stop on the way there pulls it back out of the page. A live key would have
needed two more messages to say the same thing.

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
  jitter buffer — is still open, pending a reading of the range described above. A third call, on
  the build that ships the switch, came back at **about three seconds** again: the figure is
  reproducible rather than a bad afternoon, and nothing about promoting the flag to a default
  moved it either way.
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

The lead reports still go to `console.info` from the service worker, and stay there: they are a
diagnostic for the open question above, not something a user of a working call has any use for.
What did come out of the console is the failure — an injection that does not take is invisible
from the panel, because the session connects and the transcript fills and the only symptom is a
device that never appears in a menu in another window — so that one goes to the panel's output
note, next to "the audio output device went away", which is the same sentence.

## Limitations

- **Off Google Meet, the microphone direction's translated speech reaches a call only through a
  virtual audio device.** On Meet the extension offers the page a microphone of its own
  ([#9](https://github.com/kazunori279/interpretab/issues/9)) and nothing needs installing. That
  works by injecting into one page's JavaScript world, so it reaches one site; anywhere else the
  last hop is the user's: install [BlackHole](https://existential.audio/blackhole/) or
  [VB-Cable](https://vb-audio.com/Cable/), point **Options → Audio output** at it, and select it
  as the microphone in the meeting. See [Meetings](#meetings).
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

**A quota that runs out mid-session does not look like that at all**, which took a measurement to
find out. Everything above is about a close *before* the session is ready; the other case — a run
that is working and then is not — was reasoned about and never observed, so the branch handling it
was a guess. `tests/quota-close.mjs` removes the guess by moving the limit instead of the usage:
for the Live models the free tier's only enforced lever is
`generate_content_free_tier_input_token_count` at `1/min/{project}/{model}` (every
requests-per-minute and requests-per-day bucket for every `*-live` model reads -1), so a consumer
quota override down to a hundred tokens makes one session cross it in six seconds. What the server
does is close with **1011**, `wasClean` true, a tenth of a second after the last frame, carrying

> You exceeded your current quota, please check your plan and billing details. For more information
> on this error, head to: h

— 123 bytes, which is the whole of what a close frame allows, so it stops mid-URL. Three things
follow. The sentence exists, and `LiveSession` was throwing it away: a close after `setupComplete`
reported the code alone, and 1011 on its own is the generic server-side failure and says nothing.
The match has to be on the front of the string, because the end is the part that gets cut. And the
handshake succeeds *either way* — a session opened with the quota already spent still gets
`setupComplete`, then the same 1011 eight hundred milliseconds later — so this never arrives as a
failed `open()`, and ten retries would all connect and all die, telling the user after two minutes
that the connection "keeps dropping". The loop now stops on the first one and shows what `preflight`
shows for the same limit hit at Start.

The measurement covers the per-minute token bucket, which is the one an override can reach. Whether
the daily free-tier bucket closes the same way is still unobserved, which is why the 1006 wording
still lists a spent quota among its guesses rather than ruling it out.

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
price table that is Google's and can change under it — corrected without a release by
`docs/config.json`, and watched by the two issues in
[Who watches the config file](#who-watches-the-config-file).

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

### The two facts that expire

Two things this extension hardcodes belong to Google rather than to it: which Live models exist,
and what they cost. Both change on Google's schedule. A preview model gets two weeks' notice
before it is switched off; a Chrome Web Store review takes, in the words on the submission dialog,
*up to several weeks*. The notice period is shorter than the fix, so on the day
`gemini-3.5-live-translate-preview` goes away, every installed copy stops translating and there is
nothing a new version can do about it in time. The price table goes stale the same way, more
quietly: the meter keeps printing a figure and the figure is simply wrong.

So `lib/remote-config.js` reads a file at runtime:

    https://kazunori279.github.io/interpretab/config.json

It is `docs/config.json` in this repository, served by the same GitHub Pages site as the guide.
Publishing a correction is a commit to `main`, live in about a minute, and it reaches an installed
copy within six hours without anyone updating anything.

**It is data and never logic.** MV3 bans remotely hosted *code* and explicitly permits the
opposite of it — Chrome's own migration guide names "your extension loads and caches a remote
configuration (for example a JSON file) at runtime" as a supported pattern. The line that gets
crossed is interpreting the file: a JSON document describing steps to perform is an interpreter
whatever its MIME type. Nothing here is executed, evaluated, or rendered as markup. Every field is
a model name, a number, a version or a link, and `parseConfig` checks each against a fixed shape
before anything else sees it.

```json
{
  "schemaVersion": 1,
  "models": {
    "simul": ["gemini-3.5-live-translate-preview"],
    "conversation": ["gemini-3.1-flash-live-preview"]
  },
  "rates": {
    "gemini-3.5-live-translate-preview": { "audioIn": 3.5, "audioOut": 21.0 },
    "gemini-3.1-flash-live-preview": { "audioIn": 3.0, "audioOut": 12.0 }
  },
  "ratesReadAt": "2026-08-17",
  "blockBelowVersion": "",
  "learnMoreUrl": "https://kazunori279.github.io/interpretab/"
}
```

`ratesReadAt` is the one field nothing in the extension reads. `parseConfig` takes the fields it
knows and skips the rest, which is what lets a field be added without raising `schemaVersion` and
retiring every reader in the wild. It is there for the workflow below and for anyone opening the
file: the date the prices in it were last confirmed against Google's pricing page. It moves only
when the agent came back with a price for every name a session actually starts on — the head of
each list, and the two compiled into the build — so it is a floor rather than a note of when the
script last ran. Not every name in the file: Google's pricing page stops listing a preview about
when it stops serving it, and a date pinned to the oldest fallback in the list is a date that
never moves again.

**A missing answer changes nothing.** Every field has a bundled counterpart that was correct the
day the build shipped, and the file only ever replaces one. An offline user, a 404, a truncated
body, a `schemaVersion` this build has never heard of — all four land where never having asked
lands. That is also the rule for anything malformed *inside* a valid file: a model list that lost
an entry to validation is dropped whole rather than used in half, because guessing which half was
meant is worse than using none of it, and a rate table with no valid entries is null rather than
empty, since an empty table would price every model as the expensive one.

The failure this design has to survive is its own. A text file that can name the models is a text
file that can brick every installation at once, so `modelCandidates` always puts the bundled model
in the list — appended when the file omits it, left in place when the file names it. The worst a
wrong file can do to models is add names that do not work in front of the one that does.

**When a model dies mid-run**, `SessionLoop` spends what it holds before it asks for more. A
retired name usually announces itself during `setup`, so it arrives as an `open()` that never
completed rather than as a session that died; `isModelUnavailableClose` reads the sentence in the
close — *Publisher Model `models/…` was not found or is not supported for bidiGenerateContent* —
and never the code, which is 1008, which is also what a routine session expiry closes with 31
times an hour. The next candidate is tried immediately, off the backoff curve, because the audio
is still arriving. Only when the candidates are gone does the loop force a re-fetch with the TTL
ignored, once per run: this is the moment the file is most likely to have been corrected, and the
list in hand may be hours old. If that turns up nothing new, the run stops and says so.

**`blockBelowVersion` is the emergency brake**, and the one field that can hurt someone whose
extension is working. It exists for the case the fallback cannot reach: Google changes the
protocol, or a new model behaves differently enough that a shipped build produces nonsense rather
than an error. Setting it to a version above the ones in the wild disables **Start** and puts a
notice in the side panel explaining how to update, with a *What happened?* link to
`learnMoreUrl` — which may only point at this project's own site or repository, because a field
that can send every user of the extension anywhere is a larger thing than that notice needs.

Because a mistake here is inflicted on everybody at once, the recovery path is the fast one: a
build that believes it is blocked re-checks every 15 minutes instead of every 6 hours, so
publishing `""` again lifts the block on the user's next panel open. `isBlocked` answers false for
every uncertain state — no file, no threshold, an unparseable version on either side — since
refusing to translate for someone whose extension works is worse than translating with one that is
about to fail on its own and say why. Raising a block is:

```jsonc
"blockBelowVersion": "1.0.4"   // every build below 1.0.4 stops; "" lifts it
```

**The request sends nothing.** A plain `GET` of a static file: no query string, no key, no version,
no identifier, `credentials: "omit"`, `referrerPolicy: "no-referrer"`, a four-second timeout and a
64 KB cap on the body before it is parsed. GitHub Pages was chosen over `raw.githubusercontent.com`
— both answer `access-control-allow-origin: *`, which is what lets either be fetched from a service
worker with no new host permission and therefore no new permission warning on update — because it
is the host already named in the store listing and in the guide, and a connection to somewhere the
user has been told about is a smaller claim than a new one. It is disclosed in `PRIVACY.md` and
switchable off at **Options → Model updates**, which also deletes the cached copy.

One shape worth noting: the fetch lives in the service worker, not in the offscreen document.
`chrome.storage` is undefined in an offscreen document — it gets `chrome.runtime` messaging and
nothing else — so the forced re-fetch a dying model triggers is a message to the worker and back.

### Who watches the config file

A file that corrects the build is only as good as whoever notices it needs correcting. Left alone,
that is the users: a preview is switched off, and the first anyone here hears about it is a bug
report. Two workflows stand in for that.

**`.github/workflows/model-health.yml`, hourly.** `tests/model-check.mjs` asks the API
two questions about every name in `docs/config.json` *and* the two compiled into the build, since
`modelCandidates` keeps the bundled name as the last resort and a bundled model going away is an
outage the config file says nothing about. First `ListModels`, which is where a withdrawn name
stops appearing and where a surviving name can quietly lose `bidiGenerateContent`. Then a real
socket: the same `setup` frame the extension sends, built by `buildSetup` so that a change to what
this extension asks for is a change to what gets checked — including `translationConfig`, the field
a general-purpose model rejects and the reason a catalogue lookup is not enough. It waits for
`setupComplete` and closes, sending no audio, so a run costs two sessions and no tokens.

Failures are split into *gone* and *something else went wrong*, by the same
`isModelUnavailableClose` the extension's own fallback keys on. Only *gone* is allowed to start a
rewrite. A network blip at 03:00 must not read as Google retiring a preview.

It ran at `*/5` for its first hour, which GitHub's best-effort queue turned into one run in the
first forty minutes. A schedule the queue ignores is not a schedule, so it is `0 * * * *` now.
Against two weeks' notice an hour is not the constraint, and the runs that were being dropped were
the ones that would have found nothing.

**`.github/workflows/model-discovery.yml`, daily and on an outage.** The other half of the
question: what replaced it. The names appear on Google's own documentation pages hours before
anything else knows, which is a job for a model with a browser attached rather than for a scraper
this repository would then maintain against someone else's HTML. `tools/find-models.mjs` asks
`gemini-3.5-flash` on Vertex AI, with `url_context` and `google_search`, what the current Live
model ids and audio prices are, then asks a second time — no tools, a response schema — to turn
that prose into JSON. Grounding and a schema fight each other; two calls is cheaper than the
prompt engineering to make one work.

The grounded half of that is the flakiest thing in this repository. One sitting produced a
five-minute timeout, a 429, and an HTTP 200 carrying `MALFORMED_FUNCTION_CALL` and no content at
all after thirty-five thousand tokens of thinking. Each is retried once behind a pause, and a run
that keeps coming back empty drops to `url_context` on its own, which answers with less but has
never malformed. What it will not do is return an empty answer as a result: the first version of
this printed "no change" after learning nothing, which is the same thing it prints when everything
is fine. Now it throws, and the workflow goes red.

It commits to `main`, which means it edits the file every installation reads within hours with no
human in between. Four things stand between a guess and that file:

- **A name is verified before it is written.** Every candidate goes through the same `checkModel` —
  a real session, `setupComplete` or nothing. An invented name never verifies, so an invented name
  never ships.
- **`mergeConfig` may only widen.** Newcomers go *behind* the name already serving users, because
  the first name is the one every session starts on and a discovery should be a fallback before it
  is a default. A name that verified gone is dropped, except the last one: an empty list means "the
  file has no opinion", which is the opposite of what an outage should say.
- **And only forwards.** A candidate has to be at least the generation already in the list —
  `gemini-3.5-…` next to `gemini-3.1-…`, or the same model at the same generation under the GA id
  or a newer dated preview, both of which are how a preview usually ends. Nothing here has measured
  any of these on a translation, so the only reason to fall back to one is that it is the
  successor; an earlier generation never is. An id with no readable generation is left out, and if
  that leaves nothing to fall back to, the outage issue is the right outcome — a human reading the
  notes beats a promotion this script cannot rank.
- **The emergency brake is not the agent's to pull.** `blockBelowVersion` is copied through
  untouched, and the script aborts rather than writes if it ever differs. The output is re-read
  through `parseConfig` before it is committed, and `npm test` runs against the committed file.

The discovery run is locked behind one open issue labelled `model-outage`. While it is open the
agent does not run again, so a model that stays gone costs one agent run and not one every five
minutes; the issue closes itself when the check next passes. `tests/model-tools.test.js` is about
`mergeConfig`, which is the only function in any of this that decides what gets committed.

**A price goes wrong more quietly than a model does.** A retired model announces itself: sessions
stop opening and the hourly check says so. A changed price announces nothing. The meter keeps
printing, the number is simply wrong, and the two ways that happens both look like an ordinary
morning ([#21](https://github.com/kazunori279/interpretab/issues/21)):

- **The agent came back with no price.** `mergeConfig` keeps the old number when no usable one
  arrives, which is the right thing to do and leaves the file byte-identical to a day when Google
  changed nothing. So the run reports which models it got a price for, stamps `ratesReadAt` only
  when it got all of them, and after three days without a full answer opens one issue labelled
  `price-stale` — the same one-open-issue-is-the-lock shape as `model-outage`, and deliberately a
  different label, so a pricing question never stops the discovery agent from running.
- **The build fell behind the file.** `docs/config.json` is corrected within a day and reaches an
  installed copy within six hours; the `RATES` table in `lib/usage.js` is corrected by a release.
  That table is what a fresh install prices with before its first fetch, what a user who turned
  **Model updates** off prices with for good, and what an offline run falls back to.
  `tools/check-rates.mjs` (`npm run check:rates`) compares the two, and the workflow opens a
  `price-drift` issue when they disagree.

The comparison is not in `npm test`, and that is on purpose: the workflow runs `npm test` against
the file the agent just wrote, *before* committing it, so an assertion that the two tables agree
would turn every price correction the agent found into a red run that commits nothing. It runs as
its own step after the commit, and the answer is an issue rather than a failure. Fixing it is a
human's job — copy the numbers into `lib/usage.js`, update the date in the comment above them, and
ship. Nothing automated may edit that file: the argument for letting a workflow commit unattended
is that it writes data and never code.

Setting it up needs three repository variables and one secret — see
[Development](#development).

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

**The English is written for someone who has never heard of an API.** The person this is for
watches a video in a language they don't read, or sits in a call with someone they can't follow;
they are not a developer, and the catalogue was full of words that only make sense if you are one.
Every message was rewritten against one rule — say what happens and what to do about it, in the
words the user already has. *API key* became *key*, *quota* became *what Google allows for now*,
*tier* became *plan*, *the free tier's limits on the Live models are low* became *the free plan
does not allow much*. Internal vocabulary went too: a *direction* is not a thing anybody outside
this repo has a name for, so the switches are called what the switches are called, "Tab audio" and
"Microphone". Where a message named a mechanism, it now names the consequence: not "two concurrent
Live sessions, so the API usage is roughly double" but "two translations at once, so Google charges
about twice as much". What deliberately stayed: `Start`, `Stop`, `Free`, `Paid`, the two mode
names, and the glossary's CSV header, all for the reasons above — plus `panelUsagePaid`, which
`tests/assets.test.js` pins to a sentence in all eleven guide pages.

Chrome's own vocabulary leaked in the same way. The microphone status used to render the
Permissions API state into the sentence — "Not granted (prompt)" — where `prompt` is a word about
Chrome's state machine and not about anything the reader can do. It is now "Not allowed yet.", and
`denied` gets a message of its own, `optMicBlocked`, because that is the one state the Allow button
cannot get out of: Chrome will not raise a second prompt, so telling the reader to press it again
is telling them to do nothing. The `denied` message sends them to Chrome's settings instead.

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
cannot share a root. With the source at `/docs`, `docs/ja/index.md` is still `/interpretab/ja/`,
so no published *page* moved. What did move is the exclude list in `npm run package`, which was
eleven globs for the same reason and is now one.

What also moved, and was missed for four days, is every image on those pages. The guide was
written when Pages built from the repository root, where `store/hero-tab-ja-en.png` and
`icons/icon-128.png` were paths that resolved; the move was a pure rename of ten markdown files
and left all eight images in all ten languages pointing outside the published directory, and
therefore at a 404. Jekyll cannot reach above its source and GitHub Pages will not follow a
symlink out of it, so the fix is that the site owns its images: `docs/assets/`, which is what the
pages now reference. Five of them live only there. The other three do not belong to the site — the
icon is the extension's and two of the screenshots are store uploads the guide reuses — so those
are copies, and `tests/assets.test.js` asserts they are byte-identical to their originals, on the
same reasoning as `PRIVACY.md` below. The test beside it walks every `<img>` and every markdown
image on all ten pages and resolves it, because a broken path repeated in ten translations is not
a thing anyone finds by looking.

`PRIVACY.md` is the one file in both places, and the duplication is deliberate. The store
listing's privacy policy URL is `https://kazunori279.github.io/interpretab/PRIVACY.html`, which
requires the file inside the Jekyll source; the copy a user can read in the extension they
installed requires it at the root of the ZIP; and after the above those cannot be the same
directory. A policy that says two different things depending on where it is read would be worse
than either, so `tests/assets.test.js` asserts the two copies are byte-identical.

`docs/google669da1d9f9338207.html` is Google's site-verification token, one line of text under a
name Search Console chose. It is here rather than at the repository root for the same reason the
images are: only what is under `docs/` is served, and Search Console checks the URL it named and
nothing else. It has no front matter, which is what keeps Jekyll copying it verbatim instead of
rendering it into the theme and burying the one line the checker reads.

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

The guide's install section — "Get started in 5 minutes" — is the one part of it that is markup
rather than markdown: a slideshow of ten steps, a picture each, one showing at a time. It was a
numbered list, and a numbered list is what an installer reads *after* deciding to install — the
sentences said what to do without ever showing what any of it looks like, and one of them was
"get a free Gemini API key", which is a sign-in, a button, two dialogs and a copy compressed
into six words. So the key is now five steps of its own, written for an account that has never
called the API — there is no project to put the key in yet, and the name AI Studio fills in for a
new one is in the reader's language, which the field rejects. Pinning the icon is a step for the
same reason: a freshly installed extension has none on the toolbar, so the step that told the
reader to click it pointed at nothing. The step that starts a session names a page to try it on —
a talking video on YouTube — rather than leaving the reader to think of one.
`docs/_includes/install-steps.html` is the markup once, `docs/_data/install.yml` is its words ten
times, and the CSS is in `head-custom.html` with the rest. There is no script in it. State is a
radio button per step, hidden but still focusable, so the arrow keys walk the steps the way they
walk any radio group, and the tabs are `<label>`s pointing at them; everything else is
`:checked ~`. A slideshow that needs JavaScript to show its first slide shows nothing while the
page is still loading, which is exactly when a new reader is looking at it, and every pane is in
the DOM either way — which keeps the section readable to a search engine, to Reader mode, and on
paper.

The sentence for a step is inside the frame, above the picture, rather than under it: outside, it
read as a caption for something the reader had already looked at, and inside it is the first thing
in the box with the picture as its illustration. The room it takes is reserved whether it fills it
or not and the picture is centred in what is left, so walking the ten steps does not resize the
frame or move the tabs above it.

Each step also marks the one thing it is asking the reader to press: a ring that pulses around it
and an SVG arrow that nudges towards it, both CSS, both off under `prefers-reduced-motion`. On the
three photographs the ring is not a percentage somebody measured once — `tests/guide-shots.mjs`
reads the button's box off the live DOM as it takes the picture, works out which side of it there is
room for an arrow on, and writes both to `docs/_data/shots.yml`, so re-taking a screenshot moves the
ring with the button. The other seven pictures are drawings sharing one CSS browser mock: five are
AI Studio, which is behind a Google sign-in, and two are Chrome's own toolbar and extensions menu,
which no page can photograph — those have the extension's real icon in them. The drawn key is dots
rather than characters, because a plausible-looking key in a picture is a thing somebody eventually
types in.

Links in a step open in a new tab, and the `target` is added by the include rather than written
into the data. The state is a radio button, so a reader who follows the Web Store link and comes
back with the back button comes back to step one — and putting it in one place is the version that
cannot be missed in one of the nine translations.

## Development

```bash
npm test    # node --test, no dependencies and no build step
```

The suite covers the parts that are painful to test by hand: the exact `setup` wire shape, the
GoAway cutover against a fake session and a settable clock, socket lifecycle against a stub
WebSocket, the duplex gate's arithmetic on the same settable clock, glossary CSV parsing, the ten
message catalogues against each other, and a walk over every asset path the manifest and the HTML
name.

Anything that asserts about a sentence rather than a key imports `tests/messages.mjs`, which wires
`lib/i18n.js` to `_locales/en/messages.json` off disk — `chrome.i18n` does not exist in Node, and
without it every message is its own key.

None of that talks to Google. Five scripts do, and all of them sit outside `npm test` because they
need a key and spend quota.

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

**`tests/conversation.mjs` — does it hear both people?**

```bash
node tests/conversation.mjs /tmp/key.txt --turns 12
node tests/conversation.mjs /tmp/key.txt --turns 12 --gate off       # us, or the model?
node tests/conversation.mjs /tmp/key.txt --reply-gap -1500           # talking over the interpreter
```

The soak speaks one language for an hour, so it can say translation still works; it cannot say
anything about conversation mode's actual job, which is deciding *which way* to interpret an
utterance nobody declared the language of. This is the two-speaker case, written for a report that
English utterances are sometimes ignored while the Japanese half of the same conversation comes
back interpreted every time.

Two things could be doing that, and they are in different places, so the run measures both instead
of picking one. The duplex gate is ours: in conversation mode — and nowhere else, see
`usesDuplexGate` — the microphone's frames are dropped for as long as the interpreter's own voice
is still playing, and because the model sends a sentence far faster than it takes to say, that gate
stays shut for seconds after the socket has gone quiet. Anyone who starts talking before the
interpretation has finished is not being ignored by the model; they are being cut off here, before
a byte leaves the machine. The echo guard is the model's: the instruction tells it to ignore "your
own output coming back", and in a two-language session its own voice is, half the time, speaking
the same language as one of the humans.

So the gate is reproduced frame for frame — `duplexGate` in `tests/live-harness.mjs`, deadline
arithmetic pinned by `tests/duplex-gate.test.js` — and the report splits every lost utterance by
whether the gate ate the front of it. What went out whole is then split again by whether the
interpreter had just spoken that speaker's own language, which is the condition the echo guard can
misfire on. Getting turns that are *not* in that condition is why the generated dialogue is asked
for a couple of places where the same person speaks twice in a row: in a strictly alternating
conversation every single turn follows the interpreter speaking that speaker's language, and a
column that is true for every row explains nothing.

The dialogue is written by a model rather than kept in the file, because a behaviour that shows up
"sometimes" is one that a fixed dozen sentences can miss and read as fixed. Both voices are
synthesised before the session opens and every utterance is scored after it closes: a `say`
invocation or a judge call in between is a pause the interpreter's voice finishes in, and the gate
would then never bite. An utterance restated in the language it was already spoken in is counted
apart from a low score — that is the routing failing, the same failure as being ignored wearing a
different face — and either one fails the run.

What the first three runs found is nothing, and the reports are here: `conv_default.report`,
`conv_ungated.report`, `conv_bargein.report`. Thirty-six utterances, none ignored, none restated,
scores between 9.0 and 9.7. The gate does bite — talking 1.5 s over the interpreter took the front
off eight of twelve utterances, a median of 0.28 s and at most 0.86 s — and every one of them was
still interpreted. The ceiling is the clip's own second of leading silence: 1.5 s of overlap plus
the 0.4 s release comes to 1.9 s, and the first second of that is padding, so cutting deeper needs
a larger negative gap. So the report stands unexplained, and what these runs cannot produce is the
likeliest reason: the model heard clean synthesised speech, never its own voice off a speaker. The
gate is reproduced here, but the playback that feeds a room's echo back into the microphone is not,
and neither is two people talking at once.

Two measurement bugs were found by the first run and are worth knowing about, because one of them
had been in `soak.mjs` since the port. `usage` frames arrive on the same path as transcripts, and
one landing in the accumulator appends the string `undefined` to the sentence about to be scored.
And a model asked for a conversation in two languages does not write one: it writes a sentence and
then writes that same sentence in the other language, so twelve turns carry six sentences said
twice. Told not to, it does it anyway. The dialogue is therefore written monolingual first and half
of it translated afterwards — B answers A because at that point there is nothing to translate.

**`tests/quota-close.mjs` — what does running out actually look like?**

```bash
gcloud alpha services quota update \
  --service=generativelanguage.googleapis.com --consumer=projects/<project> \
  --metric=generativelanguage.googleapis.com/generate_content_free_tier_input_token_count \
  --unit='1/min/{project}/{model}' --dimensions=model=gemini-3.5-live-translate \
  --value=100 --force
node tests/quota-close.mjs /tmp/key.txt /tmp/ja.wav --direction mic --mic-mode simul
gcloud alpha services quota delete … --override-id=<from the list output>   # put it back
```

The one failure mode that cannot be waited for and should not be paid for. Lowering the limit
costs nothing and takes seconds; exhausting the real one costs a day and can be done once. It
drives `LiveSession` directly rather than `SessionLoop`, because the loop exists to hide exactly
the event being measured, and reports the four things the handling turned on: the close code, the
verbatim `reason`, the frames either side of it, and how long after the last frame it arrived. The
dimension is the model *family* — there is no `gemini-3.1-flash-live` bucket at all, so
`gemini-3.1-flash-live-preview` accounts under `gemini-3-flash-live` — and an override on the id
the extension sends is accepted and does nothing. What it found is above, under the session loop.

**`tests/model-check.mjs` — are the models in `docs/config.json` still there?**

```bash
node tests/model-check.mjs /tmp/key.txt          # a line per model
node tests/model-check.mjs /tmp/key.txt --json   # what the workflow reads
```

What `.github/workflows/model-health.yml` runs every hour, and the same thing to run by
hand before a release. `ListModels` for whether a name is still in the catalogue and still does
`bidiGenerateContent`, then a real `BidiGenerateContent` socket for whether a session actually
opens. No audio is sent, so a run costs two sessions and no tokens. Exits non-zero if anything is
unreachable. See [Who watches the config file](#who-watches-the-config-file).

**`tools/find-models.mjs` — and what replaced the one that went away?**

```bash
node tools/find-models.mjs /tmp/key.txt --dry    # print the merge, write nothing
node tools/find-models.mjs /tmp/key.txt          # write docs/config.json if it changed
```

The Vertex AI half: `gemini-3.5-flash` reads Google's model and pricing pages, and every id it
comes back with is opened as a real session before it is allowed anywhere near `docs/config.json`.
Locally it borrows whatever `gcloud` is signed in as; in CI it gets an access token through
Workload Identity Federation. `--dry` is the one to reach for first — the merge rules are stricter
than they look, and seeing what it would have written is usually the answer.

**`tools/check-rates.mjs` — is the build still charging what the file says?**

```bash
npm run check:rates                              # exits non-zero on a difference
```

Compares the `RATES` table in `lib/usage.js` with the `rates` in `docs/config.json` and prints
what differs. Worth running before a release: the file is corrected by the workflow within a day
of a price changing, and the build only picks that correction up when someone ships it. It is not
part of `npm test`, for the reason in
[Who watches the config file](#who-watches-the-config-file).

Running the discovery agent in CI needs, on the repository:

| | |
| --- | --- |
| `GEMINI_API_KEY` (secret) | the key both scripts check models with |
| `GCP_PROJECT` (variable) | `gcp-samples-ic0` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` (variable) | `projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>` |
| `GCP_SERVICE_ACCOUNT` (variable) | the service account the provider may impersonate, with `roles/aiplatform.user` |

The federation is a one-time setup, and the point of it is that no service-account key ever lands
in this repository: the runner proves which repo it is with a short-lived OIDC token, and Google
trades that for an access token good for the hour.

The pool and the OIDC provider are per-owner, not per-repository, so check for one before creating
another — `gcp-samples-ic0` already had `github-actions-pool/github-provider`, which admits any
repository under `kazunori279`. What narrows that to this one is the `workloadIdentityUser` binding
below: it names `attribute.repository/kazunori279/interpretab`, so a token from a sibling repository
authenticates and then cannot impersonate the account.

```bash
project=gcp-samples-ic0
number=$(gcloud projects describe "$project" --format='value(projectNumber)')
account=interpretab-models@$project.iam.gserviceaccount.com
pool=github-actions-pool     # gcloud iam workload-identity-pools list --location=global
provider=github-provider     # ... providers list --workload-identity-pool="$pool"

gcloud iam service-accounts create interpretab-models --project="$project" \
  --display-name="Interpretab model discovery"
gcloud projects add-iam-policy-binding "$project" \
  --member="serviceAccount:$account" --role=roles/aiplatform.user

gcloud iam service-accounts add-iam-policy-binding "$account" --project="$project" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$number/locations/global/workloadIdentityPools/$pool/attribute.repository/kazunori279/interpretab"

gh variable set GCP_PROJECT --body "$project"
gh variable set GCP_SERVICE_ACCOUNT --body "$account"
gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER \
  --body "projects/$number/locations/global/workloadIdentityPools/$pool/providers/$provider"
```

If there is no pool yet, create one and point the provider at GitHub's issuer first. The mapping has
to carry `attribute.repository` or the binding above has nothing to match on:

```bash
gcloud iam workload-identity-pools create "$pool" --project="$project" --location=global
gcloud iam workload-identity-pools providers create-oidc "$provider" \
  --project="$project" --location=global --workload-identity-pool="$pool" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner=='kazunori279'"
```

The key is the one thing with no federation behind it, so it gets its own, restricted to the one
API the checks call and revocable without touching anything else in the project. It goes to GitHub
through a file, because a key on a command line is a key in the shell history:

```bash
umask 077
key=$(mktemp)
gcloud services api-keys create --project="$project" \
  --display-name="interpretab model health (GitHub Actions)" \
  --api-target=service=generativelanguage.googleapis.com \
  --format='value(response.keyString)' > "$key"
gh secret set GEMINI_API_KEY < "$key"
rm -f "$key"
```

**`tests/onboarding.mjs` — does the first run still guide anyone?**

```bash
node tests/onboarding.mjs             # headless, ~15 seconds
node tests/onboarding.mjs --headed --keep    # watch it, and leave the browser up
```

This one needs a Chrome binary rather than a key, and spends nothing: the key it types is the
string `not-a-real-key` and it opens no socket. It installs the unpacked directory into a
throwaway profile over the DevTools Protocol and walks the whole of [the first run](#the-first-run)
— the install opening Options, each of the three banner steps in order, the link landing on the
Microphone access section rather than the top of the page, the grant taking the banner down from
another tab, and a revoke bringing it back. Twenty-seven assertions and eight screenshots, written to
`tests/onboarding/report.md`. `lib/next-step.js` is unit-tested and none of that is: the ordered
list is pure and testable, and everything the user actually meets is browser behaviour.

`--load-extension` is ignored by current Chrome, so the install goes through the protocol's
`Extensions.loadUnpacked`. That is the better door anyway — the browser is already attached when
`onInstalled` fires, so the install-time tab is observable, which a command-line load cannot
offer. There is no driver library: Chrome speaks the DevTools Protocol over a WebSocket, Node has
had one of those for several releases, and `tests/chrome-harness.mjs` is the four commands a UI
test needs. Every run gets a fresh `--user-data-dir`, which is what makes install-time behaviour
testable more than once and keeps the test away from the browser the user is signed in to.

Three things it does not reproduce, and the report says so: the side panel is browser UI, so the
panel is walked as an ordinary tab of the same document; Chrome's permission prompt cannot be
clicked over the protocol, so the states either side of it are set directly — this says nothing
about the finding that the prompt cannot be raised in a panel at all; and a headless browser has
no microphone, so the permission is granted and never used.

It found one thing on its first run. `openOptionsPage()` focuses an Options tab that is already
open instead of loading a new one, and `init` does not run again in a page that never reloaded —
so the microphone link did nothing at all when Options was open, which after the install-time
open is the likely case, and left `optionsFocus` in session storage to ambush some later visit.
The page now takes the request as a `chrome.storage.session` change as well as on load. Step 6 of
the walkthrough is that bug.

**`tests/config-ui.mjs` — does the update notice still work?**

```bash
node tests/config-ui.mjs              # headless, ~10 seconds
node tests/config-ui.mjs --lang=ja    # the same walk in another catalogue
```

The same harness, pointed at [the file the extension reads](#the-two-facts-that-expire). The
notice it draws is the one piece of this extension that is written years before it is needed and
seen once, by everybody, on a day when nothing else works — so it is exactly the thing that rots
unnoticed. Twenty-three assertions and five screenshots in `tests/config-ui/report.md`: that a
file blocking nothing is invisible, that a block reaches a panel which has already finished
rendering, that the *What happened?* link appears only when the file offered a destination, and
that **Options → Model updates** both stops the request and deletes the cached copy — the second
half being what stops an opt-out from stranding somebody behind a block that nothing can now lift.

It reaches no network. Every state is seeded into `chrome.storage.local` the way a successful
fetch would have left it, with a timestamp inside the TTL, so the worker answers from the cache
and never opens a socket: the subject is the wiring between the worker, the panel and the Options
page, not GitHub's uptime.

`--lang=ja` runs the whole walk in a Chrome set to another of the ten languages, and every
assertion then reads `_locales/ja` instead of `_locales/en`. `tests/i18n.test.js` can only say
that all ten catalogues have the key; this says the notice renders in the language the browser is
set to. macOS ignores `--lang` and asks Cocoa, so the harness also passes `-AppleLanguages` — see
the comment in `chrome-harness.mjs` for why the blank start page has to come out with it.

**`tests/store-shots.mjs` — the store screenshots that are pure extension UI.**

```bash
node tests/store-shots.mjs            # headless, ~10 seconds
```

Three of the five — the glossary, the panel, the key field — are the Options page and the side
panel photographed at 1280×800, and they used to be taken by hand. Which meant they aged: the set
that was sitting in `store/` still said "source auto-detected" and "Original volume while
speaking", and showed an Options page from before it grew its two groups. A screenshot that has to
be re-taken by hand is a screenshot that is out of date, so this takes all three from the same
throwaway profile the onboarding walk uses. It needs no key either — the one it shows is the
obvious fake `NOT-A-REAL-KEY-only-a-placeholder-00000`, written into a profile that is deleted on
the way out.

The composition is `tests/store-frame.html`, a 1280×800 extension page with one iframe on it,
driven by `tests/framed-shot.mjs`. A browser window is never 1280×800, and the pages being shot are
`chrome-extension://` URLs that only a page at the same origin can size, scroll, or ask whether
they have finished localizing themselves. Each shot lays its page out at some width and height in
CSS pixels and scales it up with `zoom`, the product being the frame: the Options page at 916×574
zoomed 1.4, which is what makes 14px body text legible once the store scales the image down, and
the panel at 460×540 zoomed 1.43 on a gradient, wider than the 400px a side panel actually opens at
because at 400 the rewritten sentences wrap enough to push Start off the bottom of the card. The
driver is a file of its own because `guide-shots.mjs` photographs two of its pictures on the same
stage. These three stay English: the store localizes a listing's words, not its screenshots.

The other two are a live session with a real video playing and a real side panel open. Nothing
inside a page can photograph browser UI and no harness can supply the video, so those stay manual —
as do the two `spare-*.png`, which are from the same sitting and were not re-taken.

**`tests/guide-shots.mjs` — every photograph in the guide, in each of its ten languages.**

```bash
node tests/guide-shots.mjs                # headless, one Chrome per language
node tests/guide-shots.mjs --only pages   # the two page pictures, and no network
```

`docs/assets/install-1-store-<lang>.png`, `-2-key-<lang>.png` and `-4-start-<lang>.png` are the
three photographs in the install slideshow: the store listing with its Add to Chrome button, the
Options page with a key in it, and the side panel with tab audio on and Start underneath.
`meet-1-tab`, `-2-mic` and `-3-start` are the three in the Google Meet section — the two direction
cards set up for a call, and the button row. `panel-<lang>.png` and `glossary-<lang>.png` are the
two the prose sits beside, under "Choosing what to translate" and "Teaching it your words". Eighty
files, because every one of the eight is localized and none of it is ours to translate: the listing
is Google's page and says `Chrome に追加` to a reader whose Chrome is Japanese, and the rest is the
extension's own UI coming out of `_locales`. Chrome is launched once per language, which is what
decides both.

The last two used to be the store's uploads, copied into `docs/assets/` and shown to all ten
languages — an English panel above a Japanese sentence about タブ音声, which is the failure the
other seventy-eight exist to avoid. They are taken on the store's stage rather than cropped, so
they still look like the pictures the guide has always had and only their words change, and a page
asks for one by name rather than by path — `{% include page-shot.html name="panel" %}` — so a
translation cannot end up pointing at the English copy. How far short of its 540px frame the panel
falls depends on the language, the English conversation gloss being six lines and the Japanese two,
so the shot says where its page ends and the card comes up to meet it. Both are checked against
`_locales` before they are kept: the heading in the frame has to be the string the catalogue has
for it, so a run where Chrome ignored its `--lang` fails instead of writing ten English pictures.

The other six are crops rather than 1280×800 stages, sized to be legible in the guide's 980px
column. Cropping happens in Chrome, through `Page.captureScreenshot`'s `clip`, and the rectangle is
measured off the DOM rather than typed in — the key shot runs from the top of the "Gemini API key"
heading to the bottom of the line under the field, so a section that grows a line is still framed,
and so is a language whose sentences run longer. `scale` is the other half: the pages are laid out
narrow, so their own text is large relative to the frame, and then rasterized above 1× so the frame
is still wide enough to fill the column.

The listing is the one page here that belongs to somebody else, so the thing the picture is *for*
is checked rather than assumed: the Add to Chrome button's rectangle is read off the page and has
to be inside the crop, and a layout change on Google's side fails the run instead of quietly
shipping a picture of a button that is no longer in it. The crop starts below the store's own
header bar, because headless Chrome will not draw the store's logo and a broken-image glyph in the
corner of a picture meant to build confidence undoes the picture. It needs no key either, and
shows the same obvious fake the store shots do.

The script writes `docs/_data/shots.yml` as well as the pictures. Every rectangle it already
measured to crop by, it measures again relative to the crop — the button's box as a percentage of
the picture, and which side of it the arrow will fit on at the width the guide gives it. That is
the marker the slideshow draws, so the ring is generated by the same run that takes the photograph
and cannot drift away from it. The width the guide gives it is not always the column: a tall
picture runs out of frame height first, so the constants that decide the side include the space the
sentence above the picture reserves, and changing that in the CSS is a reason to re-run this. The
file says not to edit it by hand, and `npm test` checks that each picture it names is on disk and
each side it asks for is one the CSS can draw. A percentage typed by hand could not follow a button
that is `Add to Chrome` in one language and `Hinzufügen` in another; one measured as the picture is
taken does.

`--only` takes the five step names — `store`, `key`, `start`, `meet`, `pages` — and skips the rest,
for a re-take that does not need all eighty pictures. `--only pages` is twenty of them and reaches
no network at all, where a full run visits Google's listing ten times. A run that skipped a
slideshow figure leaves `docs/_data/shots.yml` alone rather than writing a copy with the skipped
figures missing from it.

**`tests/guide-preview.mjs` — the install slideshow, in a browser, before it is pushed.**

```bash
npm run preview                       # opens English; `node tests/guide-preview.mjs ja` for another
```

GitHub Pages builds the guide and nothing here builds it locally — there is no Gemfile, and the
Ruby macOS ships is too old for a Jekyll new enough to match Pages. Everything else on those pages
is markdown and renders the same wherever it is read; the slideshow is the one part that is markup,
so it is the one part with a preview. This is not Jekyll. It is a small interpreter for the subset
of Liquid the include and the stylesheet actually use — `assign`, `if`, `for`, ranges, and seven
filters — run against the real `_data/install.yml` and `_data/shots.yml`, writing one file per
language into a temp directory with a strip along the top to move between them. A tag or filter it
does not know throws rather than rendering as nothing: the include has branches in it now, and a
preview that quietly shows the wrong branch is worse than no preview.

What it is for is the part a diff cannot show: whether the tabs wrap, whether a translated label is
too long, whether the ring lands on the button, whether the arrow has room on the side the data
picked, and whether Arabic comes out mirrored. It loads the published site's own stylesheet rather
than Primer from a CDN. The theme's `.markdown-body` rules are half of what the slideshow is laid
out against — one of them is more specific than a single class — and Primer on its own leaves its
colours unset, so links came out the colour of body text and the preview was lying about the one
thing it is there to show.

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
npm run check:rates   # do the build's prices still match docs/config.json?
npm run package       # interpretab.zip, ready for the Web Store dashboard
```

Verified 2026-08-24 at 1.0.4: 43 files, 653 KB unpacked and 220 KB zipped — most of the growth is
the ten `_locales` catalogues, which do not compress the way code does. `manifest.json` at the root,
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

1.0.1 is published, with auto-publish on approval left on. Everything that blocked the first
submission is closed:
[the five screenshots](https://github.com/kazunori279/interpretab/issues/1),
[the manual checklist in Chrome](https://github.com/kazunori279/interpretab/issues/2),
[the hour-long tab soak](https://github.com/kazunori279/interpretab/issues/3) — the third of the
three hours above, next to [Simultaneous](#soak-results--1-hour-microphone-simultaneous-en--ja)
and [the conversation model](#soak-results--1-hour-microphone-the-conversation-model-en--ja) —
and [registration and submission](https://github.com/kazunori279/interpretab/issues/5).

`store/listing.md` and `store/justifications.md` hold the copy that was pasted into the dashboard
and the answers to its permission questions, with the descriptions themselves one file per locale
in `store/descriptions/`. They are the source for the *next* version rather than a record of the
last one, so the two can drift; `en.txt` and the dashboard were last checked byte-for-byte
identical when 1.0.1 went in.

1.0.0 shipped before the `_locales` work landed, and a listing is localised from the package: no
`_locales` in the ZIP, no locale selector on the dashboard, English served to everyone whatever
`hl=` says. 1.0.1 is the fix — the same ten catalogues the extension already used, so the title
and summary now arrive in the reader's language, and a translated 説明 typed into each of the ten.
That went in together with the category, which was Workflow & Planning on the reasoning that the
old Productivity bucket split that way, and is now Communication, whose definition names video
conferencing outright.

1.0.2 carries [#9](https://github.com/kazunori279/interpretab/issues/9) — the microphone's
translated voice into a Meet call with no virtual audio device to install — out from behind its
flag and into the side panel, and replaces the marquee tile and the promotional video. All of it
in one review, because a package and a listing submitted separately are two reviews and the second
waits on the first. Submitted 2026-08-20 with auto-publish on approval, and published 2026-08-22 —
two days for a review that covered a package, a new marquee tile and a new video at once, which is
the argument for having bundled them.
[The translated microphone](#the-translated-microphone) has what the calls measured; the short
version is that it works, at about three seconds mouth to far-ear, and that a second of that was
Meet's Studio Sound.

1.0.3 is three things. Two nobody would notice until the day they mattered: a run whose quota runs
out mid-sentence now stops and says so, rather than reconnecting ten times and blaming the network
— [Session expiry](#session-expiry) has what the server actually does, which took an override on
the project's per-minute limit to find out — and the microphone card's two paragraphs of grey are
down to one line, `To use, see:` and a link per phase of the guide's Meet section, each opening
that phase's card redrawn at the width of the panel. The cards open below the line under the
buttons, in the space the transcript will use, rather than above them where opening one pushed
Start down the panel. The options page gets the same treatment for the install itself: the
paragraph pointing at the guide is now nine of the guide's ten steps drawn on the page — the first
is installing the extension, and a reader on that page is already inside it — opened for whoever
arrives without a key, which, since Chrome opens that page on install, is everybody once. Saving a
key does not fold it away: pasting one is step six, and a card that closed itself there would take
the last three steps with it, so the only thing that closes it is the button on the last one. The
headphones warning is the first step of
the first card, where somebody who has asked what to do before a call will read it, rather than
four lines to skim past on the way to Start; the step after it is the microphone permission,
which is the one thing on that card the panel cannot do for you — Chrome raises the prompt for a
page, so the step draws the options page's button and links to it. The third is audible from the first call: with the translation going into
a Meet call, the microphone's voice no longer also comes out of this computer and its subtitles
here are off, which is [`callMicOn`](#meetings) above. Held while 1.0.2 was in review, because the
dashboard will not take a package while one is queued, and submitted once 1.0.2 published on the
22nd — where it sat, queued, while the step cards were being drawn.

1.0.4 is that draft with the step cards in it, and it is a separate number because of what a
submission under review will not let you do. While one is queued the dashboard disables Upload new
package, Save draft and Submit for review together: the draft belongs to the reviewer until they
are done with it. The way back is Cancel review, on the ⋮ menu beside the header buttons, which
returns the item to a draft you can edit — it does not touch what is published, which stayed 1.0.2
throughout. After that the upload is allowed, but the version has to move, because 1.0.3 is a
number the dashboard has already seen. So the install card's nine steps and the panel's microphone
step went up as 1.0.4, submitted 2026-08-24 with auto-publish on approval, and the review clock
started again from zero — which is the price of cancelling, and the reason to decide whether a
change is going in *before* pressing submit rather than after.

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

## Disclaimer

- **Not a Google product.** Interpretab is a personal project. It is not made, supported, endorsed
  or reviewed by Google. Google, Gemini, Chrome and YouTube are trademarks of Google LLC.
- **It is machine translation.** It mishears, guesses at names, and sometimes says something the
  speaker did not — confidently, and in a pleasant voice. Do not use it where being wrong costs
  something: medicine, law, money, safety, or anything you would otherwise hire an interpreter
  for.
- **Whose voice you translate is your call.** In some places recording or translating a
  conversation needs everyone's consent, and a site's terms may have their own say about its
  audio. That part is between you and them.
- **No warranty.** Apache 2.0, as-is. Gemini usage runs on your own key and is billed to your
  account.
