import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GreetingHeader } from "@/components/overview/greeting-header";
import { CreateChat } from "@/components/create/create-chat";
import { QuickActionCard } from "@/components/overview/quick-action-card";
import { RecentEntriesCard, type RecentEntry } from "@/components/overview/recent-entries-card";
import { AiCoachCard } from "@/components/overview/ai-coach-card";
import { QuickStartButton } from "@/components/overview/quick-start-button";
import { ProgressCard } from "@/components/overview/progress-card";
import { HomeStatCard } from "@/components/overview/home-stat-card";
import { CreditsHomeStat } from "@/components/overview/credits-home-stat";
import { BetaFeedbackBanner } from "@/components/overview/beta-feedback-banner";
import { GlowOrb } from "@/components/ui/glow-orb";
import { MODULE_ICONS } from "@/lib/module-icons";
import { CLASSIFIER_MODULES, moduleHref } from "@/lib/classifier-modules";
import { isBetaTester } from "@/lib/beta";
import { logApiError } from "@/lib/log-error";
import { Database, TrendingUp, Layers } from "lucide-react";
import type { ModuleRecord } from "@/types/module-record";

export const metadata: Metadata = {
  title: "Overview",
};

const QUICK_ACTIONS = [
  { slug: "ideas", label: "Idea", description: "Capture a new idea" },
  { slug: "research", label: "Research", description: "Log research notes" },
  { slug: "finance", label: "Finance", description: "Track income & expenses" },
  { slug: "trading", label: "Trading", description: "Log a trade" },
  { slug: "products", label: "Product Plan", description: "Plan a new product" },
  { slug: "content", label: "Content", description: "Draft content ideas" },
  { slug: "decisions", label: "Decision", description: "Weigh your options" },
  { slug: "automation", label: "Automation", description: "Save time automating" },
] as const;

