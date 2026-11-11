import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { listPendingApprovals, decideApproval } from "@/lib/agents/agent-approval";

/**
 * GET  /api/agents/approvals — list pending approvals for the user.
 * POST /api/agents/approvals — approve or deny a pending approval.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const admin = createAdminClient();
    const approvals = await listPendingApprovals(admin, user.id);
    return NextResponse.json({ approvals });
  } catch (err) {
    logApiError("api/agents/approvals:GET", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const body = await req.json();
    const { approvalId, decision } = body;

    if (!approvalId || typeof approvalId !== "string") {
      return NextResponse.json({ error: "approval_id_required" }, { status: 400 });
    }
    if (decision !== "approved" && decision !== "denied") {
      return NextResponse.json({ error: "invalid_decision" }, { status: 400 });
    }

    const result = await decideApproval(user.id, approvalId, decision);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("api/agents/approvals:POST", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
