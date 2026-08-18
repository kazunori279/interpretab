/**
 * The link between the extension and the microphone shim in the page (#9).
 *
 * `content/mic-shim.js` runs in the page's own world, where `chrome.runtime`
 * does not exist; this runs in the isolated one, where it does but where
 * `navigator.mediaDevices` is a different object from the page's and wrapping
 * it would fool nobody. So each half does the thing the other cannot, and they
 * meet on `window.postMessage`.
 *
 * Everything crossing here is tagged with a channel and a side, because
 * `message` is a public event: the page can send one, and so can any frame or
 * script in it. The tag is not a security boundary — a page determined to feed
 * the shim audio can — but it keeps the relay from acting on a message that was
 * never meant for it, and it stops the shim's own status reports from being
 * read back as audio.
 */

(() => {
  const CHANNEL = "interpretab-mic";
  const MARK = "__interpretabMicBridge";

  try {
    window[MARK]?.teardown?.();
  } catch {
    // An orphaned bridge throws on its way out — `chrome.runtime` went with the
    // context that owned it. Its listener died there too; only the `message`
    // listener below is left to replace.
  }

  function toShim(message) {
    window.postMessage({ channel: CHANNEL, from: "bridge", ...message }, "*");
  }

  function onRuntimeMessage(msg) {
    if (msg?.target !== "micBridge") return;
    if (msg.type === "voice") toShim({ type: "voice", pcm: msg.pcm });
    else if (msg.type === "config") toShim({ type: "config", ownVoice: msg.ownVoice });
    else if (msg.type === "teardown") teardown();
  }

  /**
   * The shim's side of the conversation, forwarded to the service worker.
   *
   * Nothing acts on it yet — this is the prototype's instrumentation, and the
   * point of it is that the failures here are all silent ones. A synthetic
   * microphone that is attached and receiving nothing sounds exactly like a
   * muted one, and a page that took the device and then re-acquired the real
   * hardware sounds exactly like a working call to everyone except the person
   * who cannot be understood.
   */
  function onWindowMessage(event) {
    if (event.source !== window) return;
    const data = event.data;
    if (data?.channel !== CHANNEL || data.from !== "shim") return;
    chrome.runtime
      .sendMessage({ target: "sw", type: "micShim", state: data.state, detail: data.detail })
      .catch(() => {});
  }

  function teardown() {
    window.removeEventListener("message", onWindowMessage);
    try {
      chrome.runtime.onMessage.removeListener(onRuntimeMessage);
    } catch {
      // Already gone with its context.
    }
    // The shim outlives this script — it is in the page's world and nothing
    // reloads it — so it has to be told, or it goes on handing Meet a stream
    // that will never carry another word.
    toShim({ type: "teardown" });
    if (window[MARK] === handle) delete window[MARK];
  }

  window.addEventListener("message", onWindowMessage);
  chrome.runtime.onMessage.addListener(onRuntimeMessage);
  const handle = { teardown };
  window[MARK] = handle;
})();
