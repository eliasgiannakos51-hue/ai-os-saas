import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminOrOwner } from "@/lib/auth/admin-emails";
import { mergeUserMetadata } from "@/lib/auth/user-metadata";

// POST /api/admin/set-owner
// Sets is_owner: true and subscription_tier: "enterprise" on the given user
// via the admin API (not raw SQL), so GoTrue picks up the change immediately.
// Body: { "email": "..." }
export async function POST(request: Request) {
  const caller = await getCurrentUser();
  if (!caller || !isAdminOrOwner(caller)) {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const { email } = await request.json();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const admin = createAdminClient();
  // Find user by email
  const { data: listing } = await admin.auth.admin.listUsers({ perPage: 1 });
  // listUsers doesn't filter by email in all Supabase versions, so we search
  const { data: allUsers } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const target = allUsers?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (!target) {
    return NextResponse.json({ error: `no user with email ${email}` }, { status: 404 });
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

  // Also update via the admin API so GoTrue's cache is refreshed
  const { error: updateError } = await admin.auth.admin.updateUserById(target.id, {
    user_metadata: { ...result },
  });

  return NextResponse.json({
    ok: true,
    userId: target.id,
    email: target.email,
    metadata: result,
    adminApiUpdate: updateError ? updateError.message : "success",
  });
}
