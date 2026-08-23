import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

// Removing a team member has to do two things, not one: drop the
// team_members row (what the UI shows) AND — if that member had actually
// accepted and joined (member_user_id is set) — revoke the tier the owner
// lent them. Access is granted by writing the owner's tier onto the
// member's own user_metadata at accept time (see
// lib/team/accept-pending-invite.ts), not by looking team_members up live
// on every request — so deleting only the row (the old client-side-only
// implementation) left the granted tier in place and a removed member kept
// full paid access indefinitely.
//
// THE GRANT IS ITS OWN FIELD, and that is the correction this file needed.
// It used to be written over `subscription_tier` and reset here to a
// hardcoded "free" — over whatever the member paid for themselves. Stripe
// was never told, so the card kept being charged while the app treated
// them as free. Removing someone from a team is not a billing action.
// `team_granted_tier` is what is revoked; `subscription_tier` is theirs and
// is left alone.
//
// Only the admin (service-role) client can write another user's
// user_metadata, which is why this has to be a server route rather than a
// direct client-side delete.

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

    // Only accepted members (member_user_id set) ever had a tier granted to
    // their account — a still-"invited" row never granted access to revoke.
    if (member.member_user_id) {
      const admin = createAdminClient();
      const { data: memberData, error: getUserError } = await admin.auth.admin.getUserById(
        member.member_user_id
      );

      if (getUserError) {
        logApiError("/api/team/remove", getUserError, { stage: "get_member_user" });
      } else {
        // REVOKE THE GRANT. DO NOT TOUCH WHAT THEY PAY FOR.
        //
        // This used to write `subscription_tier = "free"` unconditionally —
        // over the member's OWN plan. Stripe was never told, so the card
        // kept being charged while the app treated them as a free user.
        // Removing someone from a team is not a billing action and must
        // not behave like one.
        const nextMetadata = { ...memberData.user.user_metadata };
        delete nextMetadata.team_owner_id;
        delete nextMetadata.team_granted_tier;

        // THE ACCOUNTS ALREADY DAMAGED by the old behaviour, handled here
        // rather than left to a migration nobody runs. Their own tier was
        // overwritten at accept time and cannot be recovered from metadata
        // — but a live Stripe subscription proves they are paying for
        // SOMETHING, and the tier is Stripe's to say. So it is left alone
        // and the next webhook corrects it. Only an account with no
        // subscription at all is put on Free, where it belongs.
        const paysForThemselves = Boolean(
          nextMetadata.stripe_subscription_id ?? nextMetadata.stripe_customer_id
        );
        if (!paysForThemselves && memberData.user.user_metadata?.team_granted_tier === undefined) {
          nextMetadata.subscription_tier = "free";
        }

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
