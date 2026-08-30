import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LINKABLE_MODULES } from "@/lib/knowledge-graph";
import { logApiError } from "@/lib/log-error";
import { enModuleTitle } from "@/lib/module-labels";

// Bounded per-module scan, same "simple, bounded" trade-off as
// lib/chat/entity-mentions.ts — this only runs when Mentor Mode is on, so
// the extra cost is opt-in per message rather than paid by every chat.
const PER_MODULE_LIMIT = 5;
const MAX_MODULES_IN_SUMMARY = 15;
const MAX_HEADLINE_LENGTH = 60;

// Mentor Mode's proactive context: unlike lib/chat/entity-mentions.ts
// (which only surfaces records the CURRENT message names), this pulls a
// short summary of the user's most recent records across every module
// regardless of what they just typed — so advice like "what should I
// watch out for" can reference their actual Products/Decisions/Finance
// entries (etc.) instead of staying generic.
export type MentorContext = {
  /** The prompt block. Empty string when there was nothing to say. */
  prompt: string;
  /**
   * THE ROWS THE BLOCK WAS BUILT FROM — V4.6 #9.
   *
   * This used to return a string and nothing else, so everything it read
   * died at the boundary: the answer could be built on twelve of the
   * user's entries and had no way to say which twelve. Same shape
   * lib/chat/provenance.ts takes, so the caller merges rather than
   * converts.
   */
  modules: { slug: string; title: string; rows: { id: string | null; headline: string; atMs: number | null }[] }[];
};

export async function loadMentorContext(
  supabase: SupabaseClient,
  userId: string
): Promise<MentorContext> {
  try {
    const perModule = await Promise.all(
      LINKABLE_MODULES.map(async (config) => {
        // select("*") rather than a dynamic `id, ${headlineKey}` string —
        // see lib/entity-links.ts's identical comment for why.
        const { data, error } = await supabase
          .from(config.table)
          .select("*")
  // EXPLICIT, NOT LEFT TO RLS. lib/user-context.ts carries the long
  // version of this: it relied on RLS alone until two job handlers
  // began passing the SERVICE-ROLE client, for which RLS does not
  // apply at all, and every row of every user was in scope. This file
  // has always taken `userId` and never used it for anything but an
  // error log — safe only for as long as every caller happens to pass
  // a session client. That is a property of the callers, not of this
  // query, and it is one edit away from not being true.
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(PER_MODULE_LIMIT);
        if (error || !data || data.length === 0) {
          if (error) logApiError("chat:loadMentorContext", error, { table: config.table });
          return null;
        }

        // ONE LIST, TWO VIEWS — same reason as lib/user-context.ts. Derive
        // the headlines and the rows separately and a blank headline drops
        // from one and not the other, and the source list then credits an
        // entry the model never saw.
        const carried = (data as Record<string, unknown>[])
          .map((row) => {
            const raw = String(row[config.headlineKey] ?? "").trim();
            const at = new Date(String(row.created_at)).getTime();
            return {
              id: typeof row.id === "string" ? row.id : null,
              headline:
                raw.length > MAX_HEADLINE_LENGTH ? `${raw.slice(0, MAX_HEADLINE_LENGTH).trimEnd()}…` : raw,
              atMs: Number.isFinite(at) ? at : null,
              raw,
            };
          })
          .filter((r) => r.raw.length > 0)
          .map(({ raw: _raw, ...rest }) => rest);
        if (carried.length === 0) return null;

        return {
          slug: config.slug,
          title: enModuleTitle(config),
          headlines: carried.map((r) => r.headline),
          rows: carried,
        };
      })
    );

    const withData = perModule
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .slice(0, MAX_MODULES_IN_SUMMARY);
    if (withData.length === 0) return { prompt: "", modules: [] };

    const bulletList = withData.map((m) => `- ${m.title}: ${m.headlines.join(", ")}`).join("\n");

    return {
      prompt: `\n\nΠλαίσιο από τα δεδομένα του χρήστη (πιο πρόσφατες εγγραφές ανά ενότητα — χρησιμοποίησέ τα μόνο όταν είναι σχετικά με την ερώτηση, μην τα απαριθμείς άσχετα):\n${bulletList}`,
      // ONLY THE MODULES THAT SURVIVED THE SLICE. MAX_MODULES_IN_SUMMARY
      // caps the block at fifteen; a sixteenth module was read and then
      // not sent, and crediting it would name entries the model never saw.
      modules: withData.map((m) => ({ slug: m.slug, title: m.title, rows: m.rows })),
    };
  } catch (err) {
    logApiError("chat:loadMentorContext", err, { userId });
    return { prompt: "", modules: [] };
  }
}
