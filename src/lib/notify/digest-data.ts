import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { CLASSIFIER_MODULES } from "@/lib/classifier-modules";
import type { DigestFacts } from "@/lib/notify/digest";
import { MIN_WEEKS_FOR_AVERAGE } from "@/lib/notify/digest";

/**
 * THE READING HALF OF THE DIGEST.
 *
 * Every number here comes from a row that already exists because
 * something really happened. Nothing is estimated, nothing is a
 * placeholder, and a query that fails contributes NOTHING rather than a
 * zero — because a zero is a claim ("you had no visitors") and a failed
 * read is not.
 *
 * That distinction is why several fields are `number | null`: null means
 * "we could not say", and buildDigest prints no line for it. The
 * alternative — defaulting to 0 — would have the digest tell a user with
 * a busy site that nobody visited it, on a week when the analytics query
 * timed out.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** How many weeks back the personal average is computed from. Four is
 *  enough to smooth a single expensive research run without reaching so
 *  far back that a user's habits have changed underneath it. */
export const AVERAGE_WINDOW_WEEKS = 4;

export async function collectDigestFacts(params: {
  userId: string;
  /** End of the window. Injectable so a test can pin a week. */
  now?: Date;
}): Promise<DigestFacts> {
  const admin = createAdminClient();
  const now = params.now ?? new Date();
  const since = new Date(now.getTime() - WEEK_MS);
  const sinceIso = since.toISOString();
  const nowIso = now.toISOString();
  const previousStart = new Date(now.getTime() - 2 * WEEK_MS);
  const averageStart = new Date(now.getTime() - (AVERAGE_WINDOW_WEEKS + 1) * WEEK_MS);

  const facts: DigestFacts = {
    agentRuns: 0,
    agentRunsWithFindings: 0,
    agentRunsFailed: 0,
    newRecords: 0,
    siteViews: null,
    siteViewsPrevious: null,
    creditsSpent: 0,
    creditsAveragePerWeek: null,
    leadsWithoutFollowUp: 0,
  };

  // ---- agents ---------------------------------------------------------
  try {
    const { data, error } = await admin
      .from("agent_runs")
      .select("status, output")
      .eq("user_id", params.userId)
      .gte("started_at", sinceIso)
      .lt("started_at", nowIso)
      .limit(2_000);
    if (error) throw error;
    for (const row of data ?? []) {
      const status = String(row.status ?? "");
      if (status === "running") continue;
      facts.agentRuns += 1;
      if (status === "failed") facts.agentRunsFailed += 1;
      // "FOUND SOMETHING" IS THE SAME TEST THE NOTIFICATION USES —
      // non-empty output on a successful run. A run that succeeded and
      // returned nothing is a run, not a finding, and counting it as one
      // here would contradict the notification the user did not get.
      const output = typeof row.output === "string" ? row.output.trim() : "";
      if (status === "success" && output.length > 0) facts.agentRunsWithFindings += 1;
    }
  } catch (err) {
    logApiError("notify:digest", err, { stage: "agent_runs" });
  }

  // ---- new records across the module tables ---------------------------
  const moduleCounts = await Promise.all(
    CLASSIFIER_MODULES.map(async (m) => {
      try {
        const { count, error } = await admin
          .from(m.table)
          .select("id", { count: "exact", head: true })
          .eq("user_id", params.userId)
          .gte("created_at", sinceIso)
          .lt("created_at", nowIso);
        if (error) throw error;
        return count ?? 0;
      } catch (err) {
        logApiError("notify:digest", err, { stage: "module_count", table: m.table });
        return 0;
      }
    })
  );
  facts.newRecords = moduleCounts.reduce((sum, n) => sum + n, 0);

  // ---- the published site ---------------------------------------------
  try {
    const { count: siteCount, error: siteError } = await admin
      .from("published_sites")
      .select("id", { count: "exact", head: true })
      .eq("user_id", params.userId);
    if (siteError) throw siteError;

    // NO SITE MEANS NO LINE, not "0 visits". Only a user who has
    // published something can be told how it did.
    if ((siteCount ?? 0) > 0) {
      const { data, error } = await admin
        .from("site_analytics")
        .select("date, views")
        .eq("user_id", params.userId)
        // `date` is a DATE column, so it is compared against a date
        // string — passing an ISO timestamp here would be a silent
        // cast and an off-by-one at the window edges.
        .gte("date", previousStart.toISOString().slice(0, 10))
        .lte("date", now.toISOString().slice(0, 10))
        .limit(1_000);
      if (error) throw error;

      let current = 0;
      let previous = 0;
      const boundary = since.toISOString().slice(0, 10);
      for (const row of data ?? []) {
        const day = String(row.date ?? "");
        const views = Number(row.views ?? 0) || 0;
        if (day >= boundary) current += views;
        else previous += views;
      }
      facts.siteViews = current;
      facts.siteViewsPrevious = previous;
    }
  } catch (err) {
    logApiError("notify:digest", err, { stage: "site_analytics" });
  }

  // ---- credits, and the user's OWN average ----------------------------
  try {
    const { data, error } = await admin
      .from("ai_cost_log")
      .select("credits_charged, created_at")
      .eq("user_id", params.userId)
      .gte("created_at", averageStart.toISOString())
      .lt("created_at", nowIso)
      .limit(20_000);
    if (error) throw error;

    let spentThisWeek = 0;
    // One bucket per preceding week, so the average is over WEEKS the
    // user existed for rather than over rows.
    const priorWeeks = new Array<number>(AVERAGE_WINDOW_WEEKS).fill(0);
    for (const row of data ?? []) {
      const at = new Date(String(row.created_at));
      const credits = Number(row.credits_charged ?? 0) || 0;
      const weeksAgo = Math.floor((now.getTime() - at.getTime()) / WEEK_MS);
      if (weeksAgo <= 0) {
        spentThisWeek += credits;
      } else if (weeksAgo <= AVERAGE_WINDOW_WEEKS) {
        priorWeeks[weeksAgo - 1] += credits;
      }
    }
    facts.creditsSpent = spentThisWeek;

    // WEEKS THE ACCOUNT ACTUALLY EXISTED FOR. Averaging over four weeks
    // when the account is nine days old divides a real number by two
    // weeks of nothing and reports an average half what the user spends.
    const { data: created } = await admin.auth.admin.getUserById(params.userId);
    const createdAt = created?.user?.created_at ? new Date(created.user.created_at) : null;
    const ageWeeks = createdAt ? Math.floor((now.getTime() - createdAt.getTime()) / WEEK_MS) : AVERAGE_WINDOW_WEEKS;
    const usableWeeks = Math.min(AVERAGE_WINDOW_WEEKS, Math.max(0, ageWeeks));

    if (usableWeeks >= MIN_WEEKS_FOR_AVERAGE) {
      const total = priorWeeks.slice(0, usableWeeks).reduce((sum, n) => sum + n, 0);
      facts.creditsAveragePerWeek = total / usableWeeks;
    }
  } catch (err) {
    logApiError("notify:digest", err, { stage: "credits" });
  }

  // ---- what I noticed: leads with nothing after them -------------------
  try {
    const { data, error } = await admin
      .from("leads")
      .select("next_steps")
      .eq("user_id", params.userId)
      // Only leads old enough that a follow-up would be overdue. One
      // added an hour ago has not been neglected, and saying so would
      // train the user to ignore the observation.
      .lt("created_at", sinceIso)
      .limit(5_000);
    if (error) throw error;
    // COUNTED IN CODE, not with .is("next_steps", null). A lead saved
    // through a form with the field left blank stores an EMPTY STRING,
    // which is not null and would not have been counted — so the
    // observation would have quietly missed exactly the leads most likely
    // to have been forgotten.
    facts.leadsWithoutFollowUp = (data ?? []).filter(
      (row) => typeof row.next_steps !== "string" || row.next_steps.trim().length === 0
    ).length;
  } catch (err) {
    logApiError("notify:digest", err, { stage: "leads" });
  }

  return facts;
}
