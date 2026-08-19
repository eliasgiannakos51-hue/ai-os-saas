import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, resolveSupportedLocale, SUPPORTED_LOCALES, DEFAULT_LOCALE } from "./constants";

// WHERE THE LOCALE COMES FROM, in order, and why there are three sources
// rather than one.
//
//   1. THE COOKIE. Written by both language selectors, and refreshed from
//      the account by middleware.ts on every request. It is the fast path:
//      this function runs on EVERY server render, so anything here that
//      cost a network round trip would cost one per page.
//
//   2. Accept-Language, for a visitor who has never chosen. Cookie-only
//      meant a first-time visitor from Athens or Lisbon got English on the
//      landing page, the pricing page and the signup form — every page
//      they see BEFORE they have an account to store a preference on, and
//      the only ones that decide whether they get one. Their browser has
//      been announcing their language in every request the whole time.
//
//   3. English, when neither says anything we serve.
//
// THE ACCOUNT IS NOT READ HERE, deliberately. It is authoritative — see
// middleware.ts — but reading it would mean an auth round trip per render.
// Middleware already pays for exactly one getUser() per request and writes
// the answer onto the cookie, so by the time this runs the cookie IS the
// account's value.

/** The best supported locale named by an Accept-Language header, or null. */
export function localeFromAcceptLanguage(header: string | null | undefined): string | null {
  if (!header) return null;
  const supported = SUPPORTED_LOCALES as readonly string[];
  const entries = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      const quality = q ? Number(q.trim().slice(2)) : 1;
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0 };
    })
    // q=0 means "explicitly not this one", which is not the same as
    // "unranked" — dropping the entry rather than sorting it last is the
    // difference between honouring that and ignoring it.
    .filter((e) => e.tag && e.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { tag } of entries) {
    if (tag === "*") return null;
    // "el-GR" and "pt-BR" have to match "el" and "pt". The base subtag is
    // what this app serves; a regional variant of a language we have is
    // still that language.
    const base = tag.split("-")[0];
    if (supported.includes(tag)) return tag;
    if (supported.includes(base)) return base;
  }
  return null;
}

export default getRequestConfig(async () => {
  const cookieStore = cookies();
  const chosen = cookieStore.get(LOCALE_COOKIE)?.value;

  const locale = (SUPPORTED_LOCALES as readonly string[]).includes(chosen ?? "")
    ? resolveSupportedLocale(chosen)
    : resolveSupportedLocale(
        localeFromAcceptLanguage(headers().get("accept-language")) ?? DEFAULT_LOCALE
      );

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
