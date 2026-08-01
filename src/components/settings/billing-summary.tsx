import Link from "next/link";
import { getPlan } from "@/lib/billing/plans";
import { ManageBillingButton } from "@/components/billing/manage-billing-button";

export function BillingSummary({
  tier,
  seatCount,
  hasSubscription,
  isAdmin = false,
  isBetaTester = false,
}: {
  tier: string;
  seatCount: number;
  hasSubscription: boolean;
  isAdmin?: boolean;
  isBetaTester?: boolean;
}) {
  const plan = getPlan(tier) ?? getPlan("free")!;

  return (
    <div className="mb-6 space-y-3 rounded-2xl border border-border bg-panel p-5">
      <h2 className="text-sm font-semibold text-foreground">Billing</h2>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs text-muted">Current plan</p>
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
              Owner Access
            </span>
          ) : isBetaTester ? (
            <span className="inline-flex items-center rounded-full border border-emerald-800 bg-emerald-950/30 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-400">
              Beta Tester
            </span>
          ) : hasSubscription ? (
            <ManageBillingButton />
          ) : (
            <Link
              href="/pricing"
              className="inline-flex min-h-[40px] items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)]"
            >
              Upgrade Plan
            </Link>
          )}
          {(hasSubscription || isAdmin || isBetaTester) && tier !== "free" && (
            <Link
              href="/dashboard/team"
              className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-border px-4 py-2 text-sm text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400"
            >
              Manage Team
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
