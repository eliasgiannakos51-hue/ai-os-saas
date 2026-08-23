import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveEffectivePlan } from "@/lib/billing/credits";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { resolveMarginFor } from "@/lib/billing/margin-policy";
import { logApiError } from "@/lib/log-error";
import { creditsPerVoiceMinute, voiceMinutesForPlan } from "@/lib/voice/voice-pricing";
import { readVoiceUsage } from "@/lib/voice/voice-usage";
import { transcriptionConfigured, speechConfigured } from "@/lib/voice/voice-providers";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * WHAT VOICE COSTS ME AND HOW MUCH I HAVE LEFT — read before anything is
 * offered, so the microphone can say "not available on this deployment"
 * instead of appearing and then failing.
 *
 * `configured` is the honest one. Both provider keys are optional to a
 * deployment and mandatory to the feature, and a mic button that renders
 * without them is a button that wastes somebody's breath.
 */
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, code: "unauthenticated", error: "Not authenticated." }, { status: 401 });

    const plan = await resolveEffectivePlan(user);
    const limitMinutes = voiceMinutesForPlan(plan.slug);
    const allowance = await readVoiceUsage(createAdminClient(), user.id, limitMinutes);
    const config = resolvePricingConfig();
    const margin = resolveMarginFor("voice", plan.slug, config).margin;

    return NextResponse.json({
      ok: true,
      configured: { transcribe: transcriptionConfigured(), speak: speechConfigured() },
      limitMinutes,
      included: allowance.included,
      usedSeconds: allowance.usedSeconds,
      remainingSeconds: allowance.remainingSeconds,
      creditsPerMinute: {
        transcribe: creditsPerVoiceMinute("transcribe", config, margin),
        speak: creditsPerVoiceMinute("speak", config, margin),
      },
    });
  } catch (err) {
    logApiError("/api/voice/usage", err);
    return NextResponse.json({ ok: false, code: "failed", error: "Something went wrong." }, { status: 500 });
  }
}
