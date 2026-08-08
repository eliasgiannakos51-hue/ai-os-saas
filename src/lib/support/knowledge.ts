import { PLANS } from "@/lib/billing/plans";
import { DEFAULT_PRESENTATION_LIMITS } from "@/lib/presentations/presentation-limits";
import {
  DEFAULT_FILE_COUNT_LIMITS,
  DEFAULT_RESEARCH_LIMITS,
  DEFAULT_STORAGE_LIMITS,
} from "@/lib/files/limits";
import { DEFAULT_PUBLISH_LIMITS } from "@/lib/publishing/publish-limits";

/**
 * What the support assistant is allowed to know.
 *
 * THE NUMBERS ARE COMPUTED FROM THE REAL LIMIT MODULES, never typed out.
 * That is the entire design of this file. A support assistant answering
 * "how many presentations do I get on Growth?" from a hand-written
 * knowledge base is one plan change away from confidently telling a
 * paying customer the wrong number — and confidently, because it has no
 * way to know its source is stale. Importing the constants makes the
 * corpus and the enforcement the same fact.
 *
 * The prose around them is hand-written and unavoidable. It is kept to
 * things that are structurally true (what a feature IS, what it costs,
 * where it lives) rather than to behaviour that changes, and
 * scripts/tests/support.test.mjs asserts the numeric claims still match
 * their sources.
 *
 * Nothing here is a secret. This corpus is sent to the model on every
 * support question and could in principle be extracted by asking; it is
 * written to be publishable, which is why it contains no internal
 * thresholds, no margin multipliers and no security detail beyond what
 * SECURITY.md already states in public.
 */

function unlimitedOr(n: number): string {
  return Number.isFinite(n) ? String(n) : "unlimited";
}

