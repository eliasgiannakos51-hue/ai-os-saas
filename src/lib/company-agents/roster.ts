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

export type AgentStatus = "running" | "built" | "blocked" | "planned";
export type Autonomy = 1 | 2 | 3;

/** What an agent can be waiting on. Each is a fact about the repository
 *  as measured on 2026-11-06 (see docs/PROGRESS.md), not an opinion. */
export const BLOCKERS = {
  analytics: "No analytics package is installed (package.json has no PostHog, Plausible, Mixpanel, Umami or Amplitude). Owner-run SQL queries exist in docs/analytics-queries.sql; whether they cover what these agents need was not measured.",
  crm: "public.leads exists, but it is the Sales tool of each customer's own account. The company has no pipeline of its own in it yet: someone has to decide that the owner's account is the company's pipeline, or build a separate one.",
  tickets: "There is no support-ticket system: requests have nowhere to be tracked.",
  "gmail-send": "Gmail is connected read-only (gmail.readonly). Sending or modifying mail needs a restricted scope and Google's security assessment.",
  "human-only": "Legal, tax, contract and money decisions stay with a person; an agent only prepares material.",
  "video-tool": "The video tool is not a finished product yet, so there is nothing to automate around.",
} as const;
export type BlockerKey = keyof typeof BLOCKERS;

