import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { hasEnoughCredits } from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { releaseReservation, reserveCredits, settleReservation } from "@/lib/billing/reservations";
import { callImage } from "@/lib/images/gemini-image";
import { IMAGE_FEATURE, IMAGE_PREVIEW_MODEL, IMAGE_RATES_USD } from "@/lib/images/image-pricing";
import { IMAGE_ROW_COLUMNS, imageContext, refuse, showImages, storePicture, type ImageRow } from "@/lib/images/image-route";
import {
  IMAGE_BUCKET,
  IMAGE_VARIANTS,
  MAX_IMAGE_DESCRIPTION_CHARS,
  checkImageText,
  imagePath,
  readAspect,
  variantPrompt,
  type ImageVariant,
} from "@/lib/images/image-studio";

export const dynamic = "force-dynamic";
// Four calls side by side, each bounded by IMAGE_CALL_TIMEOUT_MS.
export const maxDuration = 120; // @function-limit 120

/**
 * FOUR PICTURES FROM ONE DESCRIPTION (MASTER 16, package 19), behind the
 * switch "image-studio".
 *
 * The hold is the price of four, quoted on the screen from the same
 * function (lib/images/image-pricing.ts). The four are asked for at once;
 * each picture that comes back and is stored is charged, and only those —
 * three pictures are three pictures' worth. If none comes back nothing is
 * charged, and the reader is told whether the provider declined (its own
 * rules) or failed.
 *
 * THE ROW IS WRITTEN THROUGH THE SERVICE ROLE, with user_id from the
 * session: generated_images revokes insert and update from authenticated
 * (20261019000000_generated_images.sql).
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return refuse("invalid_body", 400);
  }
  const verdict = checkImageText(body.description, MAX_IMAGE_DESCRIPTION_CHARS);
  if (!verdict.ok) return refuse(verdict.reason, 400, { limit: verdict.limit });
  const description = verdict.text;
  const aspect = readAspect(body.aspect);

  const ctx = await imageContext({ spending: true, endpoint: "image_generate", fingerprint: fingerprintRequest(description, aspect) });
  if (ctx instanceof NextResponse) return ctx;
  const { user, plan, prices, bypass } = ctx;

  let reservationId = "";
  let settled = false;
  try {
    if (!bypass && plan) {
      const enough = await hasEnoughCredits(user.id, prices.variants, plan);
      if (!enough.ok) return refuse("insufficient_credits", 402, { remaining: enough.remaining, needed: prices.variants });
      const reservation = await reserveCredits(user.id, prices.variants, IMAGE_FEATURE, { kind: "variants", aspect });
      if (!reservation.ok) return refuse("reserve_failed", 402);
      reservationId = reservation.reservationId;
    }
    void recordAiCallForDailySpend(prices.variants);

    const id = crypto.randomUUID();
    const outcomes = await Promise.all(
      Array.from({ length: IMAGE_VARIANTS }, (_, index) =>
        callImage({ apiKey: ctx.apiKey, model: IMAGE_PREVIEW_MODEL, prompt: variantPrompt(description, index), aspect, signal: request.signal })
      )
    );

    const variants: ImageVariant[] = [];
    for (const [index, outcome] of outcomes.entries()) {
      if (!outcome.ok) continue;
      const path = imagePath(user.id, id, `v${index}`, outcome.mime);
      if (await storePicture(path, outcome.data, outcome.mime)) variants.push({ index, path, mime: outcome.mime, fullPath: null, previous: [] });
      else logApiError("/api/images/generate", new Error("store_failed"), { index });
    }

    if (variants.length === 0) {
      await releaseReservation(user.id, reservationId);
      if (request.signal.aborted) return refuse("stopped", 499);
      const refused = outcomes.some((o) => !o.ok && o.kind === "refused");
      for (const o of outcomes) if (!o.ok && o.kind === "provider") logApiError("/api/images/generate", new Error(o.detail), { kind: o.kind });
      return refuse(refused ? "refused" : "ai_unavailable", refused ? 422 : 503);
    }

    // THE ROW BEFORE THE CHARGE. Pictures nobody can reach are not worth
    // paying for: if the row cannot be written, the pictures go and the
    // hold is released, and nothing is charged.
    const admin = createAdminClient();
    const { data: row, error: saveError } = await admin
      .from("generated_images")
      .insert({ id, user_id: user.id, prompt: description, aspect, variants, status: "done", credits_charged: 0 })
      .select(IMAGE_ROW_COLUMNS)
      .single();
    if (saveError || !row) {
      logApiError("/api/images/generate", saveError ?? new Error("no row"), { stage: "save" });
      await admin.storage.from(IMAGE_BUCKET).remove(variants.map((v) => v.path));
      await releaseReservation(user.id, reservationId);
      return refuse("save_failed", 500);
    }

    // ONLY WHAT WAS MADE: one line per stored picture, at the rate it cost.
    const costs = new CostAccumulator();
    for (let i = 0; i < variants.length; i++) {
      costs.recordExternal("generation", { provider: "google", usdCost: IMAGE_RATES_USD.preview, units: 1, unit: "image" });
    }
    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: IMAGE_FEATURE,
      costs,
      plan,
      bypassCharge: bypass,
      metadata: { kind: "variants", made: variants.length, asked: IMAGE_VARIANTS, model: IMAGE_PREVIEW_MODEL },
    });

    settled = true;
    const { error: receiptError } = await admin
      .from("generated_images")
      .update({ credits_charged: settlement.creditsCharged })
      .eq("id", id)
      .eq("user_id", user.id);
    if (receiptError) logApiError("/api/images/generate", receiptError, { stage: "receipt" });
    const [shown] = await showImages([row as ImageRow], user.id);
    return NextResponse.json({ ok: true, image: shown, made: variants.length, creditsCharged: settlement.creditsCharged });
  } catch (err) {
    logApiError("/api/images/generate", err);
    if (!settled) await releaseReservation(user.id, reservationId);
    return refuse("generate_failed", 500);
  }
}
