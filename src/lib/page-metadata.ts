import "server-only";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

/**
 * The browser tab's title, in the user's own language.
 *
 * EVERY dashboard page had this hardcoded in English — 31 `export const
 * metadata = { title: "Mission Control" }` declarations plus the module
 * catch-all — so a Greek user's tab strip read Timeline, Files,
 * Integrations, Published Sites while every page under those tabs was in
 * Greek. It is the one piece of UI that survives the page being scrolled
 * away, minimised or buried in twenty other tabs, and it was the only
 * piece still in English.
 *
 * IT ALSO WENT STALE THE MOMENT ANYTHING WAS RENAMED. After the naming
 * pass the tab still said "Mission Control" and "Published Sites" while
 * the page and the sidebar said "Goals & Plans" and "Live sites" — one
 * thing with two names, which is the exact failure the renaming set out
 * to remove.
 *
 * Reading the SAME key the sidebar and the page heading read is what makes
 * that impossible rather than merely fixed: there is one string, and all
 * three render it.
 */
export async function pageTitleMetadata(key: string): Promise<Metadata> {
  // No namespace: the callers pass full paths ("sidebar.items.files"),
  // because a page's name does not always live under one namespace.
  const t = await getTranslations();
  return { title: t(key) };
}

/**
 * The same thing for a module page, whose name is already declared once on
 * its config.
 *
 * `titleKey` is the key the sidebar and the page heading use, so a module
 * cannot end up with a tab that disagrees with either.
 */
export async function moduleTitleMetadata(config: {
  titleKey?: string;
  title: string;
}): Promise<Metadata> {
  if (!config.titleKey) return { title: config.title };
  return pageTitleMetadata(`sidebar.items.${config.titleKey}`);
}
