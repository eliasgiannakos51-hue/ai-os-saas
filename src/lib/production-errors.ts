import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Production error tracking.
 *
 * The goal is not a log of every exception — it is an answer to "is
 * something broken right now, and for how many people". Identical errors
 * collapse onto one fingerprint with a counter, so the owner sees five
 * distinct problems rather than five thousand rows.
 */

export const ALERT_MIN_OCCURRENCES = 3;
export const ALERT_MIN_USERS = 2;

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function alertWindowMinutes(): number {
  return num("ERROR_ALERT_WINDOW_MINUTES", 15);
}
export function alertCooldownMinutes(): number {
  return num("ERROR_ALERT_COOLDOWN_MINUTES", 60);
}

/**
 * Strips the parts of a message that differ between two occurrences of
 * the SAME bug — ids, timestamps, quoted values, line/column numbers.
 *
 * Without this, "record 4f2a… not found" and "record 91bc… not found"
 * are two fingerprints and the counter never reaches the alert
 * threshold, which is precisely the case you most want to be alerted
 * about.
 */
export function normaliseMessage(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\b\d{4}-\d{2}-\d{2}T[\d:.]+Z?\b/g, "<timestamp>")
    // No \b anchors: there is no word boundary between a digit and a
    // letter, so /\b\d+\b/ would leave "3021ms" and "5544ms" as two
    // different fingerprints — the exact case where the counter needs to
    // add up rather than split.
    .replace(/\d+/g, "<n>")
    .replace(/'[^']*'|"[^"]*"/g, "<value>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

export function fingerprintError(message: string, route: string): string {
  return createHash("sha256")
    .update(`${route}::${normaliseMessage(message)}`)
    .digest("hex")
    .slice(0, 32);
}

export type RecordResult = {
  occurrenceCount: number;
  affectedUsers: number;
  recentCount: number;
  shouldAlert: boolean;
};

/**
 * Records one occurrence and reports whether the owner should be emailed.
 *
 * Returns null rather than throwing on any failure. Error tracking that
 * can itself throw turns one broken request into two, and the original
 * error is the one that matters.
 */
export async function recordProductionError(params: {
  message: string;
  stack?: string | null;
  route: string;
  userId?: string | null;
}): Promise<RecordResult | null> {
  if (process.env.ERROR_TRACKING_ENABLED === "false") return null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("record_production_error", {
      p_fingerprint: fingerprintError(params.message, params.route),
      p_message: params.message.slice(0, 2000),
      p_stack: params.stack?.slice(0, 8000) ?? null,
      p_route: params.route,
      p_user_id: params.userId ?? null,
      p_alert_window: `${alertWindowMinutes()} minutes`,
      p_alert_cooldown: `${alertCooldownMinutes()} minutes`,
    });
    if (error) throw error;

    const row = (Array.isArray(data) ? data[0] : data) as
      | { occurrence_count: number; affected_users: number; recent_count: number; should_alert: boolean }
      | undefined;
    if (!row) return null;

    return {
      occurrenceCount: Number(row.occurrence_count),
      affectedUsers: Number(row.affected_users),
      recentCount: Number(row.recent_count),
      shouldAlert: Boolean(row.should_alert),
    };
  } catch {
    // Deliberately silent: logApiError is the caller, so logging here
    // would recurse.
    return null;
  }
}
