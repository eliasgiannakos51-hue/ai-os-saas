import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isTradingSession, type JournalTrade } from "@/lib/trading/journal";
import { isRuleKind, parseRuleParams, type TradingRule } from "@/lib/trading/rules";

/**
 * ROWS INTO THE SHAPES THE PURE MODULES EXPECT.
 *
 * One place, because the alternative is every page and every route
 * mapping the same eleven columns and one of them getting `size` and
 * `risk_amount` the wrong way round. Every numeric column comes back from
 * postgres-js as a STRING when it is `numeric` — an unconverted one
 * silently turns arithmetic into concatenation, so `num()` is applied to
 * all of them rather than to the ones somebody remembered.
 */

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function toJournalTrade(row: Record<string, unknown>): JournalTrade {
  const session = row.session;
  return {
    id: String(row.id),
    accountId: str(row.account_id),
    instrument: str(row.instrument),
    direction: str(row.direction),
    size: num(row.size),
    entryPrice: num(row.entry_price),
    exitPrice: num(row.exit_price),
    stopPrice: num(row.stop_price),
    targetPrice: num(row.target_price),
    riskAmount: num(row.risk_amount),
    commission: num(row.commission),
    pnl: num(row.pnl),
    enteredAt: str(row.entered_at) ?? str(row.occurred_at) ?? str(row.created_at),
    exitedAt: str(row.exited_at) ?? str(row.occurred_at) ?? str(row.created_at),
    session: isTradingSession(session) ? session : null,
  };
}

/**
 * A stored rule, or null when its params no longer make sense.
 *
 * NULL RATHER THAN A DEFAULT. A row whose jsonb was edited by hand, or
 * written by an older version, must not resolve to a rule with an
 * invented threshold — that rule would then measure somebody's trading
 * against a number nobody chose.
 */
export function toTradingRule(row: Record<string, unknown>): TradingRule | null {
  const kind = row.kind;
  if (!isRuleKind(kind)) return null;
  const params = parseRuleParams(kind, row.params);
  if (!params) return null;
  return {
    id: String(row.id),
    accountId: str(row.account_id),
    originalText: String(row.original_text ?? ""),
    params,
    isActive: row.is_active !== false,
    source: row.source === "ai" ? "ai" : "manual",
  };
}

export type TradingAccount = {
  id: string;
  name: string;
  currency: string;
  startingBalance: number | null;
  isActive: boolean;
};

export function toTradingAccount(row: Record<string, unknown>): TradingAccount {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    currency: String(row.currency ?? "EUR"),
    startingBalance: num(row.starting_balance),
    isActive: row.is_active !== false,
  };
}

/** Everything the journal page needs, in the ORDER the statistics
 *  require: oldest first. The drawdown, the equity curve, the after-loss
 *  pattern and three of the eight rules all depend on it, and a page that
 *  fetched newest-first would produce confident wrong numbers. */
export async function loadJournal(
  supabase: SupabaseClient,
  options: { accountId?: string | null } = {}
): Promise<{ trades: JournalTrade[]; rules: TradingRule[]; accounts: TradingAccount[] }> {
  let tradeQuery = supabase
    .from("trades")
    .select("*")
    .order("exited_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(2000);
  if (options.accountId) tradeQuery = tradeQuery.eq("account_id", options.accountId);

  const [{ data: tradeRows }, { data: ruleRows }, { data: accountRows }] = await Promise.all([
    tradeQuery,
    supabase.from("trading_rules").select("*").eq("is_active", true),
    supabase.from("trading_accounts").select("*").order("created_at", { ascending: true }),
  ]);

  return {
    trades: (tradeRows ?? []).map((r) => toJournalTrade(r as Record<string, unknown>)),
    rules: (ruleRows ?? [])
      .map((r) => toTradingRule(r as Record<string, unknown>))
      .filter((r): r is TradingRule => r !== null),
    accounts: (accountRows ?? []).map((r) => toTradingAccount(r as Record<string, unknown>)),
  };
}
