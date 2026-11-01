import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";

export type AdminAction =
  | "view_users"
  | "view_user_detail"
  | "adjust_credits"
  | "refund"
  | "suspend_user"
  | "unsuspend_user"
  | "view_costs"
  | "toggle_flag"
  | "view_reported_content";

export async function logAdminAction(
  adminEmail: string,
  action: AdminAction | string,
  detail: Record<string, unknown> = {},
  targetUserId?: string | null,
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("admin_audit_log").insert({
      admin_email: adminEmail,
      action,
      target_user_id: targetUserId ?? null,
      detail,
    });
  } catch (err) {
    logApiError("admin:auditLog", err, { adminEmail, action });
  }
}

export type AuditLogEntry = {
  id: number;
  adminEmail: string;
  action: string;
  targetUserId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
};

export async function readAuditLog(options: {
  limit?: number;
  offset?: number;
  targetUserId?: string;
}): Promise<AuditLogEntry[]> {
  const admin = createAdminClient();
  let query = admin
    .from("admin_audit_log")
    .select("id, admin_email, action, target_user_id, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);

  if (options.offset) query = query.range(options.offset, options.offset + (options.limit ?? 50) - 1);
  if (options.targetUserId) query = query.eq("target_user_id", options.targetUserId);

  const { data, error } = await query;
  if (error) {
    logApiError("admin:readAuditLog", error);
    return [];
  }

  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: Number(r.id),
    adminEmail: String(r.admin_email ?? ""),
    action: String(r.action ?? ""),
    targetUserId: r.target_user_id ? String(r.target_user_id) : null,
    detail: (r.detail ?? {}) as Record<string, unknown>,
    createdAt: String(r.created_at),
  }));
}
