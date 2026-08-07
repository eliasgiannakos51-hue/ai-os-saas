import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import {
  MAX_COLLABORATORS_PER_PROJECT,
  isCollaboratorRole,
  normaliseInviteEmail,
} from "@/lib/collaboration/collaboration";
import { sendCollaborationInviteEmail } from "@/lib/email/send-collaboration-invite-email";

export const dynamic = "force-dynamic";

/**
 * Invite an independent account to one mission (V3 Task 11).
 *
 * Everything here runs through the CALLER'S client: the ownership check
 * is a select that RLS would empty for a non-owner, and the invite
 * insert is allowed only because the insert policy requires owner_id =
 * auth.uid(). The service role appears nowhere in this route — minting
 * access is the accept route's job, and even there only after the token
 * round-trip proves consent.
 */
export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // Sends an email per accepted call — the same cost team/invite caps.
    const limited = await checkRateLimit({
      scope: "collab_invite",
      identifier: user.id,
      maxAttempts: 20,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many invites in the last hour. Please try again later." },
        { status: 429 }
      );
    }

    let projectId: string;
    let email: string | null;
    let role: unknown;
    try {
      const body = await request.json();
      projectId = typeof body?.projectId === "string" ? body.projectId : "";
      email = normaliseInviteEmail(body?.email);
      role = body?.role;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (!projectId || !email) {
      return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
    }
    if (!isCollaboratorRole(role)) {
      return NextResponse.json({ ok: false, error: "Choose a role for the invite." }, { status: 400 });
    }
    if (email === user.email.toLowerCase()) {
      return NextResponse.json({ ok: false, error: "You already own this project." }, { status: 400 });
    }

    // Ownership as a filter, miss as 404 — never a 403 that confirms the
    // id exists (same rule as presentations).
    const { data: mission, error: missionError } = await supabase
      .from("ai_missions")
      .select("id, goal, user_id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (missionError) {
      logApiError("/api/collaboration/invites", missionError, { stage: "load_mission" });
      return NextResponse.json({ ok: false, error: "Could not load the project." }, { status: 500 });
    }
    if (!mission) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }

    // The seat count bounds ACCESS (members + open doors to it). Both
    // counts fail closed: refusing an invite over a count error is
    // recoverable, over-granting is not.
    const [{ count: memberCount, error: memberError }, { count: pendingCount, error: pendingError }] =
      await Promise.all([
        supabase
          .from("project_collaborators")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId),
        supabase
          .from("collaboration_invites")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId)
          .eq("status", "pending"),
      ]);
    if (memberError || pendingError || memberCount === null || pendingCount === null) {
      logApiError("/api/collaboration/invites", memberError ?? pendingError, { stage: "count" });
      return NextResponse.json(
        { ok: false, error: "Could not check the project's collaborator count." },
        { status: 503 }
      );
    }
    if (memberCount + pendingCount >= MAX_COLLABORATORS_PER_PROJECT) {
      return NextResponse.json(
        {
          ok: false,
          error: `A project can have up to ${MAX_COLLABORATORS_PER_PROJECT} collaborators. Revoke one (or a pending invite) to add another.`,
        },
        { status: 403 }
      );
    }

    // One live invite per address per project. Checked here for a clear
    // message; the accept route's conditional claim is what makes the
    // race harmless rather than this check.
    const { data: existing } = await supabase
      .from("collaboration_invites")
      .select("id")
      .eq("project_id", projectId)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { ok: false, error: "That address already has a pending invite to this project." },
        { status: 409 }
      );
    }

    // A credential, not an id — same entropy as the presentation share
    // token.
    const token = randomBytes(16).toString("hex");

    const { data: invite, error: insertError } = await supabase
      .from("collaboration_invites")
      .insert({
        project_id: projectId,
        owner_id: user.id,
        email,
        role,
        token,
      })
      .select("id, email, role, status, created_at")
      .single();
    if (insertError || !invite) {
      logApiError("/api/collaboration/invites", insertError, { stage: "insert" });
      return NextResponse.json({ ok: false, error: "Could not create the invite." }, { status: 500 });
    }

    // Best-effort beyond this point: the invite exists, the email and the
    // activity line are conveniences.
    await sendCollaborationInviteEmail({
      to: email,
      inviterEmail: user.email,
      projectGoal: mission.goal ?? "",
      role,
      token,
    });
    const { error: activityError } = await supabase.from("collaboration_activity").insert({
      project_id: projectId,
      actor_id: user.id,
      action: "invited",
      detail: email,
    });
    if (activityError) {
      logApiError("/api/collaboration/invites", activityError, { stage: "activity" });
    }

    return NextResponse.json({ ok: true, invite });
  } catch (err) {
    logApiError("/api/collaboration/invites", err, { stage: "unhandled" });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
