import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MAX_TITLE_CHARS = 120;
const MIN_TITLE_CHARS = 8;
const MAX_DESCRIPTION_CHARS = 2000;
// The spec's number: 5 new requests per user per day. Enough for anyone
// with real ideas, useless for flooding the board.
const MAX_REQUESTS_PER_DAY = 5;

/**
 * The community roadmap's data (V3 Task 13). GET is public-friendly —
 * signed-out visitors see the same list the RLS policy makes public;
 * signed-in visitors additionally get which ones THEY voted for.
 */
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: requests, error } = await supabase
      .from("feature_requests")
      .select("id, title, description, status, votes, created_at")
      .order("votes", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      logApiError("/api/feature-requests", error, { stage: "list" });
      return NextResponse.json({ ok: false, error: "Could not load requests." }, { status: 500 });
    }

    let votedIds: string[] = [];
    if (user) {
      const { data: votes } = await supabase
        .from("feature_request_votes")
        .select("request_id")
        .eq("user_id", user.id);
      votedIds = (votes ?? []).map((v) => v.request_id);
    }

    return NextResponse.json({ ok: true, requests: requests ?? [], votedIds });
  } catch (err) {
    logApiError("/api/feature-requests", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

/** Submit a request. Authenticated, validated, 5/day. */
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
      scope: "feature_request_create",
      identifier: user.id,
      maxAttempts: MAX_REQUESTS_PER_DAY,
      windowMinutes: 24 * 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "You've submitted a lot today — please come back tomorrow." },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const title = typeof body?.title === "string" ? body.title.trim().slice(0, MAX_TITLE_CHARS) : "";
    const description =
      typeof body?.description === "string" ? body.description.trim().slice(0, MAX_DESCRIPTION_CHARS) : "";

    if (title.length < MIN_TITLE_CHARS) {
      return NextResponse.json(
        { ok: false, error: "Give the request a short, specific title." },
        { status: 400 }
      );
    }

    const { data: created, error } = await supabase
      .from("feature_requests")
      .insert({ user_id: user.id, title, description })
      .select("id, title, description, status, votes, created_at")
      .single();

    if (error) {
      logApiError("/api/feature-requests", error, { stage: "insert" });
      return NextResponse.json({ ok: false, error: "Could not submit that." }, { status: 500 });
    }

    // The author's implicit upvote — a request always starts at 1, which
    // is also what stops "0 votes" from reading as "nobody wants this"
    // the moment it is posted.
    await supabase.from("feature_request_votes").insert({ user_id: user.id, request_id: created.id });

    return NextResponse.json({ ok: true, request: { ...created, votes: created.votes + 1 } });
  } catch (err) {
    logApiError("/api/feature-requests", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
