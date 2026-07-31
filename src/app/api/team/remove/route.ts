import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

// Removing a team member has to do two things, not one: drop the
// team_members row (what the UI shows) AND — if that member had actually
// accepted and joined (member_user_id is set) — reset THEIR OWN
// subscription_tier back to "free" and clear team_owner_id. Access is
// granted by copying the owner's tier onto the member's own user_metadata
// at accept time (see lib/team/accept-pending-invite.ts), not by looking
// team_members up live on every request — so deleting only the row (the
// old client-side-only implementation) left a removed member's copied
// tier in place, meaning they kept full paid access indefinitely. Only
// the admin (service-role) client can write another user's user_metadata,
// which is why this has to be a server route instead of a direct
// client-side delete.
export async function POST(request: Request) {
  try {
    let memberId: string;
    try {
      const body = await request.json();
      memberId = typeof body?.memberId === "string" ? body.memberId : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (!memberId) {
      return NextResponse.json({ ok: false, error: "Missing memberId." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // RLS (select_own_team_members: auth.uid() = owner_id) means this only
    // ever finds a row if the caller actually owns it — a stranger's id
    // simply comes back null, same "ownership via RLS" pattern used
    // elsewhere (e.g. api/chat's conversation lookup).
    const { data: member, error: lookupError } = await supabase
      .from("team_members")
      .select("id, member_user_id")
      .eq("id", memberId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (lookupError) {
      logApiError("/api/team/remove", lookupError, { stage: "lookup" });
      return NextResponse.json(
        { ok: false, error: "Could not remove member. Please try again." },
        { status: 500 }
      );
    }

    if (!member) {
      return NextResponse.json({ ok: false, error: "Member not found." }, { status: 404 });
    }

    const { error: deleteError } = await supabase.from("team_members").delete().eq("id", memberId);
    if (deleteError) {
      logApiError("/api/team/remove", deleteError, { stage: "delete" });
      return NextResponse.json(
        { ok: false, error: "Could not remove member. Please try again." },
        { status: 500 }
      );
    }

    // Only accepted members (member_user_id set) ever had a tier copied
    // onto their own account — a still-"invited" row never granted access
    // to revoke.
    if (member.member_user_id) {
      const admin = createAdminClient();
      const { data: memberData, error: getUserError } = await admin.auth.admin.getUserById(
        member.member_user_id
      );

      if (getUserError) {
        logApiError("/api/team/remove", getUserError, { stage: "get_member_user" });
      } else {
        const nextMetadata = { ...memberData.user.user_metadata };
        delete nextMetadata.team_owner_id;
        nextMetadata.subscription_tier = "free";

        const { error: revokeError } = await admin.auth.admin.updateUserById(member.member_user_id, {
          user_metadata: nextMetadata,
        });
        if (revokeError) {
          logApiError("/api/team/remove", revokeError, { stage: "revoke_access" });
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/team/remove", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
