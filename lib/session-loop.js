/**
 * A succession of Live sessions presented as one continuous stream.
 *
 * The Live API expires a session and warns with `goAway` before it goes. A
 * continuous tab-translation session was measured at 9 min 50 s end to end, with
 * `{"goAway": {"timeLeft": "50s"}}` at 9 min and a close on code 1008 exactly 50
 * seconds later; a soak of the original relay logged 31 of these in an hour. So
 * this is the normal case, not an error path — and "reconnect when the socket
 * drops" handles it badly: the socket drops mid-sentence, and by the time a
 * fresh one has finished its handshake the speaker is three words into the next.
 *
 * So `goAway` starts the replacement immediately and the dying session keeps
 * speaking while it opens. The swap happens at whichever comes first:
 *
 *   - the dying session finishes its turn — the clean case, nothing is lost;
 *   - it falls silent for GOAWAY_IDLE_GRACE_MS — it is not going to answer, and
 *     waiting out the deadline would be dead air the user hears in full;
 *   - the deadline, less GOAWAY_DEADLINE_MARGIN_MS, arrives.
 *
 * The third is the *only* one that fires for tab audio: simultaneous translation
 * answers continuously, so it neither completes a turn nor falls silent while
 * the tab is playing.
 *
 * On the last two the turn was abandoned, so two things are owed. The audio
 * captured since the dying session last said anything went unanswered and is
 * replayed into the replacement (`preroll`); and the caption still open on
 * screen will never be closed by a `turnComplete` that is not coming, so a
 * synthetic one is emitted.
 *
 * Ported from `session_loop` in `app/main.py` of
 * https://github.com/kazunori279/adk-live-translator. One piece is deliberately
 * left behind: that version also tees the microphone into the replacement while
 * a drain is stalled, so the handover costs no audio at all rather than merely
 * little. It is worth roughly 120 lines and a second class of bug (a drain that
 * recovers has to have its mirrored replacement thrown away, or everything gets
 * translated twice); preroll covers the same ground well enough for a browser.
 */

import { isQuotaClose, LiveSession } from "./live-session.js";
import { t } from "./i18n.js";

/** How long a drain may say nothing before it is judged finished. */
export const GOAWAY_IDLE_GRACE_MS = 5000;

/** Fallback when `goAway` carries no usable `timeLeft`. */
export const GOAWAY_DEFAULT_MS = 30000;

/**
 * How far ahead of the deadline to swap.
 *
 * The server means the deadline literally: a ten-minute session was observed
 * warning at `"50s"` and closing 50.4 s later. Swapping *at* the deadline is
 * therefore a race against a close that is already in flight, and losing it
 * turns a planned handover into an unplanned one. A second early costs nothing
 * — that session had one second left — and removes the race.
 */
export const GOAWAY_DEADLINE_MARGIN_MS = 1000;

export const RETRY_BACKOFF_INIT_MS = 200;
export const RETRY_BACKOFF_MAX_MS = 4000;

/**
 * How many failures in a row before the loop stops trying (#13).
 *
 * The backoff was written for a flaky socket and is right for one. It is wrong
 * for a rejection that is not going to change: the free tier's daily quota
 * resets at midnight Pacific, so a user who runs into it used to get an
 * extension hammering a rate-limited endpoint every four seconds until they
 * noticed and pressed Stop. Ten attempts is about twenty-two seconds on the
 * curve above — long enough to ride out a Wi-Fi handover, short enough not to
 * behave like a bot.
 */
export const RETRY_MAX_ATTEMPTS = 10;

/**
 * How long a session has to last before the failures behind it stop counting.
 *
 * The tally is meant to measure "this is not coming back", so anything that
 * proves otherwise clears it: a relayed event, or simply a session that stayed
 * up. Without the second of those, an hour on bad Wi-Fi could accumulate ten
 * unrelated drops during silences and give up on the eleventh.
 */
export const RETRY_HEALTHY_MS = 60000;

/** How often the drain is checked for silence. */
const DRAIN_TICK_MS = 250;

/**
 * Recent uplink frames kept for preroll, by frame count rather than by age:
 * the cost is a fixed ~320 KB and no housekeeping on the hot path. At the
 * recorder's 128 samples a frame that is the last ten seconds.
 */
export const RECENT_AUDIO_MAX_FRAMES = 1250;

