import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { getPurchasedPackCreditPriceEur, resolveEffectivePlan } from "@/lib/billing/credits";
import { listIntegrations } from "@/lib/integrations/store";
import { listDeliveryChannels } from "@/lib/agents/delivery-store";
import { FLOW_COLUMNS, MAX_FLOWS, RUN_COLUMNS, UUID } from "@/lib/automations/flow-access";
import { flowPrices, type FlowPrices } from "@/lib/automations/flow-pricing";
import type { UserAutomation } from "@/types/user-automation";
import { ownedProjectId } from "@/lib/projects/link-result";
import { COUNTED_STARTS, readMinutes } from "@/lib/automations/time-saved";

/** How many runs of the opened automation come with the page. */
const RUNS_SHOWN = 20;

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
};

/**
 * A COLUMN THE DATABASE DOES NOT HAVE YET: Postgres's undefined_column on
 * a read (42703), PostgREST's schema-cache miss on a write (PGRST204).
 * The migrations here are pasted by hand (CLAUDE.md), so both mean
 * "20261114000000 has not run", never "something failed".
 */
export function isColumnMissing(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

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
  timeSavedOn = false
): Promise<AutomationPageData> {
  const supabase = await createClient();
  const runId = runParam && UUID.test(runParam) ? runParam : null;
  const flowIdFromUrl = flowParam && UUID.test(flowParam) ? flowParam : null;
  const [flowsResult, olderResult, plan, packPrice, integrations, channels, projectId, minutesSaved] = await Promise.all([
    supabase.from("automation_flows").select(FLOW_COLUMNS).eq("user_id", user.id).order("created_at", { ascending: false }).limit(MAX_FLOWS),
    supabase.from("user_automations").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    resolveEffectivePlan(user),
    getPurchasedPackCreditPriceEur(user.id),
    listIntegrations(user.id),
    listDeliveryChannels(user.id),
    ownedProjectId(supabase, projectIdParam),
    timeSavedOn ? loadMinutesSaved(supabase, user.id) : Promise.resolve(null),
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
    minutesSaved,
    doneRuns,
  };
}
