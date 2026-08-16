/**
 * A mark in the tab strip, so the tab being translated can be found from
 * another one.
 *
 * An extension cannot draw on the tab strip: it is browser UI, and the only
 * parts of it a page controls are its title and its favicon. The title is the
 * one worth borrowing — the favicon is how the user tells their tabs apart, and
 * replacing it costs more than it says. So each running direction puts a glyph
 * in front of whatever the site calls itself, and Stop takes it back off.
 *
 * Injected on demand with `chrome.scripting.executeScript` under `activeTab`,
 * exactly like `content/captions.js`, and with the same rule about a second
 * injection: it replaces the first rather than standing down in front of it.
 */

(() => {
  const MARK = "__liveTranslatorTabMark";

  try {
    window[MARK]?.teardown?.();
  } catch {
    // An orphan — a copy left behind by an extension reload — throws partway
    // through its own teardown, because `chrome.runtime` went with the context
    // that owned it. Its listeners died there too, so the only thing it can
    // still have left in this page is the glyph in the title, and `strip` below
    // takes that off without needing the old instance's help.
  }

  /**
   * Every glyph this file may put in front of a title.
   *
   * Stripping is done against the whole set rather than against the prefix
   * currently applied, so a mark left by an orphan, or by a run with both
   * directions where this one has only the microphone, is taken off instead of
   * being prefixed a second time. Kept in step with the service worker's
   * `TAB_MARKS` by `tests/tab-marker.test.js`. The `u` flag is not optional:
   * without it the class is read as surrogate halves.
   */
  const MARK_RE = /^[💬🔴]+\s/u;

  let prefix = "";
  let observer = null;

  const strip = (title) => title.replace(MARK_RE, "");

  /** Idempotent on purpose: this is also what the observer calls. */
  function apply() {
    const wanted = prefix + strip(document.title);
    if (document.title !== wanted) document.title = wanted;
  }

  /**
   * Put the mark back whenever the site rewrites its own title.
   *
   * Which is constantly: a video site counts the seconds in it, a mail client
   * counts the unread, and a single-page app rewrites it on every route change.
   * The whole of `<head>` is watched rather than the `<title>` element, because
   * some pages edit its text node and others replace the element outright.
   * Writing the title from in here re-enters this, and `apply` doing nothing
   * when the title is already right is what stops that being a loop.
   */
  function watch() {
    if (observer) return;
    observer = new MutationObserver(apply);
    observer.observe(document.head || document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  // Ordered like the captions overlay's: everything a replacement instance
  // needs, before the first `chrome.*` call an orphan would die on.
  function teardown() {
    delete window[MARK];
    prefix = "";
    apply();
    observer?.disconnect();
    observer = null;
    chrome.runtime.onMessage.removeListener(onMessage);
  }

  function onMessage(msg) {
    if (msg?.target !== "tabMark") return;
    if (msg.type === "mark") {
      prefix = msg.prefix || "";
      apply();
      watch();
    } else if (msg.type === "teardown") {
      teardown();
    }
  }
  chrome.runtime.onMessage.addListener(onMessage);
  window[MARK] = { teardown };
})();
