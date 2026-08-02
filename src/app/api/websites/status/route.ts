import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

// Website Builder — job POLLING endpoint. The client hits this every
// 2-3 seconds (website-builder-workspace.tsx) for any website still in
// status "pending"/"processing", instead of holding one long-lived
// request open for the whole generation — each poll is a single, cheap,
// fast row read, so it can never itself time out the way one giant
// blocking request could. Also what a page reload uses to pick a
// still-processing generation back up without the user doing anything.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // RLS (select_own_user_websites) scopes this to the caller's own
    // row — a stranger's id simply won't be found.
    const { data: record, error } = await supabase
      .from("user_websites")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      logApiError("/api/websites/status", error, { stage: "select" });
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!record) {
      return NextResponse.json({ ok: false, error: "Website not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true, record });
  } catch (err) {
    logApiError("/api/websites/status", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
