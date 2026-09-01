import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";

// Trading Workflow's "Trading Mentor" preset (see
// components/trading-workflow/trading-mentor-button.tsx) — unlike
// lib/chat/mentor-context.ts's generic 5-per-module summary, this loads
// the user's full recent trading history (last 20 trades) so Mentor Mode
// can give trading-specific feedback instead of a generic cross-module
// blurb. Only ever appended when the chat request explicitly opts in via
// mentorPreset: "trading" (see api/chat/route.ts) — the default chat/
// Mentor Mode behavior is unaffected.
const TRADE_LIMIT = 20;

export async function loadTradingMentorContext(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("trades")
      .select("*")
      // EXPLICIT, NOT LEFT TO RLS. lib/user-context.ts carries the long
      // version of this: it relied on RLS alone until two job handlers
      // began passing the SERVICE-ROLE client, for which RLS does not
      // apply at all, and every row of every user was in scope. This file
      // has always taken `userId` and never used it for anything but an
      // error log — safe only for as long as every caller happens to pass
      // a session client. That is a property of the callers, not of this
      // query, and it is one edit away from not being true.
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(TRADE_LIMIT);

    if (error || !data || data.length === 0) {
      if (error) logApiError("chat:loadTradingMentorContext", error);
      return "";
    }

    const lines = (data as Record<string, unknown>[]).map((row) => {
      const symbol = String(row.symbol ?? "").trim() || "?";
      const direction = String(row.direction ?? "").trim();
      const result = String(row.result ?? "").trim();
      const pnl = row.pnl;
      const pnlText = typeof pnl === "number" ? `${pnl >= 0 ? "+" : ""}${pnl}` : "";
      const details = [direction, result, pnlText].filter(Boolean).join(", ");
      return `- ${symbol}${details ? `: ${details}` : ""}`;
    });

    return `\n\nΠλήρες trading history του χρήστη (τα ${data.length} πιο πρόσφατα trades, από το πιο πρόσφατο στο παλαιότερο) — χρησιμοποίησέ το για συγκεκριμένη, βασισμένη σε δεδομένα καθοδήγηση αντί για γενικές συμβουλές:\n${lines.join("\n")}`;
  } catch (err) {
    logApiError("chat:loadTradingMentorContext", err, { userId });
    return "";
  }
}
