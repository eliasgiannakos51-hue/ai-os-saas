import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlan } from "@/lib/billing/plans";
import { sendTeamInviteEmail } from "@/lib/email/send-team-invite-email";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/admin";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    let email: string;
    try {
      const body = await request.json();
      email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { ok: false, error: "Enter a valid email address." },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // Admin-listed accounts (see lib/admin.ts) get full Enterprise-tier
    // access, including team invites, without a real Stripe subscription.
    const isAdmin = isAdminEmail(user.email);
    const tier = isAdmin ? "enterprise" : (user.user_metadata?.subscription_tier as string | undefined);
    const ownsSubscription = isAdmin || Boolean(user.user_metadata?.stripe_subscription_id);
    // Team collaboration is a Professional+ capability (see
    // lib/billing/plans.ts's PlanCapabilities.teamCollaboration).
    if (!ownsSubscription || !tier || !getPlan(tier)?.capabilities.teamCollaboration) {
      return NextResponse.json(
        { ok: false, error: "Team invites require the Professional plan or higher." },
        { status: 403 }
      );
    }

    if (email === user.email?.toLowerCase()) {
      return NextResponse.json(
        { ok: false, error: "You can't invite yourself." },
        { status: 400 }
      );
    }

    const { error: insertError } = await supabase
      .from("team_members")
      .insert({ owner_id: user.id, member_email: email });

    if (insertError) {
      // Unique violation on (owner_id, member_email) — already invited.
      if (insertError.code === "23505") {
        return NextResponse.json(
          { ok: false, error: "You've already invited this email." },
          { status: 409 }
        );
      }
      logApiError("/api/team/invite", insertError, { stage: "insert" });
      return NextResponse.json(
        { ok: false, error: "Could not save the invite." },
        { status: 500 }
      );
    }

    const plan = getPlan(tier);
    await sendTeamInviteEmail({
      to: email,
      inviterEmail: user.email ?? "a Veron AI user",
      planName: plan?.name ?? tier,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/team/invite", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
