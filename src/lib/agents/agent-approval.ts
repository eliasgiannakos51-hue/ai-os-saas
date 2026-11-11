import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";

/**
 * AGENT APPROVAL — «έγκριση πριν ό,τι δεν αναιρείται» (AG1 Κ3).
 *
 * When an agent is about to do something irreversible — send an email,
 * publish a site, delete data, spend above a threshold — it pauses and
 * asks for approval. The user sees the pending approval in their
 * dashboard and can approve, deny, or modify the action.
 *
 * THREE KINDS OF ACTION THAT NEED APPROVAL:
 * 1. SEND — anything that leaves the system (email, Slack, push, post)
 * 2. PUBLISH — making something public (site, app, social post)
 * 3. SPEND — any action costing more than the agent's per-action threshold
 *
 * THE APPROVAL IS STORED, NOT CACHED. A crashed server picks up where
 * it left off. An approved action that is not performed within 24 hours
 * expires — the world may have changed.
 *
 * THE USER CAN SET WHICH ACTIONS NEED APPROVAL PER AGENT. By default,
 * all three kinds need approval. A user who trusts an agent fully can
 * turn approval off for one or all kinds, per agent.
 */

export type ApprovalKind = "send" | "publish" | "spend";
export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";

export type AgentApproval = {
  id: string;
  agent_id: string;
  run_id: string;
  user_id: string;
  kind: ApprovalKind;
  action_description: string;
  action_data: Record<string, unknown>;
  status: ApprovalStatus;
  decided_at: string | null;
  expires_at: string;
  created_at: string;
};

export const APPROVAL_KINDS: ApprovalKind[] = ["send", "publish", "spend"];
export const APPROVAL_TTL_HOURS = 24;

/**
 * Request approval for an action. Returns the approval id.
 * The agent pauses after this call and resumes when the user decides.
 */
export async function requestApproval(params: {
  agentId: string;
  runId: string;
  userId: string;
  kind: ApprovalKind;
  actionDescription: string;
  actionData?: Record<string, unknown>;
}): Promise<{ ok: true; approvalId: string } | { ok: false; reason: string }> {
  try {
    const admin = createAdminClient();
    const expiresAt = new Date(Date.now() + APPROVAL_TTL_HOURS * 60 * 60 * 1000).toISOString();

    const { data, error } = await admin
      .from("agent_approvals")
      .insert({
        agent_id: params.agentId,
        run_id: params.runId,
        user_id: params.userId,
        kind: params.kind,
        action_description: params.actionDescription,
        action_data: params.actionData ?? {},
        status: "pending",
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (error) {
      logApiError("agent-approval:request", error, { stage: "store", agentId: params.agentId });
      return { ok: false, reason: "store_failed" };
    }
    return { ok: true, approvalId: data.id };
  } catch (err) {
    logApiError("agent-approval:request", err, { stage: "request", agentId: params.agentId });
    return { ok: false, reason: "internal" };
  }
}

/**
 * Decide on a pending approval.
 */
export async function decideApproval(
  userId: string,
  approvalId: string,
  decision: "approved" | "denied"
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("agent_approvals")
      .update({
        status: decision,
        decided_at: new Date().toISOString(),
      })
      .eq("id", approvalId)
      .eq("user_id", userId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (error) {
      logApiError("agent-approval:decide", error, { approvalId, decision });
      return { ok: false, reason: "update_failed" };
    }
    if (!data) return { ok: false, reason: "not_found_or_already_decided" };
    return { ok: true };
  } catch (err) {
    logApiError("agent-approval:decide", err, { approvalId });
    return { ok: false, reason: "internal" };
  }
}

/**
 * List pending approvals for a user.
 */
export async function listPendingApprovals(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<AgentApproval[]> {
  const { data, error } = await admin
    .from("agent_approvals")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    logApiError("agent-approval:list", error, { userId });
    return [];
  }
  return data ?? [];
}

/**
 * Check if an agent needs approval for a given kind.
 * Reads from the agent's settings (user_agents.approval_settings).
 */
export function needsApproval(
  approvalSettings: Record<string, boolean> | null,
  kind: ApprovalKind
): boolean {
  // Default: all kinds need approval.
  if (!approvalSettings) return true;
  // If the setting for this kind is explicitly false, no approval needed.
  return approvalSettings[kind] !== false;
}
