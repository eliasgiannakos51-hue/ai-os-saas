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
 *  as measured on 2026-11-06 (see docs/PROGRESS.md), not an opinion. */
export const BLOCKERS = {
  analytics: "No analytics package is installed (package.json has no PostHog, Plausible, Mixpanel, Umami or Amplitude). Owner-run SQL queries exist in docs/analytics-queries.sql; whether they cover what these agents need was not measured.",
  crm: "public.leads exists, but it is the Sales tool of each customer's own account. The company has no pipeline of its own in it yet: someone has to decide that the owner's account is the company's pipeline, or build a separate one.",
  tickets: "There is no support-ticket system: requests have nowhere to be tracked.",
  "gmail-send": "Gmail is connected read-only (gmail.readonly). Sending or modifying mail needs a restricted scope and Google's security assessment.",
  "human-only": "Legal, tax, contract and money decisions stay with a person; an agent only prepares material.",
  "ops-tokens": "No Vercel API token and no Supabase management token is configured (neither name appears in src/ or docs/api-keys.md), so nothing running here can ask either platform about its deployments or backups.",
  "video-tool": "The video tool is not a finished product yet, so there is nothing to automate around.",
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
export const RUNNING_AGENT_IDS = ["error-log-analyst", "api-uptime-monitor", "database-health", "queue-monitor", "budget-monitor", "fraud-alert", "cost-per-agent", "expense-tracker", "cost-optimizer", "revenue-tracker", "headers-checker", "task-auditor", "daily-reporter"] as const;

/** The agents that run in CI, on every push, from scripts/company-agents/repo-agents.mjs.
 *  They need the repository's files, which the Vercel runner does not have, so their result
 *  is on the CI job's summary page and NOT in the System Health section above. The roster's
 *  `running` entries equal RUNNING_AGENT_IDS plus this list, both ways. */
export const CI_AGENT_IDS = ["secrets-scanner", "cron-monitor", "migration-ledger", "license-monitor", "vulnerability-scanner"] as const;

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
    ["manager", "Manager", "Splits a goal into tasks, assigns them to the right agent and checks the result.", 2, "planned"],
    ["agent-builder", "Agent builder", "Creates a new internal agent from an approved template.", 2, "built"],
    ["goal-tracker", "Goal tracker", "Tracks goals and progress against them.", 1, "blocked", "analytics"],
    ["kpi-monitor", "KPI monitor", "Watches the numbers the owner cares about.", 1, "blocked", "analytics"],
    ["daily-reporter", "Daily reporter", "One line over the day's run: how many agents are ok, warn, fail or unverified, and which need a look. Recorded as a row; not sent anywhere yet.", 1, "running"],
    ["weekly-reporter", "Weekly reporter", "The weekly roll-up across every department.", 1, "built"],
    ["decision-analyst", "Decision analyst", "Lays out the options, costs and risks for a decision.", 1, "built"],
    ["priority-agent", "Priority agent", "Orders the work by stated rules.", 1, "built"],
    ["resource-manager", "Resource manager", "Watches time, compute and cost per agent.", 1, "built"],
    ["task-auditor", "Task auditor", "Checks that every scheduled agent produced a row in the last 36 hours. It audits agent runs, not human or pull-request work.", 1, "running"],
    ["final-approval", "Final approval", "Reports whether a change is really finished, from the diff and the PR text. Never says the gates passed unless it was given a real result.", 1, "built"],
  ]),
  ...dept("development", [
    ["gates-agent", "Gates agent", "Runs npm run gates and reports red or green, never ignoring a failure.", 1, "planned"],
    ["testing-wrapper", "Testing wrapper", "Runs the existing test scripts and reports pass or fail.", 1, "planned"],
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
    ["lead-finder", "Lead finder", "Finds businesses that might need Ionexa.", 1, "blocked", "crm"],
    ["lead-researcher", "Lead researcher", "Collects public facts about a lead.", 1, "blocked", "crm"],
    ["lead-qualifier", "Lead qualifier", "Judges whether a lead is worth approaching.", 1, "blocked", "crm"],
    ["crm-manager", "CRM manager", "Keeps customer records current.", 2, "blocked", "crm"],
    ["email-drafter", "Email drafter", "Writes a personalised outreach draft; a person sends it.", 2, "blocked", "gmail-send"],
    ["follow-up", "Follow-up", "Tracks the next step with each lead.", 2, "blocked", "crm"],
    ["proposal-writer", "Proposal writer", "Drafts a proposal for a person to review.", 2, "blocked", "human-only"],
    ["pricing-agent", "Pricing agent", "Suggests prices inside approved limits.", 2, "blocked", "analytics"],
    ["sales-analytics", "Sales analytics", "Reads what the sales funnel did.", 1, "blocked", "analytics"],
    ["affiliate-manager", "Affiliate manager", "Watches partners and commissions. The monthly payout cron already exists; the agent on top of it does not.", 1, "built"],
    ["onboarding", "Onboarding", "Walks a new customer through the first steps.", 2, "built"],
    ["retention", "Retention", "Spots customers at risk of leaving.", 1, "blocked", "analytics"],
  ]),
  ...dept("marketing", [
    ["market-research", "Market research", "Studies the audience and the market.", 1, "built"],
    ["content-strategist", "Content strategist", "Plans what to publish.", 2, "built"],
    ["content-writer", "Content writer", "Drafts articles and posts for approval.", 2, "built"],
    ["seo", "SEO", "Finds keywords and improves search presence.", 2, "built"],
    ["social-scheduler", "Social scheduler", "Queues approved posts.", 2, "built"],
    ["video-script", "Video script", "Writes video scripts.", 2, "blocked", "video-tool"],
    ["graphic-design", "Graphic design", "Makes graphics with the image tool.", 2, "built"],
    ["campaign-manager", "Campaign manager", "Plans campaigns and their budgets.", 2, "blocked", "analytics"],
    ["ab-testing", "A/B testing", "Compares two versions and reads the result.", 1, "blocked", "analytics"],
    ["conversion-optimizer", "Conversion optimizer", "Looks for what turns visitors into customers.", 1, "blocked", "analytics"],
    ["reputation-monitor", "Reputation monitor", "Watches what is said about Ionexa in public.", 1, "built"],
    ["discount-agent", "Discount agent", "Suggests discounts inside owner-set limits; never applies one alone.", 2, "blocked", "analytics"],
    ["brand-manager", "Brand manager", "Checks content against the brand.", 1, "built"],
  ]),
  ...dept("support", [
    ["support-intake", "Support intake", "Receives and sorts requests.", 1, "blocked", "tickets"],
    ["faq", "FAQ", "Drafts answers to common questions.", 2, "blocked", "tickets"],
    ["technical-support", "Technical support", "Investigates a technical problem.", 2, "blocked", "tickets"],
    ["billing-support", "Billing support", "Explains charges; refunds stay with a person.", 2, "blocked", "human-only"],
    ["email-replier", "Email replier", "Drafts replies to customer email; a person sends them.", 2, "blocked", "gmail-send"],
    ["escalation", "Escalation", "Hands hard cases to a person.", 1, "blocked", "tickets"],
    ["response-quality", "Response quality", "Checks a drafted answer before it goes out.", 1, "blocked", "tickets"],
    ["complaint-analyst", "Complaint analyst", "Finds the problems that keep recurring.", 1, "blocked", "tickets"],
    ["knowledge-base", "Knowledge base", "Keeps the help articles current.", 2, "built"],
  ]),
  ...dept("finance", [
    ["revenue-tracker", "Revenue tracker", "Computes monthly recurring revenue from subscriptions with the billing code, and says when a tier has no price. Not Stripe cash.", 1, "running"],
    ["expense-tracker", "AI expense tracker", "Reports AI cost for the last 7 days against the 7 before. Only AI usage, not hosting or tools.", 1, "running"],
    ["cost-per-agent", "Cost by feature", "Reports 30-day AI cost by product feature and flags features with cost but no credits charged. Company agents make no AI calls yet.", 1, "running"],
    ["invoice-prep", "Invoice preparation", "Prepares invoice data for the accountant.", 2, "blocked", "human-only"],
    ["reconciliation", "Payment reconciliation", "Matches payments with records.", 1, "planned"],
    ["budget-monitor", "Budget monitor", "Compares today's AI calls with the platform daily cap. There is no euro budget in the product, so it cannot compare euro spend.", 1, "running"],
    ["forecast", "Forecast", "Projects revenue and cost.", 1, "blocked", "analytics"],
    ["tax-documents", "Tax documents", "Organises documents for the accountant; files nothing.", 1, "blocked", "human-only"],
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
    ["backup-verifier", "Backup verifier", "Checks that a backup exists and is recent.", 1, "blocked", "ops-tokens"],
    ["deployment-monitor", "Deployment monitor", "Watches deployments for failures.", 1, "blocked", "ops-tokens"],
    ["cost-optimizer", "Cost optimizer", "Compares the last 24 hours of AI spend with the daily average of the week before and warns on a spike. AI cost only, not infrastructure bills.", 1, "running"],
  ]),
  ...dept("legal", [
    ["gdpr-assistant", "GDPR assistant", "Checks data-protection procedures; does not give legal advice.", 1, "blocked", "human-only"],
    ["terms-monitor", "Terms monitor", "Notices changes in providers' terms.", 1, "built"],
    ["license-monitor", "License monitor", "Reads the licence of every direct dependency in CI and fails on GPL, AGPL or SSPL, warns on LGPL or an unreadable licence.", 1, "running"],
    ["contract-organizer", "Contract organizer", "Files contracts; signs none.", 1, "blocked", "human-only"],
    ["approval-policy", "Approval policy", "Says whether an action needs the owner's approval.", 1, "built"],
  ]),
  ...dept("hr", [
    ["recruitment-research", "Recruitment research", "Looks for contractors.", 1, "built"],
    ["job-description", "Job description", "Drafts job descriptions.", 2, "built"],
    ["training", "Training", "Drafts training material.", 2, "built"],
    ["team-knowledge", "Team knowledge", "Keeps the internal documentation findable.", 1, "built"],
  ]),
  ...dept("success", [
    ["usage-monitor", "Usage monitor", "Reads how customers use the product.", 1, "blocked", "analytics"],
    ["churn-predictor", "Churn predictor", "Estimates who may leave.", 1, "blocked", "analytics"],
    ["upsell", "Upsell opportunity", "Finds customers for whom a plan upgrade fits.", 1, "blocked", "analytics"],
    ["renewal-reminder", "Renewal reminder", "Tracks subscription renewals and who is about to renew.", 1, "built"],
    ["customer-education", "Customer education", "Drafts guides and tutorials.", 2, "built"],
  ]),
  ...dept("data", [
    ["analytics-collector", "Analytics collector", "Collects the product's usage events.", 1, "blocked", "analytics"],
    ["data-quality", "Data quality", "Checks that the data is right.", 1, "blocked", "analytics"],
    ["dashboard-agent", "Dashboard", "Keeps the owner's dashboards current.", 1, "blocked", "analytics"],
    ["experiment-analyst", "Experiment analyst", "Reads the result of an experiment.", 1, "blocked", "analytics"],
    ["anomaly-detector", "Anomaly detector", "Notices an unusual change.", 1, "blocked", "analytics"],
    ["attribution", "Attribution", "Finds where customers come from.", 1, "blocked", "analytics"],
  ]),
  ...dept("admin", [
    ["task-manager", "Task manager", "Tracks internal tasks and deadlines.", 1, "built"],
    ["document-organizer", "Document organizer", "Files and names documents so they can be found again.", 1, "built"],
    ["calendar", "Calendar", "Organises the owner's calendar.", 2, "planned"],
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
