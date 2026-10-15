import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { mergeUserMetadata } from "@/lib/auth/user-metadata";

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

    const supabase = await createClient();
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

    // THE REVOKE COMES FIRST, AND THAT ORDER IS THE FIX.
    //
    // WHAT WAS WRONG. The row was deleted first and the grant revoked
    // after, and BOTH failure paths of the revoke were a log line and
    // then `{ ok: true }`. So a failed getUserById, or a failed metadata
    // merge, produced: the member gone from the owner's list, the granted
    // tier still live on their account, and a green "Member removed"
    // toast over the top of it — components/team/team-members-list.tsx
    // decides by `data.ok`, which said yes. That is ΑΣ-1.7, "what the
    // team lends is taken back", re-opened through the one path nobody
    // looks at, and nothing could notice afterwards: the row that
    // recorded the grant had just been deleted.
    //
    // WHY REORDERING RATHER THAN JUST RETURNING 500. A 500 after the
    // delete tells the truth and leaves the owner no way to act on it: a
    // retry finds no row and answers 404, so the grant stays forever.
    // Revoking first makes the retry the repair — nothing has been
    // removed yet, so sending the same request again is exactly right.
    //
    // AND IF THE DELETE BELOW FAILS, the damage points the safe way:
    // access is already gone, the member is still listed, and a retry
    // removes the row. The revoke is idempotent — removing two keys that
    // are already absent is a no-op, and the subscription_tier patch
    // below only fires for an account with no grant and no Stripe
    // customer of its own.
    //
    // Only accepted members (member_user_id set) ever had a tier granted to
    // their account — a still-"invited" row never granted access to revoke.
    if (member.member_user_id) {
      const admin = createAdminClient();
      const { data: memberData, error: getUserError } = await admin.auth.admin.getUserById(
        member.member_user_id
      );

      if (getUserError || !memberData?.user) {
        logApiError("/api/team/remove", getUserError ?? new Error("member account not found"), {
          stage: "get_member_user",
        });
        return NextResponse.json(
          { ok: false, error: "Could not remove member. Please try again." },
          { status: 500 }
        );
      }

      // REVOKE THE GRANT. DO NOT TOUCH WHAT THEY PAY FOR.
      //
      // This used to write `subscription_tier = "free"` unconditionally —
      // over the member's OWN plan. Stripe was never told, so the card
      // kept being charged while the app treated them as a free user.
      // Removing someone from a team is not a billing action and must
      // not behave like one.
      // TWO REMOVED KEYS AND, SOMETIMES, ONE SET KEY — expressed as
      // exactly that, instead of as a whole rebuilt object. The old form
      // copied the member's entire metadata snapshot, deleted two keys
      // from the copy and wrote the copy back, so anything another writer
      // put there in between was dropped with it.
      const snapshot = memberData.user.user_metadata ?? {};

      // THE ACCOUNTS ALREADY DAMAGED by the old behaviour, handled here
      // rather than left to a migration nobody runs. Their own tier was
      // overwritten at accept time and cannot be recovered from metadata
      // — but a live Stripe subscription proves they are paying for
      // SOMETHING, and the tier is Stripe's to say. So it is left alone
      // and the next webhook corrects it. Only an account with no
      // subscription at all is put on Free, where it belongs.
      const paysForThemselves = Boolean(
        snapshot.stripe_subscription_id ?? snapshot.stripe_customer_id
      );
      const patch: Record<string, unknown> = {};
      if (!paysForThemselves && snapshot.team_granted_tier === undefined) {
        patch.subscription_tier = "free";
      }

      // Removal runs before the patch is merged (see the SQL), which is
      // what lets this drop team_granted_tier and set subscription_tier in
      // the same statement without one undoing the other.
      const merged = await mergeUserMetadata(member.member_user_id, patch, {
        remove: ["team_owner_id", "team_granted_tier"],
        context: "/api/team/remove",
      });
      if (!merged) {
        logApiError("/api/team/remove", new Error("merge_user_metadata failed"), {
          stage: "revoke_access",
        });
        return NextResponse.json(
          { ok: false, error: "Could not remove member. Please try again." },
          { status: 500 }
        );
      }
    }

    // THE SERVER'S WRITE (20261014000000_server_written_tables.sql): a
    // member leaves only through this route, so what the team granted is
    // always taken back above, before the row that records it goes.
    const { error: deleteError } = await createAdminClient()
      .from("team_members")
      .delete()
      .eq("id", memberId)
      .eq("owner_id", user.id);
    if (deleteError) {
      logApiError("/api/team/remove", deleteError, { stage: "delete" });
      return NextResponse.json(
        { ok: false, error: "Could not remove member. Please try again." },
        { status: 500 }
      );
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
