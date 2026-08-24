/**
 * Ask Gemini what the current Live models are, then check its answer and write
 * `docs/config.json`.
 *
 *     node tools/find-models.mjs <key-file>        # writes docs/config.json if changed
 *     node tools/find-models.mjs <key-file> --dry  # prints, writes nothing
 *
 * `tests/model-check.mjs` says *that* a model is gone. This is the other half:
 * what replaced it. The names are on Google's own documentation pages hours
 * before anything else knows about them, so the job is reading those pages —
 * which is a job for a model with a browser attached, not for a scraper this
 * repository would then have to maintain against someone else's HTML.
 *
 * **Nothing it says is trusted.** A language model reading release notes is a
 * plausible-name generator, and this file rewrites something every installed
 * copy of the extension reads within hours. So its output is a list of
 * *candidates*, and a candidate reaches `docs/config.json` only after
 * `checkModel` has opened a real Live session with it and got `setupComplete`
 * back. An invented name never verifies, so an invented name never ships.
 *
 * **It may only widen.** `mergeConfig` below can add a verified name, reorder
 * nothing that still works, and correct a price. It cannot touch
 * `blockBelowVersion` — the one field that can stop every installation — and it
 * cannot empty a list, because a config with no names in it is a config that has
 * given up on the one job it has.
 *
 * Two calls to the model rather than one. Grounding and a response schema fight
 * each other: the tools want to write prose with citations, the schema wants
 * nothing but JSON. So the first call reads the pages and answers in prose, and
 * the second turns that prose into JSON with no tools attached and nothing to
 * read but the first answer.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parseConfig } from "../lib/remote-config.js";
import { MODEL, SIMUL_MODEL } from "../lib/languages.js";
import { apiKeyFrom, checkModel, listModels } from "../tests/model-check.mjs";

const ROOT = path.join(import.meta.dirname, "..");
const CONFIG = path.join(ROOT, "docs", "config.json");

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "gcp-samples-ic0";
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || "global";
const AGENT_MODEL = process.env.AGENT_MODEL || "gemini-3.5-flash";

/** The pages that carry a model name before anything else does. */
const SOURCES = [
  "https://ai.google.dev/gemini-api/docs/models",
  "https://ai.google.dev/gemini-api/docs/live",
  "https://ai.google.dev/gemini-api/docs/live-guide",
  "https://ai.google.dev/gemini-api/docs/changelog",
  "https://ai.google.dev/pricing",
];

/** Same cap as `parseConfig`, applied here so a long answer is cut before it is written. */
const MAX_MODELS = 8;

const dry = process.argv.includes("--dry");

/**
 * A Vertex access token.
 *
 * In CI it arrives as an environment variable from `google-github-actions/auth`,
 * which mints it through Workload Identity Federation and never puts a
 * long-lived key in the repository. Locally it comes from whatever `gcloud` is
 * already signed in as.
 */
function accessToken() {
  const fromEnv = (process.env.VERTEX_ACCESS_TOKEN || "").trim();
  if (fromEnv) return fromEnv;
  return execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();
}

async function generate(token, body) {
  const url =
    `https://aiplatform.googleapis.com/v1beta1/projects/${PROJECT}/locations/${LOCATION}` +
    `/publishers/google/models/${AGENT_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Vertex ${AGENT_MODEL}: HTTP ${res.status} ${(await res.text()).slice(0, 400)}`);
  const reply = await res.json();
  const parts = reply.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("").trim();
}

/** Step one: read the pages and say, in prose, what is current and what is gone. */
function researchPrompt(broken) {
  return `You are checking which Google Gemini Live API models a Chrome extension should use today.

Read these pages: ${SOURCES.join(", ")}

The extension opens a BidiGenerateContent WebSocket and needs two kinds of model:

- "simul": a live *translation* model. It is given generationConfig.translationConfig
  with a target language, detects the source language itself, takes no system
  instruction, and speaks over the speaker rather than waiting for a turn. The
  extension currently asks for ${SIMUL_MODEL}.
- "conversation": a general native-audio Live model. It takes a system instruction,
  handles turns, and interprets between two declared languages. The extension
  currently asks for ${MODEL}.
${broken.length ? `\nThese names have stopped working and need successors: ${broken.join(", ")}.\n` : ""}
Report, with the page you got each fact from:

1. Every model id currently offered for each of those two kinds, newest first.
   Use exact ids as they appear in the API — for example gemini-3.1-flash-live-preview,
   not "Gemini 3.1 Flash Live". Only models that support bidiGenerateContent.
2. For each id, the audio input and audio output price in US dollars per one
   million tokens, from the pricing page.
3. Whether any of the ids the extension currently asks for is marked deprecated,
   retired, or given a shutdown date.

If a page does not say, say that it does not say. Do not infer an id from a
product name, and do not extrapolate a version number that no page shows.`;
}

