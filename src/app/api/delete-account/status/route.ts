import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActivePendingDeletion, cancelDeletionByUserId } from "@/lib/account/pending-deletion";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const admin = createAdminClient();
    const pending = await getActivePendingDeletion(admin, user.id);

    if (!pending) {
      return NextResponse.json({ ok: true, pending: false });
    }

    return NextResponse.json({
      ok: true,
      pending: true,
      deleteAfter: pending.delete_after,
      scheduledAt: pending.created_at,
    });
  } catch (err) {
    logApiError("/api/delete-account/status", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong." },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // Every open schedule of the account, and success when at least one
    // stopped. With two (written before 20261112000000) this used to
    // cancel both and then answer 404 (lib/account/pending-deletion.ts).
    const admin = createAdminClient();
    const cancelled = await cancelDeletionByUserId(admin, user.id);

    if (cancelled === null) {
      // A failed write is not "nothing to cancel". A code and no English
      // (QUEUE FD3); Settings reads only res.ok (danger-zone.tsx).
      return NextResponse.json({ ok: false, code: "cancel_failed" }, { status: 500 });
    }
    if (cancelled === 0) {
      return NextResponse.json(
        { ok: false, error: "No active pending deletion found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/delete-account/status:cancel", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong." },
      { status: 500 },
    );
  }
}
