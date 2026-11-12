import "server-only";

/**
 * AGENT JOB ROLES — pre-built agent configurations that replace human employees.
 *
 * Each role defines:
 * - A system prompt tailored to the job
 * - The tools the agent needs (from agent-tools.ts)
 * - The approval settings (what needs human sign-off)
 * - Recommended schedule (how often to run)
 * - The departments it belongs to
 *
 * The user picks a role when creating an agent, and the role pre-fills
 * everything. They can customise after.
 *
 * ROLES ARE THE BRIDGE between Ionexa AI and Ionexa Payments:
 * - Marketing Agent uses Ionexa AI (content, images, posts)
 * - Sales Agent uses Ionexa AI (proposals) + Ionexa Payments (invoices, links)
 * - Support Agent uses Ionexa AI (answers) + Ionexa Payments (refunds)
 * - Finance Agent uses Ionexa Payments (analytics, invoicing, reporting)
 */

export type AgentJobRole = {
  id: string;
  name: string;
  nameKey: string; // i18n key under dashboard.agents.roles
  descriptionKey: string;
  icon: string; // lucide icon name
  department: "marketing" | "sales" | "support" | "finance" | "operations" | "hr";
  /** Tool IDs from agent-tools.ts that this role needs. */
  defaultTools: string[];
  /** Default approval settings. */
  defaultApprovalSettings: Record<string, boolean | number>;
  /** Recommended cron schedule. null = manual only. */
  defaultSchedule: string | null;
  /** System prompt addition for this role. */
  systemPromptAddition: string;
  /** Estimated credits per run. */
  estimatedCreditsPerRun: number;
};

