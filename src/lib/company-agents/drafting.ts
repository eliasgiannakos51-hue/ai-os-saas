/**
 * THE COMPANY'S WRITING AGENTS: WHAT EACH ONE IS, AS DATA, WITH NO I/O.
 *
 * Every entry here is a role that turns a BRIEF (typed by the owner into
 * the draft desk on /dashboard/system-health) into a DRAFT. Nothing is sent,
 * published, merged or changed: the draft is saved as `pending`, and the
 * owner approves or rejects it. That is autonomy 2 at most, and the roster
 * keeps the honest word for them, "built": the code exists, it runs when
 * the owner asks, it is not scheduled.
 *
 * WHAT A DRAFT KNOWS. Only the brief, and, for the agents flagged `web`,
 * what a web search finds, with its sources attached. It does NOT see the
 * company's database, code or customers. So the shared rules below make
 * every agent say what it assumed and what it could not check, and the
 * review agents (code, security, privacy) say that they reviewed only what
 * was pasted. A draft that sounds sure of things it was never shown is the
 * failure this file is built against.
 *
 * generate.ts (server) performs the call; this file only describes it, so
 * company-agents.test.mjs can hold the table without loading a vendor SDK.
 */

/** At most this many drafts a day across all agents. CHOSEN 2026-11-07 as a
 *  spend ceiling for an owner-only tool; there is no history to derive it from. */
export const DAILY_DRAFT_LIMIT = 10;
export const MAX_BRIEF_CHARS = 6000;
export const MIN_BRIEF_CHARS = 20;
export const MAX_DRAFT_TOKENS = 2500;
export const WEB_SEARCH_MAX_USES = 5;

export type DraftAgent = {
  id: string;
  /** What this role produces, in one sentence the model is given as its job. */
  job: string;
  /** What the owner should put in the brief; shown under the text box. */
  brief: string;
  /** True when the draft rests on live web search and must carry sources. */
  web: boolean;
};

const SHARED_RULES = `You are one of the staff of Ionexa, an AI platform company. You write a DRAFT for the owner to read and decide on. Nothing you write is sent, published or acted on until he approves it, and approving it does not send it either.

Rules that apply to every draft:
- Use only what the brief says and, if you were given a search tool, what the search returned. You cannot see Ionexa's database, code, customers, revenue or analytics. Never invent a number, a quote, a customer, a competitor's price, a statistic, a URL or a date.
- When you assume something the brief did not say, write it as [ASSUMPTION: ...] where it appears.
- End with a short section titled "Not checked" listing what you could not verify and what the owner should confirm before relying on this.
- Write in the language of the brief. Be concrete and usable; no filler, no preamble about being an AI.
- If the brief is too thin to do the job properly, say exactly what is missing instead of padding.`;

const WEB_RULES = `You have a web search tool. Search before you assert anything about the outside world. Every claim that rests on a search must be attributable to a source you actually found; if a search found nothing on a point, say so plainly. Do not present training-data memory as a finding.`;

const REVIEW_RULES = `You review ONLY the material pasted in the brief. You have not seen the rest of the codebase or system, so say what you could not judge for that reason, and never claim something is secure, correct or compliant — only what you did or did not find in what you were shown.`;

function a(id: string, job: string, brief: string, web = false): DraftAgent {
  return { id, job, brief, web };
}

