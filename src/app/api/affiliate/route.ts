import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { ensureAffiliate } from "@/lib/affiliate/store";

export const dynamic = "force-dynamic";

// Joining the programme.
//
// Idempotent: pressing "Join" twice, or double-clicking it, returns the
// same affiliate row rather than a second code. ensureAffiliate handles
// the race at the database level (unique on user_id), so two concurrent
// requests cannot produce two accounts for one person.
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
      scope: "affiliate_join",
      identifier: user.id,
      maxAttempts: 10,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
    }

    const affiliate = await ensureAffiliate(user.id);
    if (!affiliate) {
      return NextResponse.json(
        { ok: false, error: "Could not create your affiliate account. Please try again." },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true, code: affiliate.code });
  } catch (err) {
    logApiError("/api/affiliate", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
