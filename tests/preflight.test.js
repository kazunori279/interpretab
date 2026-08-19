/**
 * The one request that gets a real answer.
 *
 * Two things are being pinned here. The header, because it is the whole reason
 * Google asks for a preflight at all and nothing else in the extension can
 * carry it. And the classification, because the value of this call is entirely
 * in what it refuses to conclude: a 500 or a timeout must not be able to stop a
 * run that the socket would have opened fine.
 */

import test from "node:test";
import assert from "node:assert/strict";

// Real prose behind every message key, so the assertions below can be about it.
import "./messages.mjs";

import { apiClient, preflight } from "../lib/preflight.js";

/** A `fetch` that answers once, and records what it was asked. */
function stub(answer) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { fetchImpl, calls };
}

const reply = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => {
    if (body === undefined) throw new Error("not JSON");
    return body;
  },
});

/** A bad `AIza…` key, copied from what the live API actually returns. */
const rejected = {
  error: {
    code: 400,
    message: "API key not valid. Please pass a valid API key.",
    status: "INVALID_ARGUMENT",
    details: [{ "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID" }],
  },
};

/** A bad `AQ.…` key, which Google does not recognise as a key at all. */
const unrecognised = {
  error: {
    code: 401,
    message: "Request had invalid authentication credentials. Expected OAuth 2 access token…",
    status: "UNAUTHENTICATED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        reason: "ACCESS_TOKEN_TYPE_UNSUPPORTED",
      },
    ],
  },
};

test("the request says who is asking, and does not say it in the URL", async () => {
  const { fetchImpl, calls } = stub(reply(200, { models: [] }));
  const verdict = await preflight("AQ.Ab8RN6Jkey", { version: "1.0.0", fetchImpl });

  assert.deepEqual(verdict, { ok: true, fatal: false, detail: "" });
  assert.equal(calls.length, 1, "one request per Start, not one per direction");
  assert.equal(calls[0].init.headers["x-goog-api-client"], "interpretab/1.0.0");
  assert.equal(apiClient("1.0.0"), "interpretab/1.0.0");

  // The key is a query parameter because the REST API takes it that way, which
  // is also why nothing in this project ever prints one of these URLs.
  assert.match(calls[0].url, /[?&]key=AQ\.Ab8RN6Jkey$/);
  assert.match(calls[0].url, /^https:\/\/generativelanguage\.googleapis\.com\//);
});

test("a rejected key and an exhausted quota stop the run and say which it was", async () => {
  // The two causes the opaque 1006 has been conflating since #13. Told apart
  // here, before a capture, a microphone or a socket has been opened.
  // Both of the shapes a wrong key comes back as: `API_KEY_INVALID` for an
  // `AIza…` one and `UNAUTHENTICATED` for an `AQ.…` one, which Google answers
  // as though it had been handed an OAuth token. Same fix, so the same message.
  for (const [name, body] of [
    ["AIza", reply(400, rejected)],
    ["AQ.", reply(401, unrecognised)],
  ]) {
    const bad = await preflight("nope", { fetchImpl: stub(body).fetchImpl });
    assert.equal(bad.fatal, true, `a bad ${name} key was let through`);
    assert.match(bad.detail, /rejected that API key/);
    assert.doesNotMatch(bad.detail, /quota/i, "a rejected key must not send anyone to check quota");
  }

  const spent = {
    error: { code: 429, message: "Resource has been exhausted.", status: "RESOURCE_EXHAUSTED" },
  };
  const out = await preflight("k", { fetchImpl: stub(reply(429, spent)).fetchImpl });
  assert.equal(out.fatal, true);
  assert.match(out.detail, /used up what Google allows/);
  assert.doesNotMatch(out.detail, /Options page/, "the key is not the thing to go and check");

  const denied = {
    error: { code: 403, message: "Permission denied.", status: "PERMISSION_DENIED" },
  };
  const no = await preflight("k", { fetchImpl: stub(reply(403, denied)).fetchImpl });
  assert.equal(no.fatal, true);
  assert.match(no.detail, /restricted the key/);
});

test("no answer is not a verdict, and never refuses a run", async () => {
  // The asymmetry this whole module rests on: refusing a session that would
  // have worked is worse than opening one that fails a second later with the
  // message it would have shown anyway. So everything that is not the API
  // naming the key as the problem has to fall through.
  const cases = [
    ["a server error", stub(reply(500, { error: { code: 500, status: "INTERNAL" } }))],
    ["an error body that is not JSON", stub(reply(502))],
    ["an endpoint that moved", stub(reply(404, { error: { code: 404, status: "NOT_FOUND" } }))],
    ["a network that is not there", stub(new TypeError("Failed to fetch"))],
    ["a timeout", stub(Object.assign(new Error("timed out"), { name: "TimeoutError" }))],
  ];
  for (const [what, { fetchImpl }] of cases) {
    const verdict = await preflight("k", { fetchImpl });
    assert.equal(verdict.fatal, false, `${what} refused the run`);
    assert.equal(verdict.ok, false, `${what} was read as a working key`);
    assert.equal(verdict.detail, "", `${what} put a guess on screen`);
  }
});

test("no key at all is fatal without spending a request on it", async () => {
  const { fetchImpl, calls } = stub(reply(200, {}));
  const verdict = await preflight("", { fetchImpl });
  assert.equal(verdict.fatal, true);
  assert.match(verdict.detail, /Options/);
  assert.equal(calls.length, 0);
});