export class SessionLoop {
  /**
   * @param {object} opts
   * @param {string} opts.apiKey
   * @param {object} opts.setup            the frame from buildSetup()
   * @param {(ev: object) => void} opts.onEvent
   * @param {(state: string, detail?: string) => void} [opts.onStatus]
   * @param {string} [opts.closeHint]                 passed to each session
   * @param {typeof LiveSession} [opts.SessionClass]  seam for the tests
   * @param {() => number} [opts.now]                 seam for the tests
   */
  constructor({ apiKey, setup, onEvent, onStatus, closeHint, SessionClass = LiveSession, now }) {
    this._apiKey = apiKey;
    this._setup = setup;
    this._closeHint = closeHint || "";
    this._onEvent = onEvent || (() => {});
    this._onStatus = onStatus || (() => {});
    this._Session = SessionClass;
    this._now = now || (() => performance.now());

    this._current = null;
    this._next = null; // opened on goAway, adopted at the swap
    this._closed = false;
    this._backoff = RETRY_BACKOFF_INIT_MS;
    this._attempts = 0; // consecutive failures, against RETRY_MAX_ATTEMPTS
    this._adoptedAt = 0;
    this._retryTimer = null;
    this._drainTimer = null;

    this._recent = []; // [{t, bytes: Uint8Array}], newest last
    this._preroll = null; // owed to the next session adopted
    this._lastRelayAt = 0;
    this._draining = false;
    this._drainDeadline = 0;
  }

  start() {
    this._closed = false;
    this._attempts = 0;
    this._connect();
  }

  /** Forward one PCM16 buffer, and remember it in case it goes unanswered. */
  send(pcmBuffer) {
    this._recent.push({ t: this._now(), bytes: new Uint8Array(pcmBuffer) });
    if (this._recent.length > RECENT_AUDIO_MAX_FRAMES) this._recent.shift();
    this._current?.send(pcmBuffer);
  }

  close() {
    this._closed = true;
    clearTimeout(this._retryTimer);
    clearInterval(this._drainTimer);
    this._retryTimer = null;
    this._drainTimer = null;
    this._current?.close();
    this._next?.close();
    this._current = null;
    this._next = null;
    this._recent = [];
  }

  // ---------------------------------------------------------------- internals

  async _connect() {
    if (this._closed) return;
    const session = this._makeSession();
    try {
      await session.open();
    } catch (err) {
      if (this._closed) return session.close();
      this._onStatus("error", err.message);
      this._retryOrGiveUp(err.message);
      return;
    }
    if (this._closed) return session.close();
    this._adopt(session);
  }

  _makeSession() {
    return new this._Session({
      apiKey: this._apiKey,
      setup: this._setup,
      closeHint: this._closeHint,
      // A session that is not yet current — the replacement being opened — must
      // not narrate its own progress over a session that is still speaking.
      onStatus: (status, detail) => {
        if (this._current === null || status === "connected") this._onStatus(status, detail);
      },
      onEvent: (ev) => this._onSessionEvent(ev),
    });
  }

  /**
   * Make *session* current, paying it whatever the last one left owing.
   *
   * The preroll goes in before the session is made current, so it cannot
   * interleave with the live frames that start arriving the moment it is.
   */
  _adopt(session) {
    if (this._preroll) {
      session.send(this._preroll);
      session.flush();
      this._preroll = null;
    }
    this._current = session;
    this._backoff = RETRY_BACKOFF_INIT_MS;
    this._adoptedAt = this._now();
    this._lastRelayAt = this._now();
    this._draining = false;
    // The failure tally is deliberately not cleared here. A key that is out of
    // quota can be rejected *after* the handshake, which would give a loop that
    // trusted `open()` an endless connect-and-drop cycle with a clean counter
    // at every turn. What clears it is a session doing something — see below.
  }

  _onSessionEvent(ev) {
    if (this._closed) return;

    if (ev.type === "goAway") {
      this._beginDrain(ev.timeLeft);
      return;
    }

    if (ev.type === "closed") {
      // Quota is the one close not worth retrying, and the one the retry path
      // handles worst: the server accepts the handshake either way, so ten
      // attempts all reach `setupComplete` and all die a second later, and two
      // minutes after the user's free tier ran out they are told the connection
      // "keeps dropping". Stop on the first one and name the cause — the same
      // sentence `preflight` uses for the same limit hit at Start. Ahead of the
      // drain check on purpose: an exhausted key has nothing to hand over to.
      if (isQuotaClose(ev.reason)) {
        this.close();
        this._onStatus("failed", t("errQuota"));
        return;
      }
      // Whatever it was mid-way through, it is over. Closing during a drain
      // means the deadline beat the swap, so the turn was cut off and preroll
      // is owed — the same as any other abandoned drain, not a graceful end.
      if (this._draining) this._swap(true);
      else this._reconnect();
      return;
    }

    // A tally is not an answer. Usage frames arrive after the audio they
    // account for, sometimes after the session has stopped speaking altogether,
    // so letting one touch `_lastRelayAt` would tell a drain the dying session
    // is still working — holding the swap open to its deadline and shortening
    // the preroll owed to the replacement. Forwarded, and nothing more.
    if (ev.type === "usage") {
      this._onEvent(ev);
      return;
    }

    this._lastRelayAt = this._now();
    // Something came back, so whatever went wrong before this is over.
    this._attempts = 0;
    this._onEvent(ev);

    // A turn that completes after `goAway` is the graceful exit: the session
    // answered what it heard, so nothing is owed and the swap can happen now.
    if (ev.type === "turnComplete" && this._draining) this._swap(false);
  }

