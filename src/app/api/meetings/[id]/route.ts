import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60; // @function-limit 60

/**
 * THE WAY OUT.
 *
 * The audio was never kept, but the TRANSCRIPT is — and a transcript is
 * what the people in the room actually said, which is the thing they
 * would most want gone. A feature that makes a careful promise about the
 * recording and then offers no way to remove the words is making half a
 * promise.
 *
 * The delete goes through the user's own session client, so the row's RLS
 * policy is what decides whether it is theirs; `meeting_actions` has
 * `on delete cascade` on meeting_id, so the actions kept from it go with
 * it in the same statement rather than being left as orphans pointing at
 * a meeting that no longer exists.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, code: "unauthenticated" },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from("meetings")
      .delete()
      .eq("id", params.id)
      .select("id");
    if (error) {
      logApiError("/api/meetings/[id]", error, { stage: "delete" });
      return NextResponse.json(
        { ok: false, code: "failed" },
        { status: 500 }
      );
    }
    // A delete that matched nothing is a 404, not a silent success: "it is
    // gone" and "it was never yours to delete" are different sentences,
    // and a user who is told the first when the second is true stops
    // checking.
    if (!data || data.length === 0) {
      return NextResponse.json(
        { ok: false, code: "not_found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, deleted: data.length });
  } catch (err) {
    logApiError("/api/meetings/[id]", err);
    return NextResponse.json(
      { ok: false, code: "failed" },
      { status: 500 }
    );
  }
}