export default async function OverviewPage() {
  const t = await getTranslations("dashboard.overview");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Real account age (auth user's own created_at, not a separate stored
  // field) — 3 days is a threshold, not a stored flag, so it just
  // naturally stops applying once the account is old enough regardless of
  // when this code runs.
  const accountAgeMs = Date.now() - new Date(user.created_at).getTime();
  const showBetaFeedbackBanner = isBetaTester(user) && accountAgeMs >= 3 * 24 * 60 * 60 * 1000;
  const betaFeedbackUrl = process.env.BETA_FEEDBACK_URL || "mailto:feedback@ionexa.ai";

  const now = Date.now();
  const oneDayAgoMs = now - 24 * 60 * 60 * 1000;
  const sevenDaysAgoMs = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

  type ModuleSummary = {
    module: (typeof CLASSIFIER_MODULES)[number];
    href: string;
    count: number;
    recentCount: number;
    todayCount: number;
    monthCount: number;
    last30DaysMs: number[];
    rows: ModuleRecord[];
  };

  // Each module's summary is wrapped in its own try/catch — a single
  // table erroring (RLS hiccup, transient network issue, whatever) used
  // to reject the whole Promise.all and take the entire Home page down
  // with it. Now that module just renders as zero-activity instead of
  // crashing the render for every other module too.
  const summaries: ModuleSummary[] = await Promise.all(
    CLASSIFIER_MODULES.map(async (module): Promise<ModuleSummary> => {
      try {
        // A single 30-day created_at list (timestamps only, cheap) covers
        // "today"/"this week"/"this month" for the stat row and Progress
        // card by filtering client-side — one query per module instead of
        // three, both cheaper and less surface area for a single
        // module's query to fail.
        const [recentRowsResult, last30DaysResult] = await Promise.all([
          supabase
            .from(module.table)
            .select("*", { count: "exact" })
            .order("created_at", { ascending: false })
            .limit(5),
          supabase.from(module.table).select("created_at").gte("created_at", thirtyDaysAgo),
        ]);

        const last30DaysTimestamps = (last30DaysResult.data as { created_at: string }[] | null) ?? [];
        const last30DaysMs = last30DaysTimestamps.map((r) => new Date(r.created_at).getTime());

        return {
          module,
          href: moduleHref(module.slug),
          count: recentRowsResult.count ?? 0,
          recentCount: last30DaysMs.filter((ms) => ms >= sevenDaysAgoMs).length,
          todayCount: last30DaysMs.filter((ms) => ms >= oneDayAgoMs).length,
          monthCount: last30DaysMs.length,
          last30DaysMs,
          rows: (recentRowsResult.data as ModuleRecord[] | null) ?? [],
        };
      } catch (err) {
        logApiError("/dashboard/overview", err, { stage: "module_summary", moduleSlug: module.slug });
        return {
          module,
          href: moduleHref(module.slug),
          count: 0,
          recentCount: 0,
          todayCount: 0,
          monthCount: 0,
          last30DaysMs: [],
          rows: [],
        };
      }
    })
  );

  // Real daily-entry counts for the last 7 days, across every module —
  // powers the sparkline on the Total Entries / This Week stat cards
  // (StatCardWithTrend). Rolling 24h buckets anchored to "now" rather than
  // calendar days, same reasoning as oneDayAgoMs/sevenDaysAgo above: no
  // reliable per-user timezone available server-side. No synthetic data —
  // a module with zero activity in a given bucket is just 0.
  const DAY_MS = 24 * 60 * 60 * 1000;
  const SPARKLINE_DAYS = 7;
  const weeklySparkline: number[] = new Array(SPARKLINE_DAYS).fill(0);
  for (const summary of summaries) {
    for (const ms of summary.last30DaysMs) {
      const ageMs = now - ms;
      if (ageMs < 0 || ageMs >= SPARKLINE_DAYS * DAY_MS) continue;
      const bucketIndex = SPARKLINE_DAYS - 1 - Math.floor(ageMs / DAY_MS);
      if (bucketIndex >= 0 && bucketIndex < SPARKLINE_DAYS) {
        weeklySparkline[bucketIndex] += 1;
      }
    }
  }

  const recentEntries: RecentEntry[] = summaries
    .flatMap((summary) =>
      summary.rows.map((row) => ({
        id: `${summary.module.slug}-${row.id}`,
        title: String(row[summary.module.headlineKey] ?? "untitled"),
        moduleTitle: summary.module.title,
        href: summary.href,
        createdAt: row.created_at,
      }))
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const totalThisWeek = summaries.reduce((sum, s) => sum + s.recentCount, 0);
  const totalToday = summaries.reduce((sum, s) => sum + s.todayCount, 0);
  const totalThisMonth = summaries.reduce((sum, s) => sum + s.monthCount, 0);
  const totalEntries = summaries.reduce((sum, s) => sum + s.count, 0);
  const mostActive = summaries.reduce<(typeof summaries)[number] | null>(
    (max, s) => (s.count > (max?.count ?? -1) ? s : max),
    null
  );

  // "AI Coach" digest — same recentCount numbers as the stat cards below,
  // just reframed as a sentence. Top 3 modules with activity this week,
  // ranked by how much of it happened there.
  const topModulesThisWeek = summaries
    .filter((s) => s.recentCount > 0)
    .sort((a, b) => b.recentCount - a.recentCount)
    .slice(0, 3);

  const aiCoachSummary =
    topModulesThisWeek.length === 0
      ? t("aiCoach.noActivity")
      : [
          topModulesThisWeek
            .map((s) => t("aiCoach.entryCount", { count: s.recentCount, module: s.module.title }))
            .join(", "),
          t("aiCoach.mostActiveIn", { module: topModulesThisWeek[0].module.title }),
        ].join(". ");

  return (
    <main className="min-h-full bg-background">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <GlowOrb className="-left-10 -top-20 -z-10 h-56 w-56" />
          <GreetingHeader email={user.email ?? ""} />
          <QuickStartButton />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HomeStatCard
            icon={Database}
            label={t("statRow.totalEntries")}
            value={totalEntries.toLocaleString()}
            trend={weeklySparkline}
          />
          <HomeStatCard
            icon={TrendingUp}
            label={t("statRow.thisWeek")}
            value={totalThisWeek.toLocaleString()}
            trend={weeklySparkline}
          />
          <HomeStatCard
            icon={Layers}
            label={t("statRow.mostActive")}
            value={mostActive && mostActive.count > 0 ? mostActive.module.title : "—"}
          />
          <CreditsHomeStat label={t("statRow.creditsRemaining")} />
        </div>

        {showBetaFeedbackBanner && (
          <BetaFeedbackBanner
            message={t("betaFeedback.message")}
            linkLabel={t("betaFeedback.linkLabel")}
            feedbackUrl={betaFeedbackUrl}
          />
        )}

        <AiCoachCard title={t("aiCoach.title")} summary={aiCoachSummary} />

        <div className="mt-6">
          <CreateChat showHeading={false} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {QUICK_ACTIONS.map((action) => (
            <QuickActionCard
              key={action.slug}
              href={moduleHref(action.slug)}
              icon={MODULE_ICONS[action.slug]}
              label={action.label}
              description={action.description}
            />
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <RecentEntriesCard entries={recentEntries} />

          <ProgressCard
            title={t("progress.title")}
            stats={[
              { label: t("progress.today"), value: totalToday },
              { label: t("progress.thisWeek"), value: totalThisWeek },
              { label: t("progress.thisMonth"), value: totalThisMonth },
            ]}
          />
        </div>
      </div>
    </main>
  );
}
