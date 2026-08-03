import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";

// AI Output Protection Layer — shared write path for security_check_log
// (see supabase_schema.sql). Every check this app runs (Website Builder's
// static scan + AI content-safety review, Mission Control's plan step-
// filtering, Automations' harmful-automation safety check) writes one row
// here, pass or fail, so the owner has an independent, Supabase-Table-
// Editor-visible record that these checks actually ran — not just an
// in-app badge claiming they did.
export type SecurityCheckResourceType = "website" | "mission_plan" | "automation";

export type SecurityCheckResult = {
  passed: boolean;
  checks: string[];
  issues: string[];
};

// Best-effort by design: a logging failure must never block or fail the
// actual generation/plan/automation it's recording — same "never let
// observability break the feature it observes" rule as every other
// logApiError call site in this app.
export async function logSecurityCheck(
  supabase: SupabaseClient,
  params: {
    userId: string;
    resourceType: SecurityCheckResourceType;
    resourceId: string;
    result: SecurityCheckResult;
  }
): Promise<void> {
  try {
    const { error } = await supabase.from("security_check_log").insert({
      user_id: params.userId,
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      check_result: params.result,
    });
    if (error) {
      logApiError("security-check-log:write", error, {
        resourceType: params.resourceType,
        resourceId: params.resourceId,
      });
    }
  } catch (err) {
    logApiError("security-check-log:write", err, {
      resourceType: params.resourceType,
      resourceId: params.resourceId,
    });
  }
}
