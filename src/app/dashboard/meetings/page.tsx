import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { MEETINGS_ICON } from "@/lib/module-icons";
import { UpgradeRequired } from "@/components/billing/upgrade-required";
import { upgradeWallProps } from "@/lib/billing/feature-catalog";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { transcribeCostUsd, voiceCredits, voiceMinutesForPlan } from "@/lib/voice/voice-pricing";
import { readVoiceUsage } from "@/lib/voice/voice-usage";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveEffectivePlan, getPurchasedPackCreditPriceEur } from "@/lib/billing/credits";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { resolveMarginFor } from "@/lib/billing/margin-policy";
import { estimateForAction } from "@/lib/billing/estimate";
import { CHARS_PER_SPOKEN_MINUTE, meetingLimits } from "@/lib/meetings/meeting-limits";
import { MeetingsWorkspace, type MeetingRow } from "@/components/meetings/meetings-workspace";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.meetings");
}

/**
 * A RECORDING BECOMES A LIST SOMEBODY CHOSE FROM.
 *
 * Transcription was already here and had been for as long as
 * api/voice/transcribe existed. What was missing was the half the feature
 * is named after: nothing turned what was said into what was agreed.
 *
 * ---------------------------------------------------------------------
 * THE LIMITS ARE COMPUTED HERE AND HANDED DOWN
 * ---------------------------------------------------------------------
 *
 * `meetingLimits()` reads MAX_FUNCTION_DURATION out of the process
 * environment, and `process.env` in a client component is undefined — so
 * a browser that derived its own ceiling would get the 800s default on a
 * 60s deployment and offer a limit the server then refuses. The page
 * computes them and passes them as props; the workspace never derives
 * them, and scripts/tests/meetings.test.mjs holds that.
 */
export default async function MeetingsPage() {
  const t = await getTranslations("dashboard.meetings");
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // THE WALL, BEFORE THE FILE PICKER. api/meetings/transcribe refuses too
  // with `not_included`, and that is the line that protects the spend;
  // this one exists so somebody on the wrong plan reads a sentence naming
  // the plan and its price instead of choosing a file and being refused.
  const isAdmin = isAdminEmail(user.email);
  // ONE plan lookup, not two. `resolveEffectivePlan` returns the plan and
  // `plan.slug` is the slug, so calling resolveEffectivePlanSlug beside it
  // is a second round trip for something already in hand — and this page
  // is held at four sequential awaits by
  // scripts/tests/navigation-cost.test.mjs.
  const plan = await resolveEffectivePlan(user);
  if (!isAdmin && voiceMinutesForPlan(plan.slug) <= 0) {
    return (
      <div className="space-y-6">
        <PageHeader icon={MEETINGS_ICON} title={t("title")} description={t("description")} helpKey="help.meetings" />
        <UpgradeRequired {...upgradeWallProps("meetings", t("title"))!} />
      </div>
    );
  }

  const limitMinutes = voiceMinutesForPlan(plan.slug);
  const pricingConfig = resolvePricingConfig();
  const supabase = createClient();

  // FOUR READS, ONE WAIT. None of them needs another's answer: the pack
  // price, the monthly meter and the two tables are independent, and
  // issuing them in sequence would be four round trips to render one
  // screen. The two table reads go through the user's own session client,
  // so RLS decides what comes back rather than a filter this page
  // remembered to write.
  const [packPrice, allowance, meetingsRead, actionsRead] = await Promise.all([
    getPurchasedPackCreditPriceEur(user.id),
    readVoiceUsage(createAdminClient(), user.id, limitMinutes),
    supabase
      .from("meetings")
      .select(
        "id, title, language, transcript, summary, proposed_actions, duration_seconds, credits_charged, analysis_error, analysed_at, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("meeting_actions")
      .select("id, meeting_id, who, what, when_text, due_date, done, source_index, created_at")
      .order("created_at", { ascending: false })
      .limit(300),
  ]);
  const data = meetingsRead.data;
  const actions = actionsRead.data;
  const creditPriceEur = effectiveCreditPriceEurForAccount(plan, packPrice, pricingConfig);

  // THE PRICE, COMPUTED WHERE THE PRICING CONFIG LIVES.
  //
  // Both halves, because they are priced differently: transcription per
  // second with the provider, the analysis per token. The client is
  // handed two coefficients and multiplies — it cannot resolve a margin
  // or a credit price, and a browser that tried would be reading
  // process.env, which is undefined there.
  //
  // The analysis coefficient is measured rather than guessed: the same
  // estimator the route reserves with, asked for one minute of speech and
  // for eleven, and the difference over ten minutes is the per-minute
  // part. That way a change to the profile in lib/billing/estimate.ts
  // moves this number too instead of leaving it behind.
  const voiceMargin = resolveMarginFor("voice", plan.slug, pricingConfig).margin;
  const analyseMargin = resolveMarginFor("meeting_analyse", plan.slug, pricingConfig).margin;
  const analyseAt = (minutes: number) =>
    estimateForAction(
      "meetingAnalyse",
      {
        model: "claude-sonnet-4-6",
        inputChars: Math.round(minutes * CHARS_PER_SPOKEN_MINUTE),
        planSlug: plan.slug,
      },
      { ...pricingConfig, creditPriceEur },
      creditPriceEur,
      analyseMargin
    ).estimatedCredits;
  const analyseOne = analyseAt(1);
  const analysePerMinute = Math.max(0, (analyseAt(11) - analyseOne) / 10);
  const price = {
    fixedCredits: Math.max(0, analyseOne - analysePerMinute),
    perMinuteCredits:
      voiceCredits(transcribeCostUsd(60), { ...pricingConfig, creditPriceEur }, voiceMargin) +
      analysePerMinute,
  };


  return (
    <div className="space-y-6">
      <PageHeader icon={MEETINGS_ICON} title={t("title")} description={t("description")} helpKey="help.meetings" />
      <MeetingsWorkspace
        limits={meetingLimits()}
        price={price}
        minutes={{ usedSeconds: allowance.usedSeconds, limitMinutes }}
        meetings={(data ?? []) as MeetingRow[]}
        keptActions={actions ?? []}
      />
    </div>
  );
}
