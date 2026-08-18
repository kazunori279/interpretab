/**
 * One HTTP request before the sockets, for two things a socket cannot do.
 *
 * **It says who we are.** Google's partner integration guide asks any client
 * that sits between it and an end user to send `x-goog-api-client:
 * company-product/version`, so that traffic can be segmented and a client
 * producing a distinctive error pattern can be found. Interpretab is exactly
 * that: every session runs on the user's own key, so nothing about this
 * extension is otherwise visible from Google's side beyond the
 * `Origin: chrome-extension://<id>` the browser puts on the handshake. The
 * header cannot go on the socket — `new WebSocket(url)` takes a URL and a
 * subprotocol list and nothing else, and `BidiGenerateContentSetup` has no
 * field for a client identifier — so it goes here, on a `fetch` the run makes
 * anyway.
 *
 * **It gets an answer that means something.** A WebSocket that fails closes
 * with 1006 and no reason, by design: the browser will not tell a page why a
 * connection was refused, because that is a cross-origin oracle. So a rejected
 * key, an exhausted quota and a captive portal all arrive identically, and
 * `closeReason` has to name all three. `models.list` is the same key, the same
 * host and the same API over a protocol that answers in status codes, asked a
 * second before the socket opens.
 *
 * What it deliberately does not do is decide the run on a maybe. A verdict is
 * acted on only when the API said something specific about the key; a timeout,
 * a 500 or an unparseable body leave the run to try the socket, because the
 * cost of being wrong runs one way — refusing a session that would have worked
 * is worse than opening one that fails a second later with the message it
 * would have shown anyway.
 */

import { t } from "./i18n.js";

const MODELS_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * How long to wait before deciding the answer is not coming.
 *
 * This sits in front of Start, so it is latency the user watches. Two seconds
 * is generous for a request whose response is a model list from the same host
 * the socket is about to open, and a preflight that has not answered by then
 * has nothing to add over just trying.
 */
export const PREFLIGHT_TIMEOUT_MS = 2000;

/** The `x-goog-api-client` value: `interpretab/<manifest version>`. */
export function apiClient(version) {
  return `interpretab/${version || "0"}`;
}

/**
 * Ask the REST API whether this key can be used, and tell Google who asked.
 *
 * Resolves to `{ ok, fatal, detail }` and never rejects — a preflight that
 * throws is a preflight with no opinion, which is `fatal: false`.
 *
 * - `ok: true` — the key works. Whatever goes wrong on the socket afterwards is
 *   not the key, which is worth as much as the failure case: it is the half of
 *   the guess that the opaque 1006 message currently gets wrong.
 * - `fatal: true` — the API named the problem. Nothing is opened.
 * - `ok: false, fatal: false` — no answer, or one that is not about the key.
 *
 * @param {string} apiKey
 * @param {object} [opts]
 * @param {string} [opts.version]    manifest version, for the client header
 * @param {typeof fetch} [opts.fetchImpl]  seam for the tests
 */
export async function preflight(apiKey, { version, fetchImpl = fetch } = {}) {
  if (!apiKey) return { ok: false, fatal: true, detail: t("errPreflightNoKey") };

  const stop = AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS);
  let res;
  try {
    res = await fetchImpl(`${MODELS_URL}?pageSize=1&key=${encodeURIComponent(apiKey)}`, {
      method: "GET",
      signal: stop,
      headers: { "x-goog-api-client": apiClient(version) },
    });
  } catch {
    // Offline, blocked, or slower than the timeout. The socket is about to try
    // the same host and will say the same thing with more authority.
    return { ok: false, fatal: false, detail: "" };
  }

  if (res.ok) return { ok: true, fatal: false, detail: "" };

  let error = null;
  try {
    error = (await res.json())?.error ?? null;
  } catch {
    /* An error body that is not JSON is still an error status. */
  }
  return classify(res.status, error);
}

/**
 * Turn one REST rejection into a verdict and a sentence for the panel.
 *
 * Keyed on `error.status` rather than the HTTP code where both are available:
 * the same 400 covers a malformed key and a malformed request, and the gRPC
 * status is what separates them. The messages name the fix rather than the
 * failure, because the fix is in a different tab either way — AI Studio for the
 * key and for the quota, the Cloud console for a restriction.
 *
 * A wrong key comes back two different ways, both of them checked against the
 * live API. An `AIza…` one that is not a real key is a 400 `INVALID_ARGUMENT`
 * with `reason: "API_KEY_INVALID"`. A wrong key in the newer `AQ.…` format is a
 * 401 `UNAUTHENTICATED` with `reason: "ACCESS_TOKEN_TYPE_UNSUPPORTED"` and a
 * message about OAuth tokens, which is Google failing to recognise it as a key
 * at all. Neither reason string is worth matching on its own; the status is.
 */
function classify(status, error) {
  const reason = error?.details?.find((d) => d.reason)?.reason || "";
  const code = error?.status || "";

  if (reason === "API_KEY_INVALID" || code === "UNAUTHENTICATED" || status === 401) {
    return {
      ok: false,
      fatal: true,
      detail: t("errKeyRejected"),
    };
  }
  if (code === "RESOURCE_EXHAUSTED" || status === 429) {
    return {
      ok: false,
      fatal: true,
      detail: t("errQuota"),
    };
  }
  if (code === "PERMISSION_DENIED" || status === 403) {
    return {
      ok: false,
      fatal: true,
      detail: t("errKeyForbidden"),
    };
  }
  // A 500, a 404 from an endpoint that moved, a body we could not read. None of
  // those are about the key, and none of them are ours to act on.
  return { ok: false, fatal: false, detail: "" };
}
