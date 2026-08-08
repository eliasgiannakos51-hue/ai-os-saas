// Deep Research's shape, in a client-safe module.
//
// Same reason as lib/files/file-models.ts and lib/ai-models.ts: the topic
// box enforces the length limit before the request travels, and the plan
// panel names how many questions and searches the run may make so the
// estimate next to it is legible. lib/research/research.ts is
// `server-only` and cannot be imported from a component, and a second
// copy of these numbers in the component is exactly how a limit and its
// UI drift apart.

export const RESEARCH_MIN_QUESTIONS = 3;
export const RESEARCH_MAX_QUESTIONS = 6;

/** Web searches the model may run per research question. */
export const RESEARCH_SEARCHES_PER_QUESTION = 4;

export const RESEARCH_MAX_SEARCHES = RESEARCH_MAX_QUESTIONS * RESEARCH_SEARCHES_PER_QUESTION;

// V3 Task 14 — parallel thinking. The questions are independent, so they
// run through a POOL of this many concurrent search-enabled calls: the
// latency of the slowest ceil(N/3) instead of the sum of all N. Three,
// not six: a six-wide burst of search calls is what trips provider rate
// limits on a busy account, which surfaces as a report missing a third
// of its research for no reason the user can see.
export const RESEARCH_CONCURRENCY = 3;

export const MAX_TOPIC_CHARS = 500;
export const MIN_TOPIC_CHARS = 8;
