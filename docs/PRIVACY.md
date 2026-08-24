# Interpretab — Privacy Policy

Last updated: 24 August 2026

Interpretab is a Chrome extension that translates audio in real time. It has **no backend
service**: the developer operates no server, collects no data, and receives nothing from your
use of the extension. It makes two kinds of network request and no others — your audio to
Google's Gemini API, and a download of one small static file, both described below.

## What the extension handles

| Data | Where it comes from | Where it goes | Where it is kept |
|---|---|---|---|
| **Tab audio** | the tab you start capture on | Google's Gemini Live API, while capture is running | nowhere; streamed and discarded |
| **Microphone audio** | your microphone, only if you enable that direction | Google's Gemini Live API, while capture is running | nowhere; streamed and discarded |
| **Transcripts and translations** | returned by the Gemini API | shown in the side panel and, if enabled, as subtitles on the page | in the side panel only, and lost when it closes |
| **Your Gemini API key** | you, on the Options page | sent to `generativelanguage.googleapis.com` to authenticate the connection, and nowhere else | `chrome.storage.local`, on this device |
| **Your settings and glossary** | you | nowhere | `chrome.storage.local`, on this device |
| **Model names and prices** | downloaded from `kazunori279.github.io` | nowhere; the request sends nothing about you | `chrome.storage.local`, for a few hours at a time |

Audio is captured **only while a session is running** — that is, after you press **Start** and
before you press **Stop**. The extension does not record, buffer to disk, or retain audio. A few
seconds of recent audio are held in memory so that a sentence interrupted by a Gemini session
expiry can be re-sent to its replacement; that buffer is bounded and is discarded when capture
stops.

## The file the extension downloads

A few times a day while you have the side panel open — and again if a translation fails because
Google has withdrawn a model — the extension downloads

<https://kazunori279.github.io/interpretab/config.json>

It holds the names and the per-token prices of the Gemini models the extension uses. Both are
facts about Google's service rather than choices of the extension's, and Google changes them
faster than a Chrome Web Store review can ship a corrected version.

The request is a plain `GET` of a static file. It carries no query string, no API key, no
version number and no identifier: nothing in it distinguishes one installation from another.
GitHub, who host the file, see what any web server sees when a file is fetched — an IP address
and the headers Chrome sends. Nothing is uploaded, and nothing in the reply is executed: every
field is a model name, a number or a link back to this project, and each one is checked against
a fixed shape before it is used.

Turning it off is one checkbox, **Model updates** on the Options page. The extension then uses
the names and prices it shipped with and deletes the copy it had cached. The cost is that on the
day Google retires a model, translation stops working until you update the extension — and you
will not get the notice that says so.

## Who else is involved

**Google**, as the provider of the Gemini API you connect to with your own key. Their handling
of that data is governed by the [Gemini API Additional Terms of
Service](https://ai.google.dev/gemini-api/terms) and the [Google Privacy
Policy](https://policies.google.com/privacy). Note in particular that **the free tier of the
Gemini API may be used by Google to improve their products**, while paid tiers are not; if that
matters to you, use a key on a paid plan.

**GitHub**, only as the host of the static file above. Your audio, your transcripts and your key
never leave your device for anywhere but Google.

There is no analytics, no telemetry, no crash reporting, and no advertising. The extension
declares one host permission, `https://generativelanguage.googleapis.com/*` — though a host
permission is not what bounds the file download, which GitHub Pages serves with the CORS header
that makes it readable without one. The two addresses named in this document are the whole of
what the extension contacts.

## What the extension does not do

- It does not sell or transfer your data to anyone. There is nobody to sell it to.
- It does not use your data for anything unrelated to translating what you asked it to
  translate.
- It does not use your data to determine creditworthiness or for lending purposes.
- It does not read page content. Subtitles are *written* to the page you started capture on;
  nothing is read from it.

## Your control

- **Stop** ends capture immediately and closes both connections.
- **Model updates** on the Options page turns off the download described above.
- Removing your API key on the Options page makes the extension unable to connect at all.
- Uninstalling the extension deletes everything it stored, including the key.

## Contact

Questions or reports: open an issue at
<https://github.com/kazunori279/interpretab/issues>.
