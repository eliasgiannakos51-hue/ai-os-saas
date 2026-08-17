import "server-only";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/**
 * The browser tab title, in the reader's language.
 *
 * Every page used to declare `export const metadata = { title: "Files" }`.
 * A `const` is evaluated once, with no request and therefore no locale
 * cookie in scope, so the string it holds can only ever be the one the
 * author typed — English. That is why a fully Greek dashboard still put
 * "Files — Ionexa AI" in the tab, the history entry, the bookmark and the
 * app switcher on every page: the body went through next-intl and the
 * title could not.
 *
 * `generateMetadata` runs per request, so `getTranslations` can read the
 * NEXT_LOCALE cookie (i18n/request.ts) the same way the body does.
 *
 * KEYS ARE FULL DOTTED PATHS, not a namespace plus a key, because almost
 * every title already existed somewhere in the catalogue and the point is
 * to REUSE those rather than translate the same word twice: dashboard
 * pages take `sidebar.items.*`, so the tab and the nav link that got you
 * there can never drift apart, and the legal pages take
 * `landing.footer.*`, which is where their names are already written.
 *
 * The suffix — "%s — Ionexa AI" — stays in app/layout.tsx's title template
 * and stays untranslated on purpose: it is the product name.
 *
 * `server-only` because getTranslations is the SERVER translator: imported
 * from a client component this fails at build time with a clear message,
 * rather than at request time with a confusing one.
 */
export async function pageTitle(titleKey: string): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t(titleKey) };
}

/**
 * The same, for a page whose description is also read by a person — the
 * legal and marketing pages, where it is what a search result shows.
 */
export async function pageTitleAndDescription(
  titleKey: string,
  descriptionKey: string
): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t(titleKey), description: t(descriptionKey) };
}
