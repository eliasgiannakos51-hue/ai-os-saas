import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { getPurchasedPackCreditPriceEur, resolveEffectivePlan } from "@/lib/billing/credits";
import { listIntegrations } from "@/lib/integrations/store";
import { listDeliveryChannels } from "@/lib/agents/delivery-store";
import { FLOW_COLUMNS, MAX_FLOWS, RUN_COLUMNS, UUID, isColumnMissing } from "@/lib/automations/flow-access";
import { DEFAULT_FLOW_MODE, isFlowMode, type FlowMode } from "@/lib/automations/boxes";
import { flowPrices, type FlowPrices } from "@/lib/automations/flow-pricing";
import type { UserAutomation } from "@/types/user-automation";
import { ownedProjectId } from "@/lib/projects/link-result";
import { COUNTED_STARTS, readMinutes } from "@/lib/automations/time-saved";

/** How many runs of the opened automation come with the page. */
const RUNS_SHOWN = 20;
/** How many cross-automation approvals the Approval Center opens with — a
 *  bound, same reason MAX_FLOWS is one: a person with many automations
 *  still gets one page, not an unbounded scroll. */
const PENDING_APPROVALS_SHOWN = 20;

export type AutomationPageData = {
  flows: Record<string, unknown>[];
  runs: Record<string, unknown>[];
  openId: string | null;
  runId: string | null;
  prices: FlowPrices;
  connected: { google_calendar: boolean; telegram: boolean };
  older: UserAutomation[];
  /** From `?projectId=`, read back as the caller's own — see below. */
  projectId: string | null;
  /** The minutes each automation saves, as its owner typed them — or null
   *  for the whole map when the switch is closed to this reader or the
   *  column is not in the database yet (see loadMinutesSaved). */
  minutesSaved: Record<string, number | null> | null;
  /** The opened automation's finished runs that were not trials. */
  doneRuns: number;
  /** Each automation's Auto/Shadow/Supervised mode — or null for the
   *  whole map when the switch "agents-automations-pro" is closed to this
   *  reader or the column is not in the database yet (see loadModes).
   *  Same precedent as minutesSaved above: a selector that could not
   *  save is never drawn. */
  modes: Record<string, FlowMode> | null;
  /** Every one of this account's runs waiting for an approval, across
   *  EVERY automation (not just the one opened) — the Approval Center
   *  (οδηγία 55, 2026-11-08). Soonest deadline first, so the one about to
   *  expire is the one seen first. No switch gates this: the approval box
   *  itself has existed since package 30, this is only a new place to
   *  see every one at once instead of opening each automation in turn. */
  pendingApprovals: Record<string, unknown>[];
};

/**
 * EVERY RUN WAITING FOR APPROVAL, ACROSS EVERY AUTOMATION — the Approval
 * Center. The person's own runs, under their own select policy; no flow
 * join needed, since the screen already holds every flow's name and
 * boxes from `flows` above and matches by `flow_id` itself.
 */
export async function loadPendingApprovals(supabase: SupabaseClient, userId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from("automation_runs")
    .select(RUN_COLUMNS)
    .eq("user_id", userId)
    .eq("status", "waiting_approval")
    .order("approval_expires_at", { ascending: true, nullsFirst: false })
    .limit(PENDING_APPROVALS_SHOWN);
  if (error) {
    logApiError("dashboard/automation", error, { stage: "pending_approvals" });
    return [];
  }
  return (data ?? []) as Record<string, unknown>[];
}

/**
 * THE MODE EACH AUTOMATION RUNS WITH (automation_flows.mode,
 * 20261123000000_automation_mode.sql, Automations Κομμάτι 2a) — in a
 * query OF ITS OWN and never in FLOW_COLUMNS, same reason as
 * loadMinutesSaved just below: until the migration is pasted the column
 * is not there, and naming it in FLOW_COLUMNS would fail every read of
 * every automation whole. A missing column, or any other read problem,
 * answers null for the WHOLE map — not a per-row DEFAULT_FLOW_MODE guess
 * — so the screen hides the selector exactly as it hides the minutes
 * field, rather than show one row "auto" while its neighbours are not
 * drawn at all.
 */
export async function loadModes(supabase: SupabaseClient, userId: string): Promise<Record<string, FlowMode> | null> {
  const { data, error } = await supabase.from("automation_flows").select("id, mode").eq("user_id", userId).limit(MAX_FLOWS);
  if (error) {
    if (!isColumnMissing(error)) logApiError("dashboard/automation", error, { stage: "mode" });
    return null;
  }
  return Object.fromEntries(((data ?? []) as { id: string; mode?: unknown }[]).map((row) => [row.id, isFlowMode(row.mode) ? row.mode : DEFAULT_FLOW_MODE]));
}

/**
 * A COLUMN THE DATABASE DOES NOT HAVE YET: moved to flow-access.ts
 * (2026-11-08, Automations Κομμάτι 2a) so modeFor/modesByFlowIds there
 * can use the SAME check without an import cycle — flow-access.ts
 * already has no dependency on this file, and this file already depends
 * on flow-access.ts (FLOW_COLUMNS, below), so the reverse direction
 * would have been circular. Re-exported here so the one existing import
 * site (api/automations/flows/[id]/route.ts) is unchanged.
 */
export { isColumnMissing };

/**
 * THE MINUTES EACH AUTOMATION SAVES (automation_flows.minutes_saved,
 * 20261114000000), in a query OF ITS OWN and never in FLOW_COLUMNS: until
 * the migration is pasted the column is not there, and a select that
 * names it fails whole — which in FLOW_COLUMNS would empty the screen of
 * every automation. Here a missing column answers null, and null hides
 * the field and the figure (components/automations/flow-boxes.tsx
 * TimeSavedForm), so the screen is exactly what it was.
 */
