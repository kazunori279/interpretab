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
| **Microphone** | you | `gemini-3.1-flash-live-preview` — one-way agent mode, so the [glossary](#glossary) applies | source and target |

Either direction can be switched off; both can run at once.

The tab direction is fixed to the simultaneous model rather than offered as a choice. A tab
plays whoever it plays — a video cuts to a second speaker, a call hands over to someone else —
so naming a source language up front is a promise the listener cannot keep. Auto-detect is the
only setting that survives contact with real tab audio, which is why there is no source-language
picker on that side.

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

With both directions running, the microphone is **gated while a translation is playing** — its
audio is dropped rather than sent, so the interpreter never interprets itself.

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

The glossary applies to the **microphone direction only**. Tab audio always runs the
simultaneous-translation model, which supports neither a glossary nor system instructions.

## Limitations

- **The microphone direction's translated speech can only reach your own speakers.** Getting it
  into a Meet or Zoom microphone needs a virtual audio device (BlackHole, VB-Cable); no
  extension can do it. For a call, that direction is useful for subtitles and for people
  physically in the room — not for the remote party.
- **Running both directions on speakers invites an echo loop.** Echo cancellation and the duplex
  gate help; headphones are the real answer.
- **The tab direction takes no glossary**, for the reason above.
- **Two directions means two concurrent Live sessions**, so roughly double the API cost.
- Chrome refuses script injection on its own pages, the Web Store, and PDFs, so subtitles do not
  appear there. Capture and the side-panel transcript still work.
- **A session cutover is short, not lossless.** See [Session expiry](#session-expiry).

## How it works

```
service-worker.js     switchboard only. Action click → tabCapture.getMediaStreamId(),
                      create the offscreen document, open the side panel, inject
                      the caption script. Holds no audio and no socket.
offscreen.js          the engine. Owns every MediaStream, AudioContext and WebSocket.
sidepanel.js          controls and the transcript. Closing it does not stop capture.
content/captions.js   subtitles in a closed shadow root, injected on demand.
options.js            API key, voice, subtitle size, glossary CSV.
lib/live-session.js   one WebSocket to the Live API: framing in, framing out.
lib/session-loop.js   the succession — GoAway, pre-open, drain, preroll replay.
lib/languages.js      language and voice tables for both models.
lib/instructions.js   the system instruction the microphone direction sends.
```

**Why an offscreen document.** An MV3 service worker is torn down after ~30 seconds idle, and a
side panel dies when it is closed — neither can hold a live capture. An offscreen document
created with `USER_MEDIA` + `AUDIO_PLAYBACK` has a lifetime independent of both, so putting the
engine there removes the need for any keepalive hack. The service worker keeps what little state
it has in `chrome.storage.session`, never in a module variable.

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

**Ducking and the duplex gate share one signal.** Model audio arrives far faster than realtime,
so "is a voice speaking right now" cannot be answered by "did a frame just arrive". Each
arriving buffer extends a play-out deadline by `byteLength / 2 / 24000` seconds; ducking and the
microphone gate both read that deadline (plus a 400 ms release), and `duckGain` moves on a
`setTargetAtTime` ramp so it does not click.

**Transcripts are segmented by a silence gap, not by a turn.** Simultaneous translation never
sends `turnComplete` — there are no turns in a continuous feed — so the accumulator that joins
streamed increments has no natural end and would run for the whole session, leaving one caption
line that grows until it covers the video. A 2 s gap in the increments closes the sentence
instead. Independently, a caption line is capped at three wrapped rows and bottom-aligned inside
the clip, so a long sentence loses its already-read head rather than its newest words.

**Two directions are two independent sessions, all the way down.** Different models, different
setup frames, no shared state, and the API cost of both. They share exactly one page overlay, so
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
node tests/live-smoke.mjs /tmp/key.txt /tmp/ja.wav --minutes 12    # to see a real goAway
```

It prints what the model heard, what it said, and how much audio came back, so a wrong `setup`
field or a mishandled frame shows up as an empty transcript rather than as a bug report. The key
is read from a file so it stays out of the shell history and the process list. Run both
directions: they use different models and differently shaped setup frames, and one passing says
nothing about the other.

It drives `SessionLoop`, not a bare `LiveSession`, which is what makes `--minutes 12` worth the
twelve minutes: the cutover path can only be exercised by a server that decides on its own that a
session has had enough. The run reports how many sessions it opened, how many `goAway`s it saw,
and the longest gap between two pieces of translated audio — that last number is what a listener
would actually hear at a handover, and it is the one that fails the run if the machinery is
broken. A run past eleven minutes that sees no `goAway` fails too, on the grounds that the expiry
assumption has moved and someone should know.

**`tests/soak.mjs` — does it still work an hour later?**

```bash
node tests/soak.mjs /tmp/key.txt --direction mic --duration 3600 --log soak_mic.jsonl
node tests/soak.mjs /tmp/key.txt --direction tab --duration 3600 --target en --voice Kyoko \
  --source ja --log soak_tab.jsonl
```

An hour of sentences, each one generated by a model, spoken by `say`, streamed in at the speed of
speech, and scored 0–10 against the original by a model. Every third sentence in the microphone
direction is built around a term from `tests/soak-glossary.csv`, and the transcript is checked
both for the pronunciation the glossary asked for and for the spelling the caption is supposed to
show — two different questions, and a model that ignores the glossary and says the English term
verbatim passes the second while failing the first.

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

There is no build. The extension directory is what ships.

```bash
npm run package    # interpretab.zip, ready for the Web Store dashboard
```

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
