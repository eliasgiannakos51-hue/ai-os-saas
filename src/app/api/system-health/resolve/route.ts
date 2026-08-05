import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/admin";

export const dynamic = "force-dynamic";

// Marks one deduplicated error as resolved. Owner-only — the table holds
// platform-wide stack traces, so the gate here has to match the page's.
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ ok: false }, { status: 404 });

  let id: string;
  try {
    const body = (await request.json()) as { id?: unknown };
    id = typeof body.id === "string" ? body.id : "";
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!id) return NextResponse.json({ ok: false }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("production_errors")
    .update({ resolved: true, resolved_at: new Date().toISOString() })
    .eq("id", id);

  // Not logApiError: a failure here would write into the table this
  // request is trying to clean up.
  if (error) {
    console.error("system-health/resolve failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
