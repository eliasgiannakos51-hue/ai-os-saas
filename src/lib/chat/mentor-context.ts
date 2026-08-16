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
export async function loadMentorContext(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  try {
    const perModule = await Promise.all(
      LINKABLE_MODULES.map(async (config) => {
        // select("*") rather than a dynamic `id, ${headlineKey}` string —
        // see lib/entity-links.ts's identical comment for why.
        const { data, error } = await supabase
          .from(config.table)
          .select("*")
          .order("created_at", { ascending: false })
          .limit(PER_MODULE_LIMIT);
        if (error || !data || data.length === 0) {
          if (error) logApiError("chat:loadMentorContext", error, { table: config.table });
          return null;
        }

        const headlines = (data as Record<string, unknown>[])
          .map((row) => String(row[config.headlineKey] ?? "").trim())
          .filter(Boolean)
          .map((h) =>
            h.length > MAX_HEADLINE_LENGTH ? `${h.slice(0, MAX_HEADLINE_LENGTH).trimEnd()}…` : h
          );
        if (headlines.length === 0) return null;

        return { title: enModuleTitle(config), headlines };
      })
    );

    const withData = perModule
      .filter((m): m is { title: string; headlines: string[] } => m !== null)
      .slice(0, MAX_MODULES_IN_SUMMARY);
    if (withData.length === 0) return "";

    const bulletList = withData.map((m) => `- ${m.title}: ${m.headlines.join(", ")}`).join("\n");

    return `\n\nΠλαίσιο από τα δεδομένα του χρήστη (πιο πρόσφατες εγγραφές ανά ενότητα — χρησιμοποίησέ τα μόνο όταν είναι σχετικά με την ερώτηση, μην τα απαριθμείς άσχετα):\n${bulletList}`;
  } catch (err) {
    logApiError("chat:loadMentorContext", err, { userId });
    return "";
  }
}
