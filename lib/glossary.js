/**
 * Glossary handling.
 *
 * A glossary entry is `source,pronunciation,transcript`. The first two go into
 * the system instruction and steer what the model says; the third never reaches
 * the model at all and is applied here, to the transcript, so that a term the
 * model was told to pronounce "クバネティス" can still be captioned
 * "Kubernetes".
 *
 * `applyDisplayMap` runs against the *accumulated* transcript rather than each
 * streamed increment (see `offscreen.js`), which is why there is no equivalent
 * of the relay's `_TranscriptRewriter`: a term split across two fragments is
 * already whole by the time it gets here.
 *
 * Applies to the microphone direction only. Tab audio runs the
 * simultaneous-translation model, which takes no system instruction and so has
 * nowhere to put a glossary.
 */

export const MAX_GLOSSARY_ENTRIES = 1000;
export const MAX_GLOSSARY_BYTES = 256 * 1024;

export function normalizeEntry(p) {
  if (!p || typeof p.source !== "string" || typeof p.target !== "string") return null;
  const transcription =
    typeof p.transcription === "string" && p.transcription.length
      ? p.transcription
      : p.target;
  return { source: p.source, target: p.target, transcription };
}

export function parseGlossaryCsv(text) {
  const pairs = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const parts = line.split(",");
    if (parts.length < 2) {
      throw new Error(`Line ${i + 1} must be 'source,target' (3rd column optional).`);
    }
    const source = parts[0].trim();
    const target = parts[1].trim();
    const transcription = (parts.length >= 3 ? parts.slice(2).join(",").trim() : "") || target;
    if (!source || !target) {
      throw new Error(`Line ${i + 1} is missing source or target.`);
    }
    pairs.push({ source, target, transcription });
    if (pairs.length > MAX_GLOSSARY_ENTRIES) {
      throw new Error(`Too many entries (max ${MAX_GLOSSARY_ENTRIES}).`);
    }
  }
  return pairs;
}

export function buildDisplayMap(pairs) {
  const map = [];
  for (const p of pairs || []) {
    if (p.transcription && p.transcription !== p.target) map.push([p.target, p.transcription]);
  }
  // Longer targets first, so a longer match wins over a shorter prefix.
  map.sort((a, b) => b[0].length - a[0].length);
  return map;
}

export function applyDisplayMap(text, displayMap) {
  if (!text || !displayMap || !displayMap.length) return text;
  let out = text.normalize("NFKC");
  for (const [from, to] of displayMap) {
    const nFrom = from.normalize("NFKC");
    if (out.includes(nFrom)) out = out.split(nFrom).join(to);
  }
  return out;
}

/** Spaces between CJK characters that the model's transcript sometimes carries. */
export function cleanCJKSpaces(text) {
  const cjk = /[　-〿぀-ゟ゠-ヿ一-龯＀-￯]/;
  return text.replace(/(\S)\s+(?=(\S))/g, (match, a, b) =>
    cjk.test(a) && cjk.test(b) ? a : match
  );
}

const DEFAULT_GLOSSARY_PATH = "data/default-glossary.csv";

/** The bundled example glossary. Extension-local, so no host permission. */
export async function loadDefaultGlossary() {
  try {
    const resp = await fetch(chrome.runtime.getURL(DEFAULT_GLOSSARY_PATH));
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    return parseGlossaryCsv(await resp.text()).map(normalizeEntry).filter(Boolean);
  } catch (err) {
    console.warn("Could not read the bundled glossary:", err);
    return [];
  }
}

/**
 * The glossary, seeding from the bundled default the first time.
 *
 * A null in storage means "never seeded"; an empty array means the user
 * deliberately cleared it, and must not be re-seeded over.
 */
export async function ensureGlossary() {
  const { glossary } = await chrome.storage.local.get("glossary");
  if (Array.isArray(glossary)) return glossary;
  const seeded = await loadDefaultGlossary();
  await chrome.storage.local.set({ glossary: seeded });
  return seeded;
}
