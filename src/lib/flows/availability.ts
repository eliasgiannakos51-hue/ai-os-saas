import "server-only";
import type { User } from "@supabase/supabase-js";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { isFeatureOn } from "@/lib/flags/flags";
import { planMeetsMinimum, type Plan } from "@/lib/billing/plans";
import { imageApiKey } from "@/lib/images/gemini-image";
import { IMAGE_MIN_PLAN } from "@/lib/images/image-access";
import { planIncludes } from "@/lib/flows/plan-includes";
import type { FlowAvailability } from "@/lib/flows/plan";

/**
 * WHICH STEPS THIS PERSON CAN RUN (package 36), each asked as its own
 * route asks it before it spends anything, so the plan offers no step its
 * tool would refuse:
 *
 *   - what the plan includes, for everything but the pictures
 *     (lib/flows/plan-includes.ts);
 *   - the pictures on exactly what api/images/generate checks
 *     (lib/images/image-access.ts imageGate): its switch, its plan, its
 *     provider's key;
 *   - a deck made FROM a research on package 11's switch, which
 *     api/presentations/generate asks before it reads the report.
 *
 * What is left is answered by each tool for its own credits and caps when
 * its step runs.
 */
export async function flowAvailability(user: User, plan: Plan | null): Promise<FlowAvailability> {
  const isAdmin = isAdminEmail(user.email);
  const [imageSwitch, researchSlides] = await Promise.all([isFeatureOn("image-studio", user), isFeatureOn("research-slides", user)]);
  const images = Boolean(imageApiKey()) && imageSwitch && (isAdmin || planMeetsMinimum(plan?.slug ?? "free", IMAGE_MIN_PLAN));
  return { ...planIncludes(plan?.slug ?? "free", isAdmin), images, slidesFromResearch: researchSlides };
}
