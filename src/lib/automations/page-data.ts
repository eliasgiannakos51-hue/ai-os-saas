import "server-only";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { getPurchasedPackCreditPriceEur, resolveEffectivePlan } from "@/lib/billing/credits";
import { listIntegrations } from "@/lib/integrations/store";
import { listDeliveryChannels } from "@/lib/agents/delivery-store";
import { FLOW_COLUMNS, MAX_FLOWS, RUN_COLUMNS, UUID } from "@/lib/automations/flow-access";
import { flowPrices, type FlowPrices } from "@/lib/automations/flow-pricing";
import type { UserAutomation } from "@/types/user-automation";
import { ownedProjectId } from "@/lib/projects/link-result";

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
};

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
  projectIdParam?: string
): Promise<AutomationPageData> {
  const supabase = await createClient();
  const runId = runParam && UUID.test(runParam) ? runParam : null;
  const flowIdFromUrl = flowParam && UUID.test(flowParam) ? flowParam : null;
  const [flowsResult, olderResult, plan, packPrice, integrations, channels, projectId] = await Promise.all([
    supabase.from("automation_flows").select(FLOW_COLUMNS).eq("user_id", user.id).order("created_at", { ascending: false }).limit(MAX_FLOWS),
    supabase.from("user_automations").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50),
    resolveEffectivePlan(user),
    getPurchasedPackCreditPriceEur(user.id),
    listIntegrations(user.id),
    listDeliveryChannels(user.id),
    ownedProjectId(supabase, projectIdParam),
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
  if (openId) {
    const { data } = await supabase
      .from("automation_runs")
      .select(RUN_COLUMNS)
      .eq("flow_id", openId)
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(RUNS_SHOWN);
    runs = (data ?? []) as Record<string, unknown>[];
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
  };
}
