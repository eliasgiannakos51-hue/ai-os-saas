import { isDigestWorthSending, type WorthVerdict } from "@/lib/notify/worth-sending";

/**
 * THE WEEKLY DIGEST, FROM REAL DATA — NEVER GENERIC.
 *
 * The brief is specific about what it should read like, and every line in
 * it is a number this database can answer:
 *
 *   "3 agents ran, 2 found something"     agent_runs
 *   "12 new records"                      the classifier module tables
 *   "your site: 45 visits"                site_analytics
 *   "you spent 340 credits (average 280)" ai_cost_log, vs the user's OWN
 *                                         previous weeks
 *   "what I noticed: 5 leads with no
 *    follow-up / spend up 20%"            leads, ai_cost_log
 *
 * Pure. No SDK, no database, no clock — collectDigestFacts in
 * digest-data.ts does the reading, and this decides what is worth saying
 * about it. That split is what lets the build gate exercise every
 * observation against hand-built numbers, including the ones that must
 * NOT appear.
 *
 * THE AVERAGE IS THE USER'S OWN. "You spent 340 credits (average: 280)"
 * is only useful if 280 is what THIS account normally spends. A
 * cross-account average would tell a heavy user they are fine and a light
 * one they are extravagant, and neither would be about them.
 */

export type DigestFacts = {
  /** Runs that finished in the window, by outcome. */
  agentRuns: number;
  /** Of those, how many produced output worth reading. */
  agentRunsWithFindings: number;
  /** New rows across the module tables. */
  newRecords: number;
  /** Sum of site_analytics.views for the window. null = no published
   *  site at all, which is different from a site with no visitors. */
  siteViews: number | null;
  siteViewsPrevious: number | null;
  creditsSpent: number;
  /** Mean weekly spend over the preceding weeks. null when there are not
   *  enough of them to mean anything. */
  creditsAveragePerWeek: number | null;
  /** Leads with no next_steps recorded. */
  leadsWithoutFollowUp: number;
  /** Agent runs that failed in the window. */
  agentRunsFailed: number;
};

export type DigestLine = { key: string; text: string };

export type DigestContent = {
  lines: DigestLine[];
  /** "What I noticed" — the half of the digest that is not a count. */
  observations: DigestLine[];
  worth: WorthVerdict;
};

/** Below this many prior weeks of data, "your average" is one number
 *  dressed up as a trend. */
export const MIN_WEEKS_FOR_AVERAGE = 2;

/** How far spend has to move before it is worth mentioning. 20% is the
 *  brief's own example, and anything under it is the ordinary week-to-week
 *  noise of a product where one deep-research run costs more than a
 *  hundred chats. */
export const SPEND_CHANGE_THRESHOLD_PERCENT = 20;

export function percentChange(now: number, before: number): number | null {
  // A change FROM zero has no percentage — "up infinity percent" is not a
  // fact, and 100% would be a lie about a baseline that did not exist.
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

/**
 * Turns the facts into the lines worth printing.
 *
 * A ZERO IS NOT A LINE. "0 agents ran" is the kind of true, useless
 * sentence rule 1 exists to stop — it is what a template produces, not
 * what a person would write. Each counter contributes a line only when it
 * has something in it, and if none of them do, `worth` says no and the
 * digest is not sent at all.
 */
export function buildDigest(facts: DigestFacts): DigestContent {
  const lines: DigestLine[] = [];
  const observations: DigestLine[] = [];

  if (facts.agentRuns > 0) {
    lines.push({
      key: "agents",
      // BOTH NUMBERS, always. "3 agents ran" alone invites the reader to
      // assume three results; "3 ran, 2 found something" is the fact, and
      // the gap between them is the interesting part.
      text: `${facts.agentRuns} agent ${facts.agentRuns === 1 ? "run" : "runs"}, ${facts.agentRunsWithFindings} found something`,
    });
  }

  if (facts.newRecords > 0) {
    lines.push({
      key: "records",
      text: `${facts.newRecords} new ${facts.newRecords === 1 ? "record" : "records"}`,
    });
  }

  // null means no published site. A user without one must not be told
  // "your site: 0 visits" — they do not have a site.
  if (facts.siteViews !== null) {
    lines.push({
      key: "site",
      text: `your site: ${facts.siteViews} ${facts.siteViews === 1 ? "visit" : "visits"}`,
    });
  }

  if (facts.creditsSpent > 0) {
    const average =
      facts.creditsAveragePerWeek !== null && facts.creditsAveragePerWeek > 0
        ? ` (your average: ${Math.round(facts.creditsAveragePerWeek)})`
        : "";
    lines.push({ key: "credits", text: `${facts.creditsSpent} credits spent${average}` });
  }

  // ---- WHAT I NOTICED -------------------------------------------------
  // Only things a person would act on. Each one names a number and a
  // place to go, because an observation with no action is a complaint.

  if (facts.leadsWithoutFollowUp > 0) {
    observations.push({
      key: "leads",
      text: `${facts.leadsWithoutFollowUp} ${
        facts.leadsWithoutFollowUp === 1 ? "lead has" : "leads have"
      } no follow-up recorded`,
    });
  }

  if (facts.creditsAveragePerWeek !== null) {
    const change = percentChange(facts.creditsSpent, facts.creditsAveragePerWeek);
    if (change !== null && Math.abs(change) >= SPEND_CHANGE_THRESHOLD_PERCENT) {
      observations.push({
        key: "spend_change",
        text: `spending is ${change > 0 ? "up" : "down"} ${Math.abs(change)}% on your average`,
      });
    }
  }

  if (facts.agentRunsFailed > 0) {
    observations.push({
      key: "agent_failures",
      text: `${facts.agentRunsFailed} agent ${facts.agentRunsFailed === 1 ? "run" : "runs"} failed`,
    });
  }

  if (facts.siteViews !== null && facts.siteViewsPrevious !== null) {
    const change = percentChange(facts.siteViews, facts.siteViewsPrevious);
    if (change !== null && Math.abs(change) >= SPEND_CHANGE_THRESHOLD_PERCENT) {
      observations.push({
        key: "traffic_change",
        text: `site traffic is ${change > 0 ? "up" : "down"} ${Math.abs(change)}%`,
      });
    }
  }

  return {
    lines,
    observations,
    // The counters decide. An observation on its own — "spending is down
    // 30%" in a week where nothing else happened — is not a week worth
    // an email about.
    worth: isDigestWorthSending({
      agents: facts.agentRuns,
      records: facts.newRecords,
      siteViews: facts.siteViews ?? 0,
      credits: facts.creditsSpent,
    }),
  };
}
