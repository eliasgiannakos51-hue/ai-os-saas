/**
 * THE JSON INSIDE A REPLY — one scanner, because there were two.
 *
 * lib/data-analysis/analyse.ts and lib/evals/scoring.ts each had an
 * `extractJson`, written independently, carrying the same reasoning in
 * the same words ("balanced scan, not a regex, because a greedy match
 * runs to the last brace in the document"). Measured over eleven inputs
 * they disagreed on two, and both disagreements were the same omission:
 *
 *     "[1,2,3]"      analyse: null            evals: [1,2,3]
 *     '[{"a":1}]'    analyse: {"a":1}         evals: [{"a":1}]
 *
 * The second is the one that matters. analyse's scanner looked only for
 * `{`, found the one INSIDE the array, and returned the first element as
 * if it were the whole answer — a wrong value that looks like a right
 * one. Returning null would have been a refusal; this was a substitution.
 *
 * The fence handling differed too: analyse stripped a fence only at the
 * very start and end of the reply, so a model that wrote a sentence, then
 * a fenced block, then a sentence, got its braces scanned out of the
 * prose instead of out of the fence.
 *
 * ONE SCANNER, TWO WRAPPERS. The two callers genuinely want different
 * things — one wants a parsed object or nothing, the other wants the text
 * to hand to a checker — so what is shared is the part that was wrong in
 * one of them, not the contract on top of it.
 */

/**
 * The balanced JSON slice of `raw`, or null when there is none.
 *
 * BALANCED, not `indexOf("{")` to `lastIndexOf("}")`. A reply containing
 * an object followed by prose containing a brace produces a slice that
 * does not parse; a reply with a brace inside a string value defeats the
 * naive version from the other side.
 *
 * ARRAYS COUNT. `[` opens a JSON document exactly as `{` does, and a
 * scanner that ignores it does not fail — it finds the first `{` further
 * in and returns a fragment.
 */
export function jsonSliceOf(raw: string): string | null {
  // A FENCE ANYWHERE, not only at the ends. The model that writes
  // "Here you go:\n```json\n{...}\n```\nHope that helps" is the common
  // case, and stripping only a leading and trailing fence leaves the
  // prose in.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = (fenced ? fenced[1] : raw).trim();

  const start = text.search(/[{[]/);
  if (start === -1) return null;
  const open = text[start];
  const close = open === "{" ? "}" : "]";

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      // A CLOSE THAT NEVER OPENED is not the end of a document. Without
      // this, a reply beginning with a stray `}` would end the scan at
      // depth -1 on the first character it read.
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  // Unterminated: the document was cut off. The remainder is returned so
  // a caller that wants to show the reader what arrived can, and the
  // callers that want valid JSON get null from JSON.parse anyway.
  return text.slice(start);
}
