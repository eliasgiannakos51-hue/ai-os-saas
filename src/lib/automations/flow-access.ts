import "server-only";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { getPurchasedPackCreditPriceEur, resolveEffectivePlan } from "@/lib/billing/credits";
import type { Plan } from "@/lib/billing/plans";
import { isFeatureOn } from "@/lib/flags/flags";
import { isValidTimeZone, nextRunAt } from "@/lib/agents/cron-expression";
import { listIntegrations } from "@/lib/integrations/store";
import { providersOpenTo } from "@/lib/integrations/switches";
import { listDeliveryChannels } from "@/lib/agents/delivery-store";
import { connectionsNeeded, cronFor, type Box, type StartBox } from "@/lib/automations/boxes";

/**
 * WHAT THE AUTOMATION ROUTES SHARE (MASTER 16, package 30), and nothing
 * that reaches a model: the routes that only read, switch on, undo or
 * delete import this and not lib/automations/builder.ts or runner.ts, so
 * they are not counted as spending (scripts/tests/route-spend-inventory.test.mjs).
 *
 * EACH ROUTE STILL SAYS WHO IS ASKING AND WHOSE ROW IT IS, in its own
 * file — auth.getUser() and `.eq("user_id", user.id)` where the gates read
 * them, as for the image routes (lib/images/image-access.ts).
 *
 * THE PLAN. Automations are on every plan and charged in credits, as the
 * one-sentence automations were (feature-catalog.ts, "automation"); the
 * switch decides who sees the boxes, not who may pay for them.
 */
export function refuse(code: string, status: number, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ ok: false, code, ...extra }, { status });
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One person's automations at most; each one that is on runs on its own schedule. */
export const MAX_FLOWS = 20;
export const MAX_ACTIVE_FLOWS = 10;
/** What one sentence may be. */
export const MAX_SAID_CHARS = 2000;

export const FLOW_COLUMNS = "id, name, said, boxes, version, is_active, time_zone, next_run_at, last_run_at, cost_limit, busy_since, created_at";
export const RUN_COLUMNS = "id, flow_id, started_by, status, steps, state, credits_charged, error, approval_expires_at, started_at, finished_at";

export type FlowRecord = {
  id: string;
  name: string;
  said: string;
  boxes: unknown;
  version: number;
  is_active: boolean;
  time_zone: string;
  next_run_at: string | null;
  last_run_at: string | null;
  cost_limit: number;
  busy_since: string | null;
  created_at: string;
};

export type FlowGate = { plan: Plan | null; packPriceEur: number | null; isAdmin: boolean };

/** The switch, for a signed-in person, and the plan the price is worked out on. */
export async function flowGate(user: User): Promise<FlowGate | NextResponse> {
  if (!(await isFeatureOn("automations", user))) return refuse("not_enabled", 403);
  const plan = await resolveEffectivePlan(user);
  return { plan, packPriceEur: await getPurchasedPackCreditPriceEur(user.id), isAdmin: isAdminEmail(user.email) };
}

/** The zone the browser said, if it is one; Athens otherwise, as the table's default. */
export function readTimeZone(raw: unknown): string {
  return typeof raw === "string" && raw.length <= 64 && isValidTimeZone(raw) ? raw : "Europe/Athens";
}

/** When a time automation runs next, after `from`. Null for one a file starts. */
export function nextRunFor(boxes: Box[], timeZone: string, from = new Date()): string | null {
  const start = boxes[0] as StartBox | undefined;
  if (!start || start.kind !== "start") return null;
  const cron = cronFor(start);
  if (!cron) return null;
  return nextRunAt(cron, from, timeZone)?.toISOString() ?? null;
}

/**
 * WHAT IS NOT CONNECTED YET, of what the boxes need. An automation that
 * reads a calendar nobody connected, or sends to a Telegram that is not
 * set up, is not switched on: it would fail at its first run, unseen.
 *
 * The calendar counts as connected only while the switch "connections"
 * is open to this person (lib/integrations/switches.ts): the switch that
 * takes the calendar off the page takes it out of the automations too.
 */
