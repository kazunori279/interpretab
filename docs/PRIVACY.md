# Interpretab — Privacy Policy

Last updated: 13 August 2026

Interpretab is a Chrome extension that translates audio in real time. It has **no backend
service**. The developer operates no server, collects no data, and receives nothing from your
use of the extension.

## What the extension handles

| Data | Where it comes from | Where it goes | Where it is kept |
|---|---|---|---|
| **Tab audio** | the tab you start capture on | Google's Gemini Live API, while capture is running | nowhere; streamed and discarded |
| **Microphone audio** | your microphone, only if you enable that direction | Google's Gemini Live API, while capture is running | nowhere; streamed and discarded |
| **Transcripts and translations** | returned by the Gemini API | shown in the side panel and, if enabled, as subtitles on the page | in the side panel only, and lost when it closes |
| **Your Gemini API key** | you, on the Options page | sent to `generativelanguage.googleapis.com` to authenticate the connection, and nowhere else | `chrome.storage.local`, on this device |
| **Your settings and glossary** | you | nowhere | `chrome.storage.local`, on this device |

Audio is captured **only while a session is running** — that is, after you press **Start** and
before you press **Stop**. The extension does not record, buffer to disk, or retain audio. A few
seconds of recent audio are held in memory so that a sentence interrupted by a Gemini session
expiry can be re-sent to its replacement; that buffer is bounded and is discarded when capture
stops.

## Who else is involved

Exactly one third party: **Google**, as the provider of the Gemini API you connect to with your
own key. Their handling of that data is governed by the [Gemini API Additional Terms of
Service](https://ai.google.dev/gemini-api/terms) and the [Google Privacy
Policy](https://policies.google.com/privacy). Note in particular that **the free tier of the
Gemini API may be used by Google to improve their products**, while paid tiers are not; if that
matters to you, use a key on a paid plan.

There is no analytics, no telemetry, no crash reporting, no advertising, and no other network
destination. The extension declares exactly one host permission,
`https://generativelanguage.googleapis.com/*`, and cannot reach any other server.

## What the extension does not do

- It does not sell or transfer your data to anyone. There is nobody to sell it to.
- It does not use your data for anything unrelated to translating what you asked it to
  translate.
- It does not use your data to determine creditworthiness or for lending purposes.
- It does not read page content. Subtitles are *written* to the page you started capture on;
  nothing is read from it.

## Your control

- **Stop** ends capture immediately and closes both connections.
- Removing your API key on the Options page makes the extension unable to connect at all.
- Uninstalling the extension deletes everything it stored, including the key.

## Contact

Questions or reports: open an issue at
<https://github.com/kazunori279/interpretab/issues>.
