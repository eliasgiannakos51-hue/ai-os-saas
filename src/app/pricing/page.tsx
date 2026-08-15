import type { Metadata } from "next";
import { pageTitleAndDescription } from "@/lib/page-title";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { Check, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { PLANS, TEAM_SEAT_PRICE, CURRENCY_SYMBOL, getPlan, type Plan, type PaidPlanSlug } from "@/lib/billing/plans";
import { SubscribeButton } from "@/components/billing/subscribe-button";
import { AppBackground } from "@/components/ui/app-background";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { formatNumber } from "@/lib/format-number";

export function generateMetadata(): Promise<Metadata> {
  return pageTitleAndDescription("pricing.title", "pricing.metaDescription");
}

type ComparisonCell = { type: "value"; text: string } | { type: "check" } | { type: "cross" };

// Every row here maps straight to a real, enforced capability
// (lib/billing/plans.ts's PlanCapabilities/hasTeamSeats/teamSeatsIncluded)
// — nothing pending/unbuilt is listed. labelKey looks up
// messages/*.json's pricing.rows.<key> for the row name.
const COMPARISON_ROWS: { labelKey: string; cell: (plan: Plan, locale: string) => ComparisonCell }[] = [
  {
    labelKey: "creditsPerMonth",
    cell: (p, locale) => ({
      type: "value",
      text: p.monthlyCredits === "custom" ? "Custom" : formatNumber(p.monthlyCredits, locale),
    }),
  },
  {
    labelKey: "aiAgents",
    cell: (p) => ({
      type: "value",
      text: p.capabilities.maxAiAgents === "unlimited" ? "Unlimited" : String(p.capabilities.maxAiAgents),
    }),
  },
  { labelKey: "websiteBuilder", cell: (p) => (p.capabilities.websiteBuilder ? { type: "check" } : { type: "cross" }) },
  { labelKey: "aiMemory", cell: (p) => (p.capabilities.aiMemory ? { type: "check" } : { type: "cross" }) },
  { labelKey: "teamCollaboration", cell: (p) => (p.capabilities.teamCollaboration ? { type: "check" } : { type: "cross" }) },
  {
    labelKey: "teamSeatsAddOn",
    cell: (p) => {
      if (!p.hasTeamSeats) return { type: "cross" };
      if (p.teamSeatsIncluded) return { type: "value", text: "Included" };
      return { type: "value", text: `+${CURRENCY_SYMBOL}${TEAM_SEAT_PRICE}/seat` };
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

export default async function PricingPage() {
  const t = await getTranslations("pricing");
  const locale = await getLocale();

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
                    {plan.price}
                    {plan.price > 0 && (
                      <span className="text-sm font-normal text-muted">{t("perMonth")}</span>
                    )}
                  </>
                ) : (
                  t("custom")
                )}
              </p>
              <p className="mt-2 text-xs text-muted">
                {plan.monthlyCredits === "custom"
                  ? t("features.customCredits")
                  : t("features.creditsPerMonth", { count: formatNumber(plan.monthlyCredits, locale) })}
              </p>

              <ul className="mt-6 flex-1 space-y-2.5 text-sm text-muted">
                {plan.features.map((feature) => (
                  <li key={feature.textKey} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" aria-hidden="true" />
                    {/* `count` is only consumed by the creditsPerMonth key;
                        next-intl ignores unused params, and passing it here
                        means the number is formatted for the reader's
                        locale by the same code path as every other. */}
                    <span>
                      {t(`features.${feature.textKey}`, {
                        count:
                          plan.monthlyCredits === "custom"
                            ? ""
                            : formatNumber(plan.monthlyCredits, locale),
                      })}
                    </span>
                  </li>
                ))}
              </ul>

              {plan.hasTeamSeats && (
                <p className="mt-4 border-t border-border pt-4 text-[11px] leading-relaxed text-muted">
                  {plan.teamSeatsIncluded
                    ? "Unlimited team seats included — no per-member charge"
                    : `+ ${CURRENCY_SYMBOL}${TEAM_SEAT_PRICE}/month per team member — each member gets full access at your plan's tier`}
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
                        <ComparisonCellContent cell={row.cell(plan, locale)} />
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
