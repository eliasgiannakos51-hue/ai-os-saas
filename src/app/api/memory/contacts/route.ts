import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isFeatureOn } from "@/lib/flags/flags";
import { isContactRole } from "@/lib/memory/contacts";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

/**
 * THE BUSINESS'S OWN NETWORK, READ BACK (the 2026-11-07 market round,
 * docs/QUEUE.md «ΤΟ MOAT»). Behind "business-contact-memory" — see
 * supabase/migrations/20261121000000_business_contacts.sql and
 * lib/memory/contacts.ts for how a row gets here.
 *
 * This is the read a FUTURE tool uses — an autocomplete in Sales, a
 * "who is this" lookup in Finances — so the data a cross-tool feature
 * needs already exists before that tool is built; today it is read by
 * the panel on /dashboard/ai-memory
 * (components/memory/business-contacts-list.tsx).
 *
 * Scoped by RLS (`auth.uid() = user_id`, select_own_business_contacts):
 * the query below filters by user_id too, for the same reason
 * /dashboard/ai-memory does on chat_memory — explicit is cheap, and a
 * second reader of this table on the service role would not get RLS for
 * free.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }
    if (!(await isFeatureOn("business-contact-memory", user))) {
      return NextResponse.json({ ok: false, error: "Not available yet." }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("business_contacts")
      .select("id, name, role, detail, mention_count, first_seen_at, last_seen_at")
      .eq("user_id", user.id)
      .order("last_seen_at", { ascending: false })
      .limit(100);

    if (error) {
      logApiError("/api/memory/contacts", error, { userId: user.id });
      return NextResponse.json({ ok: false, error: "Could not load that. Please try again." }, { status: 500 });
    }

    const contacts = (data ?? []).map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ""),
      role: isContactRole(row.role) ? row.role : "other",
      detail: row.detail ? String(row.detail) : null,
      mentionCount: Number(row.mention_count ?? 1),
      firstSeenAt: String(row.first_seen_at ?? ""),
      lastSeenAt: String(row.last_seen_at ?? row.first_seen_at ?? ""),
    }));

    return NextResponse.json({ ok: true, contacts });
  } catch (err) {
    logApiError("/api/memory/contacts", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
