# Interpretab

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

Not on the Chrome Web Store yet; load it unpacked.

1. Clone this repo.
2. Open `chrome://extensions`, turn on **Developer mode** (top right), click **Load unpacked**
   and pick this directory.
3. Get a Gemini API key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) —
   the free tier is enough to try it — and paste it into the extension's **Options** page.
4. Open the page you want to translate and **click the Interpretab toolbar icon on that tab**.
   This is not optional: the click is what grants access to that tab, and Start fails without
   it.
5. Pick your languages in the side panel and click **Start**.

Chrome 116 or newer.

### About the key

The key is kept in `chrome.storage.local` and is sent to exactly one host,
`generativelanguage.googleapis.com`, as the `key` query parameter of the Live API WebSocket. It
is never logged, never synced, and there is no server of ours for it to reach.

Usage is billed to whichever Google Cloud project the key belongs to, so treat it like a
password and [restrict
it](https://cloud.google.com/docs/authentication/api-keys#api_key_restrictions) to the
Generative Language API. Two directions at once means two concurrent Live sessions and roughly
double the cost; the side panel says so when both are on.

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
seconds of nothing above the noise floor now puts the device actually being captured on screen,
by name, and points at that setting. A device named there and then unplugged falls back to the
default and says so, rather than resurrecting the silence the setting exists to end.

**Two mute buttons** sit beside Start. The microphone one drops its frames before they are sent,
so what is said while it is on is not heard, not translated, and not charged for. The sound one
drops the translated voice before it is played — including what the player had already buffered,
which is usually seconds ahead of what you are hearing, so it stops mid-sentence rather than
after it. Both apply to a running session without reopening it: a mute that reconnected would
let through the sentence it was pressed for. Neither touches the transcript — with the sound off
the translation still arrives in the panel and in the subtitles.

The sound button is about what *you* hear, so it leaves a microphone direction that Audio output
has routed to a device of its own alone: that voice is going to whatever is listening to the
device, and silencing it is the microphone button's job. When there is nothing on the speakers
to silence, the button is greyed and says why.

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

## Limitations

- **The microphone direction's translated speech reaches a call only through a virtual audio
  device.** No extension can register a microphone, so the last hop is the user's: install
  [BlackHole](https://existential.audio/blackhole/) or
  [VB-Cable](https://vb-audio.com/Cable/), point **Options → Audio output** at it, and select it
  as the microphone in the meeting. See [Meetings](#meetings).
- **Running the microphone on speakers invites an echo loop.** Echo cancellation is what handles
  it in Simultaneous mode, because the duplex gate deliberately does not run there — nor on the
  tab direction's voice. Headphones are the real answer. Two-way conversation mode is the awkward
  case — the whole point is that the room hears the interpretation out loud — so it keeps the
  gate and the instruction's echo guard, and still wants distance between the microphone and the
  speakers.
- **Only Two-way conversation mode takes a glossary**, for the reason above.
- **Two directions means two concurrent Live sessions**, so roughly double the API cost.
- **Quality depends on the language pair, not just the model.** An hour of tab audio scored 64%
  translating Japanese into English and 92% going the other way. See [Soak
  results](#soak-results--1-hour-tab-audio-ja--en).
- Chrome refuses script injection on its own pages, the Web Store, and PDFs, so subtitles do not
  appear there — starting from a new tab is the everyday way to meet this. Capture and the
  side-panel transcript still work, and the panel says to open an ordinary page and start again.
- **A session cutover is short, not lossless.** See [Session expiry](#session-expiry).

## How it works

```
service-worker.js     switchboard only. Action click → tabCapture.getMediaStreamId(),
                      create the offscreen document, open the side panel, inject
                      the caption script. Holds no audio and no socket.
offscreen.js          the engine. Owns every MediaStream, AudioContext and WebSocket.
sidepanel.js          controls and the transcript. Closing it does not stop capture.
content/captions.js   subtitles in a closed shadow root, injected on demand.
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

Connect failures back off from 200 ms to 4 s rather than spinning.

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

## Development

```bash
npm test    # node --test, no dependencies and no build step
```

The suite covers the parts that are painful to test by hand: the exact `setup` wire shape, the
GoAway cutover against a fake session and a settable clock, socket lifecycle against a stub
WebSocket, glossary CSV parsing, and a walk over every asset path the manifest and the HTML
name.

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

Verified 2026-08-16: 30 files, 143 KB unpacked and 68 KB zipped, `manifest.json` at the root,
nothing from `.git`, `tests/`, `store/` or `package.json`. This file is excluded too — 37 KB of
developer documentation that no user or reviewer opens, and it was a quarter of the package.
`LICENSE` and `PRIVACY.md` do ship: two files, a few KB, and both are documents a user is
entitled to. `tests/assets.test.js` works the list out from the script's own `-x` globs and
asserts both halves of it, so a new top-level file is either deliberately in the ZIP or
deliberately out of it.

## Before the store submission

What is left between here and a listing is tracked in
[issues](https://github.com/kazunori279/interpretab/issues) rather than here, so that its state
is visible without reading a README diff. In the order it blocks:

1. [Five screenshots, 1280×800](https://github.com/kazunori279/interpretab/issues/1) — the only
   hard blocker. `store/listing.md` says what each of the five should show and why the order
   matters.
2. [The manual checklist in Chrome](https://github.com/kazunori279/interpretab/issues/2) —
   nothing automated covers any of it, and each item on it is a plausible way to fail a review.
3. [An hour-long soak in the tab direction](https://github.com/kazunori279/interpretab/issues/3),
   the last of the three. Both microphone hours are above:
   [Simultaneous](#soak-results--1-hour-microphone-simultaneous-en--ja), which is what ships, and
   [the conversation model](#soak-results--1-hour-microphone-the-conversation-model-en--ja).
4. [Registration and submission](https://github.com/kazunori279/interpretab/issues/5) — the $5
   developer registration and the dashboard both need the author's Google account, and
   `store/justifications.md` holds the answers the dashboard asks for.

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
