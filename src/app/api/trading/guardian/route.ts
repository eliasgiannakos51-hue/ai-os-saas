import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { loadJournal } from "@/lib/trading/load";
import { evaluate } from "@/lib/trading/guardian";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // @function-limit 60

// Recomputes the recorded violations for this user.
//
// NO MODEL CALL AND NO CREDITS. Evaluation is lib/trading/guardian.ts,
// which is arithmetic — the same code the journal page runs live. This
// route exists so the numbers can be QUERIED over a window ("March") and
// kept as history, not because the screen needs it.
//
// REPLACE, NOT APPEND. The previous set is deleted and the current one
// written, inside one request, because evaluation is deterministic: the
// same trades and rules always produce the same violations, so appending
// would double every count on the second run and "8 times in March" would
// become 16.
//
// THE DELETE IS SCOPED TO THIS USER by the RLS policy, not by a WHERE
// this route has to remember — a bug here would otherwise clear somebody
// else's record of their own trading.

export async function POST() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, code: "unauthenticated", error: "Not authenticated." }, { status: 401 });
    }

    const limited = await checkRateLimit({
      scope: "trading_guardian",
      identifier: user.id,
      maxAttempts: 30,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, code: "rate_limited", error: "Too many re-checks in the last hour." },
        { status: 429 }
      );
    }

    const { trades, rules, accounts } = await loadJournal(supabase);
    // Per account, because a percentage-risk rule divides by THAT
    // account's starting balance. Evaluating every trade against one
    // balance would report violations on the wrong accounts and miss them
    // on the right ones.
    const byAccount = new Map<string | null, typeof trades>();
    for (const trade of trades) {
      byAccount.set(trade.accountId, [...(byAccount.get(trade.accountId) ?? []), trade]);
    }

    const rows: Record<string, unknown>[] = [];
    for (const [accountId, group] of byAccount) {
      const balance = accounts.find((a) => a.id === accountId)?.startingBalance ?? null;
      const result = evaluate(group, rules, { startingBalance: balance });
      for (const violation of result.violations) {
        rows.push({
          user_id: user.id,
          trade_id: violation.tradeId,
          rule_id: violation.ruleId,
          rule_kind: violation.ruleKind,
          rule_text: violation.ruleText,
          occurred_at: violation.occurredAt,
          detail: violation.detail,
        });
      }
    }

    const { error: clearError } = await supabase.from("rule_violations").delete().eq("user_id", user.id);
    if (clearError) {
      logApiError("/api/trading/guardian", clearError, { stage: "clear", userId: user.id });
      return NextResponse.json({ ok: false, code: "recheck_failed", error: "Could not refresh the rule check." }, { status: 500 });
    }

    if (rows.length > 0) {
      const { error: insertError } = await supabase.from("rule_violations").insert(rows);
      if (insertError) {
        logApiError("/api/trading/guardian", insertError, { stage: "insert", userId: user.id });
        return NextResponse.json({ ok: false, code: "recheck_failed", error: "Could not refresh the rule check." }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, violations: rows.length, trades: trades.length, rules: rules.length });
  } catch (err) {
    logApiError("/api/trading/guardian", err, { stage: "unhandled" });
    return NextResponse.json({ ok: false, code: "failed", error: "Something went wrong." }, { status: 500 });
  }
}
