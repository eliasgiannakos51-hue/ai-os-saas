import { AGENT_LIMITS } from "@/lib/agents/agent-config";
import { AGENT_DEPTHS, type AgentDepth } from "@/lib/agents/agent-depth";
import { foldForMatch } from "@/lib/text/unicode-patterns";

/**
 * READY-MADE AGENTS, and the rules for putting one in the library.
 *
 * WHY THIS EXISTS: building an agent costs a full Sonnet tool call, and a
 * large share of what people ask for is the same handful of shapes — a
 * daily news watch, a weekly competitor check, a price monitor. Paying
 * the builder to re-derive "search the web daily for X and email me
 * bullets" is paying to rediscover something already written down.
 *
 * A TEMPLATE IS A PATTERN WITH A HOLE IN IT. The hole is {subject}, and
 * it is the ONLY thing that differs between one person's daily news watch
 * and another's. That is not a convenience — it is the whole
 * anonymisation model: what gets shared is the sentence AROUND the
 * subject, and the subject itself never leaves the account it came from.
 */

/** The one slot a template may contain. Exactly one token, not a
 *  templating language: anything richer is a way to smuggle structure
 *  that has to be validated, and there is nothing a second slot buys. */
export const TEMPLATE_SLOT = "{subject}";

export type AgentTemplate = {
  /** Stable across releases: the adopt route takes this, not a title. */
  slug: string;
  title: string;
  description: string;
  /** The task prompt with {subject} where the specific thing goes. */
  taskPattern: string;
  scheduleCron: string;
  depth: AgentDepth;
  needsWebSearch: boolean;
  outputFormat: "summary" | "bullets" | "report";
  /** Free-text words that should match this template, in English —
   *  matching folds and stems nothing, so these are the extra spellings
   *  the title and description do not already contain. */
  keywords: string[];
};

/**
 * THE CURATED LIBRARY. Written here, by us, from nothing — no user's
 * agent was read to produce any of it, which is what makes these safe to
 * show to everybody without any anonymisation question arising at all.
 *
 * Deliberately small. Twelve shapes that cover most of what people ask
 * for beats fifty that nobody scrolls, and every one of these has to be
 * a thing an agent can genuinely do (search, read, compare, summarise,
 * monitor — see the builder's feasibility rules).
 */
