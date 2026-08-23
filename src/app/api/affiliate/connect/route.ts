import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { getAffiliateForUser } from "@/lib/affiliate/store";
import { createOnboardingLink, refreshPayoutsEnabled } from "@/lib/affiliate/connect";

export const dynamic = "force-dynamic";

// POST — start (or resume) Stripe Connect onboarding.
// GET  — re-read from Stripe whether this account can actually be paid.
//
// The GET exists because the onboarding RETURN URL is not proof of
// anything: Stripe redirects back whether or not verification completed,
// and a user who abandons halfway still lands on the return URL. The only
// trustworthy answer comes from asking Stripe.
export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const limited = await checkRateLimit({
      scope: "affiliate_connect",
      identifier: user.id,
      maxAttempts: 10,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
    }

    const affiliate = await getAffiliateForUser(user.id);
    if (!affiliate) {
      return NextResponse.json({ ok: false, error: "Join the programme first." }, { status: 404 });
    }
    if (affiliate.status === "suspended") {
      return NextResponse.json({ ok: false, error: "This affiliate account is suspended." }, { status: 403 });
    }

    const link = await createOnboardingLink({ affiliate, email: user.email ?? null });
    if (!link.ok) {
      return NextResponse.json(
        { ok: false, error: "Could not start payout setup. Please try again." },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: true, url: link.url });
  } catch (err) {
    logApiError("/api/affiliate/connect", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }
    const affiliate = await getAffiliateForUser(user.id);
    if (!affiliate) {
      return NextResponse.json({ ok: false, error: "Join the programme first." }, { status: 404 });
    }
    const enabled = await refreshPayoutsEnabled(affiliate);
    return NextResponse.json({ ok: true, payoutsEnabled: enabled });
  } catch (err) {
    logApiError("/api/affiliate/connect", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
