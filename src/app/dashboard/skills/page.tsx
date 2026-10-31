import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isFeatureOn } from "@/lib/flags/flags";
import { createClient } from "@/lib/supabase/server";
import { loadSkills } from "@/lib/skills/load";
import { SkillsWorkspace } from "@/components/skills/skills-workspace";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("dashboard.tools.names.skills");
}

/**
 * SKILLS (the owner's «29. SKILLS: ΤΟ ΜΑΘΑΙΝΕΙΣ ΜΙΑ ΦΟΡΑ», 2026-10-31),
 * Κομμάτι 1 ONLY: «Η σελίδα Skills στις Ρυθμίσεις: λίστα, και πατάς για
 * να ανοίξει.» — his own stop-gate sits right after it: «ΜΟΝΟ ΕΔΩ:
 * στιγμιότυπο και σταματάς μέχρι να γράψω «εγκρίνω»».
 *
 * notFound() RATHER THAN THE COMING SOON SHELL, same reasoning as
 * src/app/dashboard/sheets/page.tsx: components/tools/coming-soon-shell.tsx
 * ends in «Ειδοποίησέ με», answerable only through a tile in
 * src/lib/nav/all-tools.ts, and Skills has none — it lives behind a hidden
 * row in SETTINGS_GROUP (lib/sidebar-nav.ts), not on the grid, because the
 * owner's own message put it «στις Ρυθμίσεις».
 *
 * THE LIST IS LOADED HERE, SERVER-SIDE, same reason
 * src/app/dashboard/my-stuff/page.tsx loads its own rows up front rather
 * than an empty screen that fills a moment later. Κομμάτι 1 has no way to
 * create a second row to search for, so unlike My Stuff there is no query
 * param and no client refetch to wire — pressing a row only shows what is
 * already here.
 */
export default async function SkillsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await isFeatureOn("skills-tool", user))) notFound();

  const supabase = await createClient();
  const skills = await loadSkills(supabase, user.id);

  return (
    <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
      <SkillsWorkspace initialSkills={skills} />
    </div>
  );
}
