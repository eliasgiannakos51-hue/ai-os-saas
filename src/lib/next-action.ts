import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LINKABLE_MODULES, getLinkableModuleByTable, moduleHref } from "@/lib/knowledge-graph";
import { logApiError } from "@/lib/log-error";
import type { Mission } from "@/types/mission";

const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_THRESHOLD_MS = 3 * DAY_MS;

// Structured, not pre-formatted — the actual sentence gets built by the
// page via getTranslations, same convention as AiCoachCard/ActiveMissionCard
// (translation happens in the Server Component, these stay presentational).
export type NextAction =
  | { kind: "mission_step"; stepText: string; missionGoal: string; href: string }
  | { kind: "revisit_link"; sourceHeadline: string; targetHeadline: string; href: string }
  | { kind: "start_new"; href: string };

// Pure data-driven priority ladder — no AI call, three cheap possibilities
// checked in order, first match wins:
//   1. An in_progress mission with a step still pending — the literal
//      next thing to do.
//   2. A Knowledge Graph link (entity_links) created 3+ days ago. There's
//      no "viewed"/"followed up" tracking anywhere in the schema, so a
//      link's age alone is the signal used here — honestly just "you
//      connected these a few days ago", not a claim about whether the
//      user has since revisited it.
//   3. No new record in ANY linkable module in the last 3 days — a
//      generic nudge to start something.
// Returns null when none of the three apply (e.g. the user has been
// actively logging things but has no missions or knowledge-graph links) —
// there's nothing more specific to suggest, so nothing is shown rather
// than forcing an unhelpful fallback.
export async function computeNextAction(
  supabase: SupabaseClient,
  userId: string,
  activeMission: Mission | null
): Promise<NextAction | null> {
  // 1. Active mission with a pending step.
  if (activeMission && activeMission.status === "in_progress") {
    const steps = activeMission.plan_steps?.steps ?? [];
    const nextStep = steps.find((s) => s.status === "pending");
    if (nextStep) {
      return {
        kind: "mission_step",
        stepText: nextStep.text,
        missionGoal: activeMission.goal,
        href: "/dashboard/mission",
      };
    }
  }

  // Priorities 2 and 3 are checked in order but do not DEPEND on each
  // other, so the third one starts now and is only read if the second
  // finds nothing. Waiting for the entity_link check to come back empty
  // before beginning the activity scan added a whole round trip to Home
  // for exactly the accounts that have the least to show — the new ones.
  const activityThresholdIso = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();
  const activityFlagsPromise = Promise.all(
    LINKABLE_MODULES.map(async (config) => {
      const { data, error } = await supabase
        .from(config.table)
        .select("id")
        .gte("created_at", activityThresholdIso)
        .limit(1);
      if (error) {
        logApiError("next-action:computeNextAction", error, {
          stage: "activity_check",
          table: config.table,
        });
        return false;
      }
      return (data?.length ?? 0) > 0;
    })
  ).catch((err) => {
    // Nothing awaits this when priority 2 wins, so an unhandled rejection
    // here would surface as a process-level warning rather than a logged
    // failure. Caught at the source instead.
    logApiError("next-action:computeNextAction", err, { stage: "activity_check_unhandled" });
    return LINKABLE_MODULES.map(() => false);
  });

  // 2. Most recent entity_link older than the staleness threshold.
  const staleThresholdIso = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();
  try {
    const { data: staleLinks, error: linkError } = await supabase
      .from("entity_links")
      .select("source_table, source_id, target_table, target_id")
      .eq("user_id", userId)
      .lt("created_at", staleThresholdIso)
      .order("created_at", { ascending: false })
      .limit(1);

    if (linkError) {
      logApiError("next-action:computeNextAction", linkError, { stage: "stale_links" });
    } else if (staleLinks && staleLinks.length > 0) {
      const link = staleLinks[0];
      const sourceConfig = getLinkableModuleByTable(link.source_table);
      const targetConfig = getLinkableModuleByTable(link.target_table);

      if (sourceConfig && targetConfig) {
        const [sourceRow, targetRow] = await Promise.all([
          supabase.from(link.source_table).select("*").eq("id", link.source_id).maybeSingle(),
          supabase.from(link.target_table).select("*").eq("id", link.target_id).maybeSingle(),
        ]);

        const sourceHeadline = sourceRow.data
          ? String((sourceRow.data as Record<string, unknown>)[sourceConfig.headlineKey] ?? "")
          : "";
        const targetHeadline = targetRow.data
          ? String((targetRow.data as Record<string, unknown>)[targetConfig.headlineKey] ?? "")
          : "";

        // Both sides still exist (neither was deleted since the link was
        // made) and resolved a real headline — otherwise fall through to
        // the next priority rather than showing a broken suggestion.
        if (sourceHeadline && targetHeadline) {
          return {
            kind: "revisit_link",
            sourceHeadline,
            targetHeadline,
            href: moduleHref(sourceConfig.slug),
          };
        }
      }
    }
  } catch (err) {
    logApiError("next-action:computeNextAction", err, { stage: "stale_links_unhandled" });
  }

  // 3. No new record anywhere in the last 3 days — already in flight.
  const activityFlags = await activityFlagsPromise;

  if (!activityFlags.some(Boolean)) {
    return { kind: "start_new", href: "/dashboard/create" };
  }

  return null;
}