export async function loadMinutesSaved(supabase: SupabaseClient, userId: string): Promise<Record<string, number | null> | null> {
  const { data, error } = await supabase.from("automation_flows").select("id, minutes_saved").eq("user_id", userId).limit(MAX_FLOWS);
  if (error) {
    if (!isColumnMissing(error)) logApiError("dashboard/automation", error, { stage: "minutes_saved" });
    return null;
  }
  return Object.fromEntries(((data ?? []) as { id: string; minutes_saved: unknown }[]).map((row) => [row.id, readMinutes(row.minutes_saved)]));
}

/**
 * HOW MANY TIMES ONE AUTOMATION DID ITS JOB: finished (`done`) runs that
 * the schedule, a file or «Εκτέλεση τώρα» started — never a «Δοκιμή»
 * (lib/automations/time-saved.ts COUNTED_STARTS). Counted by the
 * database, under the person's own select policy, so it is every run and
 * not the twenty the history shows. Zero when it cannot be counted: the
 * figure it feeds is then "not yet", never a guess.
 */
export async function countDoneRuns(supabase: SupabaseClient, userId: string, flowId: string): Promise<number> {
  const { count, error } = await supabase
    .from("automation_runs")
    .select("id", { count: "exact", head: true })
    .eq("flow_id", flowId)
    .eq("user_id", userId)
    .eq("status", "done")
    .in("started_by", [...COUNTED_STARTS]);
  if (error) {
    logApiError("dashboard/automation", error, { stage: "done_runs" });
    return 0;
  }
  return count ?? 0;
}

/**
 * WHAT THE AUTOMATIONS SCREEN OPENS WITH (MASTER 16, package 30): the
 * person's automations, the one a notification pointed at (`?run=` — the
 * approval waiting) with its history, the prices, what is connected, and
 * the one-sentence automations from before, which keep running.
 * Every read is the person's own, under their select policies.
 *
 * `flowParam` (`?flow=`) AND `projectId` (`?projectId=`) ARE NEW, for the
 * owner's message 2026-10-22, point 6: a project's «Automate it» button
 * opens this page naming the flow it created (so the project's own
 * `openHref` can deep-link into a specific automation, which nothing
 * before this round let it do) and the project it should be filed under.
 * `flowParam` is read back the same way `runParam` already was — a flow
 * that is not this account's own resolves to no match and `openId` stays
 * null, which is the existing "nothing to open" path, not a new one.
 */
export async function loadAutomationPage(
  user: User,
  runParam: string | undefined,
  flowParam?: string,
  projectIdParam?: string,
  /** Whether "automation-time-saved" is open to this reader: closed, the minutes are not even read. */
  timeSavedOn = false,
  /** Whether "agents-automations-pro" is open to this reader (the same
   *  switch Κομμάτι 1 shipped behind): closed, the mode is not even read,
   *  and no selector is drawn — a customer who cannot write the mode is
   *  never shown one that cannot save it. */
  modeOn = false
): Promise<AutomationPageData> {
  const supabase = await createClient();
  const runId = runParam && UUID.test(runParam) ? runParam : null;
  const flowIdFromUrl = flowParam && UUID.test(flowParam) ? flowParam : null;
  const [flowsResult, olderResult, plan, packPrice, integrations, channels, projectId, minutesSaved, modes, pendingApprovals] = await Promise.all([
    supabase.from("automation_flows").select(FLOW_COLUMNS).eq("user_id", user.id).order("created_at", { ascending: false }).limit(MAX_FLOWS),
    supabase.from("user_automations").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    resolveEffectivePlan(user),
    getPurchasedPackCreditPriceEur(user.id),
    listIntegrations(user.id),
    listDeliveryChannels(user.id),
    ownedProjectId(supabase, projectIdParam),
    timeSavedOn ? loadMinutesSaved(supabase, user.id) : Promise.resolve(null),
    modeOn ? loadModes(supabase, user.id) : Promise.resolve(null),
    loadPendingApprovals(supabase, user.id),
  ]);
  if (flowsResult.error) logApiError("dashboard/automation", flowsResult.error, { stage: "flows" });
  const flows = (flowsResult.data ?? []) as Record<string, unknown>[];

  let openId: string | null = null;
  if (runId) {
    const { data } = await supabase.from("automation_runs").select("flow_id").eq("id", runId).eq("user_id", user.id).maybeSingle();
    openId = (data?.flow_id as string | undefined) ?? null;
  } else if (flowIdFromUrl && flows.some((f) => (f as { id?: unknown }).id === flowIdFromUrl)) {
    openId = flowIdFromUrl;
  }
  let runs: Record<string, unknown>[] = [];
  let doneRuns = 0;
  if (openId) {
    const [{ data }, done] = await Promise.all([
      supabase
        .from("automation_runs")
        .select(RUN_COLUMNS)
        .eq("flow_id", openId)
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(RUNS_SHOWN),
      minutesSaved ? countDoneRuns(supabase, user.id, openId) : Promise.resolve(0),
    ]);
    runs = (data ?? []) as Record<string, unknown>[];
    doneRuns = done;
  }
  return {
    flows,
    runs,
    openId,
    runId: openId ? runId : null,
    prices: flowPrices(plan, packPrice),
    connected: {
      // Connected — as the routes count it (lib/automations/flow-access.ts).
      google_calendar: integrations.some((i) => i.provider === "google_calendar" && i.status === "connected"),
      telegram: channels.some((c) => c.channel === "telegram"),
    },
    older: (olderResult.data ?? []) as UserAutomation[],
    projectId,
    modes,
    pendingApprovals,
    minutesSaved,
    doneRuns,
  };
}
