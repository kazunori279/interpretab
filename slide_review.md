# Reviewing a slide deck

What this repository's deck (`docs/slides/`) was corrected for, written down so the same
corrections do not have to be made twice. The specifics are Interpretab's; the rules are not.

## The loop

Never edit and move on. One slide at a time:

1. Edit.
2. Render it and look at it. `tools/slide-video.mjs` uses the same harness; a screenshot script
   over `tests/chrome-harness.mjs` is three lines.
3. Check the height. Every slide's `scrollHeight` must be exactly 720. `overflow: hidden` on
   `.slide` clips deliberate bleeds at the edge, and it hides accidents just as well.
4. Read the narration against the render. Not against the previous narration.

A rendered preview goes to the reviewer before a slide is rebuilt in the repo. Describing a
layout change costs more words than showing it and is less convincing.

## Words on the slide

**Say what it means in the first sentence.** "This is not something we get to decide" is a
conclusion; "Don't hard-code anything that changes" is the point. Lead with the point and let
the reasoning follow.

**Flat sentences.** "Call the real API and you learn things the docs don't say" beats "Open a
real socket early." The writerly version makes the reader stop and decode.

**Concrete over abstract.** "Whatever the server decided, don't retry it" tells nobody anything.
"A spent quota or a bad key: don't retry" does.

**No unexplained jargon.** *Shim*, *world*, *offscreen document* all needed a sentence the first
time. If a term is load-bearing, define it on the slide. If it is not, cut it.

**Name the specific thing.** "The page side" and "the extension side" are indistinguishable
five minutes in. "Meet's side" is not.

**Describe behaviour, not API names.** A reader who does not know `chrome.runtime` or
`navigator.mediaDevices` still has to follow the slide. "Meet's side can't reach the extension"
survives that reader; the identifier does not.

**Cut what does not serve the slide's point**, however true it is. A detail that is correct and
irrelevant still costs the reader the same attention as one that matters.

## Diagrams

**Every endpoint has to be unambiguous.** An arrow that starts at the edge of a box containing
three sub-boxes raises the question "which one?" and the reader stops to work it out. If the
answer is "all of them", fork the line from a single point on the edge so the shape says so.

**Draw the thing, do not caption it.** Two worlds that behave differently become two boxes, not
a sentence saying there are two. A process where each step has a trigger becomes a sequence
diagram with the triggers in the gutter, not four boxes in a row with the triggers dropped.

**The diagram is the claim, so check it against the code.** This deck drew an uplink and a
downlink when the implementation has two bidirectional sockets, and drew the replacement socket
opening just before the swap when it opens the moment `goAway` lands. Both survived several
readings because the picture looked reasonable.

**`viewBox` height sets rendered slide height.** `.diagram` scales the SVG to the container
width, so a taller `viewBox` makes a taller slide. Change one and re-check the 720.

**Estimate text width before writing it.** At font-size N: a full-width CJK glyph is about N px,
an ASCII glyph about 0.5–0.6 N. Cheaper than rendering, and it catches the caption that runs
into the box edge.

## Narration

The deck is the script: each slide's `<div class="notes">` is what the presenter reads and what
`tools/slide-voice.mjs` sends to the TTS model. There is no second copy to drift.

**Every number in the narration must match the number on the slide.** Seven sessions is six
handovers. A table reading 92.2% does not support "every translation came back correct". These
are the errors an audience catches live.

**Nothing on screen should go unnarrated.** If a slide has three chips and the narration covers
two, the third sits there unexplained. Either say something about it or take it off the slide.

**Finish the diagram.** Narration that covers the first two rows of a five-row sequence diagram
and stops leaves the payoff — the reason the slide exists — silent.

**Rank by what it cost.** The lesson that took longest to find goes early, not wherever it
happened to land in the list.

**Budget the time.** `--dry` prints per-slide word counts without calling the API or needing a
key. Narration plus clips is the whole runtime; there is nothing else to trim later.

## Japanese decks

**Port surgically, do not translate the file.** English runs wider than the Japanese it
replaces, so geometry tuned for one overflows in the other. Mirror each change into the existing
layout and re-check.

**A source newline inside Japanese prose renders as a visible space** between CJK characters.
Break lines only where an ASCII space already belongs, or after `。`. Never immediately before a
`、`.

**Half-width space around Latin runs**: `Live API のソケット`, `Chrome 拡張機能`, `1 本ずつ`. Pick one
convention and hold it; mixed spacing is visible at a glance.

**Type scale is not shared.** Kanji carry more ink per character, so the two largest sizes step
down one from the English deck. Body sizes stay.

## Facts

Check claims against the implementation, not against the last version of the slide. Errors that
made it into this deck and had to be corrected later:

- a worst-case gap of 3.6 s described as "no disruptions"
- model migration gated on consecutive failures, when it is gated on the close code
- the replacement socket "opened about 200 ms early", when 200 ms is how long the handshake
  takes and it opens up to fifty seconds early
- soak grading described as transcribing the returned audio, when it scores the model's own
  `outputTranscription`

All four read fine. The only thing that catches them is opening the source file.

## Checks

```bash
node tools/slide-voice.mjs --dry                      # narration text and word counts, no key
node tools/slide-voice.mjs --dry --deck docs/slides/ja/index.html
```

Plus, per round: render every changed slide, confirm `scrollHeight === 720` for all fourteen,
and run whatever deck linter is to hand. None of them can see a wrong number or an ambiguous
arrow.
