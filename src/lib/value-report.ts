// "Your impact this month", built only out of things that really
// happened.
//
// THE RULE THIS FILE EXISTS TO ENFORCE: report what occurred, never what
// it was worth.
//
// Every value dashboard in every SaaS product wants to say "you saved 14
// hours this month". That number is invented. Nobody measured those
// hours, nobody knows what the user would otherwise have done, and the
// figure is chosen because it is flattering rather than because it is
// true. It is also the fastest way to lose somebody's trust in every
// other number on the page — a person who knows one figure is made up
// has no way to tell which of the others are.
//
// So this counts: agent runs that happened while nobody was watching,
// decks generated, sites published, research reports written, AI actions
// settled, credits actually spent. Each is a row in a table. If a claim
// cannot be traced to rows, it does not appear.
//
// Pure and free of I/O so the rules can be tested without a database;
// the loader that fetches the counts lives in the page.

// Mission steps completed and documents asked about are DELIBERATELY
// absent. Neither can be counted with a cheap correct query — steps live
// inside a jsonb plan and "asked about" is a feature string in a cost
// log — and reporting 0 for something that was never counted is the same
// dishonesty as inventing a number, wearing a humbler face.
export type ValueCounts = {
  /** Executions of scheduled agents — the one category where work
   *  happened without the user present, which is the product's whole
   *  claim. Counted separately from everything else for that reason. */
  agentRuns: number;
  presentations: number;
  websitesPublished: number;
  researchReports: number;
  /** Every settled AI action, from ai_cost_log. Activity rather than
   *  outcome, which is why it ranks last. */
  aiActions: number;
  creditsSpent: number;
};

export type ValueHighlight = {
  /** i18n key under dashboard.valueReport.lines.<key>. */
  key: string;
  count: number;
};

export type ValueReport =
  | { kind: "too_early" }
  | { kind: "quiet" }
  | { kind: "report"; headline: ValueHighlight; others: ValueHighlight[]; creditsSpent: number };

/**
 * The account has to be old enough for "this month" to mean anything.
 *
 * A dashboard telling somebody on their second day what their month
 * looked like is reporting on two days and calling it a month. Seven
 * days is the point at which the window is worth summarising.
 */
export const MIN_ACCOUNT_AGE_DAYS = 7;

export function accountIsOldEnough(createdAt: string, now: Date = new Date()): boolean {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return false;
  const days = (now.getTime() - created.getTime()) / (24 * 60 * 60 * 1000);
  return days >= MIN_ACCOUNT_AGE_DAYS;
}

/**
 * Turn counts into what to show.
 *
 * The HEADLINE is chosen by a fixed priority, not by whichever number is
 * biggest. Biggest-wins would lead with "412 AI actions" — a number that
 * measures activity rather than outcome, and one a person cannot do
 * anything with. The order below is by how much the thing MATTERED:
 * work that ran unattended first, then things that now exist, then
 * activity.
 */
const PRIORITY: { key: keyof ValueCounts; label: string }[] = [
  { key: "agentRuns", label: "agentRuns" },
  { key: "websitesPublished", label: "websitesPublished" },
  { key: "presentations", label: "presentations" },
  { key: "researchReports", label: "researchReports" },
  { key: "aiActions", label: "aiActions" },
];

export function buildValueReport(params: {
  counts: ValueCounts;
  accountCreatedAt: string;
  now?: Date;
}): ValueReport {
  if (!accountIsOldEnough(params.accountCreatedAt, params.now)) return { kind: "too_early" };

  const present = PRIORITY.map(({ key, label }) => ({ key: label, count: params.counts[key] })).filter(
    (line) => line.count > 0
  );

  // Nothing happened. Said as its own state rather than as a report of
  // zeros: "0 presentations, 0 published sites, 0 agent runs" is a
  // scoreboard of failure, and the product put it in front of them.
  if (present.length === 0) return { kind: "quiet" };

  const [headline, ...others] = present;
  return {
    kind: "report",
    headline,
    // Three at most. A list of seven lines is a report nobody reads, and
    // the tail is always the least interesting.
    others: others.slice(0, 3),
    creditsSpent: Math.max(0, Math.round(params.counts.creditsSpent)),
  };
}
