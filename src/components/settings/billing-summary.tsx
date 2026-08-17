import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { getPlan } from "@/lib/billing/plans";
import { ManageBillingButton } from "@/components/billing/manage-billing-button";
import { CancelSubscription } from "@/components/settings/cancel-subscription";
import { SubscriptionEndingBanner } from "@/components/billing/subscription-ending-banner";
import { daysUntil } from "@/lib/billing/subscription-period";
import type { SubscriptionState } from "@/lib/billing/subscription-state";

export async function BillingSummary({
  tier,
  seatCount,
  hasSubscription,
  isAdmin = false,
  isBetaTester = false,
  betaDaysRemaining = null,
  subscription = null,
  creditsRemaining = 0,
  purchasedCredits = 0,
}: {
  tier: string;
  seatCount: number;
  hasSubscription: boolean;
  isAdmin?: boolean;
  isBetaTester?: boolean;
  // Whole days left in the beta window (see lib/beta.ts's daysRemaining) —
  // only meaningful while isBetaTester is true. null just falls back to a
  // plain "Beta Tester" label instead of an expiry count.
  betaDaysRemaining?: number | null;
  /** Live cancel/renew state from Stripe, or null when there is none. */
  subscription?: SubscriptionState | null;
  /** The whole spendable balance. */
  creditsRemaining?: number;
  /** How much of it was BOUGHT. Never expires; see the migration. */
  purchasedCredits?: number;
}) {
  // "Upgrade Plan" was hardcoded English on the billing panel while
  // credits.outOfCredits.upgradePlan already carried it, translated, in
  // all ten locales — the same shape as the settings jump links and the
  // upgrade wall: the string existed and nothing reached it.
  const tCredits = await getTranslations("credits.outOfCredits");
  const t = await getTranslations("settings.billing");
  const plan = getPlan(tier) ?? getPlan("free")!;

  return (
    <div className="mb-6 space-y-3 rounded-2xl border border-border bg-panel p-5">
      <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
      {subscription?.cancelAtPeriodEnd && subscription.endsAt && (
        <SubscriptionEndingBanner daysLeft={daysUntil(subscription.endsAt)} />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted">{t("currentPlan")}</p>
          <p className="mt-0.5 text-lg font-bold text-foreground">{plan.name}</p>
          {/* Shown only when there is something to explain. A user with no
              pack sees one number, as before; a user holding one needs to
              know which part of their balance survives the month, because
              that is the whole difference between the two. */}
          {purchasedCredits > 0 && (
            <p className="mt-0.5 text-xs text-muted">
              {t("creditsSplit", {
                monthly: creditsRemaining - purchasedCredits,
                purchased: purchasedCredits,
              })}
            </p>
          )}
          {seatCount > 0 && (
            <p className="mt-0.5 text-xs text-muted">
              {t("teamSeats", { seats: seatCount })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <span className="inline-flex items-center rounded-full border border-orange-800 bg-orange-950/30 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-orange-400">
              {t("ownerAccess")}
            </span>
          ) : isBetaTester ? (
            <span className="inline-flex items-center rounded-full border border-emerald-800 bg-emerald-950/30 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-400">
              {/* ICU plural, not `day${n === 1 ? "" : "s"}`. Arabic has six
                  plural forms and Japanese has none; an English "(s)" hack
                  is wrong in both directions and cannot be fixed by a
                  translator, because the branch lives in the code. */}
              {typeof betaDaysRemaining === "number"
                ? t("betaTesterExpires", { days: betaDaysRemaining })
                : t("betaTester")}
            </span>
          ) : hasSubscription ? (
            <>
              <ManageBillingButton />
              {/* Beside "Manage billing", not buried inside Stripe's hosted
                  portal behind it. Hidden only once a cancellation is
                  already pending, where the banner above offers Restore
                  instead — cancelling twice is not a thing. */}
              {!subscription?.cancelAtPeriodEnd && (
                <CancelSubscription endsAt={subscription?.endsAt ?? null} />
              )}
            </>
          ) : (
            <Link
              href="/pricing"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)]"
            >
              {t("upgradePlan")}
            </Link>
          )}
          {(hasSubscription || isAdmin || isBetaTester) && tier !== "free" && (
            <Link
              href="/dashboard/team"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border px-4 py-2 text-sm text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400"
            >
              {t("manageTeam")}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
