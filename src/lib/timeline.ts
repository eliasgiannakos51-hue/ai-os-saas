import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModuleConfig } from "@/lib/modules";
import { LINKABLE_MODULES, moduleHref } from "@/lib/knowledge-graph";
import { loadLinkedEntities, type LinkedEntity } from "@/lib/entity-links";
import { logApiError } from "@/lib/log-error";
import type { ModuleTitleKey } from "@/lib/modules";
import { DAY_MS } from "@/lib/time-constants";
import { truncate } from "@/lib/text/truncate";

export type TimelineRange = "today" | "week" | "month" | "all";

export const TIMELINE_RANGES: TimelineRange[] = ["today", "week", "month", "all"];

export type TimelineEntry = {
  key: string;
  table: string;
  id: string;
  moduleSlug: string;
  moduleTitleKey: ModuleTitleKey;
  headline: string;
  excerpt: string;
  createdAt: string;
  href: string;
  linked: LinkedEntity[];
};

// Bounds per-module scan and total merged size so the page stays fast
// regardless of how much data an account has logged over time — same
// "bounded, simple" trade-off as lib/chat/entity-mentions.ts.
const PER_MODULE_LIMIT = 60;
const MAX_ENTRIES = 200;
const EXCERPT_LENGTH = 140;

// Rolling windows rather than calendar-day/week/month boundaries — avoids
// needing the viewer's timezone server-side for something that's a rough
// filter, not a precise report.
function rangeCutoffIso(range: TimelineRange): string | null {
  if (range === "all") return null;
  const windowMs = range === "today" ? DAY_MS : range === "week" ? 7 * DAY_MS : 30 * DAY_MS;
  return new Date(Date.now() - windowMs).toISOString();
}

function excerptFor(module: ModuleConfig, row: Record<string, unknown>): string {
  const field = module.fields.find(
    (f) =>
      f.key !== module.headlineKey &&
      (f.type === "text" || f.type === "textarea") &&
      typeof row[f.key] === "string" &&
      (row[f.key] as string).trim()
  );
  if (!field) return "";
  const raw = (row[field.key] as string).trim();
  // truncateWithEllipsis, not slice: a record title ending in an emoji
  // at exactly this cut produced a lone UTF-16 surrogate — a "\uFFFD" box
  // in somebody's own timeline. See lib/text/truncate.ts.
  return truncate(raw, EXCERPT_LENGTH);
}

// Merges created_at-ordered records from every linkable module's table
// (lib/knowledge-graph.ts) into one chronological feed — no new table,
// purely a read-time join over data that already exists (per the brief).
// Also attaches each visible entry's own entity_links (lib/entity-links.ts)
// so the UI can render a small "linked" indicator — the "milestone marker"
// — batched per distinct table touched, not per entry.
export async function loadTimelineEntries(
  supabase: SupabaseClient,
  userId: string,
  { moduleSlug, range }: { moduleSlug: string | null; range: TimelineRange }
): Promise<{ entries: TimelineEntry[]; failedTables: string[] }> {
  const failedTables: string[] = [];
  const modules = moduleSlug
    ? LINKABLE_MODULES.filter((m) => m.slug === moduleSlug)
    : LINKABLE_MODULES;
  const cutoff = rangeCutoffIso(range);

  const perModule = await Promise.all(
    modules.map(async (config) => {
      // DEFECT 3 (fixed here): `userId` was accepted as a parameter and
      // then never used — the query relied entirely on RLS. Combined with
      // the swallow-and-return-[] below, a session that degraded to
      // anonymous produced an EMPTY TIMELINE with no error anywhere the
      // user could see it, across all 13 module tables at once. That is
      // the "Timeline is empty even though I have entries" report.
      let query = supabase
        .from(config.table)
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(PER_MODULE_LIMIT);
      if (cutoff) query = query.gte("created_at", cutoff);

      const { data, error } = await query;
      if (error || !data) {
        // Still per-module tolerant (one broken table must not blank the
        // whole timeline), but the failure is now REPORTED to the caller
        // instead of being indistinguishable from "no entries".
        if (error) logApiError("timeline:loadTimelineEntries", error, { table: config.table });
        failedTables.push(config.table);
        return [] as TimelineEntry[];
      }

      return (data as Record<string, unknown>[]).map(
        (row): TimelineEntry => ({
          key: `${config.table}:${row.id}`,
          table: config.table,
          id: String(row.id),
          moduleSlug: config.slug,
          moduleTitleKey: config.titleKey,
          headline: String(row[config.headlineKey] ?? "untitled"),
          excerpt: excerptFor(config, row),
          createdAt: String(row.created_at),
          href: moduleHref(config.slug),
          linked: [],
        })
      );
    })
  );

  const merged = perModule
    .flat()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_ENTRIES);

  if (merged.length === 0) return { entries: merged, failedTables };

  const idsByTable = new Map<string, string[]>();
  for (const entry of merged) {
    const list = idsByTable.get(entry.table) ?? [];
    list.push(entry.id);
    idsByTable.set(entry.table, list);
  }

  const linkedByKey = new Map<string, LinkedEntity[]>();
  await Promise.all(
    [...idsByTable.entries()].map(async ([table, ids]) => {
      const resolved = await loadLinkedEntities(supabase, userId, table, ids);
      for (const [id, entities] of Object.entries(resolved)) {
        linkedByKey.set(`${table}:${id}`, entities);
      }
    })
  );

  return {
    entries: merged.map((entry) => ({
      ...entry,
      linked: linkedByKey.get(entry.key) ?? [],
    })),
    failedTables,
  };
}
