import { isDigestWorthSending, type WorthVerdict } from "@/lib/notify/worth-sending";

/**
 * THE WEEKLY DIGEST, FROM REAL DATA — NEVER GENERIC.
 *
 * The brief is specific about what it should read like, and every line in
 * it is a number this database can answer. In English, which is one of the
 * ten languages it is sent in (messages/*.json, email.digest.lines):
 *
 *   "3 agent runs, 2 with a result"       agent_runs
 *   "12 new records"                      the classifier module tables
 *   "your site: 45 visits"                site_analytics
 *   "340 credits spent (your average:
 *    280)"                                ai_cost_log, vs the user's OWN
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
 * THE AVERAGE IS THE USER'S OWN. "340 credits spent (your average: 280)"
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

/**
 * ONE LINE OF THE DIGEST, WITHOUT ITS WORDS.
 *
 * It used to carry `text`, composed here, in English, with `n === 1 ?
 * "run" : "runs"` baked into a template literal. That is the English
 * plural rule spelled as though it were arithmetic: Arabic has six
 * categories, Japanese and Chinese have one, and Greek's two do not split
 * where English's do. A digest whose chrome was translated and whose
 * lines were not would have been a Greek heading over English sentences —
 * worse than an honest English email, and the shape docs/shapes.md calls
 * "the check covers the participants".
 *
 * So the decision about WHAT IS WORTH SAYING stays here, and the words
 * are looked up where the language is known. `digestLineText` below does
 * that, and it takes the translator as an argument so this module stays
 * pure — no catalogue, no request, no server-only import.
 */
export type DigestLine = {
  /** Stable identity: what the line IS, unchanged by any wording. The
   *  build gate asserts on this, so a rephrasing cannot move it. */
  key: string;
  /** The key under `email.digest.lines` that says it, in whatever
   *  language. Two lines can share an identity and differ here — spend
   *  with and without an average, traffic up and traffic down. */
  message: string;
  /** The number the plural form is selected from, or null for a line
   *  that has none (a percentage does not inflect its noun). */
  count: number | null;
  /** Everything else the sentence substitutes. `count` is supplied by the
   *  translator itself and is not repeated here. */
  vars: Record<string, number>;
};

/** What a translator has to be able to do for a digest line. Structural
 *  on purpose: lib/email/email-locale.ts satisfies it, and so does a
 *  three-line stub in a test, which is what keeps this module loadable
 *  without the catalogue. */
export type DigestTranslator = {
  (key: string, vars?: Record<string, string | number>): string;
  n(key: string, count: number, vars?: Record<string, string | number>): string;
};

/** The line, in the reader's language. */
export function digestLineText(line: DigestLine, t: DigestTranslator): string {
  const key = `email.digest.lines.${line.message}`;
  return line.count === null ? t(key, line.vars) : t.n(key, line.count, line.vars);
}

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
      // assume three results; "3 ran, 2 with a result" is the fact, and
      // the gap between them is the interesting part.
      //
      // The second clause is a noun phrase rather than a verb ("2 found
      // something") because the verb is the one word that would have to
      // agree with a SECOND count: English "found" does not inflect,
      // Greek "βρήκε/βρήκαν" does, and one sentence cannot carry two
      // plural forms through a catalogue keyed on one.
      message: "agents",
      count: facts.agentRuns,
      vars: { runs: facts.agentRuns, found: facts.agentRunsWithFindings },
    });
  }

  if (facts.newRecords > 0) {
    lines.push({ key: "records", message: "records", count: facts.newRecords, vars: {} });
  }

  // null means no published site. A user without one must not be told
  // "your site: 0 visits" — they do not have a site.
  if (facts.siteViews !== null) {
    lines.push({ key: "site", message: "site", count: facts.siteViews, vars: {} });
  }

  if (facts.creditsSpent > 0) {
    // THE SAME LINE WITH AND WITHOUT THE COMPARISON IS TWO SENTENCES, not
    // one sentence plus an appended fragment. A parenthesis glued on in
    // code is an English word order; where the average goes is the
    // catalogue's decision.
    const hasAverage = facts.creditsAveragePerWeek !== null && facts.creditsAveragePerWeek > 0;
    lines.push({
      key: "credits",
      message: hasAverage ? "creditsWithAverage" : "credits",
      count: facts.creditsSpent,
      vars: hasAverage ? { average: Math.round(facts.creditsAveragePerWeek as number) } : {},
    });
  }

  // ---- WHAT I NOTICED -------------------------------------------------
  // Only things a person would act on. Each one names a number and a
  // place to go, because an observation with no action is a complaint.

  if (facts.leadsWithoutFollowUp > 0) {
    observations.push({ key: "leads", message: "leads", count: facts.leadsWithoutFollowUp, vars: {} });
  }

  if (facts.creditsAveragePerWeek !== null) {
    const change = percentChange(facts.creditsSpent, facts.creditsAveragePerWeek);
    if (change !== null && Math.abs(change) >= SPEND_CHANGE_THRESHOLD_PERCENT) {
      observations.push({
        key: "spend_change",
        message: change > 0 ? "spendUp" : "spendDown",
        count: null,
        vars: { percent: Math.abs(change) },
      });
    }
  }

  if (facts.agentRunsFailed > 0) {
    observations.push({
      key: "agent_failures",
      message: "agentFailures",
      count: facts.agentRunsFailed,
      vars: {},
    });
  }

  if (facts.siteViews !== null && facts.siteViewsPrevious !== null) {
    const change = percentChange(facts.siteViews, facts.siteViewsPrevious);
    if (change !== null && Math.abs(change) >= SPEND_CHANGE_THRESHOLD_PERCENT) {
      observations.push({
        key: "traffic_change",
        message: change > 0 ? "trafficUp" : "trafficDown",
        count: null,
        vars: { percent: Math.abs(change) },
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