export const DRAFT_AGENTS: readonly DraftAgent[] = [
  // executive
  a("decision-analyst", "Lay out a decision: options, what each costs and risks, what is unknown, and a recommendation with the reason.", "The decision, the options you see, and the constraints (money, time, people)."),
  a("priority-agent", "Rank a list of tasks or initiatives by impact and effort, and say what to do first and what to drop.", "The list, with anything you know about each one's value, deadline or dependency."),
  a("resource-manager", "Plan how a limited budget, time or team should be split across the work described, and where it is overcommitted.", "The work items, the budget or hours available, and who is available."),
  a("weekly-reporter", "Turn the figures and events pasted in into a one-page weekly report: what happened, what the numbers say, what needs a decision.", "This week's figures and events, pasted as they are."),
  a("agent-builder", "Write a specification for a new internal agent: its mission, inputs, outputs, autonomy level (1 reads, 2 drafts, 3 acts alone on reversible things only), failure cases and how to test it.", "What the new agent should do and why."),
  // development
  a("product-research", "Research a product question and report what is known, with sources.", "The product question or market you want understood.", true),
  a("product-spec", "Write a product specification: problem, users, scope, out of scope, acceptance criteria, open questions.", "The feature idea and who it is for."),
  a("architecture", "Propose a technical design for the described change: components, data flow, failure modes, the alternatives rejected and why.", "What you want built and any constraints of the existing system."),
  a("frontend-dev", "Write the front-end code described. State plainly that it has not been run or tested.", "The component or page, the stack, and the behaviour."),
  a("backend-dev", "Write the back-end code described. State plainly that it has not been run or tested.", "The endpoint or job, the stack, inputs, outputs and error cases."),
  a("database-dev", "Write the SQL described, including how to undo it. State plainly that it has not been run.", "The tables or queries needed and the existing schema they touch."),
  a("code-review", `Review the code or diff pasted in: bugs, risks, unclear parts and missing tests, ordered by seriousness. ${REVIEW_RULES}`, "The diff or code to review, and what it is meant to do."),
  a("bug-detection", `Find likely bugs in the code pasted in and explain how each could fail. ${REVIEW_RULES}`, "The code, and any symptom you have seen."),
  a("bug-fix", "Propose a fix for the bug described, as a code change with the reasoning, and say how to confirm it worked. State plainly that it has not been run.", "The bug, the code around it, and how to reproduce it."),
  a("documentation", "Write the documentation for the code, feature or process described, for the reader named.", "What to document, who reads it, and the material (code, notes) to base it on."),
  a("accessibility", `Review the markup or description pasted in against WCAG 2.2 AA and list concrete problems and fixes. ${REVIEW_RULES}`, "The HTML/JSX or a description of the screen."),
  a("performance", `Analyse the code or measurements pasted in for performance problems and rank the fixes by expected effect. ${REVIEW_RULES}`, "The code or the measurements, and what feels slow."),
  a("release-manager", "Write release notes and a go/no-go checklist for the changes described.", "The list of changes in the release."),
  a("rollback", "Write a rollback plan for the change described: the exact steps in order, how to confirm it worked, and what cannot be undone.", "The change, and how it was deployed."),
  // sales / onboarding
  a("affiliate-manager", "Draft an affiliate programme outline or outreach message for the audience described, with terms marked as proposals.", "The audience and what you can offer them."),
  a("onboarding", "Write an onboarding message sequence for new customers: what each message says and when it goes.", "The product, the customer type, and the first thing they should achieve."),
  // marketing
  a("market-research", "Research the market described and report size, segments, trends and gaps, with sources.", "The market or customer segment.", true),
  a("content-strategist", "Plan a content strategy: audience, themes, formats, a calendar of pieces, and how each ties to a goal.", "The audience, the goal and the channels you can use."),
  a("content-writer", "Write the piece described, ready to edit.", "The topic, audience, tone, length and any facts it must include."),
  a("seo", "Propose an SEO plan or page copy: search intent, keywords as hypotheses to test, title and description options. You have no search-volume data, so label every keyword a hypothesis.", "The page or topic and the audience."),
  a("social-scheduler", "Write a set of social posts with a suggested order and timing. Nothing is scheduled or posted.", "The announcement or theme, the platforms and the tone."),
  a("graphic-design", "Write a design brief: purpose, audience, message, required elements, mood, sizes and what to avoid. No image is produced.", "What the graphic is for and where it will appear."),
  a("brand-manager", "Check the text pasted in against the brand voice described and rewrite where it drifts, explaining each change.", "The brand voice rules and the text."),
  a("reputation-monitor", "Report what is publicly said about the named company or product, with sources, separating facts from opinion.", "The name to look up.", true),
  // support
  a("knowledge-base", "Write a help-centre article from the notes pasted in: the problem, the steps, and what to do if it fails.", "The notes or the support answer to turn into an article."),
  // research
  a("competitor-tracker", "Report what the named competitor offers, charges and has changed recently, with sources and dates.", "The competitor's name and what you want to know.", true),
  a("technology-research", "Research the technology described: what it does, maturity, cost, risks and alternatives, with sources.", "The technology or the problem it would solve.", true),
  a("trend-detector", "Report current trends in the named field with evidence and sources, separating signals from hype.", "The field and the time frame.", true),
  a("opportunity-finder", "Identify opportunities in the described space and what each would take, with sources for any claim about the market.", "The space, and what Ionexa can already do.", true),
  a("idea-evaluator", "Evaluate the idea against clear criteria (need, size, effort, risk, fit), score each with the reason, and say what would change the verdict.", "The idea and what you know about it."),
  a("business-case", "Write a business case: costs, benefits, assumptions as ranges, risks and break-even logic. Every number must come from the brief or be marked [ASSUMPTION].", "The initiative and the figures you have."),
  a("fact-checker", "Check the claims in the pasted text against sources found by search, and mark each as supported, contradicted or not found.", "The text whose claims should be checked.", true),
  a("research-report", "Write a structured research report on the question, with a summary, findings, sources and open questions.", "The question and who will read the report.", true),
  // security / privacy
  a("auth-auditor", `Review the authentication code pasted in for weaknesses (session handling, token lifetime, brute force, enumeration). ${REVIEW_RULES}`, "The auth code or flow."),
  a("authorization-auditor", `Review the code pasted in for missing or wrong authorization checks (who may do what to which record). ${REVIEW_RULES}`, "The route or function and how access should work."),
  a("idor-checker", `Review the code pasted in for insecure direct object references: places where an id from the request reaches data without an ownership check. ${REVIEW_RULES}`, "The route handlers or queries."),
  a("privacy-checker", `Review the feature, code or policy pasted in for personal-data handling problems (collection, retention, sharing, deletion). This is not legal advice. ${REVIEW_RULES}`, "The feature description, data fields or policy text."),
  a("incident-response", "Write an incident write-up or runbook from the notes: timeline, impact, cause as far as known, what was done, and follow-ups. Mark cause as unknown where it is.", "Your notes on what happened, in any order."),
  // legal / hr
  a("terms-monitor", "Report what the named service's current terms or policies say on the point asked, and what has changed, with sources.", "The service and the clause or topic.", true),
  a("approval-policy", "Draft an internal approval policy: what needs sign-off, by whom, and what may be done without it.", "The kinds of action and the risks you care about."),
  a("recruitment-research", "Research the role, market and typical requirements and pay range, with sources.", "The role and the location.", true),
  a("job-description", "Write a job description for the role: purpose, responsibilities, requirements and what is nice to have.", "The role, the team, and must-haves."),
  a("training", "Write a training outline or material for the topic and audience: objectives, sections, exercises and how to check understanding.", "The topic, the audience and their level."),
  a("team-knowledge", "Turn the notes pasted in into a clear internal knowledge page.", "The notes or explanation to organise."),
  // success / admin
  a("renewal-reminder", "Write the renewal reminder message for the customer situation described, with a plain and honest tone.", "The plan, the renewal date and anything the customer should know."),
  a("customer-education", "Write a tutorial or guide that teaches customers to get a result with the product.", "The result the customer wants and the product steps involved."),
  a("task-manager", "Turn the notes pasted in into a clean task list with owner, next action and due date where given. Do not invent owners or dates.", "Meeting notes, messages or a messy list."),
  a("document-organizer", "Propose a folder structure and naming rule for the documents listed, and where each would go.", "The list of documents or file names."),
  a("meeting-summary", "Summarise the meeting notes or transcript pasted in: decisions, actions with owners, open questions.", "The notes or transcript."),
  a("vendor-manager", "Compare the vendors or quotes described on the criteria given and draft the questions to ask each.", "The vendors, quotes and what matters to you."),
  a("internal-audit", "Draft an audit checklist for the process described: what to check, the evidence that would show it, and what a finding looks like.", "The process or control to audit."),
];

