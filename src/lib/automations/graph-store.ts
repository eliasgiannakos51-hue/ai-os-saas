import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { isColumnMissing } from "@/lib/automations/flow-access";
import { readEdges, type Box } from "@/lib/automations/boxes";
import { reconcileEdges } from "@/lib/automations/graph-edit";

/**
 * THE CONNECTIONS OF ONE AUTOMATION (automation_flows.edges, 20261126000000),
 * read in a query OF ITS OWN and never in FLOW_COLUMNS: until the migration
 * is pasted the column is not there, and a select that names it fails whole
 * — which in FLOW_COLUMNS would empty the screen of every automation. A
 * missing column, or any read problem, answers null, and null means "a plain
 * chain": the flow runs and draws as it always did.
 */
export async function loadGraphColumns(flowId: string, userId: string): Promise<{ edges: unknown; layout: unknown } | null> {
  const { data, error } = await createAdminClient().from("automation_flows").select("edges, layout").eq("id", flowId).eq("user_id", userId).maybeSingle();
  if (error) {
    if (!isColumnMissing(error)) logApiError("automations:graph", error, { stage: "columns", flowId });
    return null;
  }
  const row = data as { edges?: unknown; layout?: unknown } | null;
  return row ? { edges: row.edges ?? null, layout: row.layout ?? null } : null;
}

export async function loadEdges(flowId: string, userId: string): Promise<unknown> {
  return (await loadGraphColumns(flowId, userId))?.edges ?? null;
}

/** A flow row for the screen with its connections and positions added, so the canvas that just saved them keeps them. */
export async function withGraph<T extends object>(row: T | null, flowId: string, userId: string): Promise<T | null> {
  if (!row) return row;
  const graph = await loadGraphColumns(flowId, userId);
  return graph ? { ...row, ...graph } : row;
}

/**
 * THE BOXES CHANGED (a person edited, undid, or asked in words): the
 * connections they drew follow (graph-edit.ts reconcileEdges). A flow with
 * no stored connections is a plain chain and has nothing to follow.
 */
export async function reconcileStoredEdges(flowId: string, userId: string, before: readonly Box[], after: readonly Box[]): Promise<void> {
  const stored = readEdges(await loadEdges(flowId, userId));
  if (!stored) return;
  const kept = reconcileEdges(before.map((b) => b.id), after.map((b) => b.id), stored);
  const { error } = await createAdminClient().from("automation_flows").update({ edges: kept.length > 0 ? kept : null }).eq("id", flowId).eq("user_id", userId);
  if (error) logApiError("automations:graph", error, { stage: "reconcile", flowId });
}
