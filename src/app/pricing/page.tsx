import type { Metadata } from "next";
import { pageTitleAndDescription } from "@/lib/page-title";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { Check, ChevronDown, X } from "lucide-react";
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
import {
  FEATURE_GROUPS,
  featuresInGroup,
  soldFeatures,
  type CellWords,
  type FeatureCell,
} from "@/lib/billing/feature-catalog";
import { SubscribeButton } from "@/components/billing/subscribe-button";
import { AppBackground } from "@/components/ui/app-background";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { formatNumber } from "@/lib/format-number";

export function generateMetadata(): Promise<Metadata> {
  return pageTitleAndDescription("pricing.title", "pricing.metaDescription");
}

/**
 * ONE CELL.
 *
 * ✕ MEANS YOU DO NOT HAVE IT, and it is a different mark from a small
 * number on purpose: "2" and "✕" were both rendered as a dash on the
 * table this replaces, so "not included" and "included, twice" looked
 * the same. The cross carries a screen-reader word for the same reason —
 * a glyph with no text is a blank cell to anybody not looking at it.
 *
 * "Unlimited" is its own cell TYPE rather than a magic string, so
 * feature-catalog.test.mjs can find every one of them by executing the
 * cell and demand the proof that nothing else bounds it.
 */
function ComparisonCellContent({
  cell,
  words,
}: {
  cell: FeatureCell;
  words: CellWords & { yes: string; no: string };
}) {
  if (cell.type === "value") {
    return <span className="text-sm text-foreground">{cell.text}</span>;
  }
  if (cell.type === "unlimited") {
    return <span className="text-sm text-foreground">{words.unlimited}</span>;
  }
  if (cell.type === "check") {
    return (
      <>
        <Check className="mx-auto h-4 w-4 text-emerald-400" aria-hidden="true" />
        <span className="sr-only">{words.yes}</span>
      </>
    );
  }
  // NOT text-muted/50, which is what this was. Measured against the
  // panel: 2.25:1 in dark and 2.35:1 in light — below the 3:1 WCAG asks
  // of a non-text graphic, and against a tick at 9.58:1. Reported from
  // production on 2026-09-19 as "Free says it has Team collaboration":
  // it does not, and the ✕ saying so could not be seen. Full muted is
  // 5.34:1 dark and 7.73:1 light.
  return (
    <>
      <X className="mx-auto h-4 w-4 text-muted" aria-hidden="true" />
      <span className="sr-only">{words.no}</span>
    </>
  );
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
  const cellWords: CellWords & { yes: string; no: string } = {
    unlimited: t("values.unlimited"),
    included: t("values.included"),
    custom: t("values.custom"),
    perSeat: t("values.perSeat", { currency: CURRENCY_SYMBOL, price: TEAM_SEAT_PRICE }),
    perHour: t("values.perHour"),
    perDay: t("values.perDay"),
    minutesPerMonth: t("values.minutesPerMonth"),
    // Read only by a screen reader — the tick and the cross are
    // aria-hidden glyphs, so without these the two most load-bearing
    // cells in the table are silent.
    yes: t("values.yes"),
    no: t("values.no"),
  };
  const rows = soldFeatures();

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
              // THE ANCHOR THE UPGRADE WALL LINKS AT. A locked feature
              // names the plan and its price and then sends the reader
              // to /pricing#plan-<slug>, so the card they were told
              // about is the one on screen — see
              // components/billing/upgrade-required.tsx.
              id={`plan-${plan.slug}`}
              className={`relative flex scroll-mt-8 flex-col rounded-2xl border p-6 ${
                plan.highlighted
                  ? "border-orange-500/60 bg-orange-500/[0.04]"
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
                        ? "bg-orange-500 text-black hover:opacity-90"
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
          <div className="relative flex flex-col surface">
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
          className="mx-auto mt-8 max-w-3xl surface text-center"
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
          {/* ROWS: 45, in seven sections, all open.
              THE NUMBER IS HELD, NOT REMEMBERED. It said FORTY-THREE here
              for two days after the table reached 45, because a count
              written into a comment goes stale the moment somebody adds a
              row and nothing tells them. It is now re-derived on every
              build: scripts/tests/pricing-truth.test.mjs reads this
              comment, parses the figure after "ROWS:" and requires it to
              equal soldFeatures().length, so adding a row and leaving
              this line alone fails the build with both numbers in the
              message. feature-catalog.test.mjs holds 45 as the ceiling on
              how long the table may get. The table this replaced had 13,
              and the thirty-two it did not have included two per-plan
              ceilings the product enforces and had never named in any
              language.

              WHY NOTHING IS COLLAPSED BY DEFAULT. Forty-five is past the
              point where a wall of rows is read, so each section is a
              <details> the reader can shut — but `open` by construction,
              because the whole purpose of the page is that nothing about
              what you get is hidden. The reader collapses what they have
              finished with; the page never decides that for them. The
              sections are also the sidebar's own headings, so somebody
              who has used the product is navigating a shape they know. */}
          <div className="space-y-3">
            {FEATURE_GROUPS.map((group) => {
              const groupRows = featuresInGroup(group);
              if (groupRows.length === 0) return null;
              // NO FRAME ROUND THE SECTION. Seven bordered boxes where
              // there used to be one is seven new lines on a page whose
              // design brief is "fewer borders, fewer cards" —
              // scripts/tests/design-density.test.mjs counts them and the
              // ceiling is 581, which this page was two over. The panel
              // colour separates the section from the page and the header
              // band separates it from its own rows, without drawing
              // anything.
              return (
                <details key={group} open className="group/section overflow-hidden rounded-2xl bg-panel">
                  <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-orange-400">
                    <span>
                      {t(`groups.${group}`)}
                      <span className="ms-2 text-xs font-normal text-muted">
                        {groupRows.length}
                      </span>
                    </span>
                    <ChevronDown
                      className="h-4 w-4 shrink-0 text-muted transition-transform duration-200 group-open/section:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  {/* `relative`, AND IT IS LOAD-BEARING. A scroll
                      container inside a <details> does not stop its
                      overflow reaching the document in Chromium 141: the
                      wrapper clips correctly (clientWidth 358, scrollWidth
                      746 at a 390px viewport) and documentElement.scrollWidth
                      was still 708, so the whole PAGE scrolled sideways
                      behind a table that was already scrolling on its own.
                      Measured in a browser against the production build,
                      not reasoned about — `position: relative` and
                      `contain: paint` both fix it and `width: 100%`,
                      `min-width: 0`, `overflow: clip` on the details and
                      four other guesses do not. */}
                  <div className="relative overflow-x-auto">
                    {/* FIXED LAYOUT, so the seven sections line up.
                        Each <table> sizes its own columns from its own
                        content by default, and the seven of them
                        disagreed: "Free" sat at x=445 in the ΦΤΙΑΞΕ
                        section and at x=570 in ΡΩΤΑ, measured in a
                        browser at 1440. A comparison table whose columns
                        move between sections is one a reader has to
                        re-find on every heading. */}
                    <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
                      <caption className="sr-only">{t(`groups.${group}`)}</caption>
                      <thead>
                        <tr className="border-b border-border bg-panel-hover">
                          <th
                            scope="col"
                            className="w-[34%] px-4 py-3 text-start font-semibold text-muted"
                          >
                            {t("feature")}
                          </th>
                          {PLANS.map((plan) => (
                            <th
                              key={plan.slug}
                              scope="col"
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
                        {groupRows.map((row, index) => (
                          <tr
                            key={row.id}
                            className={`border-b border-border last:border-b-0 ${
                              index % 2 === 1 ? "bg-panel-hover/40" : ""
                            }`}
                          >
                            <th
                              scope="row"
                              className="px-4 py-3 text-start font-normal text-muted"
                            >
                              {t(`rows.${row.id}`)}
                            </th>
                            {PLANS.map((plan) => (
                              <td key={plan.slug} className="px-4 py-3 text-center">
                                <ComparisonCellContent
                                  cell={row.cell(plan, locale, cellWords)}
                                  words={cellWords}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}
          </div>
          <p className="mt-4 text-center text-xs text-muted">
            {t("comparisonRowCount", { count: rows.length })}
          </p>
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