export const AGENT_JOB_ROLES: AgentJobRole[] = [
  // ─── MARKETING DEPARTMENT ───
  {
    id: "content_creator",
    name: "Content Creator",
    nameKey: "roles.contentCreator",
    descriptionKey: "roles.contentCreatorDesc",
    icon: "PenTool",
    department: "marketing",
    defaultTools: ["ai_chat", "ai_document", "ai_image", "ai_post", "ai_research", "social_post", "social_schedule"],
    defaultApprovalSettings: { send: true, publish: true, spend: false, spendAutoThreshold: 20, spendNotifyThreshold: 50 },
    defaultSchedule: "0 9 * * 1-5", // weekdays at 9am
    systemPromptAddition: `You are a Content Creator for this business. Your job is to:
1. Research trending topics in the business's industry
2. Write blog posts, articles, and long-form content
3. Create social media posts with engaging copy
4. Generate images for posts and articles
5. Schedule posts at optimal times
6. Maintain a consistent brand voice across all content

Always research before writing. Use data and trends to inform content. Prioritise value over volume.`,
    estimatedCreditsPerRun: 25,
  },
  {
    id: "social_media_manager",
    name: "Social Media Manager",
    nameKey: "roles.socialMediaManager",
    descriptionKey: "roles.socialMediaManagerDesc",
    icon: "Share2",
    department: "marketing",
    defaultTools: ["ai_chat", "ai_image", "ai_post", "social_post", "social_schedule", "social_analytics"],
    defaultApprovalSettings: { send: false, publish: true, spend: false, spendAutoThreshold: 15, spendNotifyThreshold: 30 },
    defaultSchedule: "0 8 * * *", // daily at 8am
    systemPromptAddition: `You are a Social Media Manager. Your daily routine:
1. Check social analytics from yesterday
2. Create today's posts (text + images) for each platform
3. Schedule posts at peak engagement times
4. Respond to comments and messages
5. Monitor mentions and sentiment
6. Report weekly performance metrics

Keep posts short, engaging, and on-brand. Use trending hashtags. Vary content types (tips, behind-scenes, customer stories, product highlights).`,
    estimatedCreditsPerRun: 15,
  },
  {
    id: "seo_specialist",
    name: "SEO Specialist",
    nameKey: "roles.seoSpecialist",
    descriptionKey: "roles.seoSpecialistDesc",
    icon: "Search",
    department: "marketing",
    defaultTools: ["ai_chat", "ai_research", "ai_document", "analytics_competitors"],
    defaultApprovalSettings: { send: false, publish: false, spend: false, spendAutoThreshold: 30, spendNotifyThreshold: 100 },
    defaultSchedule: "0 6 * * 1", // Mondays at 6am
    systemPromptAddition: `You are an SEO Specialist. Your weekly tasks:
1. Research keyword opportunities in the business's niche
2. Analyse competitor rankings and content gaps
3. Write SEO-optimised content briefs
4. Audit existing pages for SEO improvements
5. Track ranking changes and organic traffic
6. Recommend technical SEO fixes

Focus on long-tail keywords with buyer intent. Prioritise content that can rank in 3-6 months.`,
    estimatedCreditsPerRun: 30,
  },

  // ─── SALES DEPARTMENT ───
  {
    id: "sales_outreach",
    name: "Sales Outreach Agent",
    nameKey: "roles.salesOutreach",
    descriptionKey: "roles.salesOutreachDesc",
    icon: "UserPlus",
    department: "sales",
    defaultTools: ["ai_chat", "ai_research", "email_send", "email_read", "email_reply", "payments_create_link", "payments_create_invoice"],
    defaultApprovalSettings: { send: true, publish: false, spend: true, spendAutoThreshold: 5, spendNotifyThreshold: 20 },
    defaultSchedule: "0 10 * * 1-5", // weekdays at 10am
    systemPromptAddition: `You are a Sales Outreach Agent. Your job is to:
1. Research potential customers and their needs
2. Write personalised outreach emails (not spam — genuine, helpful)
3. Follow up on unanswered emails (max 2 follow-ups, 3 days apart)
4. Create proposals and quotes when requested
5. Generate payment links for agreed deals
6. Create and send invoices for closed deals
7. Track pipeline and report weekly

Every outreach must be personalised. Research the company and person first. Focus on how you can help, not what you sell.`,
    estimatedCreditsPerRun: 15,
  },
  {
    id: "proposal_writer",
    name: "Proposal Writer",
    nameKey: "roles.proposalWriter",
    descriptionKey: "roles.proposalWriterDesc",
    icon: "FileText",
    department: "sales",
    defaultTools: ["ai_chat", "ai_document", "ai_presentation", "ai_research", "payments_create_link"],
    defaultApprovalSettings: { send: true, publish: false, spend: false, spendAutoThreshold: 20, spendNotifyThreshold: 50 },
    defaultSchedule: null, // on-demand
    systemPromptAddition: `You are a Proposal Writer. When given a brief or customer request:
1. Research the customer's industry and specific needs
2. Write a professional proposal with clear scope, timeline, pricing
3. Create a presentation deck summarising the proposal
4. Generate a payment link for the quoted amount
5. Format everything with the business's branding

Proposals should be clear, professional, and focused on outcomes the customer will get.`,
    estimatedCreditsPerRun: 40,
  },

  // ─── CUSTOMER SUPPORT ───
  {
    id: "customer_support",
    name: "Customer Support Agent",
    nameKey: "roles.customerSupport",
    descriptionKey: "roles.customerSupportDesc",
    icon: "Headphones",
    department: "support",
    defaultTools: ["ai_chat", "email_read", "email_reply", "payments_view_analytics", "payments_process_refund"],
    defaultApprovalSettings: { send: true, publish: false, spend: true, spendAutoThreshold: 0, spendNotifyThreshold: 10 },
    defaultSchedule: "0 */2 * * *", // every 2 hours
    systemPromptAddition: `You are a Customer Support Agent. Your routine:
1. Check for new customer emails and messages
2. Answer product/service questions accurately
3. Resolve billing issues (check payment status, explain charges)
4. Process refunds for valid requests (under the refund policy)
5. Escalate complex issues that need human attention
6. Track common questions and suggest FAQ improvements

Be friendly, empathetic, and solution-oriented. Never argue with customers. If unsure, escalate rather than guess. Refunds under the threshold are auto-approved; above it, request approval.`,
    estimatedCreditsPerRun: 10,
  },

  // ─── FINANCE DEPARTMENT ───
  {
    id: "bookkeeper",
    name: "Bookkeeper",
    nameKey: "roles.bookkeeper",
    descriptionKey: "roles.bookkeeperDesc",
    icon: "Calculator",
    department: "finance",
    defaultTools: ["ai_chat", "ai_document", "payments_view_analytics", "payments_create_invoice", "analytics_report"],
    defaultApprovalSettings: { send: true, publish: false, spend: false, spendAutoThreshold: 5, spendNotifyThreshold: 20 },
    defaultSchedule: "0 7 * * 1", // Mondays at 7am
    systemPromptAddition: `You are a Bookkeeper. Your weekly tasks:
1. Review this week's transactions and revenue
2. Categorise income by product/service
3. Track outstanding invoices and send reminders
4. Generate a weekly financial summary
5. Flag unusual transactions or trends
6. Prepare data for monthly/quarterly reports

Be precise with numbers. Always double-check calculations. Format reports clearly with totals and comparisons to previous periods.`,
    estimatedCreditsPerRun: 15,
  },
  {
    id: "financial_advisor",
    name: "Financial Advisor",
    nameKey: "roles.financialAdvisor",
    descriptionKey: "roles.financialAdvisorDesc",
    icon: "TrendingUp",
    department: "finance",
    defaultTools: ["ai_chat", "ai_research", "ai_document", "payments_view_analytics", "analytics_report", "analytics_competitors"],
    defaultApprovalSettings: { send: false, publish: false, spend: false, spendAutoThreshold: 20, spendNotifyThreshold: 50 },
    defaultSchedule: "0 8 1 * *", // 1st of each month at 8am
    systemPromptAddition: `You are a Financial Advisor. Your monthly tasks:
1. Analyse revenue trends, MRR growth, churn rate
2. Compare metrics to industry benchmarks
3. Identify opportunities to increase revenue
4. Recommend pricing adjustments based on data
5. Forecast next month's revenue
6. Write a monthly financial report with actionable insights

Use data, not opinions. Every recommendation should cite a specific metric and its trend. Compare to competitors when relevant.`,
    estimatedCreditsPerRun: 35,
  },

  // ─── OPERATIONS ───
  {
    id: "business_intelligence",
    name: "Business Intelligence Analyst",
    nameKey: "roles.biAnalyst",
    descriptionKey: "roles.biAnalystDesc",
    icon: "BarChart3",
    department: "operations",
    defaultTools: ["ai_chat", "ai_research", "ai_document", "payments_view_analytics", "analytics_report", "analytics_competitors"],
    defaultApprovalSettings: { send: false, publish: false, spend: false, spendAutoThreshold: 30, spendNotifyThreshold: 100 },
    defaultSchedule: "0 6 * * 1", // Mondays at 6am
    systemPromptAddition: `You are a Business Intelligence Analyst. Your weekly tasks:
1. Pull key metrics: revenue, customers, conversion rates, churn
2. Identify trends and anomalies
3. Research market and competitor movements
4. Create a weekly intelligence briefing
5. Recommend strategic actions based on data
6. Track progress on previous recommendations

Data first. Every claim backed by a number. Present findings as: what happened, why it matters, what to do about it.`,
    estimatedCreditsPerRun: 25,
  },
];

/**
 * Gets a job role by ID.
 */
export function getJobRole(id: string): AgentJobRole | undefined {
  return AGENT_JOB_ROLES.find((r) => r.id === id);
}

/**
 * Gets all roles for a department.
 */
export function getRolesByDepartment(dept: AgentJobRole["department"]): AgentJobRole[] {
  return AGENT_JOB_ROLES.filter((r) => r.department === dept);
}

/**
 * All departments with their roles.
 */
export const DEPARTMENTS = [
  { id: "marketing" as const, nameKey: "departments.marketing", icon: "Megaphone" },
  { id: "sales" as const, nameKey: "departments.sales", icon: "Handshake" },
  { id: "support" as const, nameKey: "departments.support", icon: "Headphones" },
  { id: "finance" as const, nameKey: "departments.finance", icon: "Wallet" },
  { id: "operations" as const, nameKey: "departments.operations", icon: "Settings" },
  { id: "hr" as const, nameKey: "departments.hr", icon: "Users" },
] as const;
