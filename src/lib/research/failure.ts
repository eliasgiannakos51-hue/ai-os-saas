/**
 * A RESEARCH THAT DID NOT HAPPEN, SAID IN THE READER'S LANGUAGE (the
 * package check of 2026-10-08).
 *
 * Both Research screens showed what the server wrote, as it came: a refused
 * plan or start (`data.error` from api/research and api/research/[id]/run —
 * "A research report costs about 40 credits, and you do not have enough.")
 * and a failed report's stored `error` (lib/research/run-research.ts —
 * "The searches did not return anything usable on this topic."). English,
 * on a Greek screen.
 *
 * Nothing stored changes. A refusal already says what it is in its body
 * (`insufficientCredits`, `limitReached`, `upgradeRequired`, and `code` for
 * a plan the model did not give) or its status; a stored sentence is
 * matched here, exactly, to the reason it gives. The screens show a key
 * (components/research/failure-words.ts); anything not listed falls back to
 * the screen's own general sentence. Held by
 * scripts/tests/research-slides.test.mjs, which reads the stored sentences
 * straight out of run-research.ts and the run route.
 */

export const RESEARCH_FAILURES = {
  noFindings: "The searches did not return anything usable on this topic.",
  unavailable: "The AI service did not answer the research questions. Please run it again in a moment.",
  notWritten: "The report could not be written from the findings.",
  interrupted: "The report stopped before it finished. No credits were charged — please run it again.",
  notStarted: "Could not start the report.",
  noCredits: "Not enough credits.",
} as const;

export type ResearchFailure = keyof typeof RESEARCH_FAILURES;

/** Why a stored report failed, from the sentence the run stored; null when it is none of these. */
export function researchFailure(error: string | null | undefined): ResearchFailure | null {
  if (!error) return null;
  const hit = (Object.keys(RESEARCH_FAILURES) as ResearchFailure[]).find((key) => RESEARCH_FAILURES[key] === error.trim());
  return hit ?? null;
}

export type ResearchRefusal = "noCredits" | "capReached" | "rateLimited" | "unavailable" | "other";

/** A refused plan or start, by what its body and status say it is. */
export function researchRefusal(
  body: { insufficientCredits?: unknown; limitReached?: unknown; code?: unknown } | null,
  status: number
): ResearchRefusal {
  if (body?.insufficientCredits === true || status === 402) return "noCredits";
  if (body?.limitReached === true) return "capReached";
  if (status === 429) return "rateLimited";
  if (body?.code === "ai_unavailable") return "unavailable";
  return "other";
}
