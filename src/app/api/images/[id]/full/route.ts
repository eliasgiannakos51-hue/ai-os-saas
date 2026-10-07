import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { hasEnoughCredits } from "@/lib/billing/credits";
import { reserveCredits } from "@/lib/billing/reservations";
import { imageApiKey } from "@/lib/images/gemini-image";
import { IMAGE_FEATURE } from "@/lib/images/image-pricing";
import {
  IMAGE_ROW_COLUMNS,
  UUID,
  claimImage,
  downloadUrl,
  imageGate,
  refuse,
  releaseImage,
  spendingAllowed,
  type ImageRow,
} from "@/lib/images/image-access";
import { remake } from "@/lib/images/image-remake";
import { IMAGE_VARIANTS, readVariants } from "@/lib/images/image-studio";

export const dynamic = "force-dynamic";
// One 4K picture, bounded by IMAGE_CALL_TIMEOUT_MS.
export const maxDuration = 120; // @function-limit 120

/**
 * THE PICTURE AT THE LARGEST SIZE (MASTER 16, package 19), behind the
 * switch "image-studio": «την κατεβάζω στην υψηλότερη ανάλυση». Made from
 * the picture, not from the words again, by the provider's 4K model
 * (lib/images/image-pricing.ts, IMAGE_FULL_MODEL); made once and charged
 * once — asked again it is the same file, free. Answers with an address
 * that saves it under a readable name.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID.test(id)) return refuse("not_found", 404);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return refuse("invalid_body", 400);
  }
  const index = Number(body.variant);
  if (!Number.isInteger(index) || index < 0 || index >= IMAGE_VARIANTS) return refuse("no_such_picture", 400);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuse("not_signed_in", 401);
  const gate = await imageGate(user);
  if (gate instanceof NextResponse) return gate;

  // Held from the claim until remake() takes the row over (it lets go in
  // its own `finally`), so a throw in between does not leave it locked.
  let claimed = false;
  try {
    const { data, error } = await supabase
      .from("generated_images")
      .select(IMAGE_ROW_COLUMNS)
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return refuse("not_found", 404);
    const row = data as ImageRow;
    const variant = readVariants(row.variants, user.id).find((v) => v.index === index);
    if (!variant) return refuse("no_such_picture", 404);

    // MADE ONCE. Asked again, it is the same file, and free.
    if (variant.fullPath) {
      const url = await downloadUrl(row, variant, true);
      return url ? NextResponse.json({ ok: true, url, creditsCharged: 0 }) : refuse("sign_failed", 502);
    }

    const apiKey = imageApiKey();
    if (!apiKey) return refuse("not_configured", 503);
    const spend = await spendingAllowed(user, gate, "image_full", `${id}:${index}:full`);
    if (spend instanceof NextResponse) return spend;
    if (!(await claimImage(user.id, id))) return refuse("busy", 409);
    claimed = true;
    let reservationId = "";
    if (!spend.bypass && gate.plan) {
      const enough = await hasEnoughCredits(user.id, gate.prices.full, gate.plan);
      const reservation = enough.ok ? await reserveCredits(user.id, gate.prices.full, IMAGE_FEATURE, { kind: "full", image: id, variant: index }) : null;
      if (!reservation?.ok) {
        await releaseImage(user.id, id);
        return refuse(enough.ok ? "reserve_failed" : "insufficient_credits", 402);
      }
      reservationId = reservation.reservationId;
    }
    void recordAiCallForDailySpend(gate.prices.full);
    claimed = false;
    return await remake({ user, plan: gate.plan, bypass: spend.bypass, apiKey, row, variant, job: { kind: "full" }, reservationId, signal: request.signal });
  } catch (err) {
    logApiError("/api/images/[id]/full", err);
    if (claimed) await releaseImage(user.id, id);
    return refuse("failed", 500);
  }
}
