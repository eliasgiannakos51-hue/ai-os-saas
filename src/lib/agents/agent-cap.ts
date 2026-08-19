import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";

// WHAT THE CAP COUNTS, and the bug this replaces.
//
// The count behind maxAgentsForPlan used to be `count(*) from user_agents
// where user_id = $1` — every row, whatever its status — while DELETE is
// a hard delete. A Starter account (cap 2) with one paused agent and one
// the system auto-disabled after five failures could create ZERO new
// agents, while consuming NONE of its plan's actual capacity: neither
// row was running, costing credits, or doing anything at all.
//
// Counting only 'active' rows fixes that — capacity means "currently
// scheduled to run", and a paused or disabled agent is not. But that
// alone opens a different gap: an account could create up to the cap,
// pause all of them, create up to the cap again, pause those too, and
// repeat — accumulating an unbounded number of agent rows with no active
// one ever existing at the same time as another. So a SECOND, separate
// ceiling applies to the total row count regardless of status, generous
// enough (3x the active cap) that ordinary pause/resume workflow never
// comes near it, but not infinite.
const TOTAL_ROWS_CEILING_MULTIPLIER = 3;

export type AgentActivationCapResult =
  | { ok: true }
  | { ok: false; reason: "active_cap" | "total_ceiling" | "check_failed"; message: string };

/**
 * Call before an agent becomes (or stays) ACTIVE: creating a new one, or
 * resuming a paused one via PATCH. `cap` is the plan's active-agent
 * allowance (maxAgentsForPlan) — 0 and admin accounts are the caller's
 * concern to check separately, same as the two existing call sites
 * already did before this function existed.
 *
 * NOT the user-scoped client + RLS the original count used — the admin
 * client with an EXPLICIT `.eq("user_id", userId)` filter instead, same
 * choice lib/billing/bypass-ceiling.ts made and for the same reason: one
 * fewer moving part (no need to thread the caller's Supabase client
 * through), with the same safety property — `userId` is always the
 * authenticated caller's own id, verified by the route before this is
 * ever invoked, so there is no cross-user query to construct by mistake.
 *
 * KNOWN GAP, documented rather than fixed (product decision): this is a
 * check-then-write, not a transaction — a TOCTOU (time-of-check to
 * time-of-use) race. The count above and the caller's
 * subsequent insert/update are two separate round trips with nothing —
 * no DB constraint, no serializable transaction — tying them together.
 * Two requests for the SAME account that both call this within the same
 * few milliseconds (e.g. two browser tabs each resuming a different
 * paused agent, or a double-click racing a retry) can both read "N active,
 * under cap" and both proceed, landing the account one over its plan's
 * active-agent limit. All three call sites (create in api/agents,
 * build-time pre-check in api/agents/build, resume in
 * api/agents/[id] PATCH) share this exposure since they all funnel
 * through this one function.
 *
 * Left unfixed here because the blast radius is small and self-correcting
 * (one extra active agent, on one account, until the next pause/delete —
 * not a security boundary, not cross-account, not unbounded), and the
 * real fix is a DB-side guard — a partial unique/count constraint or a
 * SERIALIZABLE transaction wrapping count+write — not application code
 * that would only narrow the window, not close it.
 */
export async function checkAgentActivationCap(userId: string, cap: number): Promise<AgentActivationCapResult> {
  const admin = createAdminClient();
  const [activeResult, totalResult] = await Promise.all([
    admin.from("user_agents").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active"),
    admin.from("user_agents").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);
  if (activeResult.error || totalResult.error) {
    logApiError("agent-cap", activeResult.error ?? totalResult.error, { stage: "count_agents", userId });
    return { ok: false, reason: "check_failed", message: "Could not check your agent limit." };
  }

  const totalCeiling = cap * TOTAL_ROWS_CEILING_MULTIPLIER;
  const total = totalResult.count ?? 0;
  // Checked BEFORE the active cap: hitting this means the account has a
  // pile of paused/disabled rows regardless of how many are active right
  // now, and "delete some" is the correct instruction whether or not the
  // active count happens to be under cap at this exact moment.
  if (total >= totalCeiling) {
    return {
      ok: false,
      reason: "total_ceiling",
      message: `You have ${total} agents total (active, paused and disabled combined) — delete some before adding more.`,
    };
  }

  const active = activeResult.count ?? 0;
  if (active >= cap) {
    return {
      ok: false,
      reason: "active_cap",
      message: `You've reached your plan's limit of ${cap} active agents — pause or delete one, or upgrade to add another.`,
    };
  }

  return { ok: true };
}