export const DRAFT_AGENT_IDS: readonly string[] = DRAFT_AGENTS.map((x) => x.id);

export function draftAgent(id: string): DraftAgent | undefined {
  return DRAFT_AGENTS.find((x) => x.id === id);
}

export type BriefCheck = { ok: true; brief: string } | { ok: false; reason: string };

/** The brief as the model will see it, or why it cannot be used. */
export function checkBrief(raw: unknown): BriefCheck {
  if (typeof raw !== "string") return { ok: false, reason: "The brief is missing." };
  const brief = raw.trim();
  if (brief.length < MIN_BRIEF_CHARS) return { ok: false, reason: `The brief is too short (at least ${MIN_BRIEF_CHARS} characters).` };
  if (brief.length > MAX_BRIEF_CHARS) return { ok: false, reason: `The brief is too long (at most ${MAX_BRIEF_CHARS} characters).` };
  return { ok: true, brief };
}

/** The system prompt for one agent. */
export function systemPromptFor(agent: DraftAgent): string {
  return [SHARED_RULES, agent.web ? WEB_RULES : "", `Your role: ${agent.id}.`, `Your job: ${agent.job}`].filter(Boolean).join("\n\n");
}

/** True when `count` drafts already made today leave no room for another. */
export function dailyLimitReached(draftsToday: number): boolean {
  return draftsToday >= DAILY_DRAFT_LIMIT;
}