export async function missingConnections(user: { id: string; email?: string | null }, boxes: Box[]): Promise<("google_calendar" | "telegram")[]> {
  const needs = connectionsNeeded(boxes);
  if (needs.length === 0) return [];
  const calendar = needs.includes("google_calendar");
  const [integrations, channels, open] = await Promise.all([
    calendar ? listIntegrations(user.id) : Promise.resolve([]),
    needs.includes("telegram") ? listDeliveryChannels(user.id) : Promise.resolve([]),
    calendar ? providersOpenTo(user) : Promise.resolve(new Set<string>()),
  ]);
  return needs.filter((need) =>
    need === "google_calendar"
      ? !open.has("google_calendar") || !integrations.some((i) => i.provider === "google_calendar" && i.status === "connected")
      : !channels.some((c) => c.channel === "telegram")
  );
}

/** A claim older than this belonged to a request that died. */
const STALE_CLAIM_MINUTES = 10;

/**
 * ONE THING AT A TIME ON ONE AUTOMATION: a change with words, a run, a
 * dry run. The claim is the row's busy_since, taken only when it is free
 * or stale, and given back in a finally.
 */
export async function claimFlow(flowId: string, userId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - STALE_CLAIM_MINUTES * 60_000).toISOString();
  const { data, error } = await createAdminClient()
    .from("automation_flows")
    .update({ busy_since: new Date().toISOString() })
    .eq("id", flowId)
    .eq("user_id", userId)
    .or(`busy_since.is.null,busy_since.lt.${cutoff}`)
    .select("id");
  if (error) {
    logApiError("automations:claim", error, { flowId });
    return false;
  }
  return Array.isArray(data) && data.length === 1;
}

export async function releaseFlow(flowId: string, userId: string): Promise<void> {
  const { error } = await createAdminClient().from("automation_flows").update({ busy_since: null }).eq("id", flowId).eq("user_id", userId);
  if (error) logApiError("automations:release", error, { flowId });
}

/**
 * A NEW SET OF BOXES, AND THE VERSION THAT REMEMBERS IT.
 *
 * THE VERSIONS ARE AN UNDO STACK, as in any editor: automation_flows.version
 * is the one showing; «Αναίρεση» moves it down one (api/automations/flows/
 * [id]/undo); a change after an undo replaces what had been undone, so the
 * versions above the one showing are cleared before the new one is written.
 * Undoing twice therefore goes back two, never forward again.
 *
 * The version row first: if it cannot be written the flow keeps the boxes
 * it had, so «Αναίρεση» always has the row it goes back to.
 */
export async function saveVersion(params: { flowId: string; userId: string; version: number; boxes: Box[]; said: string; extra?: Record<string, unknown> }): Promise<boolean> {
  const admin = createAdminClient();
  const { error: clearError } = await admin
    .from("automation_flow_versions")
    .delete()
    .eq("flow_id", params.flowId)
    .eq("user_id", params.userId)
    .gte("version", params.version);
  if (clearError) {
    logApiError("automations:version", clearError, { flowId: params.flowId, stage: "clear" });
    return false;
  }
  const { error: versionError } = await admin
    .from("automation_flow_versions")
    .insert({ flow_id: params.flowId, user_id: params.userId, version: params.version, boxes: params.boxes, said: params.said.slice(0, MAX_SAID_CHARS) });
  if (versionError) {
    logApiError("automations:version", versionError, { flowId: params.flowId, version: params.version });
    return false;
  }
  const { error } = await admin
    .from("automation_flows")
    .update({ boxes: params.boxes, version: params.version, ...(params.extra ?? {}) })
    .eq("id", params.flowId)
    .eq("user_id", params.userId);
  if (error) {
    logApiError("automations:version", error, { flowId: params.flowId, stage: "flow" });
    return false;
  }
  return true;
}

/**
 * WHAT A CHANGE OF BOXES DOES TO AN AUTOMATION THAT IS ON. Its next run
 * follows the new start box; and if the new boxes need a connection that
 * is not there, it goes off — and the answer says so — rather than stay
 * on and fail at its next run.
 */
export async function scheduleAfterChange(
  user: { id: string; email?: string | null },
  flow: { is_active: boolean; time_zone: string },
  boxes: Box[]
): Promise<{ patch: Record<string, unknown>; paused: ("google_calendar" | "telegram")[] }> {
  if (!flow.is_active) return { patch: {}, paused: [] };
  const missing = await missingConnections(user, boxes);
  if (missing.length > 0) return { patch: { is_active: false, next_run_at: null }, paused: missing };
  return { patch: { next_run_at: nextRunFor(boxes, flow.time_zone) }, paused: [] };
}
