/**
 * WHICH WAY THE PAGE READS.
 *
 * WHY THIS FILE EXISTS, AND IT IS NOT A NICE-TO-HAVE. lib/website-builder.ts
 * carries a section called WRITING DIRECTION that this product sends to
 * every model it asks for a website. Its first rule is:
 *
 *   "If the site's language is written right to left — Arabic, Hebrew,
 *    Persian/Farsi, Urdu — put dir="rtl" on the <html> element alongside
 *    lang. If it is not, do not set dir at all."
 *
 * That section was written after a real Arabic site came back carrying
 * ~10,000px of horizontal scroll. The application demanded it of others
 * and shipped `<html lang="ar">` with no dir at all — measured on
 * 2026-09-07 with scripts/tests/rtl-layout.prodtest.mjs: dir=null on
 * every route, at 390 and at 1440, and an off-screen element census
 * IDENTICAL to English, which is what "the layout was never mirrored"
 * looks like from the outside.
 *
 * THE SAME LIST, ONCE. scripts/tests/rtl.test.mjs reads the four language
 * names out of WRITING_DIRECTION_SECTION and requires them to be exactly
 * the four below. Adding Hebrew to the prompt and not to this file, or the
 * reverse, turns that gate red — which is the only way one catalogue stays
 * one catalogue.
 */

/**
 * The right-to-left languages, as base subtags.
 *
 * Only "ar" is currently a supported locale (see i18n/constants.ts). The
 * other three are here because the prompt names them and because the
 * alternative — adding each one when its locale ships — is how the second
 * one gets forgotten. A language nobody has translated costs nothing here
 * and works the day its catalogue lands.
 */
export const RTL_LANGUAGES = ["ar", "he", "fa", "ur"] as const;

/**
 * The base subtag of a locale tag: "ar" from "ar", "ar-EG" or "AR-eg".
 *
 * Locale tags reach this from three places that spell them differently —
 * the cookie, Accept-Language and the account — so normalising here rather
 * than at each call site is the difference between "ar-EG" reading
 * right-to-left and reading English.
 */
function baseSubtag(locale: string | null | undefined): string {
  return String(locale ?? "")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];
}

/** Which way `locale` reads. Unknown or missing locales read left to right. */
export function directionOf(locale: string | null | undefined): "rtl" | "ltr" {
  return (RTL_LANGUAGES as readonly string[]).includes(baseSubtag(locale)) ? "rtl" : "ltr";
}

/**
 * What to put in the `dir` attribute — or undefined, meaning omit it.
 *
 * UNDEFINED RATHER THAN "ltr", DELIBERATELY. The prompt's rule says "if it
 * is not, do not set dir at all", and this file exists to obey the same
 * catalogue it hands out. It is also the better behaviour: an explicit
 * dir="ltr" on <html> overrides a user agent or an embedding page that
 * knows better, and there is no case in this product where that helps.
 */
export function dirAttribute(locale: string | null | undefined): "rtl" | undefined {
  return directionOf(locale) === "rtl" ? "rtl" : undefined;
}
