import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { isFeatureOn } from "@/lib/flags/flags";
import { looksLikeUuid } from "@/lib/iowork/pairing";

export const dynamic = "force-dynamic";

/**
 * «ΑΠΟΣΥΝΔΕΣΗ ΜΕ ΕΝΑ ΠΑΤΗΜΑ» — §3 and the security block of the owner's
 * instruction, from the Ionexa side.
 *
 * THE ROW IS DELETED, NOT FLAGGED. The device token is only ever checked
 * by looking its hash up in this table, so once the row is gone the next
 * call from that computer matches nothing and is refused. A flag would
 * mean a second condition that some later query could forget; a missing
 * row cannot be forgotten.
 *
 * No admin client and no ownership check in this file, on purpose: the
 * delete runs as the signed-in person, and the policy
 * delete_own_iowork_devices (20261031000000_iowork_devices.sql) is what
 * decides whose row it is. Another account's id simply deletes nothing.
 */
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
  if (!(await isFeatureOn("iowork-tool", user))) {
    return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });
  }
  // A malformed id answers exactly like a real id that is not this
  // account's — not_found, before the database ever sees it. Without
  // this, a non-UUID string reaches Postgres as a bad uuid literal, which
  // answers 500 instead of 404 and, through logApiError's own metadata,
  // writes whatever the caller sent into the owner's error table.
  if (!looksLikeUuid(id)) {
    return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
  }

  try {
    const { data, error } = await supabase
      .from("iowork_devices")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id");
    if (error) throw error;
    // Nothing deleted is a 404, the same answer another account's id gets,
    // so the response never confirms that a device with this id exists.
    if (!data || data.length === 0) {
      return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/iowork/devices/[id]", err, { stage: "delete" });
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