  _beginDrain(timeLeftMs) {
    if (this._draining) return;
    this._draining = true;
    this._drainDeadline =
      this._now() + Math.max(0, (timeLeftMs || GOAWAY_DEFAULT_MS) - GOAWAY_DEADLINE_MARGIN_MS);
    this._openNext();
    clearInterval(this._drainTimer);
    this._drainTimer = setInterval(() => this._checkDrain(), DRAIN_TICK_MS);
  }

  async _openNext() {
    const session = this._makeSession();
    try {
      await session.open();
    } catch (err) {
      // Not fatal here: the swap falls back to opening a fresh session, with
      // the retry backoff behind it if that fails too.
      console.warn("Interpretab: the replacement session failed to open:", err.message);
      return;
    }
    if (this._closed || !this._draining) return session.close();
    this._next = session;
  }

  _checkDrain() {
    if (!this._draining) return;
    const now = this._now();
    const silent = now - this._lastRelayAt >= GOAWAY_IDLE_GRACE_MS;
    if (silent || now >= this._drainDeadline) this._swap(true);
  }

  /**
   * Retire the current session and take up the replacement.
   *
   * @param {boolean} abandoned  true when the dying session was cut off
   *   mid-turn, which is what makes preroll and a synthetic turnComplete owed.
   */
  _swap(abandoned) {
    clearInterval(this._drainTimer);
    this._drainTimer = null;
    this._draining = false;

    const dying = this._current;
    this._current = null;
    dying?.close();

    if (abandoned) {
      // Nothing was relayed after `_lastRelayAt`, so audio from that point on
      // went unanswered and is owed to the replacement. Anything earlier was
      // answered, and replaying it would translate it twice.
      this._preroll = this._audioSince(this._lastRelayAt);
      // The abandoned turn will never report itself complete, and both the side
      // panel and the page caption keep extending an open line until something
      // does.
      this._onEvent({ type: "turnComplete" });
    }

    const next = this._next;
    this._next = null;
    if (next) this._adopt(next);
    else this._connect();
  }

  _reconnect() {
    const lasted = this._now() - this._adoptedAt;
    this._current?.close();
    this._current = null;
    // A session that stayed up for a minute was working, whether or not it had
    // anything to say — a quiet tab is not a failing one.
    if (lasted >= RETRY_HEALTHY_MS) this._attempts = 0;
    this._onStatus("disconnected");
    this._retryOrGiveUp(t("loopDropping"));
  }

  /**
   * Schedule the next attempt, or stop for good and say so.
   *
   * Giving up is a state the panel has no other way of reaching: the run is
   * over, but nothing has stopped, so without this the dot stays red and the
   * Stop button stays lit over a loop that will never connect again. Whoever
   * hears `failed` owns taking the run down — in the extension that is
   * `offscreen.js`, which hands it to the service worker.
   */
  _retryOrGiveUp(detail) {
    this._attempts += 1;
    if (this._attempts >= RETRY_MAX_ATTEMPTS) {
      this.close();
      this._onStatus("failed", t("loopGaveUp", [detail, RETRY_MAX_ATTEMPTS]));
      return;
    }
    // Cleared first: two retry chains running at once would double the rate the
    // backoff exists to hold down.
    clearTimeout(this._retryTimer);
    this._retryTimer = setTimeout(() => this._connect(), this._backoff);
    this._backoff = Math.min(this._backoff * 2, RETRY_BACKOFF_MAX_MS);
  }

  /** Uplink audio captured from *since* onwards, as one buffer, or null. */
  _audioSince(since) {
    const frames = this._recent.filter((f) => f.t >= since);
    if (!frames.length) return null;
    const total = frames.reduce((n, f) => n + f.bytes.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const f of frames) {
      merged.set(f.bytes, offset);
      offset += f.bytes.length;
    }
    return merged.buffer;
  }
}
