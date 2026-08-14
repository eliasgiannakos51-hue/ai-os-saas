import { pageTitleMetadata } from "@/lib/page-metadata";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Telescope } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { UpgradeRequired } from "@/components/billing/upgrade-required";
import { isAdminEmail } from "@/lib/admin";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { maxResearchRunsForPlan } from "@/lib/files/limits";
import { ResearchWorkspace, type ResearchReport } from "@/components/research/research-workspace";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return pageTitleMetadata("sidebar.items.deepResearch");
}

export default async function DeepResearchPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("dashboard.deepResearch");
  const isAdmin = isAdminEmail(user.email);
  const planSlug = await resolveEffectivePlanSlug(user);
  const cap = maxResearchRunsForPlan(planSlug);

  if (!isAdmin && cap <= 0) {
    return (
      <main className="min-h-full bg-dot-grid">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <PageHeader icon={Telescope} title={t("title")} description={t("description")} />
          <UpgradeRequired featureName={t("title")} planName="Starter" />
        </div>
      </main>
    );
  }

  // The same calendar-month window the API enforces. Computed here rather
  // than passed from the client so the number on the screen is the number
  // the server will act on.
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);

  const [{ data: reports }, { count }] = await Promise.all([
    supabase
      .from("research_reports")
      .select("id, topic, status, questions, document_id, credits_charged, error, created_at, completed_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("research_reports")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", since.toISOString()),
  ]);

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <PageHeader icon={Telescope} title={t("title")} description={t("description")} />

        {/* The two things a person should know before spending credits on
            this: it takes minutes, and it paraphrases rather than
            reprinting what it finds. */}
        <p className="mb-4 rounded-xl border border-border bg-panel/60 p-3 text-[11px] leading-relaxed text-muted">
          {t("intro")}
        </p>

        <ResearchWorkspace
          initialReports={(reports ?? []) as unknown as ResearchReport[]}
          monthlyCap={isAdmin ? null : cap}
          usedThisMonth={count ?? 0}
        />
      </div>
    </main>
  );
}
