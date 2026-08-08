import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { deleteObservation, editObservation, forgetEverything } from "@/lib/profile/store";

export const dynamic = "force-dynamic";

// The user's control over what the AI thinks it knows about them.
//
// PATCH  — rewrite one observation (and stop the observer overwriting it)
// DELETE — remove one, or with ?all=1, everything
//
// All three go through the service-role client rather than the browser's,
// even though the table HAS owner-scoped select and delete policies. The
// reason is the columns a client-side write would also reach: an UPDATE
// policy broad enough to fix the wording is broad enough to raise
// `confidence` and `evidence_count`, i.e. to forge how strongly the
// assistant believes something. Editing the sentence is a user right;
// editing the evidence behind it is not a thing anyone should be able to
// do, to themselves or to somebody whose session was taken.
export async function PATCH(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const limited = await checkRateLimit({
      scope: "profile_edit",
      identifier: user.id,
      maxAttempts: 60,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many changes." }, { status: 429 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      id?: unknown;
      observation?: unknown;
    };
    if (typeof body.id !== "string" || typeof body.observation !== "string") {
      return NextResponse.json({ ok: false, error: "Nothing to change." }, { status: 400 });
    }

    const ok = await editObservation({
      userId: user.id,
      id: body.id,
      observation: body.observation,
    });
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Could not save that." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/profile", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const url = new URL(request.url);
    // "Forget everything" is never rate limited. Withdrawing consent to be
    // profiled must always work on the first press, whatever else the
    // account has been doing.
    if (url.searchParams.get("all") === "1") {
      const ok = await forgetEverything(user.id);
      if (!ok) {
        return NextResponse.json({ ok: false, error: "Could not clear that." }, { status: 500 });
      }
      return NextResponse.json({ ok: true, cleared: true });
    }

    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "Nothing to delete." }, { status: 400 });
    }
    const ok = await deleteObservation(user.id, id);
    if (!ok) {
      return NextResponse.json({ ok: false, error: "Could not delete that." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/profile", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
