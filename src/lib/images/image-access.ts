import "server-only";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { checkAiCallAllowed } from "@/lib/ai-circuit-breaker";
import { getPurchasedPackCreditPriceEur, resolveEffectivePlan } from "@/lib/billing/credits";
import { planMeetsMinimum, type Plan, type PlanSlug } from "@/lib/billing/plans";
import { isFeatureOn } from "@/lib/flags/flags";
import { imagePrices, type ImagePrices } from "@/lib/images/image-pricing";
import {
  IMAGE_BUCKET,
  IMAGE_URL_TTL_SECONDS,
  imageFilename,
  readAspect,
  readVariants,
  type ImageVariant,
  type ShownImage,
} from "@/lib/images/image-studio";

/**
 * WHAT THE IMAGE ROUTES SHARE (MASTER 16, package 19), and nothing that
 * reaches the provider: the routes that only read, save or delete import
 * this and not lib/images/gemini-image.ts, so they are not counted as
 * spending (scripts/tests/route-spend-inventory.test.mjs).
 *
 * EACH ROUTE STILL SAYS WHO IS ASKING AND WHOSE ROW IT IS, in its own
 * file: auth.getUser() and `.eq("user_id", user.id)` are written where the
 * gates read them (security-posture, route-contract). What is shared is
 * what comes after: the switch and the plan, the breaker, the bucket.
 *
 * THE PLAN. Images are Starter and up — the tier the Images page has
 * carried since the build modules (src/lib/build-modules.ts, minPlanSlug)
 * and the catalog entry says (feature-catalog.ts, "imageStudio"). No tier
 * is decided here.
 */
export const IMAGE_MIN_PLAN: PlanSlug = "starter";

export function refuse(code: string, status: number, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ ok: false, code, ...extra }, { status });
}

export type ImageGate = { plan: Plan | null; packPriceEur: number | null; prices: ImagePrices; isAdmin: boolean };

/** The switch and the plan, for a signed-in person. A refusal, or the price list for this account. */
export async function imageGate(user: User): Promise<ImageGate | NextResponse> {
  if (!(await isFeatureOn("image-studio", user))) return refuse("not_enabled", 403);
  const isAdmin = isAdminEmail(user.email);
  const plan = await resolveEffectivePlan(user);
  if (!isAdmin && !planMeetsMinimum(plan?.slug ?? "free", IMAGE_MIN_PLAN)) return refuse("not_included", 403);
  const packPriceEur = await getPurchasedPackCreditPriceEur(user.id);
  return { plan, packPriceEur, prices: imagePrices(plan, packPriceEur), isAdmin };
}

/** Before anything is spent: the breaker, and the ceiling on accounts that are not charged. */
export async function spendingAllowed(user: User, gate: ImageGate, endpoint: string, fingerprint: string): Promise<{ bypass: boolean } | NextResponse> {
  const breaker = await checkAiCallAllowed(user.id, endpoint, fingerprint);
  if (!breaker.allowed) return refuse("rate_limited", 429);
  const isBeta = await hasActiveBetaBypass(user);
  const bypass = gate.isAdmin || isBeta;
  if (bypass) {
    const ceiling = await checkBypassCeiling(user.id, gate.isAdmin, isBeta);
    if (!ceiling.allowed) return refuse("bypass_ceiling", 429);
  }
  return { bypass };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ImageRow = {
  id: string;
  prompt: string;
  aspect: string;
  variants: unknown;
  credits_charged: number;
  created_at: string;
};

export const IMAGE_ROW_COLUMNS = "id, prompt, aspect, variants, credits_charged, created_at";

/**
 * A CHANGE AT A TIME. A change and a largest size both rewrite `variants`
 * from what they read; two at once would each write over the other. The
 * row is claimed for a few minutes — long enough for the slowest picture,
 * short enough that a crash does not lock it for good.
 */
export const IMAGE_BUSY_MS = 3 * 60_000;

export async function claimImage(userId: string, id: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - IMAGE_BUSY_MS).toISOString();
  const { data, error } = await createAdminClient()
    .from("generated_images")
    .update({ busy_since: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .or(`busy_since.is.null,busy_since.lt.${cutoff}`)
    .select("id");
  if (error) throw error;
  return Array.isArray(data) && data.length === 1;
}

export async function releaseImage(userId: string, id: string): Promise<void> {
  await createAdminClient().from("generated_images").update({ busy_since: null }).eq("id", id).eq("user_id", userId);
}

export async function storePicture(path: string, data: Buffer, mime: string): Promise<boolean> {
  const { error } = await createAdminClient().storage.from(IMAGE_BUCKET).upload(path, data, { contentType: mime, upsert: false });
  return !error;
}

/** Removes pictures this file stored: a row that could not be written, or a row deleted. */
export async function removePictures(paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;
  const { error } = await createAdminClient().storage.from(IMAGE_BUCKET).remove(paths);
  return !error;
}

export async function readPicture(path: string): Promise<{ data: Buffer; mime: string } | null> {
  const { data, error } = await createAdminClient().storage.from(IMAGE_BUCKET).download(path);
  if (error || !data) return null;
  return { data: Buffer.from(await data.arrayBuffer()), mime: data.type || "image/png" };
}

/** Every object a row names: the pictures, their largest sizes, and every picture a change replaced. */
export function everyPath(variants: ImageVariant[]): string[] {
  return variants.flatMap((v) => [v.path, ...(v.fullPath ? [v.fullPath] : []), ...v.previous]);
}

/** The rows as the screen draws them, each picture behind a short signed address. */
export async function showImages(rows: ImageRow[], userId: string): Promise<ShownImage[]> {
  const parsed = rows.map((row) => ({ row, variants: readVariants(row.variants, userId) }));
  const paths = parsed.flatMap((p) => p.variants.map((v) => v.path));
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await createAdminClient().storage.from(IMAGE_BUCKET).createSignedUrls(paths, IMAGE_URL_TTL_SECONDS);
    // An answer that is not a list signs nothing, rather than throwing the page away.
    for (const entry of Array.isArray(data) ? data : []) if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
  }
  return parsed.map(({ row, variants }) => ({
    id: row.id,
    prompt: row.prompt,
    aspect: readAspect(row.aspect),
    createdAt: row.created_at,
    variants: variants
      .filter((v) => signed.has(v.path))
      .map((v) => ({ index: v.index, url: signed.get(v.path)!, full: Boolean(v.fullPath) })),
  }));
}

/** An address that SAVES the picture under a readable name, rather than opening it. */
export async function downloadUrl(row: ImageRow, variant: ImageVariant, full: boolean): Promise<string | null> {
  const path = full ? variant.fullPath : variant.path;
  if (!path) return null;
  const { data } = await createAdminClient()
    .storage.from(IMAGE_BUCKET)
    .createSignedUrl(path, IMAGE_URL_TTL_SECONDS, { download: imageFilename(row.prompt, variant.index, full, variant.mime) });
  return data?.signedUrl ?? null;
}
