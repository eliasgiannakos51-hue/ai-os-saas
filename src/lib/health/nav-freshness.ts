import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * HOW OLD IS THE NEWEST nav_events ROW, AND IS ANYBODY STILL HERE?
 *
 * THE GENERAL PROBLEM THIS EXISTS FOR. api/nav/track fails quiet by
 * design — a missed navigation costs one row, an error toast on a page
 * that rendered perfectly costs the reader's trust — and a probe that
 * fails silently cannot tell anybody that it failed. On 2026-09-11 the
 * owner read §29.0 of docs/analytics-queries.sql and found the newest
 * navigation row was four days old. Nothing anywhere had said so, and
 * nothing would have: the table simply stopped growing.
 *
 * ZERO ROWS HAS TWO CAUSES AND ONLY ONE OF THEM IS A FAULT: nobody
 * opened the dashboard, or every insert was refused. So this reports
 * BOTH ages — the newest navigation row, and the newest row in a table
 * written by ordinary use that does NOT go through api/nav/track. A
 * product being used while its navigation log stands still is the
 * failure; a quiet product is not.
 *
 * NOT PART OF `ok`, AND NOT PART OF THE STATUS CODE. A quiet weekend is
 * not an outage, and paging somebody for one is how the last version of
 * this endpoint had its meaning drained (see the note on `schema` in
 * api/health/route.ts). It is a field a monitor can watch on its own.
 */
export const NAV_STALE_HOURS = 48;

export type NavFreshness = {
  /** Hours since the newest nav_events row, or null if the table is empty. */
  navAgeHours: number | null;
  /** Hours since the newest row written by ordinary use elsewhere. */
  activityAgeHours: number | null;
  /**
   * "ok"        — navigation is being recorded.
   * "quiet"     — nothing anywhere. Nobody is using the product.
   * "STALE"     — the product is in use and navigation is NOT being
   *               recorded. This is the one that means something broke.
   * "unchecked" — the question could not be asked.
   */
  verdict: "ok" | "quiet" | "STALE" | "unchecked";
  /**
   * WHICH READS ACTUALLY HAPPENED, because "no rows" and "the query was
   * refused" arrive here as the same null and mean opposite things.
   *
   * THE BUG THIS EXISTS FOR, found 2026-09-26 by reading the code that
   * produced a live "quiet": newestAt() returned null on `error || !data`.
   * A refused read of rate_limit_log therefore set activityAgeHours to
   * null, and navVerdict read that as "nobody came" — so a BROKEN PROBE
   * reported the healthiest possible answer. docs/shapes.md keeps an
   * entry under exactly that name: the fallback that reported nothing, so
   * the failure looked like an answer.
   */
  asked: { nav: boolean; activity: boolean };
};

/**
 * THE VERDICT, AS A PURE FUNCTION — and it is separate so a test can RUN
 * it rather than describe it.
 *
 * scripts/tests/nav-freshness.test.mjs first re-implemented these four
 * branches in the test file and asserted against its own copy. Its
 * mutation suite is what exposed that: deleting the STALE branch here
 * left the arithmetic section green, because the arithmetic section was
 * never reading this code. A test that reproduces the logic it is
 * checking agrees with itself for ever.
 */
export function navVerdict(
  navAgeHours: number | null,
  activityAgeHours: number | null,
  // DEFAULTS TO "both reads happened", so every existing caller keeps its
  // meaning. The parameter exists for the one case the two-argument form
  // cannot express: a null that came from a refusal rather than an empty
  // table.
  asked: { nav: boolean; activity: boolean } = { nav: true, activity: true }
): NavFreshness["verdict"] {
  // A recent navigation row is proof on its own, whatever else failed.
  if (navAgeHours !== null && navAgeHours <= NAV_STALE_HOURS) return "ok";
  // Ordinary use with no navigation row is the fault, and it is still the
  // fault when the nav read was refused — a refusal is not a row.
  if (activityAgeHours !== null && activityAgeHours <= NAV_STALE_HOURS) return "STALE";
  // BEFORE "quiet", ask whether silence was even measured. Saying "nobody
  // came" on the strength of a question nobody managed to ask is the
  // worst answer available: it is calm, plausible and wrong.
  if (!asked.nav || !asked.activity) return "unchecked";
  if (navAgeHours === null && activityAgeHours === null) return "unchecked";
  return "quiet";
}

const hoursSince = (iso: unknown): number | null => {
  if (typeof iso !== "string") return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.round(((Date.now() - t) / 3_600_000) * 10) / 10;
};

/**
 * TWO ANSWERS, NOT ONE. `ageHours: null` used to carry both "the table is
 * empty" and "the database refused me", and the caller could not tell
 * them apart — so it treated a refusal as an empty table and reported a
 * healthy product. `asked` is the half that was missing.
 */
async function newestAt(
  supabase: SupabaseClient,
  table: string
): Promise<{ ageHours: number | null; asked: boolean }> {
  const { data, error } = await supabase
    .from(table)
    .select("created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ageHours: null, asked: false };
  if (!data) return { ageHours: null, asked: true };
  return { ageHours: hoursSince((data as { created_at?: unknown }).created_at), asked: true };
}

export async function navFreshness(supabase: SupabaseClient): Promise<NavFreshness> {
  try {
    // rate_limit_log IS THE COMPARISON AND NOT chat_messages, because it
    // is written on requests that never reach a model and never cost
    // anything — so it registers a visit the other tables would miss,
    // which is exactly the visit that makes a silent tracker detectable.
    const [nav, activity] = await Promise.all([
      newestAt(supabase, "nav_events"),
      newestAt(supabase, "rate_limit_log"),
    ]);
    const asked = { nav: nav.asked, activity: activity.asked };

    return {
      navAgeHours: nav.ageHours,
      activityAgeHours: activity.ageHours,
      verdict: navVerdict(nav.ageHours, activity.ageHours, asked),
      asked,
    };
  } catch {
    return {
      navAgeHours: null,
      activityAgeHours: null,
      verdict: "unchecked",
      asked: { nav: false, activity: false },
    };
  }
}
