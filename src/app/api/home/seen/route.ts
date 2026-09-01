import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

/**
 * Stamp "the user has now seen the Home".
 *
 * WRITTEN AFTER THE RENDER, NOT DURING IT. The Home is a Server
 * Component; if it stamped the timestamp while computing the page, it
 * would overwrite the value it is diffing against and every visit would
 * report nothing changed. So the page READS, and the client POSTs here
 * once it has been shown.
 *
 * Through the caller's own client, so RLS scopes the update — and with
 * an explicit user_id filter as well, for the reason lib/user-context.ts
 * spells out.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const { error } = await supabase
      .from("user_onboarding")
      .update({ home_seen_at: new Date().toISOString() })
      .eq("user_id", user.id);

    if (error) {
      // NOT AN ERROR THE USER SHOULD SEE. Failing to stamp the visit
      // means tomorrow's "what changed" covers two days instead of one,
      // which is worse than nothing and better than an error toast on a
      // page that rendered fine.
      logApiError("/api/home/seen", error, { stage: "stamp" });
      return NextResponse.json({ ok: false }, { status: 200 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/home/seen", err);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
