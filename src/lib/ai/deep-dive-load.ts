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
  pickDeepDiveModule,
  formatDeepDive,
  deepDivePromptAddition,
  deepDiveScore,
  DEEP_DIVE_ROW_LIMIT,
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
export type DeepDive = {
  prompt: string;
  slug: string;
  title: string;
  shown: number;
  omitted: number;
  chars: number;
  rows: { id: string | null; headline: string; atMs: number | null }[];
};

export const NO_DEEP_DIVE: DeepDive = {
  prompt: "",
  slug: "",
  title: "",
  shown: 0,
  omitted: 0,
  chars: 0,
  rows: [],
};

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
    // SUBJECT WORDS COUNT DOUBLE. The vocabulary (title, field labels and
    // the module's own subject synonyms) is the strong evidence; the
    // associated words are scored separately at half weight so they can
    // decide a question with no subject word and never outvote one that
    // has. See lib/ai/module-synonyms.ts for why "customer" is not a
    // claim on Sales.
    const scored = vocab.map((v) => ({
      slug: v.slug,
      score: deepDiveScore(
        scoreTerms(words, folded, v.terms),
        scoreTerms(words, folded, associatedFor(v.slug))
      ),
    }));
    const choice = pickDeepDiveModule(question, scored);
    if (!choice) return NO_DEEP_DIVE;

    const config = CLASSIFIER_MODULES.find((m) => m.slug === choice.slug);
    if (!config) return NO_DEEP_DIVE;

    const { data, error } = await supabase
      .from(config.table)
      .select("*")
      // EXPLICIT, never left to RLS — same reason lib/user-context.ts
      // spells it out, and the same shape three mentor scans were missing.
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      // One more than the cap, so "there are more you are not seeing" is
      // measured rather than assumed.
      .limit(DEEP_DIVE_ROW_LIMIT + 1);

    if (error || !data || data.length === 0) {
      if (error) logApiError("deep-dive", error, { table: config.table });
      return NO_DEEP_DIVE;
    }

    const rows = data as Record<string, unknown>[];
    const title = enModuleTitle(config);
    const { text, used, omitted } = formatDeepDive(
      title,
      config.headlineKey,
      numericFields(config.fields as Parameters<typeof numericFields>[0]),
      rows
    );
    if (!text) return NO_DEEP_DIVE;

    const shown = text.split("\n").length;
    return {
      prompt: deepDivePromptAddition(title, text, shown, omitted, language),
      slug: config.slug,
      title,
      shown,
      omitted,
      chars: used,
      // THE ROWS THAT WERE SENT, not the ones that were fetched. The
      // budget cuts the list before it reaches the model, and crediting a
      // row that did not fit names a source the answer never saw.
      rows: rows.slice(0, shown).map((r) => {
        const at = new Date(String(r.created_at)).getTime();
        return {
          id: typeof r.id === "string" ? r.id : null,
          headline: String(r[config.headlineKey] ?? "").trim(),
          atMs: Number.isFinite(at) ? at : null,
        };
      }),
    };
  } catch (err) {
    logApiError("deep-dive", err, { userId });
    return NO_DEEP_DIVE;
  }
}
