// THE STRING THE PRODUCT ACTUALLY SHOWS, read from messages/ rather than
// typed into a test.
//
// WHY THIS FILE EXISTS. Four production browser suites waited for a button
// named "Design my agent". The product renamed it to "Design your agent",
// and all four went on waiting — for thirty seconds each, then failing —
// on a flow that worked perfectly. Nobody found out, because the browser
// suites were named by no CI job at all.
//
// That is the same rot that put pre-consolidation sidebar headings in
// routes-smoke and pre-rename page titles beside them: a test that holds
// its own copy of a user-facing string is a test that goes stale on the
// next rename, silently, and reads as a product failure when it does.
//
// A label read from messages/ cannot drift from the product. It CAN go
// missing — so this throws rather than returning undefined, because
// `getByRole("button", { name: undefined })` matches every button.
import { readFileSync } from "node:fs";

const cache = new Map();

/**
 * @param {string} keyPath dotted path, e.g. "dashboard.agents.designButton"
 * @param {string} locale  a file in messages/, default "en"
 */
export function label(keyPath, locale = "en") {
  if (!cache.has(locale)) {
    cache.set(locale, JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")));
  }
  const value = keyPath
    .split(".")
    .reduce((o, k) => (o == null ? undefined : o[k]), cache.get(locale));
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      `label("${keyPath}", "${locale}") is ${JSON.stringify(value)} — a missing label ` +
        `would match every element, so this stops rather than returning it`
    );
  }
  return value;
}

/** The same label in several locales, for a matcher that accepts either. */
export function labelPattern(keyPath, locales = ["en", "el"]) {
  const escaped = locales
    .map((l) => label(keyPath, l).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return new RegExp(escaped, "i");
}
