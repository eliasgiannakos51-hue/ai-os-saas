import { getLocale, getTranslations } from "next-intl/server";
import { formatRelativeTime } from "@/lib/format-time";
import { formatNumber } from "@/lib/format-number";

export type CreditTransaction = {
  id: string;
  amount: number;
  action_type: string;
  description: string;
  created_at: string;
};

/**
 * An AI action that cost the account NOTHING — an admin/beta bypass, or a
 * free chat message.
 *
 * These have no credit_transactions row at all, because settle_reservation
 * only writes one when p_credits_to_charge > 0. That is correct for a
 * ledger of balance movements, and it is why this panel read "No credit
 * activity yet" on an account with a full ai_cost_log: every row on it was
 * a zero charge. Showing them from ai_cost_log instead means the history
 * reflects what the user DID, not only what moved their balance.
 *
 * Rows that DID charge are deliberately not taken from here — they already
 * have a credit_transactions row, and reading both would double-count.
 */
export type FreeAiAction = {
  id: string;
  feature: string;
  created_at: string;
  /** What a normal account on this plan would have paid. */
  would_have_charged: number | null;
};

type Row =
  | { kind: "tx"; at: string; id: string; label: string; amount: number; balanceAfter: number | null }
  | { kind: "free"; at: string; id: string; label: string; wouldHave: number | null };

// action_type is a machine string (website_generate, ask_ai_record, ...).
// Rendered as words rather than raw, since this panel is user-facing.
function humanise(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bAi\b/g, "AI");
}

export async function CreditHistory({
  transactions,
  freeActions = [],
  currentBalance,
}: {
  transactions: CreditTransaction[];
  freeActions?: FreeAiAction[];
  /** Used to reconstruct the balance after each charge, walking backwards
   *  from today. Nothing stores a per-row balance, and deriving it is
   *  exact as long as it only walks rows that actually moved the balance. */
  currentBalance?: number;
}) {
  const locale = await getLocale();
  const t = await getTranslations("settings.billing");

  // Newest first, and the running balance walks the same direction: the
  // balance AFTER the newest row is today's balance, and each older row's
  // "after" is the newer row's "after" minus the newer row's amount.
  let running = typeof currentBalance === "number" ? currentBalance : null;
  const txRows: Row[] = transactions.map((tx) => {
    const balanceAfter = running;
    if (running !== null) running -= tx.amount;
    return {
      kind: "tx",
      at: tx.created_at,
      id: tx.id,
      label: tx.description || humanise(tx.action_type),
      amount: tx.amount,
      balanceAfter,
    };
  });

  const freeRows: Row[] = freeActions.map((a) => ({
    kind: "free",
    at: a.created_at,
    id: `free-${a.id}`,
    label: humanise(a.feature),
    wouldHave: a.would_have_charged,
  }));

  const rows = [...txRows, ...freeRows].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="mb-6 space-y-3 rounded-2xl border border-border bg-panel p-5">
      <h2 className="text-sm font-semibold text-foreground">{t("creditHistory")}</h2>
      {rows.length === 0 ? (
        <p className="text-xs text-muted">{t("noCreditActivity")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
              <div className="min-w-0">
                <p className="truncate text-foreground">{row.label}</p>
                <p className="mt-0.5 text-muted" suppressHydrationWarning>
                  {formatRelativeTime(row.at, locale)}
                  {row.kind === "tx" && row.balanceAfter !== null && (
                    <> · {t("balanceAfter", { count: formatNumber(row.balanceAfter, locale) })}</>
                  )}
                </p>
              </div>
              {row.kind === "tx" ? (
                <span
                  className={`shrink-0 font-semibold ${row.amount < 0 ? "text-red-400" : "text-emerald-400"}`}
                >
                  {row.amount > 0 ? "+" : ""}
                  {formatNumber(row.amount, locale)}
                </span>
              ) : (
                // The whole point of showing a bypass row: what it WOULD
                // have cost. "Unlimited" on its own tells the owner
                // nothing about whether pricing is working.
                <span className="shrink-0 text-right font-semibold text-amber-300">
                  {t("unlimited")}
                  {row.wouldHave !== null && (
                    <span className="ml-1 block font-normal text-[11px] text-muted">
                      {t("wouldHaveCost", { count: formatNumber(row.wouldHave, locale) })}
                    </span>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
