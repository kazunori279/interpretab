/**
 * A succession of Live sessions presented as one continuous stream.
 *
 * The Live API expires a session after ~15 minutes and warns with `goAway` some
 * seconds before it goes. A soak of the original relay logged 31 of these in an
 * hour of continuous use, so this is the normal case, not an error path — and
 * "reconnect when the socket drops" handles it badly: the socket drops
 * mid-sentence, and by the time a fresh one has finished its handshake the
 * speaker is three words into the next one.
 *
 * So `goAway` starts the replacement immediately and the dying session keeps
 * speaking while it opens. The swap happens at whichever comes first:
 *
 *   - the dying session finishes its turn — the clean case, nothing is lost;
 *   - it falls silent for GOAWAY_IDLE_GRACE_MS — it is not going to answer, and
 *     waiting out the deadline would be dead air the user hears in full;
 *   - the deadline arrives.
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

import { LiveSession } from "./live-session.js";

/** How long a drain may say nothing before it is judged finished. */
export const GOAWAY_IDLE_GRACE_MS = 5000;

/** Fallback when `goAway` carries no usable `timeLeft`. */
export const GOAWAY_DEFAULT_MS = 30000;

export const RETRY_BACKOFF_INIT_MS = 200;
export const RETRY_BACKOFF_MAX_MS = 4000;

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
   * @param {typeof LiveSession} [opts.SessionClass]  seam for the tests
   * @param {() => number} [opts.now]                 seam for the tests
   */
  constructor({ apiKey, setup, onEvent, onStatus, SessionClass = LiveSession, now }) {
    this._apiKey = apiKey;
    this._setup = setup;
    this._onEvent = onEvent || (() => {});
    this._onStatus = onStatus || (() => {});
    this._Session = SessionClass;
    this._now = now || (() => performance.now());

    this._current = null;
    this._next = null; // opened on goAway, adopted at the swap
    this._closed = false;
    this._backoff = RETRY_BACKOFF_INIT_MS;
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
      this._retryTimer = setTimeout(() => this._connect(), this._backoff);
      this._backoff = Math.min(this._backoff * 2, RETRY_BACKOFF_MAX_MS);
      return;
    }
    if (this._closed) return session.close();
    this._adopt(session);
  }

  _makeSession() {
    return new this._Session({
      apiKey: this._apiKey,
      setup: this._setup,
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
    this._lastRelayAt = this._now();
    this._draining = false;
  }

  _onSessionEvent(ev) {
    if (this._closed) return;

    if (ev.type === "goAway") {
      this._beginDrain(ev.timeLeft);
      return;
    }

    if (ev.type === "closed") {
      // Whatever it was mid-way through, it is over. If a replacement is
      // already waiting this is the clean handover; otherwise reconnect.
      if (this._draining) this._swap(false);
      else this._reconnect();
      return;
    }

    this._lastRelayAt = this._now();
    this._onEvent(ev);

    // A turn that completes after `goAway` is the graceful exit: the session
    // answered what it heard, so nothing is owed and the swap can happen now.
    if (ev.type === "turnComplete" && this._draining) this._swap(false);
  }

  _beginDrain(timeLeftMs) {
    if (this._draining) return;
    this._draining = true;
    this._drainDeadline = this._now() + (timeLeftMs || GOAWAY_DEFAULT_MS);
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
    this._current?.close();
    this._current = null;
    this._onStatus("disconnected");
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