function mb(bytes: number): string {
  if (!Number.isFinite(bytes)) return "unlimited";
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${Math.round(gb)}GB` : `${Math.round(bytes / (1024 * 1024))}MB`;
}

function planTable(): string {
  const rows = PLANS.map((plan) => {
    const price = plan.price === "custom" ? "custom pricing" : `EUR ${plan.price}/month`;
    const credits =
      plan.monthlyCredits === "custom" ? "custom" : `${plan.monthlyCredits} credits/month`;
    const slug = plan.slug;
    return [
      `- ${plan.name} (${price}, ${credits}):`,
      `agents ${unlimitedOr(Number(plan.capabilities.maxAiAgents === "unlimited" ? Infinity : plan.capabilities.maxAiAgents))},`,
      `presentations/month ${unlimitedOr(DEFAULT_PRESENTATION_LIMITS[slug])},`,
      `deep research runs/month ${unlimitedOr(DEFAULT_RESEARCH_LIMITS[slug])},`,
      `published sites ${unlimitedOr(DEFAULT_PUBLISH_LIMITS[slug])},`,
      `files ${unlimitedOr(DEFAULT_FILE_COUNT_LIMITS[slug])} and ${mb(DEFAULT_STORAGE_LIMITS[slug])} of storage.`,
    ].join(" ");
  });
  return rows.join("\n");
}

type Topic = { id: string; title: string; body: string };

const TOPICS: Topic[] = [
  {
    id: "credits",
    title: "How credits work",
    body: [
      "Credits are the single currency for every AI action. Each plan includes a monthly allowance that resets on the billing cycle, and extra credits can be bought as one-off packs from Settings.",
      "Nothing is charged at a flat rate. Before an AI action runs, an estimate is computed and that many credits are HELD; when it finishes, the real token usage is measured and only that is charged, with the unused remainder released. So a short request costs less than a long one, always.",
      "A failed action is still charged for the work that ran, because those tokens were really spent. An action that never called the model at all releases its hold and charges nothing.",
      "Every AI action returns a receipt showing what it cost, and the full history is in Settings > Billing.",
    ].join("\n"),
  },
  {
    id: "plans",
    title: "Plans and what each includes",
    body: [
      "Prices are in EUR. Every limit below is the default; a deployment can raise or lower any of them.",
      planTable(),
      "Free deliberately includes zero agents, zero presentations, zero deep research runs and zero published sites. Those four are the actions that spend money unattended or host content publicly, which is not something a throwaway account should be able to do.",
      "Downgrading never deletes anything. Limits apply to CREATING new items; everything already made stays readable, editable and exportable.",
    ].join("\n"),
  },
  {
    id: "agents",
    title: "Autonomous agents",
    body: [
      "An agent is described in one sentence, and Ionexa designs it: a task, a schedule and a delivery address. It then runs on our infrastructure on that schedule, indefinitely, and emails the result.",
      "Schedules are interpreted in the agent's own IANA timezone, not UTC, so 'every morning' means the user's morning. An agent may not be scheduled more than once an hour.",
      "Each run reserves credits before the first token and settles on measured usage. A run retries twice on a transient failure and the hold covers all three attempts. If the account runs out of credits the agent auto-pauses; after five consecutive failures it switches itself off and emails to say so.",
      "An agent has exactly one tool — server-side web search — and can only deliver to the account's own verified email address, or to a Slack channel its own connected workspace confirms the bot is a member of.",
    ].join("\n"),
  },
  {
    id: "presentations",
    title: "Presentations",
    body: [
      "Describe a deck and it is researched, written and laid out. Generation is a web-search pass for real, sourced material followed by one call that composes the slides, and every figure has to come from the findings — the sources are listed under the deck.",
      "Five themes, an editor with inline editing, drag-and-drop reordering and AI edits in a sentence ('make slide 3 shorter'). Every generation and every accepted AI edit appends a version; the last 20 are kept and any can be restored.",
      "Export is PowerPoint (.pptx, with speaker notes in the notes pane) or PDF via the browser's print dialog. A share link can be created, revoked and rotated.",
    ].join("\n"),
  },
  {
    id: "websites",
    title: "Website Builder and publishing",
    body: [
      "The Website Builder generates a complete single-file site from a description. A finished site can be PUBLISHED at a chosen address and is then served live.",
      "Roughly 70 addresses are reserved — anything that would shadow a real route, impersonate us, or make a URL look like something it is not. Every publish and every rollback re-runs a static security scan and refuses rather than warning.",
      "Analytics are views per day with no cookies and no personal data: the table has no column that could hold an IP address, a user agent, a referrer or a visitor id.",
    ].join("\n"),
  },
  {
    id: "files",
    title: "Files and Deep Research",
    body: [
      "Upload a PDF, Word file, spreadsheet, CSV or Markdown and ask questions answered ONLY from that document, with a citation on every claim. References naming a page that was never supplied are removed rather than shown.",
      "Deep Research turns a topic into 3-6 questions, researches each with web search, and writes a sourced report saved as a Document. It stops after planning so the price is visible before the expensive half runs.",
      "The storage bucket is private. Downloads use short-lived signed links minted after an ownership check.",
    ].join("\n"),
  },
  {
    id: "integrations",
    title: "Connected accounts",
    body: [
      "Gmail, Google Drive and Slack can be connected so the AI works on real data. Gmail is read as metadata only — subjects, senders and a snippet — never message bodies, never attachments, and never Spam or Trash.",
      "Gmail and Drive are separate connections even though they share one Google sign-in, so granting file access does not also grant mailbox access. Either can be disconnected on its own.",
      "Tokens are encrypted at rest with a key that lives only in the environment.",
    ].join("\n"),
  },
  {
    id: "privacy",
    title: "Your data, export and deletion",
    body: [
      "Settings > Export downloads everything the product holds about the account as one JSON file: modules, chats, what the assistant has remembered, the extracted text of uploaded documents, agents, sites, presentations, credit history, connected accounts and login devices. The file states what it contains and what it deliberately leaves out.",
      "Two things are excluded on purpose: the original bytes of uploaded files (the extracted text is included; the files download individually from the Files page) and connected-account tokens, which are encrypted credentials to services that are not ours.",
      "Account deletion is in Settings > Danger Zone, confirmed by an emailed link. It removes the account, every record tied to it, and the files in private storage. It cannot be undone.",
      "One cookie is set: the session cookie that keeps you signed in. Language, accessibility and consent preferences are kept in the browser, not on our servers. There is no advertising or cross-site tracking.",
    ].join("\n"),
  },
  {
    id: "billing-questions",
    title: "Billing, refunds and cancellation",
    body: [
      "Subscriptions and credit packs are handled by Stripe. Payment details never reach our servers.",
      "A subscription can be changed or cancelled from Settings > Billing, which opens Stripe's own billing portal. Cancelling takes effect at the end of the paid period; the account stays on its plan until then.",
      "Support cannot issue refunds, change a plan, or adjust a credit balance from a chat. Those need a person — use the contact page.",
    ].join("\n"),
  },
];

/** The corpus, as the model receives it. Assembled once per request
 *  rather than cached, because the plan numbers are computed and a cache
 *  would be one more place they could go stale. */
export function buildSupportKnowledge(): string {
  return TOPICS.map((topic) => `## ${topic.title}\n${topic.body}`).join("\n\n");
}

/**
 * The corpus PLUS the published help-centre articles (V3 Task 13) — the
 * same text a user reads on /help, so support answers and the written
 * docs cannot disagree. The DB read is best-effort: if it fails, the
 * assistant falls back to the computed corpus rather than failing the
 * question. Capped, because the system prompt is paid for per token and
 * a runaway article table must not be able to blow the request up.
 */
export async function buildSupportKnowledgeWithArticles(
  loadArticles: () => Promise<{ title: string; content: string }[]>
): Promise<string> {
  const base = buildSupportKnowledge();
  try {
    const articles = await loadArticles();
    const MAX_ARTICLES = 30;
    const MAX_CHARS_PER_ARTICLE = 4000;
    const articleText = articles
      .slice(0, MAX_ARTICLES)
      .map((a) => `## ${a.title}\n${a.content.slice(0, MAX_CHARS_PER_ARTICLE)}`)
      .join("\n\n");
    return articleText ? `${base}\n\n${articleText}` : base;
  } catch {
    return base;
  }
}

export function supportTopicIds(): string[] {
  return TOPICS.map((t) => t.id);
}

export const SUPPORT_MAX_QUESTION_CHARS = 600;
export const SUPPORT_MIN_QUESTION_CHARS = 3;
/** Turns of history sent back with a follow-up. Short on purpose: a
 *  support conversation that needs more than this is one that should
 *  have reached a person several turns ago. */
export const SUPPORT_MAX_HISTORY_TURNS = 6;
