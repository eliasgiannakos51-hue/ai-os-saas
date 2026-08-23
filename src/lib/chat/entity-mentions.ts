import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LINKABLE_MODULES } from "@/lib/knowledge-graph";
import { loadLinkedEntities } from "@/lib/entity-links";
import { logApiError } from "@/lib/log-error";
import { enModuleTitle } from "@/lib/module-labels";
import { normalizeForSearch } from "@/lib/text/search-match";
import { enFieldLabel } from "@/lib/module-labels";
import { selectWithinBudget } from "@/lib/context-relevance";

// Scans, per module, only this many of the user's most recent records —
// keeps the per-message cost bounded regardless of how much data an
// account has logged over time. Deliberately simple (no embeddings/semantic
// search yet, per the brief): a headline "matches" when it appears as a
// substring of the user's message, case-, accent- and sigma-folded (see
// lib/text/search-match.ts's header) so a Greek user typing "καφε" still
// mentions a record headlined "Καφές" — plain toLowerCase() alone leaves
// the accent and never matches.
const PER_MODULE_SCAN_LIMIT = 50;
const MAX_MENTIONED_ENTITIES = 8;
const MIN_HEADLINE_LENGTH = 3;

// THE HEADLINE ALONE IS NOT THE RECORD.
//
// This used to send `- [AI Coding] Margin calculator` and stop there. Ask
// the chat "do you remember the function you wrote?" and it received the
// TITLE of a note and nothing in it — so it either said nothing useful or
// filled the gap itself, which is the worse of the two.
//
// The body is therefore attached too, but only for the mentions whose body
// is relevant to what was just asked, and only up to a budget. Naming a
// record is evidence the user means it; it is not evidence they want all
// eight of them recited in full on every message.
const MAX_EXCERPT_CHARS = 260;

/**
 * The gate for the bodies. Exported so the measurement script and the
 * tests read the shipped numbers instead of copies.
 *
 * budgetChars 700 is the whole feature's ceiling per message — about 175
 * tokens by the repo's own estimator (lib/billing/estimate.ts), against a
 * system prompt that already runs into the thousands. The instruction this
 * was built to was "if it doubles the context, narrow the criterion"; this
 * is bounded at roughly a twentieth of it, and the measurement script
 * prints the real figure rather than this claim.
 */
export const MENTION_EXCERPT_RELEVANCE = {
  minScore: 0.34,
  budgetChars: 700,
  maxItems: 3,
} as const;

export type MentionedEntity = {
  table: string;
  id: string;
  moduleTitle: string;
  headline: string;
  linked: { moduleTitle: string; headline: string }[];
  /** The record's substantive fields, trimmed. Empty when the body was
   *  not relevant to the message or the budget was already spent. */
  excerpt: string;
};

/** Carries the row's body alongside the public shape while the selection
 *  decides which bodies are worth their characters. */
type ScannedEntity = MentionedEntity & { body: string };

/**
 * The record's substance, minus what the headline already said.
 *
 * Field labels come from enFieldLabel — the same helper
 * api/records/ask/route.ts serialises records with — so a record reads the
 * same whether the model meets it through chat or through Ask AI. Two
 * serialisers for one row is how the two surfaces start disagreeing about
 * what a field is called.
 */
export function bodyOf(config: (typeof LINKABLE_MODULES)[number], row: Record<string, unknown>): string {
  return config.fields
    .filter((field) => field.key !== config.headlineKey)
    .map((field) => {
      const value = row[field.key];
      if (value === null || value === undefined || value === "") return null;
      return `${enFieldLabel(field)}: ${String(value).replace(/\s+/g, " ").trim()}`;
    })
    .filter((line): line is string => line !== null)
    .join(" · ");
}

// Finds the user's own records whose headline (name/title field) is
// mentioned in `message`, then attaches each match's own linked entities
// (see lib/entity-links.ts) — so the AI sees not just "the user mentioned
// Product X" but also "...which is already linked to Idea Y".
export async function findMentionedEntities(
  supabase: SupabaseClient,
  userId: string,
  message: string
): Promise<MentionedEntity[]> {
  if (message.trim().length < MIN_HEADLINE_LENGTH) return [];
  // Normalised once and reused per headline below, rather than calling
  // matchesSearch() per headline — that would re-fold this same message
  // up to 50 times per module for no reason.
  const normalizedMessage = normalizeForSearch(message);

  try {
    const perModule = await Promise.all(
      LINKABLE_MODULES.map(async (config) => {
        // select("*") rather than a dynamic `id, ${headlineKey}` string —
        // see lib/entity-links.ts's identical comment for why.
        const { data, error } = await supabase
          .from(config.table)
          .select("*")
          // EXPLICIT, not left to RLS. RLS does scope this correctly today
          // — every one of these tables carries a `select_own_*` policy on
          // auth.uid() = user_id, and this runs under the cookie-scoped
          // client — so this is not a leak being closed. It is the
          // convention lib/user-context.ts states in its own scan and the
          // reason it gives: the same query shape runs under the
          // service-role client in job handlers, where RLS does not apply,
          // and a function that already takes userId and does not use it
          // is one copy-paste away from being wrong.
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(PER_MODULE_SCAN_LIMIT);
        if (error || !data) return [] as ScannedEntity[];

        return (data as Record<string, unknown>[])
          .map((row) => ({
            table: config.table,
            id: String(row.id),
            moduleTitle: enModuleTitle(config),
            headline: String(row[config.headlineKey] ?? "").trim(),
            linked: [] as { moduleTitle: string; headline: string }[],
            excerpt: "",
            body: bodyOf(config, row),
          }))
          .filter(
            (entity) =>
              entity.headline.length >= MIN_HEADLINE_LENGTH &&
              normalizedMessage.includes(normalizeForSearch(entity.headline))
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

    // WHICH BODIES EARN THEIR CHARACTERS.
    //
    // Every match keeps its headline line — that is the behaviour this
    // already had and it costs almost nothing. The body is extra, so it is
    // scored against the message and taken only while the budget lasts.
    // A user who names three records and asks about one gets the one.
    const withBody = matched.filter((m) => m.body.length > 0);
    const chosen = selectWithinBudget(
      message,
      withBody,
      (m) => m.body.slice(0, MAX_EXCERPT_CHARS),
      MENTION_EXCERPT_RELEVANCE
    );
    const excerptFor = new Map<string, string>();
    for (const m of chosen.selected) {
      const trimmed =
        m.body.length <= MAX_EXCERPT_CHARS ? m.body : `${m.body.slice(0, MAX_EXCERPT_CHARS - 1)}…`;
      excerptFor.set(`${m.table}:${m.id}`, trimmed);
    }

    return matched.map(({ body: _body, ...m }) => ({
      ...m,
      linked: linkedByKey.get(`${m.table}:${m.id}`) ?? [],
      excerpt: excerptFor.get(`${m.table}:${m.id}`) ?? "",
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
      let base = `- [${e.moduleTitle}] ${e.headline}`;
      if (e.linked.length > 0) {
        const linkedList = e.linked.map((l) => `${l.moduleTitle}: ${l.headline}`).join(", ");
        base = `${base} (συνδεδεμένο με: ${linkedList})`;
      }
      // Indented under its own headline rather than appended to the line:
      // a body containing "· Status: done" run together with the next
      // bullet is how a model starts attributing one record's fields to
      // the record beneath it.
      return e.excerpt ? `${base}\n    ${e.excerpt}` : base;
    })
    .join("\n");
  return `\n\nΟ χρήστης έχει ήδη καταγράψει τα εξής σχετικά:\n${bulletList}`;
}
