import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, isOwner, isAdminOrOwner } from "@/lib/auth/admin-emails";
import { resolvePlanSlug, hasLiveSubscription } from "@/lib/billing/plan-resolution";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { isBetaTester } from "@/lib/beta";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

// Admin-only diagnostic: shows how the server resolves the current user's plan.
// Hit /api/admin/debug-plan while signed in to see every step.
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
    if (!isAdminOrOwner(user)) return NextResponse.json({ error: "admin only" }, { status: 403 });

    const effectivePlan = await resolveEffectivePlanSlug(user);

    return NextResponse.json({
      email: user.email,
      user_metadata: user.user_metadata,
      checks: {
        isOwner: isOwner(user),
        isAdminEmail: isAdminEmail(user.email),
        isAdminOrOwner: isAdminOrOwner(user),
        resolvePlanSlug: resolvePlanSlug(user),
        hasLiveSubscription: hasLiveSubscription(user),
        isBetaTester: isBetaTester(user),
        resolveEffectivePlanSlug: effectivePlan,
      },
    });
  } catch (err) {
    logApiError("admin/debug-plan", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
