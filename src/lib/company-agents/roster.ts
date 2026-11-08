/**
 * THE COMPANY'S OWN AGENTS — THE WHOLE ROSTER, WITH WHAT IS TRUE OF EACH.
 *
 * These are Ionexa's internal workers: the ones that watch, check and
 * report on the product and the business. They are NOT the customer-facing
 * agents in public.user_agents (src/lib/agents/).
 *
 * THE LIST IS LONG ON PURPOSE AND HONEST ON PURPOSE. A roster in which
 * every name looks alive would repeat the thing this product already
 * suffered once — dashboard squares that exist and do nothing. So every
 * entry carries one of four statuses, and only the first means code is
 * running:
 *
 *   running  code exists AND something schedules it (a Vercel cron).
 *   built    code exists, nothing schedules it yet.
 *   blocked  cannot work until something missing exists (`blockedBy`).
 *   planned  nothing written; nothing in the way either.
 *
 * `autonomy` is the ceiling, not the current behaviour:
 *   1 = reads and reports, never changes anything.
 *   2 = prepares a draft or a pull request and waits for the owner.
 *   3 = acts alone, for reversible, bounded actions with no customer
 *       contact only.
 *
 * KEPT HONEST BY A GATE. scripts/tests/company-agents.test.mjs holds that
 * every `running` entry has an implementation the runner executes, that
 * every `blocked` entry names a reason from BLOCKERS, and that no
 * customer-contact, money or legal action is rated above autonomy 2.
 * RUNNING_AGENT_IDS below is what the runner reads, so the roster cannot
 * say "running" about an agent the runner does not run.
 */

export type RosterStatus = "running" | "built" | "blocked" | "planned";
export type Autonomy = 1 | 2 | 3;

/** What an agent can be waiting on. Each is a fact about the repository
 *  as measured on 2026-11-06 (see docs/PROGRESS.md), not an opinion.
 *
 *  FIVE REASONS WERE REMOVED ON 2026-11-07 (crm, tickets, gmail-send,
 *  human-only, video-tool) and that was a correction, not progress: they
 *  blocked agents that ACT on a system that does not exist, but a draft
 *  agent needs only a brief. Those agents now exist as draft agents and say
 *  in their missions what they cannot do (send, track, apply, file). */
export const BLOCKERS = {
  analytics: "No analytics package is installed (package.json has no PostHog, Plausible, Mixpanel, Umami or Amplitude). Owner-run SQL queries exist in docs/analytics-queries.sql; whether they cover what these agents need was not measured.",
  "supabase-token": "No Supabase management API token is configured (no such variable is read in src/ or listed in docs/api-keys.md), so nothing running here can ask Supabase about its backups. Deployments are a different case: the deployment monitor reads them from GitHub.",
} as const;
export type BlockerKey = keyof typeof BLOCKERS;

export type RosterAgent = {
  id: string;
  department: DepartmentKey;
  name: string;
  mission: string;
  autonomy: Autonomy;
  status: RosterStatus;
  blockedBy?: BlockerKey;
};

export const DEPARTMENTS = {
  executive: "Executive",
  development: "Development",
  sales: "Sales",
  marketing: "Marketing",
  support: "Support",
  finance: "Finance",
  research: "Research",
  security: "Security",
  devops: "DevOps",
  legal: "Legal & compliance",
  hr: "People",
  success: "Customer success",
  data: "Data & analytics",
  admin: "Administration",
} as const;
export type DepartmentKey = keyof typeof DEPARTMENTS;

/** The agents the runner (lib/company-agents/run.ts) executes today. The
 *  roster's `running` entries must equal this list, both ways. */
export const RUNNING_AGENT_IDS = ["error-log-analyst", "api-uptime-monitor", "database-health", "queue-monitor", "budget-monitor", "fraud-alert", "cost-per-agent", "expense-tracker", "kpi-monitor", "usage-monitor", "churn-predictor", "retention", "upsell", "anomaly-detector", "sales-analytics", "data-quality", "attribution", "cost-optimizer", "revenue-tracker", "headers-checker", "task-auditor", "daily-reporter"] as const;

/** The agents that run in CI, on every push, from scripts/company-agents/repo-agents.mjs.
 *  They need the repository's files, which the Vercel runner does not have, so their result
 *  is on the CI job's summary page and NOT in the System Health section above. The roster's
 *  `running` entries equal RUNNING_AGENT_IDS plus this list, both ways. */
