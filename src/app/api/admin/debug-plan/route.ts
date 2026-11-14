import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminEmail, isOwner, isAdminOrOwner } from "@/lib/auth/admin-emails";
import { resolvePlanSlug, hasLiveSubscription } from "@/lib/billing/plan-resolution";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { isBetaTester } from "@/lib/beta";

// Admin-only diagnostic: shows how the server resolves the current user's plan.
// Hit /api/admin/debug-plan while signed in to see every step.
export async function GET() {
  const user = await getCurrentUser();
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
}
