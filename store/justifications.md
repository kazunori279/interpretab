# Privacy practices tab — the answers the dashboard asks for

Each heading below is a field in the Chrome Web Store developer dashboard. The text in the code
blocks is what goes in it, verbatim.

Reviewers reject vague justifications far more often than broad ones. Every entry below names
the specific API call the permission enables and the user-visible feature that call implements.

---

## Single purpose

```
Interpretab translates speech in the user's browser in real time: it interprets the audio playing in the current tab into a language the user chooses, and optionally interprets the user's own microphone into another language, delivering both as spoken audio and as subtitles. Every permission it requests serves that one purpose.
```

---

## `tabCapture`

```
This is the feature. The extension captures the audio of the tab the user starts it on so that speech in that tab can be translated. On the Start click, the service worker calls chrome.tabCapture.getMediaStreamId({targetTabId}) for that tab only, and the resulting stream is used for two things: it is resampled to 16 kHz and sent to the Gemini Live API for translation, and it is played back to the user, because capturing a tab mutes it. No other tab can be captured, and capture ends when the user presses Stop.
```

## `offscreen`

```
A Manifest V3 service worker is terminated after about 30 seconds of inactivity and a side panel is destroyed when it is closed, so neither can hold a live audio capture, an AudioContext, or a WebSocket for the length of a translation session. The extension creates one offscreen document with the USER_MEDIA and AUDIO_PLAYBACK reasons to own those objects. This is the supported alternative to keeping a service worker artificially alive.
```

## `sidePanel`

```
The extension's entire user interface is a side panel: the language pickers, the Start and Stop buttons, the running transcript, and the connection status. A side panel is used rather than a popup because a popup closes on any click elsewhere, and the user needs to interact with the video they are translating while the controls stay visible.
```

## `storage`

```
Stores the user's own settings on their device: their Gemini API key, chosen languages, voice, subtitle switches, the ducking level, and their glossary CSV. chrome.storage.session additionally holds which tab is currently being captured, because a Manifest V3 service worker cannot keep that in a variable across its own restarts. Nothing in storage is transmitted anywhere except the API key, which is sent only to generativelanguage.googleapis.com to authenticate the user's own connection.
```

## `activeTab`

```
Grants temporary access to the tab the user clicked the toolbar icon on, which is used to display subtitles over the video on that page. activeTab is requested instead of a broad host permission specifically so the extension has no standing access to any site: the access exists only for the tab the user explicitly invoked it on, and only after that click.
```

## `scripting`

```
Used with activeTab to inject content/captions.js into the tab the user started translation on, which draws the subtitle overlay inside a closed shadow root at the bottom of the page. Injecting on demand avoids declaring a content script that would otherwise run on every page the user visits. The script only writes the overlay; it does not read page content.
```

## Host permission — `https://generativelanguage.googleapis.com/*`

```
The extension opens a WebSocket to the Gemini Live API at this host to perform the translation. This is the only host it can reach, and it is the whole of the extension's network activity — there is no backend service of the developer's, and no analytics or telemetry endpoint. It is declared as a required host permission rather than an optional one so that the single destination is visible in the manifest and cannot be widened silently.
```

---

## Data disclosures

Tick these, and only these:

| Category | Collected? | Why |
|---|---|---|
| Personally identifiable information | No | |
| Health information | No | |
| Financial and payment information | No | |
| Authentication information | **Yes** | The user's Gemini API key is stored on-device and sent to Google to authenticate their own API connection. |
| Personal communications | **Yes** | Captured audio can contain speech, including the user's own. It is streamed to the Gemini API for translation and not retained. |
| Location | No | |
| Web history | No | |
| User activity | No | No clicks, no page views, no analytics of any kind. |
| Website content | No | Audio is captured, but no page text, DOM or media file is read. Subtitles are written to the page, not read from it. |

Then all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Privacy policy URL: `https://kazunori279.github.io/interpretab/PRIVACY.html` — GitHub Pages
serving the repo root with Jekyll renders `PRIVACY.md` at that path. Enable Pages and **open the
URL yourself** before submitting; a policy URL that 404s at review time is a rejection. If Pages
is not wanted, `https://github.com/kazunori279/interpretab/blob/main/PRIVACY.md` is accepted and
needs no setup.

---

## Remote code

Answer **"No, I am not using remote code."** Manifest V3 forbids it and the extension complies:
both AudioWorklet processors are bundled in `audio/`, every script is a local file, and nothing
is loaded with `eval` or from a URL. The only network traffic is the Gemini API WebSocket, which
carries audio and JSON, never code.

---

## Before pressing Submit

- [ ] `npm test` passes.
- [ ] `npm run package` and confirm `manifest.json` is at the **root** of the ZIP, not inside a
      folder.
- [ ] The ZIP contains no `.git`, no `tests/`, no `store/`, and no `package.json`.
- [ ] The privacy policy URL resolves.
- [ ] Screenshots are exactly 1280×800 and contain no real API key.
- [ ] The version in `manifest.json` is higher than the last published one.
- [ ] Load the ZIP's contents unpacked in a clean profile and run once end to end — a packaging
      mistake that only shows up post-review costs days.
