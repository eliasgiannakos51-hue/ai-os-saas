import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { inviteExpired, isInviteDrivenSignup } from "@/lib/collaboration/collaboration";

export const dynamic = "force-dynamic";

/**
 * The ONE code path that turns an invite into access (V3 Task 11).
 *
 * project_collaborators has no insert policy at all, so membership can
 * only be created here, with the service role, after every check below
 * has passed. The checks are the contract the RLS design leans on — see
 * v3_collaboration_migration.sql's header:
 *
 *   1. The token matches a PENDING invite that has not expired.
 *   2. The accepting account's email is the address the invite named.
 *      A token is a credential that travels through an inbox; binding
 *      acceptance to the addressed account means a forwarded or leaked
 *      email cannot seat somebody else.
 *   3. The inviter still OWNS the mission — re-checked here, at accept
 *      time, not trusted from the row. This is what makes the invites
 *      table's permissive insert policy safe: a forged invite row
 *      pointing at somebody else's mission dies on this check.
 *   4. The claim is conditional (status = 'pending'), so a double click
 *      or a replay accepts once.
 *
 * This is also where the growth measurement happens: an invite whose
 * accepting account is YOUNGER than the invite is recorded as an
 * invite-driven signup.
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

    // Bounds token guessing far below the token's entropy making it
    // meaningful; mostly this stops a stuck client hammering the claim.
    const limited = await checkRateLimit({
      scope: "collab_accept",
      identifier: user.id,
      maxAttempts: 30,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    let token: string;
    try {
      const body = await request.json();
      token = typeof body?.token === "string" ? body.token.trim() : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }
    if (!token || token.length > 64) {
      return NextResponse.json({ ok: false, error: "Invalid invite link." }, { status: 400 });
    }

    // Admin client from here down: the invitee is, by definition, not
    // the owner the invites table's RLS admits.
    const admin = createAdminClient();
    const { data: invite, error: inviteError } = await admin
      .from("collaboration_invites")
      .select("id, project_id, owner_id, email, role, status, created_at")
      .eq("token", token)
      .maybeSingle();
    if (inviteError) {
      logApiError("/api/collaboration/accept", inviteError, { stage: "load_invite" });
      return NextResponse.json({ ok: false, error: "Could not check the invite." }, { status: 500 });
    }
    // Every dead-token shape gets the same answer, so the endpoint
    // cannot be used to distinguish revoked from never-existed.
    if (!invite || invite.status !== "pending" || inviteExpired(invite.created_at)) {
      return NextResponse.json(
        { ok: false, error: "This invite is no longer valid. Ask for a new one." },
        { status: 404 }
      );
    }

    if (invite.email !== user.email.toLowerCase()) {
      return NextResponse.json(
        { ok: false, error: "This invite was sent to a different email address." },
        { status: 403 }
      );
    }
    if (invite.owner_id === user.id) {
      return NextResponse.json({ ok: false, error: "You already own this project." }, { status: 400 });
    }

    // Check 3: the inviter must still own the mission NOW.
    const { data: mission, error: missionError } = await admin
      .from("ai_missions")
      .select("id, user_id, goal")
      .eq("id", invite.project_id)
      .maybeSingle();
    if (missionError) {
      logApiError("/api/collaboration/accept", missionError, { stage: "load_mission" });
      return NextResponse.json({ ok: false, error: "Could not load the project." }, { status: 500 });
    }
    if (!mission || mission.user_id !== invite.owner_id) {
      return NextResponse.json(
        { ok: false, error: "This invite is no longer valid. Ask for a new one." },
        { status: 404 }
      );
    }

    // Check 4: claim the invite BEFORE seating the member. Two racing
    // accepts both reach here; one wins this conditional update, the
    // loser stops. Claiming first also means a crash between claim and
    // seat burns the invite rather than leaving a re-runnable grant.
    const { data: claimed, error: claimError } = await admin
      .from("collaboration_invites")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        invited_user_id: user.id,
        signup_attributed: isInviteDrivenSignup({
          inviteCreatedAt: invite.created_at,
          accountCreatedAt: user.created_at,
        }),
      })
      .eq("id", invite.id)
      .eq("status", "pending")
      .select("id");
    if (claimError) {
      logApiError("/api/collaboration/accept", claimError, { stage: "claim" });
      return NextResponse.json({ ok: false, error: "Could not accept the invite." }, { status: 500 });
    }
    if (!claimed || claimed.length === 0) {
      return NextResponse.json(
        { ok: false, error: "This invite is no longer valid. Ask for a new one." },
        { status: 404 }
      );
    }

    const { error: seatError } = await admin.from("project_collaborators").insert({
      project_id: invite.project_id,
      owner_id: invite.owner_id,
      user_id: user.id,
      role: invite.role,
    });
    // A unique violation means they are already seated (an earlier
    // invite) — the accept still succeeded from the user's view.
    if (seatError && !/duplicate key|unique/i.test(seatError.message ?? "")) {
      logApiError("/api/collaboration/accept", seatError, { stage: "seat" });
      return NextResponse.json(
        { ok: false, error: "Could not join the project. Ask the owner to re-invite you." },
        { status: 500 }
      );
    }

    const { error: activityError } = await admin.from("collaboration_activity").insert({
      project_id: invite.project_id,
      actor_id: user.id,
      action: "joined",
      detail: user.email,
    });
    if (activityError) {
      logApiError("/api/collaboration/accept", activityError, { stage: "activity" });
    }

    return NextResponse.json({ ok: true, projectGoal: mission.goal ?? "" });
  } catch (err) {
    logApiError("/api/collaboration/accept", err, { stage: "unhandled" });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
