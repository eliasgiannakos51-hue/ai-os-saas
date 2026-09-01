import type { Plan } from "@/lib/billing/plans";

/**
 * HOW MUCH OF THE OWNER'S OWN PHOTOGRAPHY WE WILL HOLD.
 *
 * Uploads go straight from the browser to Storage — the app never sees
 * the bytes — so nothing has ever bounded this. A free account can put
 * twenty 5MB photographs behind every generation, forever, and the only
 * thing that eventually notices is a bill.
 *
 * TWO MECHANISMS, and neither alone is enough. Be exact about which is
 * which, because a quota that is only advisory and is described as
 * enforced is worse than no quota:
 *
 *   THE QUOTA, checked before the browser uploads. It is ADVISORY: the
 *   Storage RLS policy lets a user write into their own folder, so
 *   somebody driving the API directly can still exceed it. It stops the
 *   ordinary case — a person with a folder of holiday photos — which is
 *   the case that actually happens.
 *
 *   THE CLEANUP, which is what bounds growth for real. Files nothing
 *   references are removed on a schedule, so an account that goes over
 *   comes back under without anyone intervening.
 *
 * The limits are per ACCOUNT, not per site. A site is deleted far more
 * often than a photograph stops being wanted, and a per-site allowance
 * would mean the same logo counted five times.
 */

const MB = 1024 * 1024;

/**
 * Deliberately generous. This is not a revenue lever — it exists so one
 * account cannot become the storage bill. 50MB is roughly ten to twenty
 * real photographs after the WebP derivative
 * (lib/website-reference-image-server.ts) has done its work.
 */
export const STORAGE_LIMIT_BYTES: Record<string, number> = {
  free: 50 * MB,
  starter: 250 * MB,
  growth: 1024 * MB,
  professional: 5 * 1024 * MB,
  ultimate: 20 * 1024 * MB,
  enterprise: 100 * 1024 * MB,
};

/** An unknown or absent plan gets the FREE allowance, not an unlimited
 *  one. Guessing generously here is how a misconfigured tier becomes an
 *  account with no ceiling at all. */
export const DEFAULT_STORAGE_LIMIT_BYTES = STORAGE_LIMIT_BYTES.free;

export function storageLimitBytes(plan: Plan | { slug: string } | null | undefined): number {
  const slug = plan?.slug;
  if (!slug) return DEFAULT_STORAGE_LIMIT_BYTES;
  return STORAGE_LIMIT_BYTES[slug] ?? DEFAULT_STORAGE_LIMIT_BYTES;
}

export type StorageUsage = {
  usedBytes: number;
  limitBytes: number;
  /** 0..1, clamped — a value over 1 is a real state (the cleanup has not
   *  run yet) and the bar has to render it as full rather than overflow. */
  fraction: number;
  remainingBytes: number;
};

export function summariseStorage(usedBytes: number, limitBytes: number): StorageUsage {
  const used = Number.isFinite(usedBytes) && usedBytes > 0 ? usedBytes : 0;
  const limit = Number.isFinite(limitBytes) && limitBytes > 0 ? limitBytes : DEFAULT_STORAGE_LIMIT_BYTES;
  return {
    usedBytes: used,
    limitBytes: limit,
    fraction: Math.min(used / limit, 1),
    remainingBytes: Math.max(limit - used, 0),
  };
}

export type UploadDecision =
  | { ok: true; remainingBytes: number }
  | { ok: false; reason: "over_quota"; neededBytes: number; remainingBytes: number };

/**
 * Whether this batch of files fits.
 *
 * JUDGED ON THE WHOLE BATCH, not file by file. Six photographs that each
 * fit individually and do not fit together is exactly the upload a
 * per-file check waves through and then half-completes — and a
 * half-completed batch is a generation with some of the owner's photos
 * missing, which looks like the model ignoring them.
 */
export function canUpload(usage: StorageUsage, incomingBytes: number[]): UploadDecision {
  const needed = incomingBytes.reduce((sum, n) => sum + (Number.isFinite(n) && n > 0 ? n : 0), 0);
  if (needed <= usage.remainingBytes) {
    return { ok: true, remainingBytes: usage.remainingBytes - needed };
  }
  return { ok: false, reason: "over_quota", neededBytes: needed, remainingBytes: usage.remainingBytes };
}

// The second copy is gone. It returned "0 MB" for NaN and for every
// negative — including the over-quota figure website-builder passes it,
// which is the one case where the sign is the whole message.
export { formatBytes } from "@/lib/format-bytes";