const ANSWER_SCHEMA = {
  type: "OBJECT",
  properties: {
    simul: { type: "ARRAY", items: { type: "STRING" } },
    conversation: { type: "ARRAY", items: { type: "STRING" } },
    rates: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          model: { type: "STRING" },
          audioIn: { type: "NUMBER" },
          audioOut: { type: "NUMBER" },
        },
        required: ["model", "audioIn", "audioOut"],
      },
    },
    retired: { type: "ARRAY", items: { type: "STRING" } },
    notes: { type: "STRING" },
  },
  required: ["simul", "conversation", "rates", "retired", "notes"],
};

/** Step two: the same answer as JSON, with no tools and nothing new to read. */
async function extract(token, prose) {
  const text = await generate(token, {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Turn this report into JSON. Include only ids the report states outright; leave a list empty rather than guessing at one. Omit a price the report did not give.\n\n---\n${prose}`,
          },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json", responseSchema: ANSWER_SCHEMA, temperature: 0 },
  });
  return JSON.parse(text);
}

/**
 * What the file should say, given what it says now and what verified.
 *
 * Pure, and the only thing in this file that decides what gets committed —
 * `tests/model-tools.test.js` is about this function. The rules, in the order
 * they matter:
 *
 * - `schemaVersion`, `blockBelowVersion` and `learnMoreUrl` are copied across
 *   untouched. The emergency brake is not an agent's to pull.
 * - A list keeps the names it has that still work, in the order it has them: a
 *   working config is not improved by being reordered, and the first name is the
 *   one every session starts on.
 * - Verified newcomers go on the end, so a discovery is a fallback before it is
 *   a default, and the name that has been serving users stays in front until a
 *   human moves it.
 * - A name that verified *gone* is dropped — but never the last one. An empty
 *   list means "the file has no opinion", which is the opposite of what an
 *   outage should say.
 * - A price is corrected only when a finite, positive number arrived for a model
 *   that is in the merged lists. Rates for names nobody asks for are dropped.
 *
 * @param {object} current   the parsed contents of docs/config.json
 * @param {Map<string, boolean>} verdict  `mode:model` → did a real session open
 * @param {{simul: string[], conversation: string[], rates: object[]}} found
 */
export function mergeConfig(current, verdict, found) {
  // Keyed by mode as well as name, because the answer differs by mode: the
  // simultaneous frame carries `translationConfig` and the conversation frame a
  // system instruction, and a model that takes one may refuse the other.
  const keep = (mode, existing, candidates) => {
    const ruling = (name) => verdict.get(`${mode}:${name}`);
    const alive = (existing || []).filter((name) => ruling(name) !== false);
    const added = (candidates || []).filter((name) => ruling(name) === true && !alive.includes(name));
    const merged = [...alive, ...added].slice(0, MAX_MODELS);
    // Everything failed. Say nothing rather than nothing at all: the old list is
    // still the best guess, and `blockBelowVersion` is how a human says stop.
    return merged.length ? merged : existing;
  };

  const models = {
    simul: keep("simul", current.models?.simul, found.simul),
    conversation: keep("conversation", current.models?.conversation, found.conversation),
  };

  const named = new Set([...(models.simul || []), ...(models.conversation || []), SIMUL_MODEL, MODEL]);
  const rates = {};
  for (const [model, rate] of Object.entries(current.rates || {})) {
    if (named.has(model)) rates[model] = rate;
  }
  for (const rate of found.rates || []) {
    if (!named.has(rate?.model)) continue;
    const audioIn = Number(rate.audioIn);
    const audioOut = Number(rate.audioOut);
    if (!Number.isFinite(audioIn) || !Number.isFinite(audioOut) || audioIn <= 0 || audioOut <= 0) continue;
    rates[rate.model] = { audioIn, audioOut };
  }

  return {
    schemaVersion: current.schemaVersion,
    models,
    rates: Object.keys(rates).length ? rates : current.rates,
    blockBelowVersion: current.blockBelowVersion,
    learnMoreUrl: current.learnMoreUrl,
  };
}

/** The file, formatted the way the committed one is: two spaces, lists on one line. */
export function formatConfig(config) {
  const list = (names) => JSON.stringify(names);
  const rates = Object.entries(config.rates || {})
    .map(([model, r]) => `    ${JSON.stringify(model)}: { "audioIn": ${r.audioIn}, "audioOut": ${r.audioOut} }`)
    .join(",\n");
  return `{
  "schemaVersion": ${config.schemaVersion},
  "models": {
    "simul": ${list(config.models.simul)},
    "conversation": ${list(config.models.conversation)}
  },
  "rates": {
${rates}
  },
  "blockBelowVersion": ${JSON.stringify(config.blockBelowVersion)},
  "learnMoreUrl": ${JSON.stringify(config.learnMoreUrl)}
}
`;
}

if (import.meta.filename === process.argv[1]) {
  const before = fs.readFileSync(CONFIG, "utf8");
  const current = JSON.parse(before);

  // What is already broken, so the research prompt can ask about it by name.
  const apiKey = apiKeyFrom(process.argv.slice(2));
  const listed = await listModels(apiKey);
  const existing = [
    ...(current.models?.simul || []).map((model) => ({ model, mode: "simul" })),
    ...(current.models?.conversation || []).map((model) => ({ model, mode: "conversation" })),
  ];
  const verdict = new Map();
  const broken = [];
  for (const target of existing) {
    const result = await checkModel(apiKey, listed, target);
    verdict.set(`${target.mode}:${target.model}`, result.healthy);
    if (!result.healthy) broken.push(target.model);
    console.log(`${result.healthy ? "ok  " : "gone"} ${target.model} (${target.mode})`);
  }

  const token = accessToken();
  console.log(`\nasking ${AGENT_MODEL} on ${PROJECT}/${LOCATION}...`);
  const prose = await generate(token, {
    contents: [{ role: "user", parts: [{ text: researchPrompt(broken) }] }],
    tools: [{ url_context: {} }, { google_search: {} }],
    generationConfig: { temperature: 0 },
  });
  console.log(`\n--- what it read ---\n${prose}\n`);

  const found = await extract(token, prose);
  console.log(`--- candidates ---\n${JSON.stringify(found, null, 2)}\n`);

  // Every name it offered that we have not already ruled on, checked for real.
  // The catalogue is read again first: a name published while this run was
  // reading the docs would still be absent from the copy fetched at the top,
  // and `checkModel` calls an unlisted model gone whatever the socket says.
  const fresh = await listModels(apiKey);
  for (const [mode, names] of [["simul", found.simul], ["conversation", found.conversation]]) {
    for (const model of names || []) {
      if (verdict.has(`${mode}:${model}`)) continue;
      const result = await checkModel(apiKey, fresh, { model, mode });
      verdict.set(`${mode}:${model}`, result.healthy);
      console.log(`${result.healthy ? "verified" : "rejected"} ${model} (${mode})${result.healthy ? "" : ` — ${result.reason || "not listed"}`}`);
    }
  }

  const merged = mergeConfig(current, verdict, found);
  const after = formatConfig(merged);

  // The file has to survive the extension's own parser, or a run of this script
  // is how every installed copy stops getting a config at all.
  const reparsed = parseConfig(after);
  if (!reparsed) throw new Error("the merged config does not survive parseConfig; nothing written");
  if (!reparsed.models.simul?.length || !reparsed.models.conversation?.length) {
    throw new Error("the merged config has an empty model list; nothing written");
  }
  if (reparsed.blockBelowVersion !== parseConfig(before)?.blockBelowVersion) {
    throw new Error("the merged config changed blockBelowVersion; nothing written");
  }

  const changed = after !== before;
  console.log(changed ? `\nchanged:\n${after}` : "\nno change");
  if (changed && !dry) fs.writeFileSync(CONFIG, after);

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  }
  // The commit message is written here rather than assembled in the workflow:
  // the notes are several paragraphs of someone else's prose, and interpolating
  // that into a shell heredoc is a quoting bug waiting for the day it matters.
  if (changed && process.env.COMMIT_MESSAGE_FILE) {
    fs.writeFileSync(process.env.COMMIT_MESSAGE_FILE, commitMessage(verdict, found));
  }
}

/** What the workflow commits, from what actually verified. */
export function commitMessage(verdict, found) {
  const verified = [...verdict].filter(([, ok]) => ok).map(([key]) => key);
  const rejected = [...verdict].filter(([, ok]) => !ok).map(([key]) => key);
  return [
    "Point the config at the models that answered today",
    "",
    "Written by .github/workflows/model-discovery.yml. Every name committed here",
    "was verified by opening a real BidiGenerateContent session with it and",
    "getting setupComplete back, so a name the agent invented could not reach",
    "this file.",
    "",
    `Answered: ${verified.join(", ") || "none"}`,
    `Did not: ${rejected.join(", ") || "none"}`,
    "",
    (found.notes || "").trim(),
    "",
  ].join("\n");
}
