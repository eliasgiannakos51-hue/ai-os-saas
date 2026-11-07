import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

/**
 * APPROVE OR REJECT A DRAFT. POST { decision: "approved" | "rejected" }.
 *
 * Owner only (404 for anybody else). This changes the draft's status and
 * decided_at and NOTHING ELSE: approving does not send, publish, merge or
 * schedule anything. Only a draft that is still `pending` can be decided,
 * so a second click cannot rewrite the first decision.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sign in." }, { status: 401 });
    if (!isAdminEmail(user.email)) return new NextResponse(null, { status: 404 });

    const { id } = await context.params;
    let decision: unknown;
    try {
      decision = ((await request.json()) as { decision?: unknown }).decision;
    } catch {
      decision = undefined;
    }
    if (decision !== "approved" && decision !== "rejected") {
      return NextResponse.json({ error: "decision must be approved or rejected." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("company_agent_drafts")
      .update({ status: decision, decided_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) {
      logApiError("/api/company-agents/drafts/[id]", error, { stage: "decide" });
      return NextResponse.json({ error: "Could not save the decision." }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "No pending draft with that id." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/company-agents/drafts/[id]", err, { stage: "post" });
    return NextResponse.json({ error: "Decision failed." }, { status: 500 });
  }
}
