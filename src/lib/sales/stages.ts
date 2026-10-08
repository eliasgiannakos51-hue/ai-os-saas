/**
 * WHERE A CONTACT STANDS, AND WHEN TO BE REMINDED (MASTER 16, package 18:
 * «περνάω μια επαφή από στάδιο σε στάδιο, με υπενθύμιση»), behind the
 * switch "finance-sales". The stages are the column's own CHECK
 * (supabase/migrations/20261023000000_lead_stages.sql), in order.
 *
 * Pure: scripts/tests/finance-sales.test.mjs runs it.
 */
export const LEAD_STAGES = ["new", "contacted", "meeting", "proposal", "won", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export function isLeadStage(value: unknown): value is LeadStage {
  return typeof value === "string" && (LEAD_STAGES as readonly string[]).includes(value);
}

/** The stage after this one; a closed contact (won, lost) has none. */
export function nextStage(stage: LeadStage): LeadStage | null {
  const ORDER: Record<LeadStage, LeadStage | null> = {
    new: "contacted",
    contacted: "meeting",
    meeting: "proposal",
    proposal: "won",
    won: null,
    lost: null,
  };
  return ORDER[stage];
}

/** How far ahead a reminder may be set. */
export const MAX_REMINDER_DAYS = 365;

/**
 * A reminder as sent: an ISO time in the future, within a year — or null
 * for none. Anything else is refused rather than guessed.
 */
export function readReminder(raw: unknown, now: Date): { ok: true; at: string | null } | { ok: false } {
  if (raw === null || raw === undefined || raw === "") return { ok: true, at: null };
  if (typeof raw !== "string") return { ok: false };
  const at = new Date(raw);
  if (Number.isNaN(at.getTime())) return { ok: false };
  const ms = at.getTime() - now.getTime();
  if (ms <= 0 || ms > MAX_REMINDER_DAYS * 86_400_000) return { ok: false };
  return { ok: true, at: at.toISOString() };
}
