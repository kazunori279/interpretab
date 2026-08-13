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
options.js            API key, voice, glossary CSV.
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
onto its own connect config. On the wire they live inside `generationConfig`, and a
misplaced field is **silent** — the API accepts the connection and ignores what it does not
recognise, which surfaces half a minute later as "the translation is in the wrong language".
`tests/setup-frame.test.js` exists to pin the exact shape:

```json
{"setup": {
  "model": "models/gemini-3.5-live-translate-preview",
  "generationConfig": {
    "responseModalities": ["AUDIO"],
    "speechConfig": {"voiceConfig": {"prebuiltVoiceConfig": {"voiceName": "Puck"}}},
    "inputAudioTranscription": {},
    "outputAudioTranscription": {},
    "translationConfig": {"targetLanguageCode": "ja", "echoTargetLanguage": false}
  }
}}
```

`systemInstruction` really is a sibling of `generationConfig`, and the microphone direction adds
it. `echoTargetLanguage: false` matters for the tab direction specifically: the translation
comes out of the same speakers the tab is playing through, and echoing the source language back
as well would put two voices over one video.

Uplink audio is base64 inside JSON, not the raw binary a socket of one's own would take:

```json
{"realtimeInput": {"audio": {"data": "<base64>", "mimeType": "audio/pcm;rate=16000"}}}
```

The recorder worklet emits 128 samples at a time — 8 ms, 125 times a second — and wrapping each
of those would spend more bytes on the envelope than on the audio, so `live-session.js`
coalesces to 32 ms frames. That costs at most 32 ms of latency, far below anything audible next
to the model's own response time.

### Session expiry

Live sessions do not last indefinitely. The server warns with `{"goAway": {"timeLeft": "30s"}}`
and then closes; in hour-long soaks of the [server-based
version](https://github.com/kazunori279/live-translator) this happened about 30 times an hour.
Reacting to it with a reconnect would mean a gap in the middle of a sentence, every few minutes,
so `lib/session-loop.js` does this instead:

1. **On `goAway`, open the replacement immediately** — it is warm in ~200 ms — while the dying
   session keeps speaking and keeps receiving audio.
2. **Swap** when the dying session sends `turnComplete`, or after 5 s of silence, or at the
   `goAway` deadline, whichever comes first. Waiting out the whole deadline would be dead air the
   listener hears in full.
3. **Replay what was never answered.** A bounded ring keeps recent PCM frames with their arrival
   times; on a silent cutover, everything captured since the outgoing session last said anything
   is replayed into the replacement. Nothing was relayed after that point, so none of it has been
   translated — and anything older has been, so replaying that too would translate the same words
   twice.
4. **Close the abandoned caption.** A turn that was cut off will never report itself complete, so
   the loop emits a synthetic `turnComplete` to the UI.

Connect failures back off from 200 ms to 4 s rather than spinning.

**Known limitation.** The server version also tees the microphone into the replacement while a
drain has stalled, and discards that replacement if the drain then recovers — about 120 lines
whose job is to make a cutover *lossless* rather than merely *short*. That is not ported here;
preroll replay covers the common case. The Python implementation is in
[`app/main.py`](https://github.com/kazunori279/live-translator/blob/main/app/main.py) if you
want it back.

Session resumption (`sessionResumption`, a handle valid for two hours) would be the better
mechanism still, and is not used in v1.0: whether
`gemini-3.5-live-translate-preview` accepts the field is unverified, and an unrecognised `setup`
field risks a hard failure at connect for every user.

## Development

```bash
npm test    # node --test, no dependencies and no build step
```

The suite covers the parts that are painful to test by hand: the exact `setup` wire shape, the
GoAway cutover against a fake session and a settable clock, socket lifecycle against a stub
WebSocket, glossary CSV parsing, and a walk over every asset path the manifest and the HTML
name.

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
