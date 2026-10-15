import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";

/**
 * How many research reports this account has STARTED this calendar month.
 *
 * COUNTED FROM THE LEDGER, NOT FROM THE REPORTS THAT STILL EXIST.
 *
 * WHAT WAS WRONG. The screen and the route both counted rows in
 * `research_reports` created since the 1st. Deleting a report is a hard
 * delete (api/research/[id] DELETE — no tombstone, no `deleted_at`), so
 * it removed one from that count and handed the allowance back: delete,
 * run another, delete, run another, for as long as the account has
 * credits. The route's own comment said the cap "fails CLOSED" because a
 * counting error must not be the way around it. A deletion was.
 *
 * WHY ai_cost_log. It is append-only — nothing in the application deletes
 * from it — and api/research/route.ts settles exactly one `research_plan`
 * row per report it plans, BEFORE the report row is inserted, for bypass
 * accounts too (lib/billing/reservations.ts writes the row whatever the
 * charge is, and skips it only when no AI call completed at all). So one
 * row is one report started, which is what "N reports a month" means, and
 * nothing the account can do removes one.
 *
 * WHY `outcome`. It is settlement metadata the route already writes:
 * "planned" when the plan came back usable, the failure reason when it
 * did not. A topic the AI could not break into questions produces no
 * report at all, and must not spend an allowance.
 *
 * ADMIN CLIENT, SCOPED BY HAND. 20261012000000_cost_log_server_reads.sql
 * took SELECT on ai_cost_log away from `authenticated`, so this cannot run
 * on the account's own client. The `user_id` filter below is what keeps it
 * to one account, which is why this function takes an id and never a
 * request.
 *
 * Returns null when the count could not be taken. Both callers must treat
 * that as "do not know", never as zero.
 */
export async function countResearchRunsThisMonth(userId: string): Promise<number | null> {
  // Calendar month, matching how the plan allowance is described.
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);
  const sinceIso = since.toISOString();

  const planningSettlements = () =>
    createAdminClient()
      .from("ai_cost_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("feature", "research_plan")
      .gte("created_at", sinceIso);

  // THE JSON FILTER IS TRIED, AND NOT DEPENDED ON.
  //
  // `metadata->>outcome` is PostgREST's syntax for a field inside a jsonb
  // column, and this is the first place in this repository to use it —
  // so there is no deployment here that has ever proved the database API
  // accepts it. A filter that is merely WRITTEN and silently rejected
  // would turn every research request into a 503, which is a worse
  // outcome than the one being fixed.
  //
  // So the exact count is attempted, and a rejected filter falls back to
  // counting every planning settlement. The fallback over-counts in
  // exactly one case — a topic the model could not break into questions,
  // which produced no report — and over-counting errs TOWARDS the cap,
  // which is the direction this count is required to fail in. The first
  // real production run settles the question; until then neither answer
  // can open the hole.
  const exact = await planningSettlements().eq("metadata->>outcome", "planned");
  if (!exact.error) return exact.count ?? 0;

  logApiError("research:countRunsThisMonth", exact.error, { userId, stage: "outcome_filter" });
  const all = await planningSettlements();
  if (all.error) {
    logApiError("research:countRunsThisMonth", all.error, { userId, stage: "fallback" });
    return null;
  }
  return all.count ?? 0;
}
