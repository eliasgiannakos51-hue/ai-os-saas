import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { GreetingHeader } from "@/components/overview/greeting-header";
import { InsightList, type Insight } from "@/components/onboarding/insight-list";
import { CreateChat } from "@/components/create/create-chat";
import { FirstScreenExamples } from "@/components/overview/first-screen-examples";
import { QuickActionCard } from "@/components/overview/quick-action-card";
import { WidgetBoundary } from "@/components/ui/widget-boundary";
import { LowCreditsBanner } from "@/components/credits/low-credits-banner";
import { ITEM_LABEL_KEYS } from "@/lib/sidebar-label-keys";
import { RecentEntriesCard, type RecentEntry } from "@/components/overview/recent-entries-card";
import { AiCoachCard } from "@/components/overview/ai-coach-card";
import { ActiveMissionCard } from "@/components/overview/active-mission-card";
import { NextActionCard } from "@/components/overview/next-action-card";
import { QuickStartButton } from "@/components/overview/quick-start-button";
import { formatRelativeTime } from "@/lib/format-time";
import { NextCard } from "@/components/overview/next-card";
import { WhatChangedCard } from "@/components/overview/what-changed-card";
import { HomeSeenStamp } from "@/components/overview/home-seen-stamp";
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
import {
  computeHealthScore,
  hasEnoughDataForScore,
  HEALTH_SCORE_MIN_ENTRIES,
  CHART_MIN_ENTRIES,
} from "@/lib/health-score";
import { HealthScoreCard } from "@/components/overview/health-score-card";
import { SetupProgressCard, type SetupStep } from "@/components/overview/setup-progress-card";
import { LoadSampleButton } from "@/components/sample-data/load-sample-button";
import { findSampleImport } from "@/lib/sample-data/apply";
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
  const tErr = await getTranslations("errors");
  // The config carries the sidebar key directly now, so this no longer
  // has to look an English string up in a table to find its own name.
  const tKey = await getTranslations();
  const supabase = createClient();

  const user = await getCurrentUser();

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
  // AN ERROR IS NOT A STATE, AND READING IT AS ONE TOOK HOME DOWN.
  //
  // This destructured only `{ data }`. `home_seen_at` arrived in
  // 20260914000000_home_seen_at.sql, and against a database where that
  // migration has not been applied PostgREST answers 400 — "column
  // user_onboarding.home_seen_at does not exist". `data` is then null,
  // the error was discarded, and the next line read null as "this user
  // has not onboarded" and sent them to /onboarding. Every visit, for
  // every account, on the one route that selects the column.
  //
  // It presents as "Home does not open" rather than as a crash, which is
  // also why the error boundary never fired: nothing threw. redirect()
  // is ordinary control flow.
  //
  // So the error is read, and a FAILED READ IS NEVER TREATED AS A
  // FINISHED ONBOARDING DECISION. The retry drops the newest column so a
  // deploy that is ahead of its migration degrades to the behaviour it
  // had before that column existed — home_seen_at is optional (null
  // renders no "what changed" block, which is exactly a first visit).
  let { data: onboardingState, error: onboardingError } = await supabase
    .from("user_onboarding")
    // home_seen_at rides along on a query this page already ran — "what
    // changed since last time" costs no extra round trip.
    .select("completed_at, skipped_at, home_seen_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (onboardingError) {
    logApiError("/dashboard/overview", onboardingError, {
      stage: "user_onboarding_query",
      note: "retrying without home_seen_at — a deploy ahead of its migration",
    });
    const fallback = await supabase
      .from("user_onboarding")
      .select("completed_at, skipped_at")
      .eq("user_id", user.id)
      .maybeSingle();
    onboardingState = fallback.data as typeof onboardingState;
    onboardingError = fallback.error;
  }

  // ONLY A SUCCESSFUL READ MAY SEND SOMEBODY TO ONBOARDING. If the read
  // itself failed we do not know what they decided, and guessing "not
  // onboarded" is the guess that bounces an established user out of the
  // product.
  if (!onboardingError && !onboardingState?.completed_at && !onboardingState?.skipped_at) {
    redirect("/onboarding");
  }

  const now = Date.now();
  const oneDayAgoMs = now - 24 * 60 * 60 * 1000;
  const sevenDaysAgoMs = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();

  // Real account age (auth user's own created_at, not a separate stored
  // field) — 3 days is a threshold, not a stored flag, so it just
  // naturally stops applying once the account is old enough regardless of
  // when this code runs.
  const accountAgeMs = Date.now() - new Date(user.created_at).getTime();
  const showBetaFeedbackBanner = isBetaTester(user) && accountAgeMs >= 3 * 24 * 60 * 60 * 1000;
  const betaFeedbackUrl = process.env.BETA_FEEDBACK_URL || "mailto:feedback@ionexa.ai";

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
  const loadSummaries = (): Promise<ModuleSummary[]> =>
    Promise.all(
    CLASSIFIER_MODULES.map(async (module): Promise<ModuleSummary> => {
      const base = { module, href: moduleHref(module.slug) };

      // TOGETHER, not one after the other. These two reads do not depend on
      // each other and never did; awaiting them in sequence made every
      // module cost two round trips instead of one, and there are fourteen
      // modules. Each is still caught on its own, so one table erroring
      // still leaves the other's answer usable — that property is what the
      // separate try/catch blocks below preserve.
      let count = 0;
      let rows: ModuleRecord[] = [];
      let last30DaysMs: number[] = [];
      const [recentRowsSettled, last30DaysSettled] = await Promise.allSettled([
        supabase
          .from(module.table)
          .select("*", { count: "exact" })
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from(module.table).select("created_at").gte("created_at", thirtyDaysAgo),
      ]);
      if (recentRowsSettled.status === "fulfilled") {
        count = recentRowsSettled.value.count ?? 0;
        rows = (recentRowsSettled.value.data as ModuleRecord[] | null) ?? [];
      } else {
        logApiError("/dashboard/overview", recentRowsSettled.reason, {
          stage: "recent_rows_query",
          moduleSlug: module.slug,
          table: module.table,
        });
      }
      if (last30DaysSettled.status === "fulfilled") {
        const last30DaysTimestamps =
          (last30DaysSettled.value.data as { created_at: string }[] | null) ?? [];
        last30DaysMs = last30DaysTimestamps.map((r) => new Date(r.created_at).getTime());
      } else {
        logApiError("/dashboard/overview", last30DaysSettled.reason, {
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

  // ------------------------------------------------------------------
  // ONE WAVE, NOT A QUEUE.
  //
  // Everything below was awaited one statement at a time: insights, then
  // the beta window, then fourteen modules, then the active mission, then
  // the missions touched recently, then the energy check-in. None of them
  // needs any of the others — the queue was an accident of the order the
  // features were written in, and it cost the user one database round trip
  // per line on every visit to Home.
  //
  // The onboarding read above deliberately stays where it is: it decides
  // whether this page renders at all, and doing this work first for an
  // account that is about to be redirected would be work nobody sees.
  // ------------------------------------------------------------------
  const [
    activeInsightsResult,
    betaDaysRemaining,
    summaries,
    activeMissionResult,
    recentMissionResult,
    latestEnergyCheckIn,
  ] = await Promise.all([
    supabase
      .from("user_insights")
      .select("id, detector, module_slug, headline, detail, evidence, sample_size")
      .eq("user_id", user.id)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(3),
    isBetaTester(user) ? getBetaDaysRemaining(user.id) : Promise.resolve(null),
    loadSummaries(),
    supabase
      .from("ai_missions")
      .select("*")
      .in("status", ["planning", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.from("ai_missions").select("plan_steps").gte("updated_at", fourteenDaysAgo),
    loadLatestEnergyCheckIn(supabase, user.id),
  ]);
  const activeInsights = activeInsightsResult.data;
  // "Expires soon" banner — only in the final 3 days of an active beta
  // window (already-expired accounts fall back to Free elsewhere and have
  // nothing to warn about here). getBetaDaysRemaining reads the real
  // beta_expires_at, so this stays correct without any manual upkeep.
  const showBetaExpiryBanner =
    betaDaysRemaining !== null && betaDaysRemaining > 0 && betaDaysRemaining <= 3;

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

  // WHAT CHANGED SINCE LAST TIME — V4.6 #10.
  //
  // Costs no extra query: home_seen_at rides on the onboarding row this
  // page already reads, and last30DaysMs is already in hand for the
  // sparkline. Null on a first visit, and the card renders nothing then —
  // there is no "since last time" when there is no last time.
  const homeSeenAtMs = onboardingState?.home_seen_at
    ? new Date(String(onboardingState.home_seen_at)).getTime()
    : null;
  const entriesSinceLastVisit =
    homeSeenAtMs === null
      ? 0
      : summaries.reduce(
          (sum, sm) => sum + sm.last30DaysMs.filter((ms: number) => ms > homeSeenAtMs).length,
          0
        );
  const insightsSinceLastVisit =
    homeSeenAtMs === null
      ? 0
      : (activeInsights ?? []).filter(
          (i) => new Date(String((i as { created_at?: unknown }).created_at ?? 0)).getTime() > homeSeenAtMs
        ).length;

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
  const { data: activeMissionRows, error: activeMissionError } = activeMissionResult;
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
    const { data: recentMissionRows, error: recentMissionError } = recentMissionResult;
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

  // FOUR STEPS, NONE OF THEM A NEW QUERY. Onboarding state, the entry
  // total, the per-module summaries and the active mission are all
  // already read above — a setup checklist that cost its own round trip
  // would be a worse trade than the number it replaces.
  const sampleLoaded = Boolean(await findSampleImport(supabase, user.id));

  const setupSteps: SetupStep[] = [
    {
      id: "onboarding",
      label: t("setupProgress.steps.onboarding"),
      done: Boolean(onboardingState?.completed_at || onboardingState?.skipped_at),
      href: "/onboarding",
    },
    {
      id: "firstEntry",
      label: t("setupProgress.steps.firstEntry"),
      done: totalEntries > 0,
      href: "/dashboard/records",
    },
    {
      id: "secondModule",
      label: t("setupProgress.steps.secondModule"),
      done: summaries.filter((s) => s.count > 0).length >= 2,
      href: "/dashboard/records",
    },
    {
      id: "mission",
      label: t("setupProgress.steps.mission"),
      done: Boolean(activeMission),
      href: "/dashboard/mission",
    },
  ];

  // ONE CARD FAILING MUST NOT TAKE THE HOME SCREEN.
  //
  // A React error #310 ("rendered more hooks than during the previous
  // render") was observed on this page in a production build, two runs in
  // seven, thrown from a useMemo inside a vendor chunk. Without a boundary
  // BELOW the route, that unmounts the whole page and the first screen a
  // person sees after signing in is the generic dashboard error.
  //
  // components/ui/widget-boundary.tsx already existed for exactly this,
  // reported to /api/client-error, and was used on no page at all. It is
  // used here now, per card, so the failure is contained to the card that
  // produced it and the crash still reaches production_errors.
  //
  // The strings are resolved HERE because the boundary is a class
  // component and cannot call useTranslations.
  const boundary = { title: tErr("boundary.section"), body: tErr("boundary.sectionBody") };

  return (
    <div className="min-h-full">
      {/* Stamps the visit AFTER the render, so the diff above was made
          against the previous value and not against now. */}
      <HomeSeenStamp />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* ORDER: ACTION -> WHAT CHANGED -> PROGRESS -> NUMBERS -> HISTORY.
            V4.6 #10. Measured before this reorder
            (scripts/tests/home-audit.prodtest.mjs, 1440x900): the numbers
            sat at y=302 and the thing to actually DO sat at y=1124, two
            hundred pixels below the fold. The page opened with a summary
            of the past and buried the present. */}
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <GlowOrb className="-left-10 -top-20 -z-10 h-56 w-56" />
          <GreetingHeader email={user.email ?? ""} />
          <LowCreditsBanner />
          <QuickStartButton />
        </div>

        {/* 1. ACTION — the input, first, because it is the answer to
               "what do I do now" and it was below the fold. */}
        <div className="mt-6">
          <WidgetBoundary label="create-chat" {...boundary}>
            <CreateChat showHeading={false} />
          </WidgetBoundary>
          {/* UNDER the input, not above it. Above, they read as the
              screen's own suggestions and compete with the box; below,
              they read as answers to "what could I type here?" — which
              is the question nobody in the test could answer.
              From V4.6-2 on claude/ten-test-issues-281zpo; the merge that
              brought it in resolved this file to main's side and dropped
              this line, which first-screen.test.mjs caught. */}
          <FirstScreenExamples />
        </div>

        {/* ONE CARD WHERE THERE WERE THREE — V4.6 #10. "What's Next?",
            "AI Coach" and "Active Mission" were three stacked full-width
            cards saying similar things, 208px of vertical space, all of
            it under the fold. */}
        <NextCard
          title={t("next.title")}
          action={
            nextAction && nextActionMessage
              ? { message: nextActionMessage, href: nextAction.href, ctaLabel: t("nextAction.cta") }
              : null
          }
          weekSummary={aiCoachSummary || null}
          plan={
            activeMission
              ? {
                  goal: activeMission.goal,
                  progressPercent: missionProgressPercent(activeMission),
                  stepsLabel: t("activeMission.stepsLabel", {
                    completed: activeMissionSteps.filter((s) => s.status === "completed").length,
                    total: activeMissionSteps.length,
                  }),
                  href: "/dashboard/mission",
                  openLabel: t("activeMission.open"),
                }
              : null
          }
        />

        {/* 2. WHAT CHANGED — the reason to come back tomorrow. Above the
               fold, straight after the action, and absent entirely when
               nothing changed or there is no last visit to compare with. */}
        <WhatChangedCard
          title={t("whatChanged.title")}
          sinceLabel={
            homeSeenAtMs === null
              ? ""
              : t("whatChanged.since", { when: formatRelativeTime(new Date(homeSeenAtMs).toISOString(), locale) })
          }
          changes={[
            { label: t("whatChanged.entries"), count: entriesSinceLastVisit, href: "/dashboard/timeline" },
            { label: t("whatChanged.insights"), count: insightsSinceLastVisit },
          ]}
        />

        {(activeInsights ?? []).length > 0 && (
          <section className="mt-6 space-y-2">
            <h2 className="text-sm font-semibold text-foreground">{tInsights("title")}</h2>
            <InsightList insights={(activeInsights ?? []) as unknown as Insight[]} />
          </section>
        )}

        {/* 3. PROGRESS — one card, not two. The audit's inventory listed
               the ring and the step list as separate blocks; they are two
               COLUMNS of this one card, which the walker split. Nothing
               was merged here because nothing needed merging.

               NO VERDICT BEFORE THERE IS EVIDENCE — V4.6 #5. Measured
               before that branch: a real build, an account with no rows,
               and the ring read "Business Health Score: 0 / 100" under
               "Just getting started". Zero out of a hundred is a
               judgement, and the account had done nothing to be judged
               for. */}
        {hasEnoughDataForScore(totalEntries) ? (
          <WidgetBoundary label="health-score-card" {...boundary}>
            <HealthScoreCard
              title={t("healthScore.title")}
              score={healthScore.score}
              rangeLabel={healthScoreRangeLabel}
              suggestion={healthScoreSuggestion}
              trend={weeklySparkline}
            />
          </WidgetBoundary>
        ) : (
          <WidgetBoundary label="setup-progress-card" {...boundary}>
            <SetupProgressCard
              title={t("setupProgress.title")}
              countLabel={t("setupProgress.count", {
                done: setupSteps.filter((s) => s.done).length,
                total: setupSteps.length,
              })}
              suggestion={t("setupProgress.suggestion", { count: HEALTH_SCORE_MIN_ENTRIES })}
              steps={setupSteps}
            />
          </WidgetBoundary>
        )}

        {/* 4. NUMBERS.
            EVERY NUMBER CARRIES ITS OWN LINE, AND OPENS — V4.6 #7. The
            destinations are not new: /dashboard/timeline has taken
            ?range= and ?module= since it was built, so "click the number
            to see the records behind it" is a href, not a feature.
            `explain` is a REQUIRED prop precisely so the next card cannot
            be added without one. */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <HomeStatCard
            icon={<Database className="h-4 w-4" aria-hidden="true" />}
            label={t("statRow.totalEntries")}
            placeholderLabel={t("statRow.fillsAfter", { count: CHART_MIN_ENTRIES })}
            value={formatNumber(totalEntries, locale)}
            trend={weeklySparkline}
            explain={t("statRow.totalEntriesExplain")}
            href="/dashboard/timeline"
            openLabel={t("statRow.openEntries")}
          />
          <HomeStatCard
            icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
            label={t("statRow.thisWeek")}
            placeholderLabel={t("statRow.fillsAfter", { count: CHART_MIN_ENTRIES })}
            value={formatNumber(totalThisWeek, locale)}
            trend={weeklySparkline}
            explain={t("statRow.thisWeekExplain")}
            // NOT a raw count as the basis — the denominator is what
            // makes a numerator mean anything. "4" says nothing; "4, from
            // 36 in total" says the week was quiet.
            basis={totalEntries > 0 ? t("statRow.ofTotal", { count: totalEntries }) : undefined}
            href="/dashboard/timeline?range=week"
            openLabel={t("statRow.openEntries")}
          />
          <HomeStatCard
            icon={<Layers className="h-4 w-4" aria-hidden="true" />}
            label={t("statRow.mostActive")}
            value={mostActive && mostActive.count > 0 ? tKey(mostActive.module.titleKey) : "—"}
            explain={t("statRow.mostActiveExplain")}
            basis={
              mostActive && mostActive.count > 0
                ? t("statRow.fromEntries", { count: mostActive.count })
                : undefined
            }
            href={
              mostActive && mostActive.count > 0
                ? `/dashboard/timeline?module=${mostActive.module.slug}`
                : undefined
            }
            openLabel={t("statRow.openEntries")}
          />
          <CreditsHomeStat
            label={t("statRow.creditsRemaining")}
            explain={t("statRow.creditsExplain")}
            openLabel={t("statRow.openCredits")}
          />
        </div>

        {/* 5. HISTORY, AND THE CHECK-IN BESIDE IT.
               ProgressCard is gone: its three numbers (today / this week
               / this month) are the same counts the stat row above
               already shows, in the same units, four hundred pixels
               apart. Removing it frees NO vertical space — it shared a
               row with Recent Entries — so that was a clarity cut and not
               a space one, and saying so is the point of having measured
               the widths rather than only the heights.

               WHICH IS ALSO WHY THIS IS A ROW. Measured at 1440x900
               (scripts/tests/home-audit.prodtest.mjs): after the merge
               and the two deletions the page was 1629px against 1632px
               before — three pixels. The deleted blocks were either
               side-by-side already or replaced by the card that merged
               them, and stacking two full-width cards below the fold is
               what the remaining height actually is. Putting the history
               and the check-in in one row is the change that moves the
               number; the widget's own `mt-6` is passed off for the same
               reason.

               THE CHECK-IN IS BELOW THE FOLD DELIBERATELY. It answers
               none of the three questions the Home exists for; it is kept
               because it feeds a real decision (lib/mission-energy.ts
               picks the next plan step from it) and now says so on the
               widget itself. */}
        <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start">
          <RecentEntriesCard entries={recentEntries} />
          <EnergyCheckinWidget initialCheckIn={latestEnergyCheckIn} className="" />
        </div>

        {/* THE WAY OUT OF AN EMPTY ACCOUNT — V4.6 #6. Offered only while
            there is nothing to look at and no sample already loaded. */}
        {totalEntries === 0 && !sampleLoaded && <LoadSampleButton className="mt-4" />}

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
      </div>
    </div>
  );
}
