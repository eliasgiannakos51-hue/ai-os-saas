import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isFeatureOn } from "@/lib/flags/flags";
import { ComingSoonShell } from "@/components/tools/coming-soon-shell";
import { FilmsShell } from "@/components/films/films-shell";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("dashboard.tools.names.films");
}

/**
 * FILMS (the owner's "20. FILMS: ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΕΛΕΓΧΟ ΑΝΑ ΠΛΑΝΟ",
 * 2026-10-30), Κομμάτι 2 ONLY, behind the switch "films-tool".
 *
 * THE SWITCH, NOT `ready`. The All tools tile keeps its «Σύντομα» mark
 * from src/lib/nav/all-tools.ts until every piece passes, and this page
 * does not read that flag: anyone the switch is not open to gets the
 * same Coming Soon screen the tile promised, so a half-built piece is
 * never reachable by a customer.
 *
 * No plan-gate and no Supabase fetch here, same as Editing's own page
 * this session — there is no billing wall and no data table for Films
 * yet (pieces 3+ need one; this piece is chrome only).
 */
export default async function FilmsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations();

  if (!(await isFeatureOn("films-tool", user))) {
    return (
      <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
        <ComingSoonShell
          toolKey="films"
          name={t("dashboard.tools.names.films")}
          examples={[t("dashboard.comingSoon.examples.films.a"), t("dashboard.comingSoon.examples.films.b")]}
        />
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
      <FilmsShell />
    </div>
  );
}
