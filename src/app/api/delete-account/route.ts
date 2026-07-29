import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Deletes the signed-in user's auth account via the service-role admin API.
// Every table's user_id column is `references auth.users(id) on delete
// cascade` (see supabase_schema.sql), so this single call also wipes all of
// that user's rows across all 13 modules (and the create_requests rate-limit
// log) — no separate per-table deletes needed.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated." },
      { status: 401 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
