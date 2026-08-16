import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { FavoritesList } from "@/components/favorites/favorites-list";
import { groupFavorites, loadAllFavorites } from "@/lib/favorites";

export const metadata: Metadata = { title: "Favorites" };

// Same reasoning as dashboard/timeline and dashboard/mission — reads
// live, frequently-changing data (favorites toggled from any module),
// so it must never serve a cached result.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function FavoritesPage() {
  const t = await getTranslations("dashboard.favorites");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const entries = await loadAllFavorites(supabase, user.id);
  const groups = groupFavorites(entries);

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader helpKey="help.favorites" icon={Star} title={t("title")} description={t("description")} />
        <FavoritesList groups={groups} />
      </div>
    </main>
  );
}
