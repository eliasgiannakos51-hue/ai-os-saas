import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { readRequestedId } from "@/lib/library/requested";
import { rebuildSystemPrompt } from "@/lib/rebuild/rebuild-system";
import { appSystemPrompt } from "@/lib/apps/app-system";
import { RebuildShell, type RebuildRow } from "@/components/rebuild/rebuild-shell";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("dashboard.tools.names.rebuild");
}

/** How many of the person's own apps the page brings with it. */
const RECENT_APPS = 30;

/**
 * REBUILD, for everybody (the final All tools grid, 2026-10-23): describe
 * an app, or point at a page of one you like, and get your own version.
 * No switch and no plan wall — what holds it in is the credits every step
 * spends and the number of apps an account keeps
 * (lib/rebuild/limits.ts, Free: one). The person's own client reads their
 * own rows (RLS select_own_rebuild_projects); nobody else's are reachable.
 */
export default async function RebuildPage(props: { searchParams?: Promise<{ record?: string }> }) {
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data } = await supabase
    .from("rebuild_projects")
    .select("id, title, plan, reference, html, versions, locale, has_app_phase, app_definition, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(RECENT_APPS);
  return (
    <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
      <RebuildShell
        initialProjects={(data as RebuildRow[] | null) ?? []}
        initialOpenId={readRequestedId(searchParams?.record)}
        systemChars={rebuildSystemPrompt().length}
        appSystemChars={appSystemPrompt().length}
      />
    </div>
  );
}