export const BUILT_IN_TEMPLATES: AgentTemplate[] = [
  {
    slug: "daily-news-watch",
    title: "Daily news watch",
    description: "Every morning, what actually happened with one topic since yesterday.",
    taskPattern:
      "Find what has genuinely changed about {subject} in the last 24 hours. Report only real developments with a source for each: announcements, results, incidents, decisions. Leave out opinion pieces, speculation and anything already reported before yesterday. If nothing of substance happened, say so rather than filling the space.",
    scheduleCron: "0 8 * * *",
    depth: "standard",
    needsWebSearch: true,
    outputFormat: "bullets",
    keywords: ["news", "daily", "updates", "latest", "briefing", "morning"],
  },
  {
    slug: "competitor-watch",
    title: "Weekly competitor watch",
    description: "What a named competitor did this week — pricing, product, hiring, press.",
    taskPattern:
      "Check what {subject} has done in the past week. Look specifically for: pricing or packaging changes, new product or feature announcements, notable hires or departures, funding, and press coverage. For each, give the fact and the source. Say plainly which of those areas you found nothing on.",
    scheduleCron: "0 9 * * 1",
    depth: "standard",
    needsWebSearch: true,
    outputFormat: "report",
    keywords: ["competitor", "rival", "competition", "market", "weekly"],
  },
  {
    slug: "price-check",
    title: "Daily price check",
    description: "One number, once a day.",
    taskPattern:
      "Find the current price of {subject} and report it as a single line with the figure, the currency, the date it is as of, and the source. If today's figure is not published yet, say so and give the most recent one with its date. Never estimate or interpolate a price.",
    scheduleCron: "0 9 * * *",
    depth: "simple",
    needsWebSearch: true,
    outputFormat: "summary",
    keywords: ["price", "cost", "rate", "quote", "value", "exchange"],
  },
  {
    slug: "regulation-monitor",
    title: "Regulation monitor",
    description: "Rule changes in one area, weekly, before they bite.",
    taskPattern:
      "Check for changes to the rules, laws or official guidance affecting {subject}. Report only changes that have actually been published or formally proposed — with the issuing body, the date, and a link. Distinguish clearly between what is in force, what is proposed, and what is merely being discussed.",
    scheduleCron: "0 9 * * 2",
    depth: "standard",
    needsWebSearch: true,
    outputFormat: "report",
    keywords: ["regulation", "law", "compliance", "legal", "rules", "policy"],
  },
  {
    slug: "market-landscape",
    title: "Monthly market landscape",
    description: "The broad picture of one market, once a month.",
    taskPattern:
      "Build a picture of the current state of the {subject} market. Cover: who the significant players are and how they position themselves, what customers in this market are actually buying on, what has shifted in the last quarter, and where the market appears to be heading. Use many sources, name each one, and be explicit about anything the sources disagree on.",
    scheduleCron: "0 9 1 * *",
    depth: "deep",
    needsWebSearch: true,
    outputFormat: "report",
    keywords: ["market", "landscape", "industry", "sector", "overview", "research", "monthly"],
  },
  {
    slug: "job-market-watch",
    title: "Job market watch",
    description: "What is being hired for, in one field, each week.",
    taskPattern:
      "Look at what employers are currently hiring for in {subject}. Report the roles that appear most, the skills most often asked for, the salary ranges being advertised where they are stated, and anything that has visibly changed since a month ago. Cite where each observation comes from.",
    scheduleCron: "0 9 * * 3",
    depth: "standard",
    needsWebSearch: true,
    outputFormat: "bullets",
    keywords: ["jobs", "hiring", "recruitment", "salary", "roles", "careers"],
  },
  {
    slug: "supplier-check",
    title: "Supplier check",
    description: "Is a supplier still solid? Monthly.",
    taskPattern:
      "Check the current standing of {subject} as a supplier. Look for: financial distress or insolvency filings, ownership changes, service outages or recalls, legal action, and recent customer complaints at scale. Report only what is documented, with sources. If you find nothing concerning, say that plainly — it is the useful answer.",
    scheduleCron: "0 9 1 * *",
    depth: "standard",
    needsWebSearch: true,
    outputFormat: "report",
    keywords: ["supplier", "vendor", "partner", "risk", "due diligence"],
  },
  {
    slug: "grant-funding-watch",
    title: "Grants and funding watch",
    description: "Open funding a business in one field could actually apply for.",
    taskPattern:
      "Find funding, grants and subsidy schemes currently open to organisations working in {subject}. For each: who runs it, who is eligible, roughly how much, and the closing date. Exclude anything already closed or not yet open for applications. Give a link for each.",
    scheduleCron: "0 9 * * 4",
    depth: "standard",
    needsWebSearch: true,
    outputFormat: "bullets",
    keywords: ["grant", "funding", "subsidy", "finance", "programme", "scheme"],
  },
  {
    slug: "reputation-check",
    title: "Reputation check",
    description: "What is being said publicly about one name, weekly.",
    taskPattern:
      "Find what has been said publicly about {subject} in the past week — reviews, forum threads, news mentions, social posts that got traction. Summarise the themes rather than listing every mention, separate praise from complaint, and give a source for each theme. Do not speculate about anything you cannot source.",
    scheduleCron: "0 9 * * 5",
    depth: "standard",
    needsWebSearch: true,
    outputFormat: "report",
    keywords: ["reputation", "reviews", "mentions", "sentiment", "brand", "feedback"],
  },
  {
    slug: "release-notes-digest",
    title: "Release notes digest",
    description: "What changed in a tool you depend on.",
    taskPattern:
      "Check what has been released or changed in {subject} since a week ago. Report only actual releases and changelog entries — version numbers, what changed, and anything flagged as breaking or deprecated. Ignore blog posts and marketing. Link the changelog entry for each item.",
    scheduleCron: "0 9 * * 1",
    depth: "simple",
    needsWebSearch: true,
    outputFormat: "bullets",
    keywords: ["release", "changelog", "version", "update", "software", "tool"],
  },
  {
    slug: "event-watch",
    title: "Event watch",
    description: "Conferences and events worth attending in one field.",
    taskPattern:
      "Find upcoming conferences, trade shows and significant events for {subject} in the next three months. For each: the name, the dates, where it is, roughly what it costs to attend, and who it is for. Exclude anything already past and anything with no confirmed date.",
    scheduleCron: "0 9 1 * *",
    depth: "standard",
    needsWebSearch: true,
    outputFormat: "bullets",
    keywords: ["events", "conference", "trade show", "exhibition", "calendar"],
  },
  {
    slug: "weekly-summary",
    title: "Weekly topic summary",
    description: "One topic, one page, once a week — no web search.",
    taskPattern:
      "Write a clear, structured explanation of {subject} for somebody who needs to understand it well enough to make a decision. Cover what it is, why it matters, the main trade-offs, and the questions worth asking. Work from what you know; do not present anything as current news.",
    scheduleCron: "0 9 * * 1",
    depth: "simple",
    needsWebSearch: false,
    outputFormat: "report",
    keywords: ["explain", "summary", "learn", "understand", "primer", "briefing"],
  },
];

