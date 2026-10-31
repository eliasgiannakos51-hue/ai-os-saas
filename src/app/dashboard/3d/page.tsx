import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isFeatureOn } from "@/lib/flags/flags";
import { ComingSoonShell } from "@/components/tools/coming-soon-shell";
import { ThreeDShell } from "@/components/three-d/three-d-shell";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("dashboard.tools.names.threeD");
}

/**
 * 3D (the owner's "23. 3D: ΝΕΟ ΕΡΓΑΛΕΙΟ", 2026-10-31), Κομμάτι 2 ONLY,
 * behind the switch "3d-tool". Brand new tool — no earlier stub existed
 * before this directive; src/lib/nav/all-tools.ts's own entry is new too.
 *
 * THE SWITCH, NOT `ready`. The All tools tile keeps its «Σύντομα» mark
 * until every piece passes, and this page does not read that flag:
 * anyone the switch is not open to gets the same Coming Soon screen the
 * tile promised, so a half-built piece is never reachable by a customer.
 *
 * No plan-gate and no Supabase fetch here, same as Editing/Films this
 * session — there is no billing wall and no data table for 3D yet
 * (pieces 3+ need one; this piece is chrome only).
 */
export default async function ThreeDPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const t = await getTranslations();

  if (!(await isFeatureOn("3d-tool", user))) {
    return (
      <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
        <ComingSoonShell
          toolKey="threeD"
          name={t("dashboard.tools.names.threeD")}
          examples={[t("dashboard.comingSoon.examples.threeD.a"), t("dashboard.comingSoon.examples.threeD.b"), t("dashboard.comingSoon.examples.threeD.c")]}
        />
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
      <ThreeDShell />
    </div>
  );
}
