import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import type { SecurityCheckResourceType } from "@/lib/security-check-log";

export const dynamic = "force-dynamic";

const VALID_RESOURCE_TYPES: SecurityCheckResourceType[] = ["website", "mission_plan", "automation"];

// Read path for the AI Output Protection Layer's visible "Security
// checked" badge (components/security/security-checked-badge.tsx) —
// returns the single most recent check for one resource. RLS
// (select_own_security_check_log) already scopes this to the caller's
// own rows.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const resourceType = searchParams.get("resourceType");
    const resourceId = searchParams.get("resourceId");

    if (!resourceType || !resourceId || !VALID_RESOURCE_TYPES.includes(resourceType as SecurityCheckResourceType)) {
      return NextResponse.json({ ok: false, error: "Invalid resourceType or resourceId." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("security_check_log")
      .select("*")
      .eq("resource_type", resourceType)
      .eq("resource_id", resourceId)
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logApiError("/api/security-check-log", error);
      return NextResponse.json({ ok: false, error: "Could not load the security check." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, log: data });
  } catch (err) {
    logApiError("/api/security-check-log", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
