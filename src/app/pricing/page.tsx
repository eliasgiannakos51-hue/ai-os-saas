import type { Metadata } from "next";
import { pageTitleAndDescription } from "@/lib/page-title";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { Check, X } from "lucide-react";
import { Logo } from "@/components/logo";
import {
  PLANS,
  TEAM_SEAT_PRICE,
  CURRENCY_SYMBOL,
  ANNUAL_DISCOUNT_PERCENT,
  getPlan,
  annualPriceEur,
  annualMonthlyEquivalentEur,
  annualSavingsEur,
  type BillingInterval,
  type Plan,
  type PaidPlanSlug,
} from "@/lib/billing/plans";
import { annualBillingAvailable } from "@/lib/billing/price-ids";
import { BillingIntervalToggle } from "@/components/billing/billing-interval-toggle";
import { freeChatAllowance } from "@/lib/billing/free-chat";
import { maxAgentsForPlan } from "@/lib/agents/agent-limits";
import { maxFilesForPlan, maxResearchRunsForPlan, maxStorageBytesForPlan } from "@/lib/files/limits";
import { maxIntegrationsForPlan } from "@/lib/integrations/limits";
import { maxPublishedSitesForPlan } from "@/lib/publishing/publish-limits";
import { SubscribeButton } from "@/components/billing/subscribe-button";
import { AppBackground } from "@/components/ui/app-background";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { formatNumber } from "@/lib/format-number";

export function generateMetadata(): Promise<Metadata> {
  return pageTitleAndDescription("pricing.title", "pricing.metaDescription");
}

type ComparisonCell = { type: "value"; text: string } | { type: "check" } | { type: "cross" };

// Words that appear INSIDE a cell rather than as a row label. They were
// hardcoded English ("Unlimited", "Included", "Custom") on a page whose
// whole point is that a non-English visitor sees it first — the same
// defect the feature list was fixed for. Passed down as a lookup so the
// cell builders stay pure.
type CellWords = { unlimited: string; included: string; custom: string; perSeat: string };

function formatStorage(bytes: number, locale: string): string {
  const MB = 1024 * 1024;
  const GB = 1024 * MB;
  return bytes >= GB
    ? `${formatNumber(Math.round(bytes / GB), locale)} GB`
    : `${formatNumber(Math.round(bytes / MB), locale)} MB`;
}

function countOrUnlimited(n: number, locale: string, words: CellWords): ComparisonCell {
  if (!Number.isFinite(n)) return { type: "value", text: words.unlimited };
  if (n <= 0) return { type: "cross" };
  return { type: "value", text: formatNumber(n, locale) };
}

