import type { Metadata } from "next";
import { pageTitle } from "@/lib/page-title";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ErrorMessage } from "@/components/error-message";
import { AddIdeaForm } from "@/components/ideas/add-idea-form";
import { IdeasList } from "@/components/ideas/ideas-list";
import { MODULE_ICONS } from "@/lib/module-icons";
import type { Idea } from "@/types/ideas";
import { loadLinkedEntities } from "@/lib/entity-links";
import { loadFavoriteIds } from "@/lib/favorites";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.ideas");
}

export default async function DashboardPage() {
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
        <PageHeader icon={MODULE_ICONS.ideas} title="Ideas" />

        <div className="mb-6">
          <AddIdeaForm />
        </div>

        {error && <ErrorMessage detail={`loading ideas: ${error.message}`} />}

        <IdeasList
          ideas={(ideas as Idea[]) ?? []}
          linkedEntities={linkedEntities}
          favoritedIds={favoritedIds}
        />
      </div>
    </main>
  );
}
