import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isAdminOrOwner } from "@/lib/auth/admin-emails";
import { mergeUserMetadata } from "@/lib/auth/user-metadata";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

// POST /api/admin/set-owner
// Sets is_owner: true and subscription_tier: "enterprise" on the given user
// via the admin API (not raw SQL), so GoTrue picks up the change immediately.
// Body: { "email": "..." }
//
// Auth: either signed in as admin/owner, OR provide the SUPABASE_SERVICE_ROLE_KEY
// as a Bearer token (for bootstrapping before any admin exists in the JWT).
// The admin client is needed to list and update users via GoTrue; access is
// gated on isAdminEmail/isAdminOrOwner OR the service-role key itself as a
// Bearer token (chicken-and-egg: the key IS the admin credential).
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const authHeader = request.headers.get("authorization");
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const isBearerAuth = authHeader && serviceKey && authHeader === `Bearer ${serviceKey}`;

    // Either a signed-in admin/owner or a valid service-role Bearer token.
    if (!user && !isBearerAuth) {
      return NextResponse.json({ error: "not signed in" }, { status: 401 });
    }
    if (!isBearerAuth && (!isAdminOrOwner(user!) && !isAdminEmail(user!.email))) {
      return NextResponse.json({ error: "admin only" }, { status: 403 });
    }

    const { email } = await request.json();
    if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

    const admin = createAdminClient();
    // listUsers doesn't filter by email in all Supabase versions, so we search
    const { data: allUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const target = allUsers?.users?.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!target) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    // Use mergeUserMetadata (the atomic merge via RPC) to set the flags
    const result = await mergeUserMetadata(
      target.id,
      {
        is_owner: true,
        subscription_tier: "enterprise",
      },
      { context: "admin/set-owner" }
    );

    if (!result) {
      return NextResponse.json({ error: "merge failed" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      userId: target.id,
      email: target.email,
      metadata: result,
    });
  } catch (err) {
    logApiError("admin/set-owner", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
