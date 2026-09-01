import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLASSIFIER_MODULES } from "@/lib/classifier-modules";
import { moduleVocabulary } from "@/lib/ai/module-vocabulary";
import { associatedFor } from "@/lib/ai/module-synonyms";
import { questionWords, scoreTerms } from "@/lib/ai/module-relevance";
import { foldForMatch } from "@/lib/text/unicode-patterns";
import { enModuleTitle, enFieldLabel } from "@/lib/module-labels";
import { logApiError } from "@/lib/log-error";
import {
  planDeepDive,
  formatDeepDive,
  deepDivePromptAddition,
  deepDiveScore,
  deepDiveBreadthNotice,
  DEEP_DIVE_ROW_LIMIT,
  DEEP_DIVE_CHAR_BUDGET,
  type DeepDiveField,
} from "@/lib/ai/deep-dive";

/**
 * The server half of the deep dive — the decision and the format live in
 * lib/ai/deep-dive.ts so the gate can load them without a database.
 *
 * COSTS ONE QUERY, AND USUALLY ZERO. The module is chosen before anything
 * is fetched, and a question that does not clearly point at one module
 * returns early without touching the database at all. That is the
 * difference between this and raising PER_MODULE_LIMIT, which pays on
 * every message whether the question needed it or not.
 */
export type DeepDiveModuleRead = {
  slug: string;
  title: string;
  shown: number;
  omitted: number;
  rows: { id: string | null; headline: string; atMs: number | null }[];
};

export type DeepDive = {
  prompt: string;
  /** Every module read, in prompt order. Empty when nothing was read. */
  reads: DeepDiveModuleRead[];
  chars: number;
  /** How the question was placed, for the diagnostic log. */
  mode: "one" | "split" | "none";
};

export const NO_DEEP_DIVE: DeepDive = { prompt: "", reads: [], chars: 0, mode: "none" };

/** Which numeric-ish fields are worth the characters. A deep read exists
 *  to make arithmetic possible, so amounts and counts earn their place
 *  and a long free-text field does not. */
function numericFields(fields: { key: string; labelKey: string; type: string; money?: true }[]): DeepDiveField[] {
  return fields
    .filter((f) => f.money === true || f.type === "number" || f.type === "date" || f.type === "select")
    .slice(0, 4)
    .map((f) => ({
      key: f.key,
      label: enFieldLabel(f as Parameters<typeof enFieldLabel>[0]),
      ...(f.money ? { money: true as const } : {}),
    }));
}

export async function loadDeepDive(
  supabase: SupabaseClient,
  userId: string,
  question: string,
  language: "en" | "el"
): Promise<DeepDive> {
  try {
    const folded = foldForMatch(question);
    const words = questionWords(folded);
    const vocab = moduleVocabulary();
    const scored = vocab.map((v) => ({
      slug: v.slug,
      score: deepDiveScore(
        scoreTerms(words, folded, v.terms),
        scoreTerms(words, folded, associatedFor(v.slug))
      ),
    }));
    const plan = planDeepDive(question, scored);

    // TOO MANY MODULES: read nothing, and say so. The sentence costs
    // ~44 tokens against the ~431 a real read costs, and it is the part
    // the user was missing — not depth, but knowing why the answer is
    // shallow.
    if (plan.kind === "none") {
      if (plan.reason !== "too-many") return NO_DEEP_DIVE;
      const titles = plan.slugs
        .map((slug) => CLASSIFIER_MODULES.find((m) => m.slug === slug))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map((c) => enModuleTitle(c));
      const notice = deepDiveBreadthNotice(titles, false, language);
      return { prompt: notice, reads: [], chars: notice.length, mode: "none" };
    }

    const slugs = plan.kind === "one" ? [plan.slug] : plan.slugs;
    // HALF EACH WHEN THE QUESTION NAMES TWO. A comparison cannot be
    // answered from one side, and a full read of each would double the
    // cost of the one question shaped to need both.
    const share = Math.max(1, Math.floor(DEEP_DIVE_ROW_LIMIT / slugs.length));
    const budget = Math.floor(DEEP_DIVE_CHAR_BUDGET / slugs.length);

    const reads: DeepDiveModuleRead[] = [];
    let prompt = "";
    let chars = 0;
    for (const slug of slugs) {
      const config = CLASSIFIER_MODULES.find((m) => m.slug === slug);
      if (!config) continue;

      const { data, error } = await supabase
        .from(config.table)
        .select("*")
        // EXPLICIT, never left to RLS — same reason lib/user-context.ts
        // spells it out, and the same shape three mentor scans were
        // missing.
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        // One more than the share, so "there are more you are not
        // seeing" is measured rather than assumed.
        .limit(share + 1);

      if (error || !data || data.length === 0) {
        if (error) logApiError("deep-dive", error, { table: config.table });
        continue;
      }

      const rows = data as Record<string, unknown>[];
      const title = enModuleTitle(config);
      const { text, used, omitted } = formatDeepDive(
        title,
        config.headlineKey,
        numericFields(config.fields as Parameters<typeof numericFields>[0]),
        rows,
        budget,
        share
      );
      if (!text) continue;
      const shown = text.split("\n").length;
      const block = deepDivePromptAddition(title, text, shown, omitted, language);
      prompt += block;
      chars += used;
      reads.push({
        slug: config.slug,
        title,
        shown,
        omitted,
        // THE ROWS THAT WERE SENT, not the ones that were fetched. The
        // budget cuts the list before it reaches the model, and
        // crediting a row that did not fit names a source the answer
        // never saw.
        rows: rows.slice(0, shown).map((r) => {
          const at = new Date(String(r.created_at)).getTime();
          return {
            id: typeof r.id === "string" ? r.id : null,
            headline: String(r[config.headlineKey] ?? "").trim(),
            atMs: Number.isFinite(at) ? at : null,
          };
        }),
      });
    }

    if (reads.length === 0) return NO_DEEP_DIVE;
    // The notice rides on a SPLIT read too: half the rows is still half,
    // and a user comparing two modules should be told the comparison was
    // made on half of each.
    if (plan.kind === "split") {
      prompt += deepDiveBreadthNotice(reads.map((r) => r.title), true, language);
    }
    return { prompt, reads, chars, mode: plan.kind };
  } catch (err) {
    logApiError("deep-dive", err, { userId });
    return NO_DEEP_DIVE;
  }
}