// Every row here maps straight to a real, enforced capability or limit —
// nothing pending/unbuilt is listed, and every number is READ FROM the
// module that enforces it rather than typed here. That is the difference
// between a pricing page and a promise: `maxResearchRunsForPlan` is the
// same function api/research/route.ts refuses a run with.
//
// The six quantitative rows below were the gap this closes. Growth already
// gave 5x the Deep Research, 5x the files, 4x the storage, 2.5x the
// integrations and 3x the published sites of Starter — and the page said
// "Everything in Starter", because none of those numbers appeared
// anywhere. The differentiation existed; the copy did not mention it.
//
// labelKey looks up messages/*.json's pricing.rows.<key> for the row name.
const COMPARISON_ROWS: {
  labelKey: string;
  cell: (plan: Plan, locale: string, words: CellWords) => ComparisonCell;
}[] = [
  {
    labelKey: "creditsPerMonth",
    cell: (p, locale, words) => ({
      type: "value",
      text: p.monthlyCredits === "custom" ? words.custom : formatNumber(p.monthlyCredits, locale),
    }),
  },
  {
    labelKey: "freeChatMessages",
    // lib/billing/free-chat.ts, clamped to the share of the combined
    // ceiling the quota registry allocates it.
    cell: (p, locale, words) => countOrUnlimited(freeChatAllowance(p.slug), locale, words),
  },
  {
    labelKey: "aiAgents",
    // lib/agents/agent-limits.ts — enforced in api/agents.
    cell: (p, locale, words) => countOrUnlimited(maxAgentsForPlan(p.slug), locale, words),
  },
  {
    labelKey: "deepResearch",
    // lib/files/limits.ts — enforced in api/research.
    cell: (p, locale, words) => countOrUnlimited(maxResearchRunsForPlan(p.slug), locale, words),
  },
  {
    labelKey: "files",
    // lib/files/limits.ts — enforced in api/files/upload.
    cell: (p, locale, words) => countOrUnlimited(maxFilesForPlan(p.slug), locale, words),
  },
  {
    labelKey: "storage",
    // lib/files/limits.ts — enforced in api/files/upload. Never
    // "unlimited": storage is the one resource that bills every month
    // whether anyone reads it or not.
    cell: (p, locale) => ({ type: "value", text: formatStorage(maxStorageBytesForPlan(p.slug), locale) }),
  },
  {
    labelKey: "integrations",
    // lib/integrations/limits.ts — enforced in api/integrations/[provider]/connect.
    cell: (p, locale, words) => countOrUnlimited(maxIntegrationsForPlan(p.slug), locale, words),
  },
  {
    labelKey: "publishedSites",
    // lib/publishing/publish-limits.ts — enforced in api/websites/[id]/publish.
    cell: (p, locale, words) => countOrUnlimited(maxPublishedSitesForPlan(p.slug), locale, words),
  },
  { labelKey: "websiteBuilder", cell: (p) => (p.capabilities.websiteBuilder ? { type: "check" } : { type: "cross" }) },
  { labelKey: "aiMemory", cell: (p) => (p.capabilities.aiMemory ? { type: "check" } : { type: "cross" }) },
  { labelKey: "teamCollaboration", cell: (p) => (p.capabilities.teamCollaboration ? { type: "check" } : { type: "cross" }) },
  {
    labelKey: "teamSeatsAddOn",
    cell: (p, locale, words) => {
      if (!p.hasTeamSeats) return { type: "cross" };
      if (p.teamSeatsIncluded) return { type: "value", text: words.included };
      // "/seat" was the last English word left in the table — one word, so
      // the sentence scanner in combined-ceiling.test.mjs could not see it,
      // and it took a screenshot of the Greek page to find.
      return { type: "value", text: words.perSeat };
    },
  },
];

