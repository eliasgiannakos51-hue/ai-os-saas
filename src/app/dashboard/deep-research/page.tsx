import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Telescope } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { UpgradeRequired } from "@/components/billing/upgrade-required";
import { upgradeWallProps } from "@/lib/billing/feature-catalog";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { maxResearchRunsForPlan } from "@/lib/files/limits";
import type { ResearchReport } from "@/components/research/research-workspace";
import { readExampleParam } from "@/lib/overview/first-screen-examples";
import { readRequestedId } from "@/lib/library/requested";
import { ResearchShell } from "@/components/research/research-shell";
import { countResearchRunsThisMonth } from "@/lib/research/research-usage";
import { ownedProjectId } from "@/lib/projects/link-result";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.deepResearch");
}

// THE BRIEF ARRIVES IN THE URL. Home's field routes a research request
// here with the question the person already typed; readExampleParam is
// the same clamp the first-screen examples use, and
// scripts/tests/producer-routes.test.mjs compares this parameter's name
// against the one lib/create-studio/producer-routes.ts emits.
export default async function DeepResearchPage(
  props: {
    searchParams: Promise<{ brief?: string; record?: string; projectId?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("dashboard.deepResearch");
  const isAdmin = isAdminEmail(user.email);
  const planSlug = await resolveEffectivePlanSlug(user);
  const cap = maxResearchRunsForPlan(planSlug);

  if (!isAdmin && cap <= 0) {
    return (
      <div className="min-h-full">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <PageHeader helpKey="help.deepResearch" icon={Telescope} title={t("title")} description={t("description")} />
          <UpgradeRequired {...upgradeWallProps("deepResearch", t("title"))!} />
        </div>
      </div>
    );
  }

  // THE SAME FUNCTION THE API ENFORCES WITH, not a second query that
  // means the same thing today. Both used to count research_reports rows
  // created since the 1st, side by side, with a comment here promising
  // they matched; when the route's count moved to the ledger (a deleted
  // report used to hand the allowance back — see
  // lib/research/research-usage.ts) a copy here would have gone on
  // showing the old number while the server refused on the new one.
  const REPORT_COLUMNS = "id, topic, status, questions, document_id, credits_charged, error, created_at, completed_at";
  const [{ data: listed }, used] = await Promise.all([
    supabase
      .from("research_reports")
      .select(REPORT_COLUMNS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    countResearchRunsThisMonth(user.id),
  ]);
  // `?record=` (the Library): a report older than the newest 100 still
  // opens — read on its own, by id AND owner.
  const reports = [...(listed ?? [])];
  const wanted = readRequestedId(searchParams.record);
  if (wanted && !reports.some((r) => String(r.id) === wanted)) {
    const { data: one } = await supabase.from("research_reports").select(REPORT_COLUMNS).eq("id", wanted).eq("user_id", user.id).maybeSingle();
    if (one) reports.push(one);
  }

  // THE SHELL, FOR EVERYBODY (MASTER 14.3, package 3; its switch was removed
  // 2026-10-23): the reports and the plan-then-run stop, drawn as
  // conversation and work.
  const projectId = await ownedProjectId(supabase, searchParams.projectId);
  return (
    <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
      <ResearchShell
        initialTopic={readExampleParam(searchParams.brief)}
        initialReports={reports as unknown as ResearchReport[]}
        initialOpenId={wanted}
        monthlyCap={isAdmin ? null : cap}
        usedThisMonth={used ?? 0}
        initialProjectId={projectId}
      />
    </div>
  );
}
