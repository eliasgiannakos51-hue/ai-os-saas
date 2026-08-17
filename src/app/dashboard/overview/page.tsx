import type { Metadata } from "next";
import { pageTitle } from "@/lib/page-title";
import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { GreetingHeader } from "@/components/overview/greeting-header";
import { InsightList, type Insight } from "@/components/onboarding/insight-list";
import { CreateChat } from "@/components/create/create-chat";
import { QuickActionCard } from "@/components/overview/quick-action-card";
import { LowCreditsBanner } from "@/components/credits/low-credits-banner";
import { ITEM_LABEL_KEYS } from "@/lib/sidebar-label-keys";
import { RecentEntriesCard, type RecentEntry } from "@/components/overview/recent-entries-card";
import { AiCoachCard } from "@/components/overview/ai-coach-card";
import { ActiveMissionCard } from "@/components/overview/active-mission-card";
import { NextActionCard } from "@/components/overview/next-action-card";
import { QuickStartButton } from "@/components/overview/quick-start-button";
import { ProgressCard } from "@/components/overview/progress-card";
import { HomeStatCard } from "@/components/overview/home-stat-card";
import { CreditsHomeStat } from "@/components/overview/credits-home-stat";
import { BetaFeedbackBanner } from "@/components/overview/beta-feedback-banner";
import { BetaExpiryBanner } from "@/components/overview/beta-expiry-banner";
import { GlowOrb } from "@/components/ui/glow-orb";
import { MODULE_ICONS } from "@/lib/module-icons";
import { CLASSIFIER_MODULES, moduleHref } from "@/lib/classifier-modules";
import { isBetaTester, getBetaDaysRemaining } from "@/lib/beta";
import { logApiError } from "@/lib/log-error";
import { isActiveMission, missionProgressPercent } from "@/lib/mission-progress";
import { computeNextAction } from "@/lib/next-action";
import { computeHealthScore } from "@/lib/health-score";
import { HealthScoreCard } from "@/components/overview/health-score-card";
import { loadLatestEnergyCheckIn } from "@/lib/energy-checkins";
import { EnergyCheckinWidget } from "@/components/overview/energy-checkin-widget";
import { Database, TrendingUp, Layers } from "lucide-react";
import type { ModuleRecord } from "@/types/module-record";
import type { Mission } from "@/types/mission";
import { formatNumber } from "@/lib/format-number";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.home");
}

// See dashboard/mission/page.tsx for why this is explicit rather than
// relying only on cookies() to imply it — this page's Active Missions
// widget reads the same frequently-changing ai_missions data.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Four, not eight. Every one of these modules is also one click away in
// the sidebar, so a second eight-item grid on the Home page was just
// duplicating the nav and crowding the page — the point of this row is a
// handful of obvious starting points, not full coverage. Each gets its
// own accent so the row scans as four distinct destinations.
// Only the slug and the accent live here. Label and description are looked
// up per render from dashboard.overview.quickActions.<slug>, because
// literals in this array were rendered verbatim and stayed English in every
// language — one of the reported i18n bugs.
const QUICK_ACTIONS = [
  { slug: "ideas", tone: "amber" },
  { slug: "research", tone: "violet" },
  { slug: "finance", tone: "sky" },
  { slug: "trading", tone: "emerald" },
] as const;

