import { readFileSync, existsSync } from "node:fs";

/**
 * THE STRING THE PAGE IS ACTUALLY SHOWING, IN THE LANGUAGE IT IS SHOWING IT.
 *
 * WHY THIS EXISTS. A prodtest that writes
 *
 *     !body.includes("Upgrade Required")
 *
 * is asserting in one of ten languages. Point the same working product at
 * a Greek UI and the check does not fail — it PASSES, because the English
 * string it forbids was never going to be there. The gate goes green
 * having measured nothing, which is worse than going red: red is seen.
 *
 * `node scripts/scan-english-anchored-gates.mjs` found 26 such hits across
 * 11 files. Twenty-two fail loudly under another locale; four pass
 * vacuously. These are the four.
 *
 * IT IS THE SAME SHAPE AS `\b` AND THE FINAL SIGMA (docs/shapes.md): an
 * instrument that works in one script is not an instrument, it is a
 * coincidence that has not been travelled yet.
 *
 * HOW IT WORKS. The page says which language it is in — <html lang> is
 * what next-intl sets — so the expected text is resolved out of that
 * locale's own messages file, the same file the renderer read. An English
 * run keeps asserting the English string; a Greek run asserts the Greek
 * one; neither has a sentence typed into the test.
 *
 * IT ALSO CATCHES A SECOND THING FOR FREE: a copy change in
 * messages/en.json used to break these checks silently (the literal in the
 * test no longer matched anything, and the negative ones went green). Now
 * the test and the product read the same source.
 */

const cache = new Map();

function messagesFor(locale) {
  if (cache.has(locale)) return cache.get(locale);
  const path = `messages/${locale}.json`;
  const parsed = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  cache.set(locale, parsed);
  return parsed;
}

/** Resolve a dotted key out of a locale's messages, or null. */
function leaf(messages, key) {
  let node = messages;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return null;
    node = node[part];
  }
  return typeof node === "string" ? node : null;
}

/**
 * The locale the page is rendering in, read from <html lang>.
 *
 * Falls back to "en" rather than throwing: a page that has not set lang is
 * a different defect, and i18n-coverage owns it. What must not happen is
 * this helper deciding a check cannot run.
 */
export async function pageLocale(page) {
  try {
    const lang = await page.evaluate(() => document.documentElement.lang || "");
    const base = String(lang).split("-")[0].trim().toLowerCase();
    return base && messagesFor(base) ? base : "en";
  } catch {
    return "en";
  }
}

/**
 * The rendered text for `key`, in the language the page is in.
 *
 * ICU is stripped to the literal head: "{count} credits" has no single
 * rendering, so the caller gets the part that is stable. A key whose whole
 * value is a placeholder yields "" and MUST NOT be used as a needle — see
 * `uiTextStrict`.
 */
export async function uiText(page, key) {
  const locale = await pageLocale(page);
  const value = leaf(messagesFor(locale), key) ?? leaf(messagesFor("en"), key);
  if (value === null) return null;
  return value.replace(/\{[^{}]*\}/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Same, but refuses to return something useless.
 *
 * A NEEDLE THAT IS EMPTY MAKES `includes()` ALWAYS TRUE, and its negation
 * always false — the vacuity this file exists to remove, reintroduced one
 * level down. So a key that resolves to nothing, or to fewer than three
 * characters after ICU is stripped, throws here instead of quietly
 * becoming a check that cannot fail.
 */
export async function uiTextStrict(page, key) {
  const text = await uiText(page, key);
  if (!text || text.length < 3) {
    throw new Error(
      `ui-text: "${key}" resolved to ${JSON.stringify(text)} — too short to assert on. ` +
        `An empty needle makes includes() always true and its negation always false.`
    );
  }
  return text;
}
