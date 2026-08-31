import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ErrorMessage } from "@/components/error-message";
import { IdeasSection } from "@/components/ideas/ideas-section";
import { MODULE_ICONS } from "@/lib/module-icons";
import type { Idea } from "@/types/ideas";
import { loadLinkedEntities } from "@/lib/entity-links";
import { loadFavoriteIds } from "@/lib/favorites";
import { RECORD_CAP, isCapped } from "@/lib/record-cap";
import { ListCappedNotice } from "@/components/ui/list-capped-notice";

// The module name has exactly one source — the same key the sidebar
// renders — so the tab title, the H1 and the "Ask AI about ..." heading
// can never drift apart into three spellings of the same thing.
export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.ideas");
}

export default async function DashboardPage() {
  const t = await getTranslations("sidebar");
  const tIdeas = await getTranslations("dashboard.ideas");
  const supabase = createClient();

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // Capped like every other module list — see lib/record-cap.ts.
  const { data: ideas, error } = await supabase
    .from("ideas")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(RECORD_CAP);

  const ideaIds = (ideas as Idea[] | null)?.map((i) => i.id) ?? [];
  const [linkedEntities, favoritedIds] = await Promise.all([
    loadLinkedEntities(supabase, user.id, "ideas", ideaIds),
    loadFavoriteIds(supabase, user.id, "ideas", ideaIds),
  ]);

  return (
    <div className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader
          icon={MODULE_ICONS.ideas}
          title={t("items.ideas")}
          helpKey="help.businessModule"
        />

        {/* Form + list share one client boundary so pressing the worked
            example on the empty screen can fill the form — see
            components/ideas/ideas-section.tsx. The DOM order is unchanged. */}
        {isCapped((ideas as Idea[]) ?? [], RECORD_CAP) && (
          <ListCappedNotice cap={RECORD_CAP} />
        )}

        <IdeasSection
          ideas={(ideas as Idea[]) ?? []}
          linkedEntities={linkedEntities}
          favoritedIds={favoritedIds}
        >
          {error && <ErrorMessage message={tIdeas("loadError", { message: error.message })} />}
        </IdeasSection>
      </div>
    </div>
  );
}
