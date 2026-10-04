import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LayoutGrid } from "lucide-react";
import { pageTitle } from "@/lib/page-title";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { PageHeader } from "@/components/dashboard/page-header";
import { MAIN_SIDEBAR_GROUPS, sidebarGroups } from "@/lib/sidebar-nav";
import { GROUP_HEADING_KEYS, ITEM_LABEL_KEYS } from "@/lib/sidebar-label-keys";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.rail.allTools");
}

/**
 * ALL TOOLS — the third road to every tool, and the only one a person can
 * browse without knowing a name (docs/mockups/README.md, "Three roads to
 * every tool"; the owner's OK on the design, 2026-10-02).
 *
 * The rail beside it (components/dashboard/sidebar.tsx) is now New, Recent,
 * All tools and Settings. The list it used to draw did not go anywhere: it
 * is lib/sidebar-nav.ts, unchanged, read here through the same
 * sidebarGroups() with the same owner filter, so every gate on that list —
 * names, hints in ten languages, the catalog claiming every row — still
 * holds over what this page shows. Each card is the icon, the name the
 * sidebar used and the hint that used to be a tooltip, now written out,
 * because a hint you have to hover to find is one a phone never shows.
 */
export default async function ToolsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("dashboard.tools");
  const tSidebar = await getTranslations("sidebar");
  const tCommon = await getTranslations("common");
  const groups = sidebarGroups(MAIN_SIDEBAR_GROUPS, isAdminEmail(user.email));

  // The same two lookups the sidebar makes, so a card cannot be named
  // differently from the row it replaced.
  const heading = (h: string) => (GROUP_HEADING_KEYS[h] ? tSidebar(`groups.${GROUP_HEADING_KEYS[h]}`) : h);
  const label = (l: string) =>
    l === "Create Studio" ? tCommon("createStudio") : ITEM_LABEL_KEYS[l] ? tSidebar(`items.${ITEM_LABEL_KEYS[l]}`) : l;

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <PageHeader helpKey="help.tools" icon={LayoutGrid} title={t("title")} description={t("description")} />
        <div className="mt-6 space-y-8">
          {groups.map((group) => (
            <section key={group.heading} aria-labelledby={`tools-${group.heading}`}>
              <h2
                id={`tools-${group.heading}`}
                className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted"
              >
                {heading(group.heading)}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="tool-card surface-tight group flex min-h-[44px] items-start gap-3 transition-colors duration-150 hover:bg-panel-hover"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground/10 text-foreground">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-foreground">{label(item.label)}</span>
                        {item.hintKey && (
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                            {tSidebar(`hints.${item.hintKey}`)}
                          </span>
                        )}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <p className="mt-8 text-xs text-muted">{t("orPress")}</p>
      </div>
    </div>
  );
}
