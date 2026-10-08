import "server-only";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { releaseReservation, settleReservation } from "@/lib/billing/reservations";
import type { Plan } from "@/lib/billing/plans";
import { callImage } from "@/lib/images/gemini-image";
import { IMAGE_FEATURE, IMAGE_FULL_MODEL, IMAGE_PREVIEW_MODEL, IMAGE_RATES_USD } from "@/lib/images/image-pricing";
import {
  downloadUrl,
  readPicture,
  refuse,
  releaseImage,
  removePictures,
  showImages,
  storePicture,
  type ImageRow,
} from "@/lib/images/image-access";
import { FULL_SIZE_PROMPT, editPrompt, imagePath, readAspect, readVariants, type ImageVariant } from "@/lib/images/image-studio";

export type RemakeJob = { kind: "edit"; instruction: string } | { kind: "full" };

/**
 * ONE PICTURE, MADE AGAIN FROM ITSELF (MASTER 16, package 19): changed
 * with words (api/images/[id]/edit), or the same picture at the largest
 * size (api/images/[id]/full). The route has already said who is asking,
 * read the row as the owner's, claimed it and held the price; this is
 * what both do next, written once:
 *
 *   read the picture    from the bucket — the provider is sent THIS one;
 *   make, store, write  the new path into `variants`; for a change the old
 *                       picture moves to `previous` and is never deleted;
 *   charge              only for a picture that was stored and written;
 *   let go of the row   in every case, in `finally`.
 */
export async function remake(params: {
  user: User;
  plan: Plan | null;
  bypass: boolean;
  apiKey: string;
  row: ImageRow;
  variant: ImageVariant;
  job: RemakeJob;
  reservationId: string;
  signal: AbortSignal;
}): Promise<NextResponse> {
  const { user, plan, bypass, row, variant, job, reservationId } = params;
  const index = variant.index;
  const route = `/api/images/[id]/${job.kind}`;
  let settled = false;
  try {
    const source = await readPicture(variant.path);
    if (!source) {
      await releaseReservation(user.id, reservationId);
      return refuse("no_such_picture", 404);
    }
    const outcome = await callImage({
      apiKey: params.apiKey,
      model: job.kind === "full" ? IMAGE_FULL_MODEL : IMAGE_PREVIEW_MODEL,
      prompt: job.kind === "full" ? FULL_SIZE_PROMPT : editPrompt(job.instruction),
      aspect: readAspect(row.aspect),
      size: job.kind === "full" ? "4K" : undefined,
      source,
      signal: params.signal,
    });
    if (!outcome.ok) {
      await releaseReservation(user.id, reservationId);
      if (outcome.kind === "aborted") return refuse("stopped", 499);
      if (outcome.kind === "provider") logApiError(route, new Error(outcome.detail), { kind: outcome.kind });
      return refuse(outcome.kind === "refused" ? "refused" : "ai_unavailable", outcome.kind === "refused" ? 422 : 503);
    }

    const stamp = Date.now().toString(36);
    const path = imagePath(user.id, row.id, job.kind === "full" ? `v${index}-full-${stamp}` : `v${index}-${stamp}`, outcome.mime);
    if (!(await storePicture(path, outcome.data, outcome.mime))) {
      await releaseReservation(user.id, reservationId);
      return refuse("store_failed", 502);
    }
    const next: ImageVariant[] = readVariants(row.variants, user.id).map((v) =>
      v.index !== index
        ? v
        : job.kind === "full"
          ? { ...v, fullPath: path }
          : // The picture a change replaces, and its largest size, are kept.
            { index, path, mime: outcome.mime, fullPath: null, previous: [...v.previous, v.path, ...(v.fullPath ? [v.fullPath] : [])] }
    );

    const admin = createAdminClient();
    const { error: writeError } = await admin
      .from("generated_images")
      .update({ variants: next })
      .eq("id", row.id)
      .eq("user_id", user.id);
    if (writeError) {
      logApiError(route, writeError, { stage: "write" });
      await removePictures([path]);
      await releaseReservation(user.id, reservationId);
      return refuse("save_failed", 500);
    }

    const costs = new CostAccumulator();
    costs.recordExternal("generation", {
      provider: "google",
      usdCost: job.kind === "full" ? IMAGE_RATES_USD.full : IMAGE_RATES_USD.preview,
      units: 1,
      unit: "image",
    });
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
    const charged = row.credits_charged + settlement.creditsCharged;
    const { error: receiptError } = await admin
      .from("generated_images")
      .update({ credits_charged: charged })
      .eq("id", row.id)
      .eq("user_id", user.id);
    if (receiptError) logApiError(route, receiptError, { stage: "receipt" });

    const updated: ImageRow = { ...row, variants: next, credits_charged: charged };
    if (job.kind === "full") {
      const url = await downloadUrl(updated, next.find((v) => v.index === index)!, true);
      return url ? NextResponse.json({ ok: true, url, creditsCharged: settlement.creditsCharged }) : refuse("sign_failed", 502);
    }
    const [shown] = await showImages([updated], user.id);
    return NextResponse.json({ ok: true, image: shown, creditsCharged: settlement.creditsCharged });
  } catch (err) {
    logApiError(route, err);
    if (!settled) await releaseReservation(user.id, reservationId);
    return refuse("failed", 500);
  } finally {
    await releaseImage(user.id, row.id);
  }
}
