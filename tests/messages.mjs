/**
 * The English catalogue, in Node.
 *
 * `chrome.i18n` does not exist outside the browser, so without this every
 * message in a test is its own key — and an assertion against `errQuota` proves
 * only that the key is spelled the same way twice. Importing this file wires
 * `lib/i18n.js` to `_locales/en/messages.json` off disk, so the tests and the
 * live scripts keep asserting about the sentence a user actually reads.
 *
 * Importing it is the whole API: it installs on load, because a test that
 * forgot the call would pass on key names and look fine.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { useMessages } from "../lib/i18n.js";

const ROOT = new URL("../", import.meta.url);

/** One locale's catalogue, as Chrome's `{ key: { message } }` JSON. */
export function readCatalogue(locale) {
  const path = fileURLToPath(new URL(`_locales/${locale}/messages.json`, ROOT));
  return JSON.parse(readFileSync(path, "utf8"));
}

export const MESSAGES = readCatalogue("en");

useMessages((key) => MESSAGES[key]?.message || "");
