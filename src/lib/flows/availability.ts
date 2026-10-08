import "server-only";
import type { User } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { isFeatureOn } from "@/lib/flags/flags";
import { planMeetsMinimum, type Plan } from "@/lib/billing/plans";
import { imageApiKey } from "@/lib/images/gemini-image";
import { IMAGE_MIN_PLAN } from "@/lib/images/image-access";
import type { FlowKind } from "@/lib/flows/plan";

/**
 * WHICH STEPS THIS PERSON CAN RUN (package 36). Only the pictures are
 * conditional today, and on exactly what api/images/generate checks
 * (lib/images/image-access.ts imageGate): its switch, its plan, its
 * provider's key. Every other tool is on every plan and answers for its
 * own credits and caps when its step runs.
 */
export async function flowAvailability(user: User, plan: Plan | null): Promise<Record<FlowKind, boolean>> {
  const images =
    Boolean(imageApiKey()) &&
    (await isFeatureOn("image-studio", user)) &&
    (isAdminEmail(user.email) || planMeetsMinimum(plan?.slug ?? "free", IMAGE_MIN_PLAN));
  return { research: true, site: true, images, posts: true, slides: true, analysis: true };
}
