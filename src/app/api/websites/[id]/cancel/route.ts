import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { markStopRequested } from "@/lib/stop-requests";

export const dynamic = "force-dynamic";

/**
 * "Stop" for a website generation in flight. V4.6.
 *
 * The generation runs in api/websites/generate/process, a request the
 * browser deliberately does not wait on. This sets the flag that worker
 * polls every two seconds; it aborts the stream, counts the tokens that
 * were produced, settles for those, and marks the row failed with a
 * sentence that says so. Ownership is decided by a user-scoped read
 * (RLS), and only a row still pending or processing can be stopped.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const { data: site, error } = await supabase
      .from("user_websites")
      .select("id, status")
      .eq("id", params.id)
      .maybeSingle();
    if (error) {
      logApiError("/api/websites/[id]/cancel", error, { websiteId: params.id });
      return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
    }
    if (!site) return NextResponse.json({ ok: false, error: "Website not found." }, { status: 404 });
    if (site.status !== "pending" && site.status !== "processing") {
      return NextResponse.json({ ok: true, alreadyFinished: true, status: site.status });
    }

    const written = await markStopRequested(createAdminClient(), "user_websites", String(site.id));
    if (!written) return NextResponse.json({ ok: false, error: "Could not record the stop." }, { status: 500 });
    return NextResponse.json({ ok: true, stopRequested: true });
  } catch (err) {
    logApiError("/api/websites/[id]/cancel", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