export function findBuiltInTemplate(slug: string): AgentTemplate | undefined {
  return BUILT_IN_TEMPLATES.find((template) => template.slug === slug);
}

/** The finished task prompt for one adoption. */
export function fillTemplate(taskPattern: string, subject: string): string {
  const trimmed = subject.trim().slice(0, 200);
  // replaceAll, not replace: a pattern that mentions the slot twice must
  // not end up with one filled and one literal "{subject}" emailed to
  // somebody every morning.
  return taskPattern.split(TEMPLATE_SLOT).join(trimmed).slice(0, AGENT_LIMITS.prompt);
}

// ---------------------------------------------------------------------
// Sharing your own agent as a template — the anonymisation rules.
// ---------------------------------------------------------------------

export const SHARE_REFUSAL_REASONS = [
  "no_slot",
  "subject_still_present",
  "contains_contact_details",
  "contains_numbers",
  "too_short",
  "too_long",
] as const;
export type ShareRefusalReason = (typeof SHARE_REFUSAL_REASONS)[number];

export type AnonymiseResult =
  | { ok: true; pattern: string }
  | { ok: false; reason: ShareRefusalReason };

/** Shortest pattern worth sharing. Below this it carries no structure —
 *  it is a subject with a verb in front of it. */
export const MIN_PATTERN_CHARS = 60;

const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const URL = /\bhttps?:\/\/\S+|\bwww\.\S+\.[a-z]{2,}/i;
const HANDLE = /(^|\s)@[a-z0-9_]{2,}/i;
// Four or more digits in a row: a phone number, an account number, an
// order reference, a VAT id. A year is four digits too, which is why the
// refusal is a refusal and not a redaction — "share it without the year"
// is a judgement only the person sharing can make.
const LONG_DIGITS = /\d{4,}/;

/**
 * Turn one user's task prompt into a shareable pattern, or refuse.
 *
 * REFUSAL-FIRST, AND IT DOES NOT GUESS AT NAMES.
 *
 * The obvious implementation — find the proper nouns and replace them —
 * cannot work in this product. German capitalises every noun. Greek,
 * Arabic, Japanese and Chinese do not mark proper nouns with case at all.
 * A capitalisation heuristic would leak names in four languages and
 * mangle sentences in a fifth, while LOOKING like it had anonymised
 * something. That is worse than no anonymiser, because it would be
 * trusted.
 *
 * So the person sharing names their own subject — they are the only one
 * who knows which words are theirs — and this function's job is to check
 * that the result is actually free of it, and to refuse outright on the
 * categories a machine CAN recognise: addresses, links, handles, long
 * digit strings.
 *
 * `subject` is the text the sharer identified as specific to them.
 */
export function anonymiseTaskPrompt(prompt: string, subject: string): AnonymiseResult {
  const trimmedSubject = subject.trim();
  if (trimmedSubject.length < 2) return { ok: false, reason: "no_slot" };

  // THE REPLACEMENT IS EXACT. Replacing every accent-blind variant would
  // mean deciding, for the sharer, that "Καφές" and "καφες" are the same
  // word in their sentence — and getting that wrong mangles the pattern
  // they are publishing.
  const pattern = prompt.split(trimmedSubject).join(TEMPLATE_SLOT).trim();

  if (!pattern.includes(TEMPLATE_SLOT)) return { ok: false, reason: "no_slot" };

  // THE RE-CHECK IS FOLDED, and deliberately stricter than the
  // replacement. foldForMatch is the app's one definition of "the same
  // text" — lower case, accents removed, Greek final sigma normalised
  // (lib/text/unicode-patterns.ts) — so "Acme" replaced while "ACME"
  // stands is caught, and so is "Καφές" replaced while "καφες" stands.
  //
  // A stricter check than the replacement can only ever REFUSE a share
  // that a laxer one would have allowed, which is the safe direction: a
  // refusal costs somebody an edit, a miss publishes their name.
  //
  // Refused rather than replaced again — a second pass keeps finding
  // near-misses and can never prove it found the last one.
  if (foldForMatch(pattern).includes(foldForMatch(trimmedSubject))) {
    return { ok: false, reason: "subject_still_present" };
  }
  if (EMAIL.test(pattern) || URL.test(pattern) || HANDLE.test(pattern)) {
    return { ok: false, reason: "contains_contact_details" };
  }
  if (LONG_DIGITS.test(pattern)) return { ok: false, reason: "contains_numbers" };
  if (pattern.length < MIN_PATTERN_CHARS) return { ok: false, reason: "too_short" };
  if (pattern.length > AGENT_LIMITS.prompt) return { ok: false, reason: "too_long" };

  return { ok: true, pattern };
}

