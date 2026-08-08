/**
 * Research confidence (V3 Task 14) — honest by construction.
 *
 * NEVER A PERCENTAGE. A model asked "how confident are you, 0-100?"
 * produces a number with the texture of measurement and the substance
 * of vibes; showing it would be laundering a guess through a progress
 * bar. What we actually KNOW is how many real, citable sources the
 * API's own citation blocks returned against how many questions were
 * asked — so that is the only thing the indicator states.
 */

export type ResearchConfidence =
  | { level: "grounded"; sourceCount: number }
  | { level: "thin"; sourceCount: number }
  | { level: "insufficient"; sourceCount: number };

export function researchConfidence(params: {
  sourceCount: number;
  questionCount: number;
}): ResearchConfidence {
  const sourceCount = Math.max(0, Math.floor(params.sourceCount));
  const questionCount = Math.max(1, Math.floor(params.questionCount));

  if (sourceCount === 0) return { level: "insufficient", sourceCount };
  // Fewer than one distinct source per question asked is a report
  // leaning hard on little evidence — true, but worth saying quietly.
  if (sourceCount < questionCount) return { level: "thin", sourceCount };
  return { level: "grounded", sourceCount };
}