function ComparisonCellContent({ cell }: { cell: ComparisonCell }) {
  if (cell.type === "value") {
    return <span className="text-sm text-foreground">{cell.text}</span>;
  }
  if (cell.type === "check") {
    return <Check className="mx-auto h-4 w-4 text-emerald-400" aria-hidden="true" />;
  }
  return <X className="mx-auto h-4 w-4 text-muted/50" aria-hidden="true" />;
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams?: { billing?: string };
}) {
  // The interval lives in the URL so this page stays a server component —
  // see components/billing/billing-interval-toggle.tsx. Annual is only
  // ever offered when every paid plan has a Stripe annual price
  // configured: a toggle that half-works is worse than none, and a
  // checkout for a missing price id is a 500 on the buy button.
  const annualAvailable = annualBillingAvailable();
  const interval: BillingInterval =
    annualAvailable && searchParams?.billing === "annual" ? "year" : "month";
  const t = await getTranslations("pricing");
  const locale = await getLocale();
  const cellWords: CellWords = {
    unlimited: t("values.unlimited"),
    included: t("values.included"),
    custom: t("values.custom"),
    perSeat: t("values.perSeat", { currency: CURRENCY_SYMBOL, price: TEAM_SEAT_PRICE }),
  };

  // Determines whether "Set Up Team" below can skip straight to
  // /dashboard/team, or needs to route through checkout first — mirrors
  // the exact gate dashboard/team/page.tsx and api/team/invite/route.ts
  // already enforce server-side (Professional+ owned subscription), so
  // this is purely a UX shortcut, not a new access rule.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isAdmin = isAdminEmail(user?.email);
  const tier = isAdmin ? "enterprise" : (user?.user_metadata?.subscription_tier as string | undefined);
  const ownsSubscription = isAdmin || Boolean(user?.user_metadata?.stripe_subscription_id);
  const hasTeamCapablePlan = Boolean(ownsSubscription && tier && getPlan(tier)?.capabilities.teamCollaboration);

  return (
    <main className="relative min-h-screen px-4 py-16 text-foreground sm:px-6">
      <AppBackground />
      <div className="relative z-10 mx-auto max-w-6xl">
        <div className="text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 transition-colors duration-150 hover:text-orange-400"
          >
            <Logo iconOnly className="h-6 w-6" />
            <span className="text-base font-bold tracking-tight text-foreground">
              IONEXA
            </span>
          </Link>
          <h1 className="mt-6 text-3xl font-bold text-foreground sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-3 text-sm text-muted">{t("subtitle")}</p>
          {annualAvailable && (
            <BillingIntervalToggle interval={interval} savingsPercent={ANNUAL_DISCOUNT_PERCENT} />
          )}
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
          {PLANS.map((plan) => (
            <div
              key={plan.slug}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                plan.highlighted
                  ? "border-orange-500/60 bg-orange-500/[0.04] shadow-[0_0_24px_rgba(249,115,22,0.12)]"
                  : "border-border bg-panel"
              }`}
            >
              {plan.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center rounded-full bg-orange-500 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-black">
                  {t("mostPopular")}
                </span>
              )}
              <h2 className="text-sm font-semibold text-orange-400">{plan.name}</h2>
              <p className="mt-3 text-2xl font-bold text-foreground">
                {typeof plan.price === "number" ? (
                  <>
                    {CURRENCY_SYMBOL}
                    {/* On annual, the HEADLINE is still a monthly number —
                        the per-month equivalent — because that is the
                        figure a reader compares against the monthly plan
                        and against a competitor. The real amount charged
                        is stated immediately underneath, never implied. */}
                    {/* ROUNDED TO CENTS FOR DISPLAY. The value is
                        deliberately unrounded (see plans.ts: rounding it
                        would make 12x it disagree with the amount
                        actually charged), but the SCREEN is not the
                        place to show that: a €20 plan billed for ten
                        months rendered as "€16.667" in English and
                        "€16,667" in Greek — three decimals on a price,
                        which no shop shows and which reads as a mistake.
                        Rounded here, at the render, so the arithmetic
                        keeps its precision and the customer sees money:
                        €16.67 / 16,67 €. */}
                    {interval === "year" && annualMonthlyEquivalentEur(plan) !== null
                      ? formatNumber(Math.round(annualMonthlyEquivalentEur(plan)! * 100) / 100, locale)
                      : plan.price}
                    {plan.price > 0 && (
                      <span className="text-sm font-normal text-muted">{t("perMonth")}</span>
                    )}
                  </>
                ) : (
                  t("custom")
                )}
              </p>
              {interval === "year" && annualPriceEur(plan) !== null && (
                <p className="mt-1 text-xs text-emerald-400">
                  {t("billedAnnually", {
                    total: `${CURRENCY_SYMBOL}${formatNumber(annualPriceEur(plan)!, locale)}`,
                    saving: `${CURRENCY_SYMBOL}${formatNumber(annualSavingsEur(plan)!, locale)}`,
                  })}
                </p>
              )}
              <p className="mt-2 text-xs text-muted">
                {plan.monthlyCredits === "custom"
                  ? t("features.customCredits")
                  : t("features.creditsPerMonth", { count: plan.monthlyCredits })}
              </p>

              <ul className="mt-6 flex-1 space-y-2.5 text-sm text-muted">
                {plan.features.map((feature) => (
                  <li key={feature.textKey} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" aria-hidden="true" />
                    {/* `count` is only consumed by the creditsPerMonth key,
                        and next-intl ignores unused params.

                        A NUMBER, NOT A FORMATTED STRING. creditsPerMonth is an
                        ICU plural now, and a plural has to SELECT a category
                        before it can print anything — which means calling
                        Number() on what it is handed. formatNumber(1000) is
                        "1,000", Number("1,000") is NaN, and four of the five
                        plans read "NaN credits/month" in production. ICU's `#`
                        formats for the locale itself, so there is now one
                        formatting path here instead of two.

                        The custom plan never reaches this key — it renders
                        customCredits — but 0 is passed rather than "" so that
                        nothing here can select on a non-number. */}
                    <span>
                      {t(`features.${feature.textKey}`, {
                        count: plan.monthlyCredits === "custom" ? 0 : plan.monthlyCredits,
                      })}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Both of these were English string literals, on the page a
                  non-English visitor is most likely to see FIRST — the same
                  defect the feature bullets were converted to `textKey` for,
                  in the same file, surviving because neither i18n gate reads
                  JSX text nodes built from a ternary. */}
              {plan.hasTeamSeats && (
                <p className="mt-4 border-t border-border pt-4 text-[11px] leading-relaxed text-muted">
                  {plan.teamSeatsIncluded
                    ? t("seatNote.included")
                    : t("seatNote.perMember", { currency: CURRENCY_SYMBOL, price: TEAM_SEAT_PRICE })}
                </p>
              )}

              <div className="mt-6">
                {plan.slug === "free" ? (
                  <Link
                    href="/signup?plan=free"
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-all duration-200 hover:border-orange-500 hover:text-orange-400"
                  >
                    {t("signUp")}
                  </Link>
                ) : plan.slug === "enterprise" ? (
                  <a
                    href="mailto:sales@ionexa.ai?subject=Ionexa%20AI%20Enterprise"
                    className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-all duration-200 hover:border-orange-500 hover:text-orange-400"
                  >
                    {t("contactSales")}
                  </a>
                ) : (
                  <SubscribeButton
                    plan={plan.slug as PaidPlanSlug}
                    interval={interval}
                    label={t("getPlan", { plan: plan.name })}
                    className={`inline-flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
                      plan.highlighted
                        ? "bg-orange-500 text-black hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)]"
                        : "border border-border text-foreground hover:border-orange-500 hover:text-orange-400"
                    }`}
                  />
                )}
              </div>
            </div>
          ))}
          {/* Business — a real member of the SAME grid as the plan cards,
              not a separate row underneath. It used to sit in its own
              trailing grid, which put it 781px below Ultimate and read as an
              unrelated footnote; measured before/after with Playwright.
              The grid is xl:grid-cols-7 so all seven cards share one row at
              full width without displacing Enterprise. */}
          <div className="relative flex flex-col rounded-2xl border border-border bg-panel p-6">
            <h2 className="text-sm font-semibold text-orange-400">{t("businessTitle")}</h2>
            <p className="mt-3 text-lg font-bold text-foreground">{t("businessSubtitle")}</p>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              {t("businessCardDescription", { price: `${CURRENCY_SYMBOL}${TEAM_SEAT_PRICE}` })}
            </p>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-muted">
              {t("businessExplanation", { price: `${CURRENCY_SYMBOL}${TEAM_SEAT_PRICE}` })}
            </p>
            <div className="mt-6">
              {hasTeamCapablePlan ? (
                <Link
                  href="/dashboard/team"
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-all duration-200 hover:border-orange-500 hover:text-orange-400"
                >
                  {t("setUpTeam")}
                </Link>
              ) : (
                <SubscribeButton
                  plan="professional"
                  label={t("setUpTeam")}
                  successPath="/dashboard/team?setup=success"
                  className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-all duration-200 hover:border-orange-500 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
                />
              )}
            </div>
          </div>
        </div>

        {/* data-deploy-check below is a temporary, invisible-in-UI marker
            (renders into the HTML attribute, unlike a JSX comment, which
            compiles away entirely) — confirms whether the LIVE deployment
            is actually running this commit. View-source or curl the live
            /pricing page and search for "deploy-check-a2ac56f"; if it's
            absent, the live site isn't serving this branch's code at all
            (a deployment/production-branch config issue, not a code bug)
            — remove this attribute once verified. */}
        <div
          data-deploy-check="deploy-check-a2ac56f"
          className="mx-auto mt-8 max-w-3xl rounded-2xl border border-border bg-panel p-6 text-center"
        >
          <h2 className="text-sm font-semibold text-orange-400">{t("teamBannerTitle")}</h2>
          <p className="mt-2 text-sm text-muted">
            {t("teamBannerBody", { price: `${CURRENCY_SYMBOL}${TEAM_SEAT_PRICE}` })}
          </p>
        </div>

        <div className="mt-16">
          <h2 className="mb-5 text-center text-xl font-bold text-foreground">
            {t("comparePlans")}
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-panel">
                  <th className="px-4 py-3 text-left font-semibold text-muted">{t("feature")}</th>
                  {PLANS.map((plan) => (
                    <th
                      key={plan.slug}
                      className={`px-4 py-3 text-center font-semibold ${
                        plan.highlighted ? "text-orange-400" : "text-foreground"
                      }`}
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, index) => (
                  <tr
                    key={row.labelKey}
                    className={`border-b border-border last:border-b-0 ${
                      index % 2 === 1 ? "bg-panel/40" : ""
                    }`}
                  >
                    <td className="px-4 py-3 text-left text-muted">{t(`rows.${row.labelKey}`)}</td>
                    {PLANS.map((plan) => (
                      <td key={plan.slug} className="px-4 py-3 text-center">
                        <ComparisonCellContent cell={row.cell(plan, locale, cellWords)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/"
            className="text-xs text-orange-400 underline underline-offset-2"
          >
            {t("backToHome")}
          </Link>
        </div>
      </div>
    </main>
  );
}
