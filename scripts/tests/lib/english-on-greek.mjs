// «ΚΑΝΕΝΑ ΑΓΓΛΙΚΟ ΚΕΙΜΕΝΟ ΣΕ ΕΛΛΗΝΙΚΗ ΟΘΟΝΗ» (the owner's check of
// 2026-10-08), as something a browser test can ask of a screen's text.
//
// The English a Greek screen can show comes from two places, and this
// reads both:
//
//   1. messages/en.json, where a component asks the wrong namespace or a
//      key is missing in el.json: every English leaf of the namespaces the
//      screen uses whose Greek differs, cut at its placeholders into the
//      literal runs of two words or more and at least 8 characters.
//   2. Sentences a ROUTE wrote in English and a screen showed as it came
//      (`body.error`): those are not in any messages file, so a test names
//      the ones its routes can send.
//
// It must also say yes when there IS English: a test that uses it runs one
// English screen through the same function and requires a hit, so a
// detector that finds nothing anywhere cannot pass for one that works.
import { readFileSync } from "node:fs";

const read = (locale) => JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));

function leaves(node, prefix, out) {
  if (typeof node === "string") out.set(prefix, node);
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) leaves(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

/** The literal runs of an ICU message: what is printed whatever the values. */
function literalRuns(message) {
  return message
    .split(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g)
    .map((s) => s.replace(/[''""]/g, "").trim())
    .filter((s) => s.length >= 8 && /[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(s));
}

/**
 * Every English run under `namespaces` (dotted paths into the messages)
 * that the Greek file says differently.
 */
export function englishRuns(namespaces) {
  const en = leaves(read("en"), "", new Map());
  const el = leaves(read("el"), "", new Map());
  const runs = new Set();
  for (const [key, value] of en) {
    if (!namespaces.some((ns) => key === ns || key.startsWith(`${ns}.`))) continue;
    if (el.get(key) === value) continue;
    for (const run of literalRuns(value)) runs.add(run);
  }
  return [...runs];
}

/** The runs (and the routes' own sentences) found in a screen's text. */
export function englishIn(text, runs, routeSentences = []) {
  return [...runs, ...routeSentences].filter((s) => text.includes(s));
}