export default async function OverviewPage() {
  const t = await getTranslations("dashboard.overview");
  const locale = await getLocale();
  const tSidebar = await getTranslations("sidebar.items");
  const tInsights = await getTranslations("dashboard.insights");
  // The config carries the sidebar key directly now, so this no longer
  // has to look an English string up in a table to find its own name.
  const tKey = await getTranslations();
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // A brand-new account goes through the first-run flow once.
  //
  // The redirect is gated on a row EXISTING with an outcome, not on a
  // count of their data: an account that imported nothing and skipped is
  // still an account that has decided, and sending them back through the
  // flow every visit would be nagging. Writing the row is what "decided"
  // means, and both Skip and Finish write it.
  const { data: onboardingState } = await supabase
    .from("user_onboarding")
    .select("completed_at, skipped_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!onboardingState?.completed_at && !onboardingState?.skipped_at) {
    redirect("/onboarding");
  }

  // The insights card. Dismissed ones are excluded by the query, so a
  // pattern the user has said they know about does not come back.
  const { data: activeInsights } = await supabase
    .from("user_insights")
    .select("id, detector, module_slug, headline, detail, evidence, sample_size")
    .eq("user_id", user.id)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(3);

  // Real account age (auth user's own created_at, not a separate stored
  // field) — 3 days is a threshold, not a stored flag, so it just
  // naturally stops applying once the account is old enough regardless of
  // when this code runs.
  const accountAgeMs = Date.now() - new Date(user.created_at).getTime();
  const showBetaFeedbackBanner = isBetaTester(user) && accountAgeMs >= 3 * 24 * 60 * 60 * 1000;
  const betaFeedbackUrl = process.env.BETA_FEEDBACK_URL || "mailto:feedback@ionexa.ai";

  // "Expires soon" banner — only in the final 3 days of an active beta
  // window (0 already-expired accounts fall back to Free elsewhere and
  // have nothing to warn about here). getBetaDaysRemaining reads the real
  // beta_expires_at, so this stays correct without any manual upkeep.
  const betaDaysRemaining = isBetaTester(user) ? await getBetaDaysRemaining(user.id) : null;
  const showBetaExpiryBanner =
    betaDaysRemaining !== null && betaDaysRemaining > 0 && betaDaysRemaining <= 3;

  const now = Date.now();
  const oneDayAgoMs = now - 24 * 60 * 60 * 1000;
  const sevenDaysAgoMs = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

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
  // crashing the render for every other module too. The two queries below
  // are also caught individually (not as a pair) so a Runtime Log failure
  // names the exact query that failed, not just "something in this module".
  const summaries: ModuleSummary[] = await Promise.all(
    CLASSIFIER_MODULES.map(async (module): Promise<ModuleSummary> => {
      const base = { module, href: moduleHref(module.slug) };

      let count = 0;
      let rows: ModuleRecord[] = [];
      try {
        const recentRowsResult = await supabase
          .from(module.table)
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .limit(5);
        count = recentRowsResult.count ?? 0;
        rows = (recentRowsResult.data as ModuleRecord[] | null) ?? [];
      } catch (err) {
        logApiError("/dashboard/overview", err, {
          stage: "recent_rows_query",
          moduleSlug: module.slug,
          table: module.table,
        });
      }

      let last30DaysMs: number[] = [];
      try {
        const last30DaysResult = await supabase
          .from(module.table)
          .select("created_at")
          .gte("created_at", thirtyDaysAgo);
        const last30DaysTimestamps = (last30DaysResult.data as { created_at: string }[] | null) ?? [];
        last30DaysMs = last30DaysTimestamps.map((r) => new Date(r.created_at).getTime());
      } catch (err) {
        logApiError("/dashboard/overview", err, {
          stage: "last_30_days_query",
          moduleSlug: module.slug,
          table: module.table,
        });
      }

      return {
        ...base,
        count,
        recentCount: last30DaysMs.filter((ms) => ms >= sevenDaysAgoMs).length,
        todayCount: last30DaysMs.filter((ms) => ms >= oneDayAgoMs).length,
        monthCount: last30DaysMs.length,
        last30DaysMs,
        rows,
      };
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
        // module.title is the raw English title from lib/modules.ts (a data
        // definition, not UI copy), so rendering it directly kept module
        // names English in every language. ITEM_LABEL_KEYS maps it onto the
        // same sidebar.items.* message the sidebar already uses, so a module
        // reads identically in both places.
        moduleTitleKey: summary.module.titleKey,
        href: summary.href,
        createdAt: row.created_at,
      }))
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  // Active Missions widget — most recently created mission that's still
  // "planning" or "in_progress" (see lib/mission-progress.ts). Reads the
  // exact same ai_missions data Mission Control itself uses; nothing here
  // mutates a mission or changes its status.
  const { data: activeMissionRows, error: activeMissionError } = await supabase
    .from("ai_missions")
    .select("*")
    .in("status", ["planning", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (activeMissionError) {
    logApiError("/dashboard/overview", activeMissionError, { stage: "active_mission_query" });
  }
  const activeMission =
    ((activeMissionRows as Mission[] | null) ?? []).find(isActiveMission) ?? null;
  const activeMissionSteps = activeMission?.plan_steps?.steps ?? [];

  // "What's Next?" — pure data-driven priority ladder (lib/next-action.ts),
  // no AI call. Reuses the activeMission already fetched above instead of
  // querying ai_missions again.
  const nextAction = await computeNextAction(supabase, user.id, activeMission);
  let nextActionMessage: string | null = null;
  if (nextAction?.kind === "mission_step") {
    nextActionMessage = t("nextAction.continueMission", {
      step: nextAction.stepText,
      goal: nextAction.missionGoal,
    });
  } else if (nextAction?.kind === "revisit_link") {
    nextActionMessage = t("nextAction.revisitLink", {
      source: nextAction.sourceHeadline,
      target: nextAction.targetHeadline,
    });
  } else if (nextAction?.kind === "start_new") {
    nextActionMessage = t("nextAction.startNew");
  }

  // Business Health Score — pure calculation (lib/health-score.ts), no AI
  // call. Mission-steps-completed-recently is an approximation: ai_missions
  // has no per-step completed_at, but its updated_at trigger (see
  // supabase_schema.sql) bumps every time a step is marked completed
  // (mission-card.tsx's buildStep), so "missions touched in the last 14
  // days" is the closest real signal available without a schema change.
  let missionStepsCompletedRecent = 0;
  try {
    const { data: recentMissionRows, error: recentMissionError } = await supabase
      .from("ai_missions")
      .select("plan_steps")
      .gte("updated_at", fourteenDaysAgo);
    if (recentMissionError) {
      logApiError("/dashboard/overview", recentMissionError, { stage: "recent_mission_steps_query" });
    } else {
      missionStepsCompletedRecent = ((recentMissionRows as Mission[] | null) ?? []).reduce(
        (sum, m) => sum + (m.plan_steps?.steps ?? []).filter((s) => s.status === "completed").length,
        0
      );
    }
  } catch (err) {
    logApiError("/dashboard/overview", err, { stage: "recent_mission_steps_query_unhandled" });
  }

  const lastActivityMs = summaries.reduce<number | null>((latest, s) => {
    const rowMs = s.rows[0] ? new Date(s.rows[0].created_at).getTime() : null;
    if (rowMs === null) return latest;
    return latest === null || rowMs > latest ? rowMs : latest;
  }, null);

  const healthScore = computeHealthScore({
    lastActivityMs,
    modulesWithActivity: summaries.filter((s) => s.count > 0).length,
    totalModules: CLASSIFIER_MODULES.length,
    missionStepsCompletedRecent,
    activeDaysThisWeek: weeklySparkline.filter((count) => count > 0).length,
  });

  // "AI Life Context" — feeds lib/user-context.ts's getUserFullContext, so
  // every AI-calling endpoint can reference the user's latest energy
  // check-in. This widget is the only place a check-in gets created.
  const latestEnergyCheckIn = await loadLatestEnergyCheckIn(supabase, user.id);

  const healthScoreRangeLabel =
    healthScore.label === "justStarting"
      ? t("healthScore.justStarting")
      : healthScore.label === "buildingMomentum"
        ? t("healthScore.buildingMomentum")
        : healthScore.label === "strongProgress"
          ? t("healthScore.strongProgress")
          : t("healthScore.excellentConsistency");
  const healthScoreSuggestion: string =
    healthScore.weakestFactor === "recency"
      ? t("healthScore.suggestion.recency")
      : healthScore.weakestFactor === "coverage"
        ? t("healthScore.suggestion.coverage")
        : healthScore.weakestFactor === "missionSteps"
          ? t("healthScore.suggestion.missionSteps")
          : t("healthScore.suggestion.consistency");

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
            .map((s) => t("aiCoach.entryCount", { count: s.recentCount, module: tKey(s.module.titleKey) }))
            .join(", "),
          t("aiCoach.mostActiveIn", { module: tKey(topModulesThisWeek[0].module.titleKey) }),
        ].join(". ");

  return (
    <main className="min-h-full">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <GlowOrb className="-left-10 -top-20 -z-10 h-56 w-56" />
          <GreetingHeader email={user.email ?? ""} />
        <LowCreditsBanner />
          <QuickStartButton />
        </div>

        {(activeInsights ?? []).length > 0 && (
          <section className="mt-6 space-y-2">
            <h2 className="text-sm font-semibold text-foreground">{tInsights("title")}</h2>
            <InsightList insights={(activeInsights ?? []) as unknown as Insight[]} />
          </section>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HomeStatCard
            icon={<Database className="h-4 w-4" aria-hidden="true" />}
            label={t("statRow.totalEntries")}
            value={formatNumber(totalEntries, locale)}
            trend={weeklySparkline}
          />
          <HomeStatCard
            icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
            label={t("statRow.thisWeek")}
            value={formatNumber(totalThisWeek, locale)}
            trend={weeklySparkline}
          />
          <HomeStatCard
            icon={<Layers className="h-4 w-4" aria-hidden="true" />}
            label={t("statRow.mostActive")}
            value={mostActive && mostActive.count > 0 ? tKey(mostActive.module.titleKey) : "—"}
          />
          <CreditsHomeStat label={t("statRow.creditsRemaining")} />
        </div>

        <HealthScoreCard
          title={t("healthScore.title")}
          score={healthScore.score}
          rangeLabel={healthScoreRangeLabel}
          suggestion={healthScoreSuggestion}
          trend={weeklySparkline}
        />

        <EnergyCheckinWidget initialCheckIn={latestEnergyCheckIn} />

        {nextAction && nextActionMessage && (
          <NextActionCard
            title={t("nextAction.title")}
            message={nextActionMessage}
            href={nextAction.href}
            ctaLabel={t("nextAction.cta")}
          />
        )}

        {showBetaExpiryBanner && betaDaysRemaining !== null && (
          <BetaExpiryBanner
            daysRemaining={betaDaysRemaining}
            expiresAtKey={String(betaDaysRemaining)}
          />
        )}

        {showBetaFeedbackBanner && (
          <BetaFeedbackBanner
            message={t("betaFeedback.message")}
            linkLabel={t("betaFeedback.linkLabel")}
            feedbackUrl={betaFeedbackUrl}
          />
        )}

        <AiCoachCard title={t("aiCoach.title")} summary={aiCoachSummary} />

        {activeMission && (
          <ActiveMissionCard
            title={t("activeMission.title")}
            goal={activeMission.goal}
            progressPercent={missionProgressPercent(activeMission)}
            stepsLabel={t("activeMission.stepsLabel", {
              completed: activeMissionSteps.filter((s) => s.status === "completed").length,
              total: activeMissionSteps.length,
            })}
            href="/dashboard/mission"
          />
        )}

        <div className="mt-6">
          <CreateChat showHeading={false} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {QUICK_ACTIONS.map((action) => (
            <QuickActionCard
              key={action.slug}
              href={moduleHref(action.slug)}
              icon={MODULE_ICONS[action.slug]}
              label={t(`quickActions.${action.slug}.label`)}
              description={t(`quickActions.${action.slug}.description`)}
              tone={action.tone}
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
