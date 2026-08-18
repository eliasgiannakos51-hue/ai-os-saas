import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModuleConfig } from "@/lib/modules";
import { LINKABLE_MODULES, getLinkableModuleByTable, moduleHref } from "@/lib/knowledge-graph";
import { logApiError } from "@/lib/log-error";
import { normalizeForSearch } from "@/lib/text/search-match";
import type { ModuleTitleKey } from "@/lib/modules";

// Bounded per-module scan, same trade-off as lib/chat/entity-mentions.ts —
// keeps a single "just created a record" call cheap regardless of how
// much data an account has, and this runs on every create, not just an
// opt-in action.
const PER_MODULE_LIMIT = 30;
const MAX_SUGGESTIONS = 3;
const MIN_KEYWORD_LENGTH = 4;
const MAX_KEYWORDS = 8;

// Small, deliberately minimal stopword list (English + Greek, since the
// app's content can be in either) — just enough to filter out the most
// common connector words that would otherwise match almost everything.
// Not a real NLP stoplist; keyword matching here is intentionally simple
// per the brief (no embeddings/semantic search yet).
const STOPWORDS = new Set([
  "this",
  "that",
  "with",
  "from",
  "your",
  "have",
  "will",
  "about",
  "there",
  "which",
  "their",
  "into",
  "were",
  "been",
  "για",
  "και",
  "του",
  "της",
  "μια",
  "ένα",
  "που",
  "θα",
  "να",
  "τον",
  "την",
  "από",
  "στο",
  "στη",
]);

export type EntityLinkSuggestion = {
  table: string;
  id: string;
  headline: string;
  moduleTitleKey: ModuleTitleKey;
  href: string;
};

function bodyFieldFor(module: ModuleConfig) {
  return module.fields.find(
    (f) => f.key !== module.headlineKey && (f.type === "text" || f.type === "textarea")
  );
}

function textFor(module: ModuleConfig, row: Record<string, unknown>): string {
  const headline = String(row[module.headlineKey] ?? "");
  const bodyField = bodyFieldFor(module);
  const body = bodyField ? String(row[bodyField.key] ?? "") : "";
  return `${headline} ${body}`;
}

// Unicode-aware split (\p{L}/\p{N}) rather than a hardcoded character
// range, so this works the same for Greek, English, or anything else
// without special-casing a language.
function extractKeywords(text: string): string[] {
  // normalizeForSearch, not toLowerCase(): both this and candidateText
  // below have to fold the SAME way or a Greek headline written two
  // ordinary ways ("Καφές" vs "καφε") never overlaps itself — the exact
  // bug documented in lib/text/search-match.ts's header, hit here too.
  const tokens = normalizeForSearch(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const unique = [...new Set(tokens)].filter(
    (t) => t.length >= MIN_KEYWORD_LENGTH && !STOPWORDS.has(t)
  );
  return unique.slice(0, MAX_KEYWORDS);
}

// Knowledge Graph "Smart Search": accent- and case-insensitive keyword overlap
// between a just-created record's title/description and every OTHER
// module's recent records (same user) — no AI, no embeddings. Called
// right after a successful create (see suggested-links-prompt.tsx).
export async function suggestEntityLinks(
  supabase: SupabaseClient,
  sourceTable: string,
  sourceId: string
): Promise<EntityLinkSuggestion[]> {
  const sourceConfig = getLinkableModuleByTable(sourceTable);
  if (!sourceConfig) return [];

  const { data: sourceRow, error: sourceError } = await supabase
    .from(sourceTable)
    .select("*")
    .eq("id", sourceId)
    .maybeSingle();

  if (sourceError || !sourceRow) {
    if (sourceError) {
      logApiError("entity-link-suggestions:suggestEntityLinks", sourceError, { stage: "source" });
    }
    return [];
  }

  const keywords = extractKeywords(textFor(sourceConfig, sourceRow as Record<string, unknown>));
  if (keywords.length === 0) return [];

  const otherModules = LINKABLE_MODULES.filter((m) => m.table !== sourceTable);

  const perModuleMatches = await Promise.all(
    otherModules.map(async (config): Promise<EntityLinkSuggestion[]> => {
      const { data, error } = await supabase
        .from(config.table)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(PER_MODULE_LIMIT);

      if (error || !data) {
        if (error) {
          logApiError("entity-link-suggestions:suggestEntityLinks", error, { table: config.table });
        }
        return [];
      }

      const matches: EntityLinkSuggestion[] = [];
      for (const row of data as Record<string, unknown>[]) {
        const headline = String(row[config.headlineKey] ?? "").trim();
        if (!headline) continue;

        const candidateText = normalizeForSearch(textFor(config, row));
        const isMatch = keywords.some((kw) => candidateText.includes(kw));
        if (isMatch) {
          matches.push({
            table: config.table,
            id: String(row.id),
            headline,
            moduleTitleKey: config.titleKey,
            href: moduleHref(config.slug),
          });
        }
      }
      return matches;
    })
  );

  return perModuleMatches.flat().slice(0, MAX_SUGGESTIONS);
}
