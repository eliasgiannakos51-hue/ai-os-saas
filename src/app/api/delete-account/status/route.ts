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

    const admin = createAdminClient();
    const cancelled = await cancelDeletionByUserId(admin, user.id);

    if (!cancelled) {
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