/**
 * What a shared template is allowed to carry, built from an agent.
 *
 * NOTHING FROM THE ROW EXCEPT THE STRUCTURE. Not the name (people call
 * an agent after their company), not the description (same), not the
 * delivery target, not the schedule's timezone — which is a location.
 * The title and description are the SHARER'S OWN, typed for the library,
 * and length-capped here.
 */
export type ShareableTemplate = {
  title: string;
  description: string;
  taskPattern: string;
  scheduleCron: string;
  depth: AgentDepth;
  needsWebSearch: boolean;
  outputFormat: "summary" | "bullets" | "report";
};

export const TEMPLATE_LIMITS = {
  title: 60,
  description: 160,
} as const;

/** Everything a shared template must satisfy before it is stored, in one
 *  place, so the API route and the test check the same rules. */
export function validateShareableTemplate(
  input: Partial<ShareableTemplate>
): { ok: true; template: ShareableTemplate } | { ok: false; reason: string } {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const taskPattern = typeof input.taskPattern === "string" ? input.taskPattern.trim() : "";

  if (title.length < 3) return { ok: false, reason: "A title is required." };
  if (title.length > TEMPLATE_LIMITS.title) return { ok: false, reason: "That title is too long." };
  if (description.length < 3) return { ok: false, reason: "A description is required." };
  if (description.length > TEMPLATE_LIMITS.description)
    return { ok: false, reason: "That description is too long." };
  if (!taskPattern.includes(TEMPLATE_SLOT))
    return { ok: false, reason: "The pattern must contain a {subject} slot." };
  if (taskPattern.length < MIN_PATTERN_CHARS)
    return { ok: false, reason: "The pattern is too short to be useful to anybody else." };
  // The same recognisers as anonymiseTaskPrompt, applied again to the
  // TITLE and DESCRIPTION, which that function never saw. A pattern
  // scrubbed clean under a title reading "Watch acme.com for Nikos" has
  // published exactly what the scrub was for.
  for (const field of [title, description, taskPattern]) {
    if (EMAIL.test(field) || URL.test(field) || HANDLE.test(field)) {
      return { ok: false, reason: "Remove email addresses, links and @handles before sharing." };
    }
    if (LONG_DIGITS.test(field)) {
      return { ok: false, reason: "Remove long numbers before sharing." };
    }
  }

  const depth = (AGENT_DEPTHS as readonly string[]).includes(input.depth as string)
    ? (input.depth as AgentDepth)
    : "standard";
  const outputFormat = ["summary", "bullets", "report"].includes(input.outputFormat as string)
    ? (input.outputFormat as ShareableTemplate["outputFormat"])
    : "summary";

  return {
    ok: true,
    template: {
      title,
      description,
      taskPattern,
      scheduleCron: typeof input.scheduleCron === "string" ? input.scheduleCron.trim() : "0 9 * * 1",
      depth,
      needsWebSearch: input.needsWebSearch === true,
      outputFormat,
    },
  };
}

// ---------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------

/**
 * NOT SEMANTIC, and saying so is the point.
 *
 * "Semantic matching" needs embeddings, and #17 established that
 * embeddings are not being added yet. What this does is rank by WORD
 * OVERLAP against a folded, accent-blind form of the request — the same
 * fold the database's own full-text ranking uses, so the browser's
 * preview and the server's answer agree about what matches.
 *
 * The seam for embeddings later is the same one the search index has: a
 * score from this and a score from a vector distance, combined. Nothing
 * here needs to be unpicked to add that.
 */
export function scoreTemplateMatch(
  request: string,
  template: Pick<AgentTemplate, "title" | "description" | "keywords">,
  fold: (s: string) => string
): number {
  const words = fold(request)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3);
  if (words.length === 0) return 0;
  const unique = [...new Set(words)];

  const title = fold(template.title);
  const description = fold(template.description);
  const keywords = template.keywords.map(fold);

  let score = 0;
  for (const word of unique) {
    // Weighted the way the search index weights its columns: a word in
    // the title is what the template IS, a word in the description is
    // what it mentions.
    if (keywords.some((k) => k.includes(word) || word.includes(k))) score += 3;
    else if (title.includes(word)) score += 3;
    else if (description.includes(word)) score += 1;
  }
  return score;
}

/** The floor below which "we found one that does this" would be a lie.
 *  Two weak word hits is a coincidence, not a match. */
export const MIN_MATCH_SCORE = 3;
