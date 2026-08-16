import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ErrorMessage } from "@/components/error-message";
import { IdeasSection } from "@/components/ideas/ideas-section";
import { MODULE_ICONS } from "@/lib/module-icons";
import type { Idea } from "@/types/ideas";
import { loadLinkedEntities } from "@/lib/entity-links";
import { loadFavoriteIds } from "@/lib/favorites";

// The module name has exactly one source — the same key the sidebar
// renders — so the tab title, the H1 and the "Ask AI about ..." heading
// can never drift apart into three spellings of the same thing.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("sidebar");
  return { title: t("items.ideas") };
}

export default async function DashboardPage() {
  const t = await getTranslations("sidebar");
  const tIdeas = await getTranslations("dashboard.ideas");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: ideas, error } = await supabase
    .from("ideas")
    .select("*")
    .order("created_at", { ascending: false });

  const ideaIds = (ideas as Idea[] | null)?.map((i) => i.id) ?? [];
  const [linkedEntities, favoritedIds] = await Promise.all([
    loadLinkedEntities(supabase, user.id, "ideas", ideaIds),
    loadFavoriteIds(supabase, user.id, "ideas", ideaIds),
  ]);

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader icon={MODULE_ICONS.ideas} title={t("items.ideas")} />

        {/* Form + list share one client boundary so pressing the worked
            example on the empty screen can fill the form — see
            components/ideas/ideas-section.tsx. The DOM order is unchanged. */}
        <IdeasSection
          ideas={(ideas as Idea[]) ?? []}
          linkedEntities={linkedEntities}
          favoritedIds={favoritedIds}
        >
          {error && <ErrorMessage message={tIdeas("loadError", { message: error.message })} />}
        </IdeasSection>
      </div>
    </main>
  );
}
