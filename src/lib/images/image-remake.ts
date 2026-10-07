import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { hasEnoughCredits } from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { releaseReservation, reserveCredits, settleReservation } from "@/lib/billing/reservations";
import { callImage } from "@/lib/images/gemini-image";
import { IMAGE_FEATURE, IMAGE_FULL_MODEL, IMAGE_PREVIEW_MODEL, IMAGE_RATES_USD } from "@/lib/images/image-pricing";
import {
  claimImage,
  downloadUrl,
  readPicture,
  refuse,
  releaseImage,
  showImages,
  storePicture,
  type ImageContext,
  type ImageRow,
} from "@/lib/images/image-route";
import { FULL_SIZE_PROMPT, IMAGE_BUCKET, editPrompt, imagePath, readAspect, readVariants, type ImageVariant } from "@/lib/images/image-studio";

/**
 * ONE PICTURE, MADE AGAIN FROM ITSELF (MASTER 16, package 19): changed
 * with words (api/images/[id]/edit), or the same picture at the largest
 * size (api/images/[id]/full). The same steps, written once:
 *
 *   claim the row       so two presses cannot both rewrite it;
 *   hold the price      quoted on the screen from lib/images/image-pricing.ts;
 *   read the picture    from the bucket — the provider is sent THIS one;
 *   make, store, write  the new path into `variants`; for a change the old
 *                       picture moves to `previous` and is never deleted;
 *   charge              only for a picture that was stored and written;
 *   let go of the row   in every case, in `finally`.
 */
export async function remakeVariant(
  ctx: ImageContext,
  row: ImageRow,
  index: number,
  job: { kind: "edit"; instruction: string } | { kind: "full" },
  signal: AbortSignal
): Promise<NextResponse> {
  const { user, plan, prices, bypass } = ctx;
  const variants = readVariants(row.variants, user.id);
  const variant = variants.find((v) => v.index === index);
  if (!variant) return refuse("no_such_picture", 404);

  // THE LARGEST SIZE IS MADE ONCE. Asked again, it is the same file, free.
  if (job.kind === "full" && variant.fullPath) {
    const url = await downloadUrl(row, variant, true);
    return url ? NextResponse.json({ ok: true, url, creditsCharged: 0 }) : refuse("sign_failed", 502);
  }

  const price = job.kind === "full" ? prices.full : prices.edit;
  if (!(await claimImage(user.id, row.id))) return refuse("busy", 409);
  let reservationId = "";
  let settled = false;
  try {
    if (!bypass && plan) {
      const enough = await hasEnoughCredits(user.id, price, plan);
      if (!enough.ok) return refuse("insufficient_credits", 402, { remaining: enough.remaining, needed: price });
      const reservation = await reserveCredits(user.id, price, IMAGE_FEATURE, { kind: job.kind, image: row.id, variant: index });
      if (!reservation.ok) return refuse("reserve_failed", 402);
      reservationId = reservation.reservationId;
    }
    void recordAiCallForDailySpend(price);

    const source = await readPicture(variant.path);
    if (!source) {
      await releaseReservation(user.id, reservationId);
      return refuse("no_such_picture", 404);
    }
    const outcome = await callImage({
      apiKey: ctx.apiKey,
      model: job.kind === "full" ? IMAGE_FULL_MODEL : IMAGE_PREVIEW_MODEL,
      prompt: job.kind === "full" ? FULL_SIZE_PROMPT : editPrompt(job.instruction),
      aspect: readAspect(row.aspect),
      size: job.kind === "full" ? "4K" : undefined,
      source,
      signal,
    });
    if (!outcome.ok) {
      await releaseReservation(user.id, reservationId);
      if (outcome.kind === "aborted") return refuse("stopped", 499);
      if (outcome.kind === "provider") logApiError(`/api/images/[id]/${job.kind}`, new Error(outcome.detail), { kind: outcome.kind });
      return refuse(outcome.kind === "refused" ? "refused" : "ai_unavailable", outcome.kind === "refused" ? 422 : 503);
    }

    const stamp = Date.now().toString(36);
    const path = imagePath(user.id, row.id, job.kind === "full" ? `v${index}-full-${stamp}` : `v${index}-${stamp}`, outcome.mime);
    if (!(await storePicture(path, outcome.data, outcome.mime))) {
      await releaseReservation(user.id, reservationId);
      return refuse("store_failed", 502);
    }
    const next: ImageVariant[] = variants.map((v) =>
      v.index !== index
        ? v
        : job.kind === "full"
          ? { ...v, fullPath: path }
          : // The picture a change replaces, and its largest size, are kept.
            { index, path, mime: outcome.mime, fullPath: null, previous: [...v.previous, v.path, ...(v.fullPath ? [v.fullPath] : [])] }
    );

    const costs = new CostAccumulator();
    costs.recordExternal("generation", {
      provider: "google",
      usdCost: job.kind === "full" ? IMAGE_RATES_USD.full : IMAGE_RATES_USD.preview,
      units: 1,
      unit: "image",
    });
    const admin = createAdminClient();
    const { error: writeError } = await admin
      .from("generated_images")
      .update({ variants: next })
      .eq("id", row.id)
      .eq("user_id", user.id);
    if (writeError) {
      logApiError(`/api/images/[id]/${job.kind}`, writeError, { stage: "write" });
      await admin.storage.from(IMAGE_BUCKET).remove([path]);
      await releaseReservation(user.id, reservationId);
      return refuse("save_failed", 500);
    }
    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: IMAGE_FEATURE,
      costs,
      plan,
      bypassCharge: bypass,
      metadata: { kind: job.kind, image: row.id, variant: index, model: job.kind === "full" ? IMAGE_FULL_MODEL : IMAGE_PREVIEW_MODEL },
    });
    settled = true;
    const { error: receiptError } = await admin
      .from("generated_images")
      .update({ credits_charged: row.credits_charged + settlement.creditsCharged })
      .eq("id", row.id)
      .eq("user_id", user.id);
    if (receiptError) logApiError(`/api/images/[id]/${job.kind}`, receiptError, { stage: "receipt" });

    const updated: ImageRow = { ...row, variants: next, credits_charged: row.credits_charged + settlement.creditsCharged };
    if (job.kind === "full") {
      const url = await downloadUrl(updated, next.find((v) => v.index === index)!, true);
      return url ? NextResponse.json({ ok: true, url, creditsCharged: settlement.creditsCharged }) : refuse("sign_failed", 502);
    }
    const [shown] = await showImages([updated], user.id);
    return NextResponse.json({ ok: true, image: shown, creditsCharged: settlement.creditsCharged });
  } catch (err) {
    logApiError(`/api/images/[id]/${job.kind}`, err);
    if (!settled) await releaseReservation(user.id, reservationId);
    return refuse("failed", 500);
  } finally {
    await releaseImage(user.id, row.id);
  }
}
