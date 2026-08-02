import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ErrorMessage } from "@/components/error-message";
import { GenericAddForm } from "@/components/modules/generic-add-form";
import { GenericList } from "@/components/modules/generic-list";
import { TimelineList } from "@/components/timeline/timeline-list";
import { ReflectionGenerator } from "@/components/reflection/reflection-generator";
import { PatternInsightCard } from "@/components/trading-workflow/pattern-insight-card";
import { TradingMentorButton } from "@/components/trading-workflow/trading-mentor-button";
import { TradingMissionButton } from "@/components/trading-workflow/trading-mission-button";
import { getModule } from "@/lib/modules";
import { TRADING_WORKFLOW_ICON } from "@/lib/module-icons";
import { loadLinkedEntities } from "@/lib/entity-links";
import { loadTimelineEntries } from "@/lib/timeline";
import { detectLossStreakPattern } from "@/lib/trading-pattern";
import type { ModuleRecord } from "@/types/module-record";

export const metadata: Metadata = { title: "Trading Workflow" };

const MINI_TIMELINE_LIMIT = 10;

// This is an additive layer on top of the existing, unmodified Trading
// module (/dashboard/trading — see [module]/page.tsx) — it reuses that
// module's own add form and list as-is, plus already-built V2 pieces
// (Knowledge Graph, Timeline, Mentor Mode, Mission Control, Weekly
// Reflection), all scoped to trading data. The only genuinely new logic
// here is the pattern-detection insight (lib/trading-pattern.ts, no AI).
export default async function TradingWorkflowPage() {
  const t = await getTranslations("dashboard.tradingWorkflow");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const tradingModule = getModule("trading");
  if (!tradingModule) {
    redirect("/dashboard/trading");
  }

  const { data: trades, error } = await supabase
    .from("trades")
    .select("*")
    .order("created_at", { ascending: false });

  const tradeRows = (trades as ModuleRecord[] | null) ?? [];

  const linkedEntities = await loadLinkedEntities(
    supabase,
    user.id,
    "trades",
    tradeRows.map((r) => r.id)
  );

  const pattern = detectLossStreakPattern(
    tradeRows.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      result: typeof r.result === "string" ? r.result : null,
      pnl: typeof r.pnl === "number" ? r.pnl : null,
    }))
  );

  const insightMessage =
    tradeRows.length === 0
      ? t("insight.noTrades")
      : pattern === null
        ? t("insight.notEnoughData")
        : t("insight.pattern", {
            analyzedCount: pattern.analyzedCount,
            lossesAfterLoss: pattern.lossesAfterLoss,
            pairsAfterLoss: pattern.pairsAfterLoss,
            ratePercent: pattern.continuationRatePercent,
          });

  const tradingTimeline = (
    await loadTimelineEntries(supabase, user.id, { moduleSlug: "trading", range: "all" })
  ).slice(0, MINI_TIMELINE_LIMIT);

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader icon={TRADING_WORKFLOW_ICON} title={t("title")} description={t("description")} />

        <PatternInsightCard title={t("insight.title")} message={insightMessage} />

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TradingMentorButton label={t("mentorButton")} description={t("mentorButtonDescription")} />
          <TradingMissionButton
            label={t("missionButton")}
            description={t("missionButtonDescription")}
            creatingLabel={t("missionButtonCreating")}
            goal={t("missionGoal")}
          />
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-semibold text-foreground">{t("timelineTitle")}</h2>
          <div className="mt-3">
            <TimelineList entries={tradingTimeline} />
          </div>
          <Link
            href="/dashboard/timeline?module=trading"
            className="mt-2 inline-block text-xs text-orange-400 transition-colors duration-150 hover:underline"
          >
            {t("viewFullTimeline")}
          </Link>
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-semibold text-foreground">{t("reflectionTitle")}</h2>
          <div className="mt-3">
            <ReflectionGenerator scope="trading" />
          </div>
        </div>

        <div className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-foreground">{t("tradesTitle")}</h2>

          {error && <ErrorMessage message={`loading trades: ${error.message}`} />}

          <div className="mb-6">
            <GenericAddForm module={tradingModule} />
          </div>

          <GenericList module={tradingModule} records={tradeRows} linkedEntities={linkedEntities} />
        </div>
      </div>
    </main>
  );
}
