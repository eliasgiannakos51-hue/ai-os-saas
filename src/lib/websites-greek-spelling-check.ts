import { runCompletion } from "@/lib/ai/providers/complete";
import { logApiError } from "@/lib/log-error";
import { greekWordsToCheck, keepOnlyAsked, parseWordList } from "@/lib/website-greek-spelling";
import type { CostAccumulator } from "@/lib/billing/cost-accumulator";

/** Just the part of the accumulator this needs, so a caller can pass its
 *  own without this file depending on the whole shape. */
type CostRecorder = Pick<CostAccumulator, "record">;

/**
 * THE MODEL CALL, KEPT AWAY FROM THE RULES.
 *
 * lib/website-greek-spelling.ts holds the parts that decide WHICH words
 * are asked about and WHICH answers are kept — pure text, and the half
 * that has to be tested, since it is where "never flag the owner's own
 * village" and "never show a word the model invented" actually live.
 * Importing the provider chain into that file dragged the Anthropic SDK
 * behind it and put those rules out of reach of scripts/tests, so the
 * call lives here instead and the rules stay testable.
 */
const SYSTEM = [
  "You are given a list of Greek words taken from a web page.",
  "Reply with a JSON array of ONLY the words from that list that are misspelled in Greek.",
  "A word that is a place name, a person's name, a brand, or a loanword is NOT misspelled.",
  "If every word is correct, reply with [].",
  "Reply with the JSON array and nothing else. Never invent a word that is not in the list.",
].join(" ");

/**
 * THE MODEL WAS NEVER CHOSEN — IT WAS THE DEFAULT, and the default is not
 * the cheap one.
 *
 * This call said `purpose: "classification"` and named no model. It reads
 * like "one cheap classification call", and providers/complete.ts does
 * something else with it: no model means `originTier = "mid"`, and
 * substituteModel then returns the cheapest anthropic model at mid tier
 * OR ABOVE — claude-sonnet-4-6 at 3/15 per MTok, not claude-haiku-4-5 at
 * 1/5. Measured by calling substituteModel("anthropic", "mid", []), not
 * by reading it.
 *
 * EVERY OTHER runCompletion CALLER IN THE TREE NAMES ITS MODEL. This one
 * was the only one that did not, so it was the only one whose model was
 * decided by a fallback nobody wrote down.
 *
 * NAMED HERE, AND THE BEHAVIOUR IS UNCHANGED. `claude-sonnet-4-6` is
 * exactly what was being served; writing it down turns an accident into a
 * decision without changing one request. The cheaper candidate is not
 * taken on a hunch: a spelling note that flags correct Greek is worse
 * than no note (see the comment at the top of
 * lib/website-greek-spelling.ts), and whether haiku is as good at Greek
 * orthography is a MEASUREMENT nobody here has made. It costs about two
 * tenths of a cent to make:
 *
 *   node scripts/check-site-spelling.mjs --url <site> --brief "..." \
 *     --model claude-haiku-4-5      # and again with claude-sonnet-4-6
 *
 * WHAT THE DIFFERENCE IS WORTH, so the number is not left to sound
 * bigger than it is: about 250 tokens in and 30 out per generation, so
 * $0.0012 on sonnet against $0.0004 on haiku — eight hundredths of a
 * cent per website. It is worth naming, not worth guessing at.
 */
const MODEL = "claude-sonnet-4-6";

/**
 * One classification call. Returns the misspelled words, or an empty list
 * on any failure — a spelling note is a courtesy, and a generation must
 * never fail because the courtesy did.
 */
export async function findGreekMisspellings(
  html: string,
  brief: string,
  // `costs` IS REQUIRED, not optional. An optional accumulator is a call
  // that silently costs the owner money whenever somebody forgets to pass
  // one; a required one makes that a type error at the call site.
  options: { costs: CostRecorder; userId?: string; signal?: AbortSignal }
): Promise<string[]> {
  const words = greekWordsToCheck(html, brief);
  if (words.length === 0) return [];
  try {
    const outcome = await runCompletion(
      {
        purpose: "classification",
        model: MODEL,
        system: [{ type: "text", text: SYSTEM }],
        messages: [{ role: "user", content: JSON.stringify(words) }],
        maxTokens: 300,
        temperature: 0,
      },
      { userId: options.userId, signal: options.signal }
    );
    if (!outcome.ok) return [];
    // THE TOKENS ARE THE GENERATION'S. This runs inside a website build
    // that has already reserved credits, so its usage goes on that build's
    // accumulator and is settled with it — a call whose tokens reach no
    // accumulator is one the owner pays for and the user never does, which
    // is what scripts/tests/billing-coverage.test.mjs exists to refuse.
    const costs = options.costs;
    costs.record("generation", outcome.usage, outcome.reportedModel || outcome.model);
    return keepOnlyAsked(parseWordList(outcome.text ?? ""), words);
  } catch (err) {
    logApiError("website:greek-spelling", err, { stage: "classify", words: String(words.length) });
    return [];
  }
}
