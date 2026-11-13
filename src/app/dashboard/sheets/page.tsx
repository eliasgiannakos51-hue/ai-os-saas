import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isFeatureOn } from "@/lib/flags/flags";
import { SheetsShell } from "@/components/sheets/sheets-shell";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("dashboard.tools.names.sheets");
}

/**
 * SHEETS (the owner's «28. SHEETS: ΠΙΝΑΚΕΣ ΜΕ ΠΡΑΓΜΑΤΙΚΟΥΣ ΤΥΠΟΥΣ»,
 * 2026-10-31), Κομμάτι 1 ONLY, behind the switch "sheets-tool".
 *
 * notFound() RATHER THAN THE COMING SOON SHELL, and the difference is a
 * promise nobody could keep. components/tools/coming-soon-shell.tsx ends
 * in «Ειδοποίησέ με», which stores a row keyed by the tool
 * (app/api/tools/notify/route.ts) and is read by
 * scripts/notify-tool-ready.mjs through lib/nav/all-tools.ts — and
 * Sheets has no tile there, because the owner's own «ALL TOOLS: ΟΛΑ ΤΑ
 * ΤΕΤΡΑΓΩΝΑ» message enumerated twenty-five squares and this is not one
 * of them. A «Notify me» that no job can ever answer is worse than an
 * address that honestly does not exist yet, so whether Sheets gets the
 * twenty-sixth square is a question for him
 * (docs/NEEDS-FROM-ELIAS.md), not a tile added quietly here.
 *
 * Same shape as src/app/dashboard/system-health/page.tsx: notFound() for
 * a page that is not this reader's, not a redirect and not a "you are not
 * allowed" screen.
 *
 * No plan-gate and no Supabase fetch, same as 3D's and Films' own pages:
 * there is no billing wall and no table for Sheets yet (Κομμάτι 5 needs
 * one; this piece is the screen).
 */
export default async function SheetsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await isFeatureOn("sheets-tool", user))) notFound();

  return (
    <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
      <SheetsShell />
    </div>
  );
}
