import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { getPlan } from "@/lib/billing/plans";
import { ManageBillingButton } from "@/components/billing/manage-billing-button";

export async function BillingSummary({
  tier,
  seatCount,
  hasSubscription,
  isAdmin = false,
  isBetaTester = false,
  betaDaysRemaining = null,
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted">{t("currentPlan")}</p>
          <p className="mt-0.5 text-lg font-bold text-foreground">{plan.name}</p>
          {seatCount > 0 && (
            <p className="mt-0.5 text-xs text-muted">
              + {seatCount} team {seatCount === 1 ? "seat" : "seats"}
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
              {typeof betaDaysRemaining === "number"
                ? `Beta Tester — expires in ${betaDaysRemaining} day${betaDaysRemaining === 1 ? "" : "s"}`
                : "Beta Tester"}
            </span>
          ) : hasSubscription ? (
            <ManageBillingButton />
          ) : (
            <Link
              href="/pricing"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)]"
            >
              {tCredits("upgradePlan")}
            </Link>
          )}
          {(hasSubscription || isAdmin || isBetaTester) && tier !== "free" && (
            <Link
              href="/dashboard/team"
              className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-border px-4 py-2 text-sm text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400"
            >
              {t("manageTeam")}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