export const CI_AGENT_IDS = ["secrets-scanner", "cron-monitor", "migration-ledger", "license-monitor", "vulnerability-scanner", "gates-agent", "testing-wrapper", "deployment-monitor"] as const;

type Row = [id: string, name: string, mission: string, autonomy: Autonomy, status: RosterStatus, blockedBy?: BlockerKey];

function dept(department: DepartmentKey, rows: Row[]): RosterAgent[] {
  return rows.map(([id, name, mission, autonomy, status, blockedBy]) => ({
    id,
    department,
    name,
    mission,
    autonomy,
    status,
    ...(blockedBy ? { blockedBy } : {}),
  }));
}

export const ROSTER: RosterAgent[] = [
  ...dept("executive", [
    ["manager", "Manager", "Drafts the split of a goal into tasks, owners and checks. The owner assigns; nothing is started by it.", 2, "built"],
    ["agent-builder", "Agent builder", "Creates a new internal agent from an approved template.", 2, "built"],
    ["goal-tracker", "Goal tracker", "Compares goals with the figures pasted in and says which are on track. It has no goals of its own stored anywhere.", 1, "built"],
    ["kpi-monitor", "KPI monitor", "Counts accounts and new accounts this week against last, from company_kpis(). Warns when new accounts fall by more than half (10+ the week before). Not web traffic.", 1, "running"],
    ["daily-reporter", "Daily reporter", "One line over the day's run: how many agents are ok, warn, fail or unverified, and which need a look. Recorded as a row; not sent anywhere yet.", 1, "running"],
    ["weekly-reporter", "Weekly reporter", "The weekly roll-up across every department.", 1, "built"],
    ["decision-analyst", "Decision analyst", "Lays out the options, costs and risks for a decision.", 1, "built"],
    ["priority-agent", "Priority agent", "Orders the work by stated rules.", 1, "built"],
    ["resource-manager", "Resource manager", "Watches time, compute and cost per agent.", 1, "built"],
    ["task-auditor", "Task auditor", "Checks that every scheduled agent produced a row in the last 36 hours. It audits agent runs, not human or pull-request work.", 1, "running"],
    ["final-approval", "Final approval", "Reports whether a change is really finished, from the diff and the PR text. Never says the gates passed unless it was given a real result.", 1, "built"],
  ]),
  ...dept("development", [
    ["gates-agent", "Gates agent", "Checks in CI that the workflow still runs `npm run gates` on push and cannot pass it silently (no continue-on-error). It does not run the gates or say whether they pass: the CI job does.", 1, "running"],
    ["testing-wrapper", "Testing wrapper", "Checks in CI that the workflow still runs the mutation, integration and database suites and that none can fail open. It runs none of them itself.", 1, "running"],
    ["code-review", "Code review", "Reads a diff against CLAUDE.md's rules before a merge.", 2, "built"],
    ["bug-detection", "Bug detection", "Finds problems from errors and tests.", 1, "built"],
    ["bug-fix", "Bug fix", "Proposes a fix as a pull request, never committing to main.", 2, "built"],
    ["migration-ledger", "Migration ledger", "Checks the migration files: every one since 20261016000000 has an undo note and every name starts with a date. Runs in CI on every push. It cannot say which are applied (npm run db:pending does, with DATABASE_URL).", 1, "running"],
    ["product-research", "Product research", "Looks into what the market needs.", 1, "built"],
    ["product-spec", "Product specification", "Turns an idea into written requirements.", 2, "built"],
    ["architecture", "Architecture", "Sketches the technical design of a change.", 2, "built"],
    ["frontend-dev", "Frontend developer", "Writes interface code as a pull request.", 2, "built"],
    ["backend-dev", "Backend developer", "Writes server code as a pull request.", 2, "built"],
    ["database-dev", "Database developer", "Writes migrations as a pull request, each with its undo.", 2, "built"],
    ["documentation", "Documentation", "Keeps the technical docs and PROGRESS entries current.", 2, "built"],
    ["accessibility", "Accessibility", "Checks screens for accessibility problems.", 1, "built"],
    ["performance", "Performance", "Measures speed and reports regressions.", 1, "built"],
    ["release-manager", "Release manager", "Prepares a release and its release notes.", 2, "built"],
    ["rollback", "Rollback", "Prepares the steps to take a release back.", 2, "built"],
  ]),
  ...dept("sales", [
    ["lead-finder", "Lead finder", "Finds businesses matching a profile on the open web, with sources. It does not store leads anywhere.", 1, "built"],
    ["lead-researcher", "Lead researcher", "Collects public facts about one lead from the open web, with sources.", 1, "built"],
    ["lead-qualifier", "Lead qualifier", "Judges one lead from the notes pasted in. It has no pipeline of its own to read.", 1, "built"],
    ["crm-manager", "CRM manager", "Turns pasted notes into clean customer records. It does not write to public.leads or any CRM.", 2, "built"],
    ["email-drafter", "Email drafter", "Writes an outreach draft. It cannot send mail: Gmail is connected read-only, and nothing here sends.", 2, "built"],
    ["follow-up", "Follow-up", "Lists next steps from pasted notes and drafts follow-ups. It does not track anything between uses.", 2, "built"],
    ["proposal-writer", "Proposal writer", "Drafts a proposal for the owner to review and sign off. Prices come only from the brief.", 2, "built"],
    ["pricing-agent", "Pricing agent", "Suggests prices inside limits the owner states. It sees no sales data and applies nothing.", 2, "built"],
    ["sales-analytics", "Sales analytics", "Reports the share of accounts that pay. There is no funnel data: visits and conversion are not recorded.", 1, "running"],
    ["affiliate-manager", "Affiliate manager", "Watches partners and commissions. The monthly payout cron already exists; the agent on top of it does not.", 1, "built"],
    ["onboarding", "Onboarding", "Walks a new customer through the first steps.", 2, "built"],
    ["retention", "Retention", "Counts paying accounts with no AI call in 30 days and warns on any. It returns a count, not the list of accounts.", 1, "running"],
  ]),
  ...dept("marketing", [
    ["market-research", "Market research", "Studies the audience and the market.", 1, "built"],
    ["content-strategist", "Content strategist", "Plans what to publish.", 2, "built"],
    ["content-writer", "Content writer", "Drafts articles and posts for approval.", 2, "built"],
    ["seo", "SEO", "Finds keywords and improves search presence.", 2, "built"],
    ["social-scheduler", "Social scheduler", "Queues approved posts.", 2, "built"],
    ["video-script", "Video script", "Writes a video script. It makes no video: the video tool is not a finished product.", 2, "built"],
    ["graphic-design", "Graphic design", "Makes graphics with the image tool.", 2, "built"],
    ["campaign-manager", "Campaign manager", "Plans a campaign and its budget split from the brief. It runs and measures nothing.", 2, "built"],
    ["ab-testing", "A/B testing", "Compares two versions and reads the result.", 1, "blocked", "analytics"],
    ["conversion-optimizer", "Conversion optimizer", "Looks for what turns visitors into customers.", 1, "blocked", "analytics"],
    ["reputation-monitor", "Reputation monitor", "Watches what is said about Ionexa in public.", 1, "built"],
    ["discount-agent", "Discount agent", "Suggests a discount inside owner-set limits. It never applies one.", 2, "built"],
    ["brand-manager", "Brand manager", "Checks content against the brand.", 1, "built"],
  ]),
  ...dept("support", [
    ["support-intake", "Support intake", "Sorts pasted support requests. There is no ticket system, so nothing is tracked after.", 1, "built"],
    ["faq", "FAQ", "Drafts FAQ answers from the facts in the brief.", 2, "built"],
    ["technical-support", "Technical support", "Analyses a pasted problem and drafts a reply. It has no access to logs, accounts or code.", 2, "built"],
    ["billing-support", "Billing support", "Explains a charge and drafts a reply. Refunds stay with a person.", 2, "built"],
    ["email-replier", "Email replier", "Drafts a reply to a pasted email. It cannot send mail.", 2, "built"],
    ["escalation", "Escalation", "Writes the hand-off note for a hard case. There is no ticket queue to route it through.", 1, "built"],
    ["response-quality", "Response quality", "Checks a pasted draft reply before it goes out.", 1, "built"],
    ["complaint-analyst", "Complaint analyst", "Groups pasted complaints into recurring problems. It counts only what is pasted.", 1, "built"],
    ["knowledge-base", "Knowledge base", "Keeps the help articles current.", 2, "built"],
  ]),
  ...dept("finance", [
    ["revenue-tracker", "Revenue tracker", "Computes monthly recurring revenue from subscriptions with the billing code, and says when a tier has no price. Not Stripe cash.", 1, "running"],
    ["expense-tracker", "AI expense tracker", "Reports AI cost for the last 7 days against the 7 before. Only AI usage, not hosting or tools.", 1, "running"],
    ["cost-per-agent", "Cost by feature", "Reports 30-day AI cost by product feature and flags features with cost but no credits charged. Company agents make no AI calls yet.", 1, "running"],
    ["invoice-prep", "Invoice preparation", "Prepares invoice data for the accountant from pasted details. It issues nothing.", 2, "built"],
    ["reconciliation", "Payment reconciliation", "Matches two pasted lists. It does not read Stripe or the database.", 1, "built"],
    ["budget-monitor", "Budget monitor", "Compares today's AI calls with the platform daily cap. There is no euro budget in the product, so it cannot compare euro spend.", 1, "running"],
    ["forecast", "Forecast", "Projects scenarios from pasted figures. It has no sales history of its own.", 1, "built"],
    ["tax-documents", "Tax documents", "Organises a pasted list of documents for the accountant. It files nothing.", 1, "built"],
    ["fraud-alert", "Spend concentration alert", "Flags one account being most of a day's AI spend. It does not see payments or cards.", 1, "running"],
  ]),
  ...dept("research", [
    ["competitor-tracker", "Competitor tracker", "Watches competitors' features and prices.", 1, "built"],
    ["technology-research", "Technology research", "Looks at new tools and models.", 1, "built"],
    ["trend-detector", "Trend detector", "Spots new trends in the market and in how people use AI tools.", 1, "built"],
    ["opportunity-finder", "Opportunity finder", "Proposes business opportunities as drafts. It does not build or publish anything.", 1, "built"],
    ["idea-evaluator", "Idea evaluator", "Scores ideas against fixed criteria.", 1, "built"],
    ["business-case", "Business case", "Writes cost and benefit for an idea.", 1, "built"],
    ["fact-checker", "Fact checker", "Checks the sources behind a claim.", 1, "built"],
    ["research-report", "Research report", "Turns research into a short report.", 1, "built"],
  ]),
  ...dept("security", [
    ["vulnerability-scanner", "Vulnerability scanner", "Runs npm audit on the lockfile in CI on every push and reports critical and high advisories. Dependencies only, not the code this project wrote.", 1, "running"],
    ["idor-checker", "IDOR checker", "Looks for routes that read another user's data.", 1, "built"],
    ["auth-auditor", "Authentication auditor", "Reviews how sign-in works.", 1, "built"],
    ["authorization-auditor", "Authorization auditor", "Reviews who may do what.", 1, "built"],
    ["headers-checker", "Security headers", "Fetches the public home page and checks HSTS, nosniff, Referrer-Policy and framing protection are sent.", 1, "running"],
    ["secrets-scanner", "Secrets scanner", "Scans every tracked file in CI for eight credential shapes (Anthropic, AWS, Stripe, GitHub, Slack, JWT, Resend keys, private-key blocks). Current files only, not git history.", 1, "running"],
    ["privacy-checker", "Privacy checker", "Reviews how personal data is handled.", 1, "built"],
    ["incident-response", "Incident response", "Proposes steps when something happens; takes none.", 1, "built"],
  ]),
  ...dept("devops", [
    ["cron-monitor", "Cron monitor", "Checks in CI that every cron in vercel.json has a route and a valid schedule and that every /api/cron route is scheduled. It does not see whether Vercel actually fired them.", 1, "running"],
    ["api-uptime-monitor", "API uptime monitor", "Calls /api/health and records whether the app answers and says it is ok.", 1, "running"],
    ["error-log-analyst", "Error log analyst", "Reads the open production errors and reports how many and where.", 1, "running"],
    ["database-health", "Database health", "Reads the database's own exposure report and fails when any of its checks fails.", 1, "running"],
    ["queue-monitor", "Queue monitor", "Counts background jobs (ai_jobs) that are queued or running and have not moved for 30 minutes, and recent failures.", 1, "running"],
    ["backup-verifier", "Backup verifier", "Checks that a backup exists and is recent.", 1, "blocked", "supabase-token"],
    ["deployment-monitor", "Deployment monitor", "Reads the last ten production deployments Vercel reported to GitHub and fails when the newest one failed. It does not test the live site.", 1, "running"],
    ["cost-optimizer", "Cost optimizer", "Compares the last 24 hours of AI spend with the daily average of the week before and warns on a spike. AI cost only, not infrastructure bills.", 1, "running"],
  ]),
  ...dept("legal", [
    ["gdpr-assistant", "GDPR assistant", "Reviews a described procedure for gaps. Not legal advice; a lawyer decides.", 1, "built"],
    ["terms-monitor", "Terms monitor", "Notices changes in providers' terms.", 1, "built"],
    ["license-monitor", "License monitor", "Reads the licence of every direct dependency in CI and fails on GPL, AGPL or SSPL, warns on LGPL or an unreadable licence.", 1, "running"],
    ["contract-organizer", "Contract organizer", "Summarises a pasted contract. It signs nothing and stores nothing.", 1, "built"],
    ["approval-policy", "Approval policy", "Says whether an action needs the owner's approval.", 1, "built"],
  ]),
  ...dept("hr", [
    ["recruitment-research", "Recruitment research", "Looks for contractors.", 1, "built"],
    ["job-description", "Job description", "Drafts job descriptions.", 2, "built"],
    ["training", "Training", "Drafts training material.", 2, "built"],
    ["team-knowledge", "Team knowledge", "Keeps the internal documentation findable.", 1, "built"],
  ]),
  ...dept("success", [
    ["usage-monitor", "Usage monitor", "Counts accounts that used an AI feature this week against last. \"Active\" means at least one logged AI call; the product records no visits. Warns on a fall of 30% or more (10+ the week before).", 1, "running"],
    ["churn-predictor", "Churn predictor", "Reports the share of accounts active 30-60 days ago that made no AI call in the last 30 days. A rate over the whole base, not a prediction about any person.", 1, "running"],
    ["upsell", "Upsell opportunity", "Counts free accounts that used an AI feature this week and have 10% or less of their credits left. It measures no willingness to pay.", 1, "running"],
    ["renewal-reminder", "Renewal reminder", "Tracks subscription renewals and who is about to renew.", 1, "built"],
    ["customer-education", "Customer education", "Drafts guides and tutorials.", 2, "built"],
  ]),
  ...dept("data", [
    ["analytics-collector", "Analytics collector", "Collects the product's usage events.", 1, "blocked", "analytics"],
    ["data-quality", "Data quality", "Counts rows that break seven stated rules in the credit, usage and affiliate tables. It checks rules, not truth.", 1, "running"],
    ["dashboard-agent", "Dashboard", "Keeps the owner's dashboards current.", 1, "blocked", "analytics"],
    ["experiment-analyst", "Experiment analyst", "Reads the result of an experiment.", 1, "blocked", "analytics"],
    ["anomaly-detector", "Anomaly detector", "Warns when new accounts or active accounts jump 3x or more week on week. It sees the size, not the cause.", 1, "running"],
    ["attribution", "Attribution", "Counts new accounts that came through an affiliate link. No other source is recorded, so the rest are not attributed.", 1, "running"],
  ]),
  ...dept("admin", [
    ["task-manager", "Task manager", "Tracks internal tasks and deadlines.", 1, "built"],
    ["document-organizer", "Document organizer", "Files and names documents so they can be found again.", 1, "built"],
    ["calendar", "Calendar", "Proposes a schedule from pasted commitments. It does not touch any calendar.", 2, "built"],
    ["meeting-summary", "Meeting summary", "Summarises meetings.", 1, "built"],
    ["vendor-manager", "Vendor manager", "Tracks providers and subscriptions.", 1, "built"],
    ["internal-audit", "Internal audit", "Checks that internal procedures are followed.", 1, "built"],
  ]),
];

/** How many agents are in each status — what the page's summary prints. */
export function rosterCounts(roster: RosterAgent[] = ROSTER): Record<RosterStatus, number> {
  const out: Record<RosterStatus, number> = { running: 0, built: 0, blocked: 0, planned: 0 };
  for (const a of roster) out[a.status] += 1;
  return out;
}
