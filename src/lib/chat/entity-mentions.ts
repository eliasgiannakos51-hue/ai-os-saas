import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LINKABLE_MODULES } from "@/lib/knowledge-graph";
import { loadLinkedEntities } from "@/lib/entity-links";
import { logApiError } from "@/lib/log-error";
import { enModuleTitle } from "@/lib/module-labels";

// Scans, per module, only this many of the user's most recent records —
// keeps the per-message cost bounded regardless of how much data an
// account has logged over time. Deliberately simple (no embeddings/semantic
// search yet, per the brief): a headline "matches" when it appears
// case-insensitively as a substring of the user's message, same idea as
// the user typing the exact name of something they already logged.
const PER_MODULE_SCAN_LIMIT = 50;
const MAX_MENTIONED_ENTITIES = 8;
const MIN_HEADLINE_LENGTH = 3;

export type MentionedEntity = {
  table: string;
  id: string;
  moduleTitle: string;
  headline: string;
  linked: { moduleTitle: string; headline: string }[];
};

// Finds the user's own records whose headline (name/title field) is
// mentioned in `message`, then attaches each match's own linked entities
// (see lib/entity-links.ts) — so the AI sees not just "the user mentioned
// Product X" but also "...which is already linked to Idea Y".
export async function findMentionedEntities(
  supabase: SupabaseClient,
  userId: string,
  message: string
): Promise<MentionedEntity[]> {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.trim().length < MIN_HEADLINE_LENGTH) return [];

  try {
    const perModule = await Promise.all(
      LINKABLE_MODULES.map(async (config) => {
        // select("*") rather than a dynamic `id, ${headlineKey}` string —
        // see lib/entity-links.ts's identical comment for why.
        const { data, error } = await supabase
          .from(config.table)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(PER_MODULE_SCAN_LIMIT);
        if (error || !data) return [] as MentionedEntity[];

        return (data as Record<string, unknown>[])
          .map((row) => ({
            table: config.table,
            id: String(row.id),
            moduleTitle: enModuleTitle(config),
            headline: String(row[config.headlineKey] ?? "").trim(),
            linked: [] as { moduleTitle: string; headline: string }[],
          }))
          .filter(
            (entity) =>
              entity.headline.length >= MIN_HEADLINE_LENGTH &&
              lowerMessage.includes(entity.headline.toLowerCase())
          );
      })
    );

    const matched = perModule.flat().slice(0, MAX_MENTIONED_ENTITIES);
    if (matched.length === 0) return [];

    // Resolve each match's own linked entities, grouped by table so it's
    // one query per distinct table touched rather than one per match.
    const idsByTable = new Map<string, string[]>();
    for (const m of matched) {
      const list = idsByTable.get(m.table) ?? [];
      list.push(m.id);
      idsByTable.set(m.table, list);
    }

    const linkedByKey = new Map<string, { moduleTitle: string; headline: string }[]>();
    await Promise.all(
      [...idsByTable.entries()].map(async ([table, ids]) => {
        const resolved = await loadLinkedEntities(supabase, userId, table, ids);
        for (const [id, entities] of Object.entries(resolved)) {
          linkedByKey.set(
            `${table}:${id}`,
            entities.map((e) => ({ moduleTitle: enModuleTitle({ titleKey: e.moduleTitleKey }), headline: e.headline }))
          );
        }
      })
    );

    return matched.map((m) => ({
      ...m,
      linked: linkedByKey.get(`${m.table}:${m.id}`) ?? [],
    }));
  } catch (err) {
    logApiError("chat:findMentionedEntities", err, { userId });
    return [];
  }
}

export function buildEntityMentionPromptAddition(entities: MentionedEntity[]): string {
  if (entities.length === 0) return "";
  const bulletList = entities
    .map((e) => {
      const base = `- [${e.moduleTitle}] ${e.headline}`;
      if (e.linked.length === 0) return base;
      const linkedList = e.linked.map((l) => `${l.moduleTitle}: ${l.headline}`).join(", ");
      return `${base} (συνδεδεμένο με: ${linkedList})`;
    })
    .join("\n");
  return `\n\nΟ χρήστης έχει ήδη καταγράψει τα εξής σχετικά:\n${bulletList}`;
}
