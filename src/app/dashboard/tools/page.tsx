import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LayoutGrid } from "lucide-react";
import { pageTitle } from "@/lib/page-title";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { PageHeader } from "@/components/dashboard/page-header";
import { ToolsGrid } from "@/components/tools/tools-grid";
import { readRecentPrefs } from "@/lib/nav/recent-tools";
import { availableTools } from "@/lib/nav/all-tools";
import { imageApiKey } from "@/lib/images/gemini-image";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.rail.allTools");
}

/**
 * ALL TOOLS — the third road to every tool, and the only one a person can
 * browse without knowing a name (docs/mockups/README.md, "Three roads to
 * every tool"). Five groups with a search on top —
 * components/tools/tools-grid.tsx, the seventeen tools of lib/nav/all-tools.ts,
 * those that work; since MASTER 14.1
 * (2026-10-07) without the Settings block. Each square's pin is the only
 * way to put a tool in the sidebar at once, so the page hands it this
 * person's pins.
 *
 * NO SWITCH HIDES THE SQUARES (the owner's critical message, 2026-10-05
 * decision reversed 2026-10-22: `all-tools-tiles` is gone — the switch
 * that could hide every square, from everyone including the owner, is
 * exactly the shape of bug that left All tools looking empty with no way
 * back once /dashboard/system-health 404'd). Every tool still keeps its
 * own page and address, Chat and ⌘K still open them, the Library keeps
 * what was made — that part is unchanged.
 */
export default async function ToolsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const t = await getTranslations("dashboard.tools");
  const isOwner = isAdminEmail(user.email);
  // THE TOOLS THAT WORK, for everybody (lib/nav/all-tools.ts): no switch
  // decides a tile any more. The one thing a tile waits for is a key the
  // server does not have — Image without a Gemini key is not drawn.
  const shown = availableTools({ imageKey: Boolean(imageApiKey()) }).map((tool) => tool.href);

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <PageHeader helpKey="help.tools" icon={LayoutGrid} title={t("title")} description={t("description")} />
        <div className="mt-4">
          <ToolsGrid isOwner={isOwner} pinned={readRecentPrefs(user.user_metadata).pinned} shown={shown} />
        </div>
        <p className="mt-6 text-xs text-muted">{t("orPress")}</p>
      </div>
    </div>
  );
}