export type RosterAgent = {
  id: string;
  department: DepartmentKey;
  name: string;
  mission: string;
  autonomy: Autonomy;
  status: AgentStatus;
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
export const RUNNING_AGENT_IDS = ["error-log-analyst", "api-uptime-monitor"] as const;

type Row = [id: string, name: string, mission: string, autonomy: Autonomy, status: AgentStatus, blockedBy?: BlockerKey];

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
    ["agent-builder", "Agent builder", "Creates a new internal agent from an approved template.", 2, "planned"],
    ["goal-tracker", "Goal tracker", "Tracks goals and progress against them.", 1, "blocked", "analytics"],
    ["kpi-monitor", "KPI monitor", "Watches the numbers the owner cares about.", 1, "blocked", "analytics"],
    ["daily-reporter", "Daily reporter", "One daily message: what ran, what failed, what needs a decision.", 1, "planned"],
    ["weekly-reporter", "Weekly reporter", "The weekly roll-up across every department.", 1, "planned"],
    ["decision-analyst", "Decision analyst", "Lays out the options, costs and risks for a decision.", 1, "planned"],
    ["priority-agent", "Priority agent", "Orders the work by stated rules.", 1, "planned"],
    ["resource-manager", "Resource manager", "Watches time, compute and cost per agent.", 1, "planned"],
    ["task-auditor", "Task auditor", "Checks that assigned work was actually done.", 1, "planned"],
    ["final-approval", "Final approval", "Reports whether a change is really finished, from the diff and the PR text. Never says the gates passed unless it was given a real result.", 1, "built"],
  ]),
  ...dept("development", [
    ["gates-agent", "Gates agent", "Runs npm run gates and reports red or green, never ignoring a failure.", 1, "planned"],
    ["testing-wrapper", "Testing wrapper", "Runs the existing test scripts and reports pass or fail.", 1, "planned"],
    ["code-review", "Code review", "Reads a diff against CLAUDE.md's rules before a merge.", 2, "planned"],
    ["bug-detection", "Bug detection", "Finds problems from errors and tests.", 1, "planned"],
    ["bug-fix", "Bug fix", "Proposes a fix as a pull request, never committing to main.", 2, "planned"],
    ["migration-ledger", "Migration ledger", "Reports which migration files are not applied (npm run db:pending).", 1, "planned"],
    ["product-research", "Product research", "Looks into what the market needs.", 1, "planned"],
    ["product-spec", "Product specification", "Turns an idea into written requirements.", 2, "planned"],
    ["architecture", "Architecture", "Sketches the technical design of a change.", 2, "planned"],
    ["frontend-dev", "Frontend developer", "Writes interface code as a pull request.", 2, "planned"],
    ["backend-dev", "Backend developer", "Writes server code as a pull request.", 2, "planned"],
    ["database-dev", "Database developer", "Writes migrations as a pull request, each with its undo.", 2, "planned"],
    ["documentation", "Documentation", "Keeps the technical docs and PROGRESS entries current.", 2, "planned"],
    ["accessibility", "Accessibility", "Checks screens for accessibility problems.", 1, "planned"],
    ["performance", "Performance", "Measures speed and reports regressions.", 1, "planned"],
    ["release-manager", "Release manager", "Prepares a release and its release notes.", 2, "planned"],
    ["rollback", "Rollback", "Prepares the steps to take a release back.", 2, "planned"],
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
    ["affiliate-manager", "Affiliate manager", "Watches partners and commissions. The monthly payout cron already exists; the agent on top of it does not.", 1, "planned"],
    ["onboarding", "Onboarding", "Walks a new customer through the first steps.", 2, "planned"],
    ["retention", "Retention", "Spots customers at risk of leaving.", 1, "blocked", "analytics"],
  ]),
  ...dept("marketing", [
    ["market-research", "Market research", "Studies the audience and the market.", 1, "planned"],
    ["content-strategist", "Content strategist", "Plans what to publish.", 2, "planned"],
    ["content-writer", "Content writer", "Drafts articles and posts for approval.", 2, "planned"],
    ["seo", "SEO", "Finds keywords and improves search presence.", 2, "planned"],
    ["social-scheduler", "Social scheduler", "Queues approved posts.", 2, "planned"],
    ["video-script", "Video script", "Writes video scripts.", 2, "blocked", "video-tool"],
    ["graphic-design", "Graphic design", "Makes graphics with the image tool.", 2, "planned"],
    ["campaign-manager", "Campaign manager", "Plans campaigns and their budgets.", 2, "blocked", "analytics"],
    ["ab-testing", "A/B testing", "Compares two versions and reads the result.", 1, "blocked", "analytics"],
    ["conversion-optimizer", "Conversion optimizer", "Looks for what turns visitors into customers.", 1, "blocked", "analytics"],
    ["reputation-monitor", "Reputation monitor", "Watches what is said about Ionexa in public.", 1, "planned"],
    ["discount-agent", "Discount agent", "Suggests discounts inside owner-set limits; never applies one alone.", 2, "blocked", "analytics"],
    ["brand-manager", "Brand manager", "Checks content against the brand.", 1, "planned"],
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
    ["knowledge-base", "Knowledge base", "Keeps the help articles current.", 2, "planned"],
  ]),
  ...dept("finance", [
    ["revenue-tracker", "Revenue tracker", "Reads revenue and cash in. The db:invoice and db:spend scripts already exist.", 1, "planned"],
    ["expense-tracker", "Expense tracker", "Reads what the company spends.", 1, "planned"],
    ["cost-per-agent", "Cost per agent", "Reports what each agent's model calls cost.", 1, "planned"],
    ["invoice-prep", "Invoice preparation", "Prepares invoice data for the accountant.", 2, "blocked", "human-only"],
    ["reconciliation", "Payment reconciliation", "Matches payments with records.", 1, "planned"],
    ["budget-monitor", "Budget monitor", "Compares spend with the budget.", 1, "planned"],
    ["forecast", "Forecast", "Projects revenue and cost.", 1, "blocked", "analytics"],
    ["tax-documents", "Tax documents", "Organises documents for the accountant; files nothing.", 1, "blocked", "human-only"],
    ["fraud-alert", "Fraud alert", "Flags unusual payments.", 1, "planned"],
  ]),
  ...dept("research", [
    ["competitor-tracker", "Competitor tracker", "Watches competitors' features and prices.", 1, "planned"],
    ["technology-research", "Technology research", "Looks at new tools and models.", 1, "planned"],
    ["trend-detector", "Trend detector", "Spots new trends in the market and in how people use AI tools.", 1, "planned"],
    ["opportunity-finder", "Opportunity finder", "Proposes business opportunities as drafts. It does not build or publish anything.", 1, "planned"],
    ["idea-evaluator", "Idea evaluator", "Scores ideas against fixed criteria.", 1, "planned"],
    ["business-case", "Business case", "Writes cost and benefit for an idea.", 1, "planned"],
    ["fact-checker", "Fact checker", "Checks the sources behind a claim.", 1, "planned"],
    ["research-report", "Research report", "Turns research into a short report.", 1, "planned"],
  ]),
  ...dept("security", [
    ["vulnerability-scanner", "Vulnerability scanner", "Scans code and dependencies; GitHub's Dependabot and CodeQL are the first tools for it.", 1, "planned"],
    ["idor-checker", "IDOR checker", "Looks for routes that read another user's data.", 1, "planned"],
    ["auth-auditor", "Authentication auditor", "Reviews how sign-in works.", 1, "planned"],
    ["authorization-auditor", "Authorization auditor", "Reviews who may do what.", 1, "planned"],
    ["headers-checker", "Security headers", "Checks the CSP and other headers.", 1, "planned"],
    ["secrets-scanner", "Secrets scanner", "Finds API keys and secrets that were committed or exposed.", 1, "planned"],
    ["privacy-checker", "Privacy checker", "Reviews how personal data is handled.", 1, "planned"],
    ["incident-response", "Incident response", "Proposes steps when something happens; takes none.", 1, "planned"],
  ]),
  ...dept("devops", [
    ["cron-monitor", "Cron monitor", "Checks that the scheduled jobs in vercel.json actually ran.", 1, "planned"],
    ["api-uptime-monitor", "API uptime monitor", "Calls /api/health and records whether the app answers and says it is ok.", 1, "running"],
    ["error-log-analyst", "Error log analyst", "Reads the open production errors and reports how many and where.", 1, "running"],
    ["database-health", "Database health", "Watches the database's own health report.", 1, "planned"],
    ["queue-monitor", "Queue monitor", "Watches background work that is stuck.", 1, "planned"],
    ["backup-verifier", "Backup verifier", "Checks that a backup exists and is recent.", 1, "planned"],
    ["deployment-monitor", "Deployment monitor", "Watches deployments for failures.", 1, "planned"],
    ["cost-optimizer", "Cost optimizer", "Finds infrastructure spend that buys nothing.", 1, "planned"],
  ]),
  ...dept("legal", [
    ["gdpr-assistant", "GDPR assistant", "Checks data-protection procedures; does not give legal advice.", 1, "blocked", "human-only"],
    ["terms-monitor", "Terms monitor", "Notices changes in providers' terms.", 1, "planned"],
    ["license-monitor", "License monitor", "Tracks software licences in the dependencies.", 1, "planned"],
    ["contract-organizer", "Contract organizer", "Files contracts; signs none.", 1, "blocked", "human-only"],
    ["approval-policy", "Approval policy", "Says whether an action needs the owner's approval.", 1, "planned"],
  ]),
  ...dept("hr", [
    ["recruitment-research", "Recruitment research", "Looks for contractors.", 1, "planned"],
    ["job-description", "Job description", "Drafts job descriptions.", 2, "planned"],
    ["training", "Training", "Drafts training material.", 2, "planned"],
    ["team-knowledge", "Team knowledge", "Keeps the internal documentation findable.", 1, "planned"],
  ]),
  ...dept("success", [
    ["usage-monitor", "Usage monitor", "Reads how customers use the product.", 1, "blocked", "analytics"],
    ["churn-predictor", "Churn predictor", "Estimates who may leave.", 1, "blocked", "analytics"],
    ["upsell", "Upsell opportunity", "Finds customers for whom a plan upgrade fits.", 1, "blocked", "analytics"],
    ["renewal-reminder", "Renewal reminder", "Tracks subscription renewals and who is about to renew.", 1, "planned"],
    ["customer-education", "Customer education", "Drafts guides and tutorials.", 2, "planned"],
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
    ["task-manager", "Task manager", "Tracks internal tasks and deadlines.", 1, "planned"],
    ["document-organizer", "Document organizer", "Files and names documents so they can be found again.", 1, "planned"],
    ["calendar", "Calendar", "Organises the owner's calendar.", 2, "planned"],
    ["meeting-summary", "Meeting summary", "Summarises meetings.", 1, "planned"],
    ["vendor-manager", "Vendor manager", "Tracks providers and subscriptions.", 1, "planned"],
    ["internal-audit", "Internal audit", "Checks that internal procedures are followed.", 1, "planned"],
  ]),
];

/** How many agents are in each status — what the page's summary prints. */
export function rosterCounts(roster: RosterAgent[] = ROSTER): Record<AgentStatus, number> {
  const out: Record<AgentStatus, number> = { running: 0, built: 0, blocked: 0, planned: 0 };
  for (const a of roster) out[a.status] += 1;
  return out;
}
