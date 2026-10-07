import "server-only";
import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import { checkAiCallAllowed } from "@/lib/ai-circuit-breaker";
import { getPurchasedPackCreditPriceEur, resolveEffectivePlan } from "@/lib/billing/credits";
import { planMeetsMinimum, type Plan, type PlanSlug } from "@/lib/billing/plans";
import { isFeatureOn } from "@/lib/flags/flags";
import { imageApiKey } from "@/lib/images/gemini-image";
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
 * WHAT EVERY IMAGE ROUTE DOES FIRST, written once (MASTER 16, package 19).
 *
 * The order is the one every paid route keeps (route-refusals gate): the
 * key, the person, the switch, the plan, then — for a route that spends —
 * the breaker and the bypass ceiling, and only then the price. Each
 * refusal is a CODE; the screen says it in the reader's language
 * (components/images/image-shell.tsx).
 *
 * THE PLAN. Images are Starter and up — the tier the Images page has
 * carried since the build modules (src/lib/build-modules.ts, minPlanSlug)
 * and the catalog row says (feature-catalog.ts, "imageStudio"). No tier is
 * decided here.
 */
export const IMAGE_MIN_PLAN: PlanSlug = "starter";

export type ImageContext = {
  user: User;
  supabase: Awaited<ReturnType<typeof createClient>>;
  plan: Plan | null;
  packPriceEur: number | null;
  prices: ImagePrices;
  bypass: boolean;
  apiKey: string;
};

export function refuse(code: string, status: number, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ ok: false, code, ...extra }, { status });
}

/**
 * The person, the switch and the plan; and when `spending`, the key, the
 * breaker and the ceiling. Returns a refusal or everything a route needs.
 */
export async function imageContext(options: { spending: boolean; fingerprint?: string; endpoint?: string }): Promise<ImageContext | NextResponse> {
  const apiKey = imageApiKey();
  if (options.spending && !apiKey) return refuse("not_configured", 503);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuse("not_signed_in", 401);
  if (!(await isFeatureOn("image-studio", user))) return refuse("not_enabled", 403);
  const isAdmin = isAdminEmail(user.email);
  const plan = await resolveEffectivePlan(user);
  if (!isAdmin && !planMeetsMinimum(plan?.slug ?? "free", IMAGE_MIN_PLAN)) return refuse("not_included", 403);

  let bypass = isAdmin;
  if (options.spending) {
    const breaker = await checkAiCallAllowed(user.id, options.endpoint ?? "image_generate", options.fingerprint ?? "");
    if (!breaker.allowed) return refuse("rate_limited", 429);
    const isBeta = await hasActiveBetaBypass(user);
    bypass = isAdmin || isBeta;
    if (bypass) {
      const ceiling = await checkBypassCeiling(user.id, isAdmin, isBeta);
      if (!ceiling.allowed) return refuse("bypass_ceiling", 429);
    }
  }
  const packPriceEur = await getPurchasedPackCreditPriceEur(user.id);
  return { user, supabase, plan, packPriceEur, prices: imagePrices(plan, packPriceEur), bypass, apiKey };
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

/** One row, the owner's only: read through the person's own session (RLS) AND filtered on user_id. */
export async function loadOwnImage(ctx: ImageContext, id: string): Promise<ImageRow | null> {
  const { data, error } = await ctx.supabase
    .from("generated_images")
    .select(IMAGE_ROW_COLUMNS)
    .eq("id", id)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (error) throw error;
  return (data as ImageRow | null) ?? null;
}

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
    for (const entry of data ?? []) if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
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
