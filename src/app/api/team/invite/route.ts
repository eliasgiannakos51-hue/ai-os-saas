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
    let role: string;
    try {
      const body = await request.json();
      email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      role = typeof body?.role === "string" ? body.role.trim().slice(0, 100) : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { ok: false, error: "Enter a valid email address." },
        { status: 400 }
      );
    }

    // Required — see invite-form.tsx's work-use disclaimer shown right
    // above this field: naming a real role/position is the (non-technical)
    // confirmation that the seat is for actual team work, not personal use.
    if (!role) {
      return NextResponse.json(
        { ok: false, error: "Please select what this person does on your team." },
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
    const plan = getPlan(tier ?? "");
    if (!ownsSubscription || !tier || !plan?.capabilities.teamCollaboration) {
      return NextResponse.json(
        { ok: false, error: "Team invites require the Professional plan or higher." },
        { status: 403 }
      );
    }

    // Professional pays €20/member/month as a real Stripe subscription
    // line item (see api/checkout's team-seat item, api/webhooks/stripe
    // which writes the paid quantity to user_metadata.seat_count). Without
    // this check, nothing server-side stopped an account from calling this
    // route past however many seats were actually purchased — a real,
    // repeatable free-seat bypass. Ultimate/Enterprise (teamSeatsIncluded)
    // have no per-seat charge at all, so they're exempt entirely (isAdmin
    // is granted Enterprise-equivalent access above and is exempt too).
    if (!isAdmin && !plan.teamSeatsIncluded) {
      const seatCount = typeof user.user_metadata?.seat_count === "number" ? user.user_metadata.seat_count : 0;
      const { count: activeMemberCount, error: countError } = await supabase
        .from("team_members")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", user.id);
      if (countError) {
        logApiError("/api/team/invite", countError, { stage: "count_seats" });
        return NextResponse.json({ ok: false, error: "Could not verify seat availability." }, { status: 500 });
      }
      if ((activeMemberCount ?? 0) >= seatCount) {
        return NextResponse.json(
          {
            ok: false,
            error:
              seatCount === 0
                ? "Add a paid team seat (+€20/member/month) in Settings before inviting anyone."
                : `You've used all ${seatCount} purchased team seat${seatCount === 1 ? "" : "s"}. Add another seat in Settings to invite more people.`,
          },
          { status: 403 }
        );
      }
    }

    if (email === user.email?.toLowerCase()) {
      return NextResponse.json(
        { ok: false, error: "You can't invite yourself." },
        { status: 400 }
      );
    }

    const { error: insertError } = await supabase
      .from("team_members")
      .insert({ owner_id: user.id, member_email: email, role });

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

    await sendTeamInviteEmail({
      to: email,
      inviterEmail: user.email ?? "a Ionexa AI user",
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
