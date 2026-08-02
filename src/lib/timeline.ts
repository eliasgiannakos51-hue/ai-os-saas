import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ModuleConfig } from "@/lib/modules";
import { LINKABLE_MODULES, moduleHref } from "@/lib/knowledge-graph";
import { loadLinkedEntities, type LinkedEntity } from "@/lib/entity-links";
import { logApiError } from "@/lib/log-error";

export type TimelineRange = "today" | "week" | "month" | "all";

export const TIMELINE_RANGES: TimelineRange[] = ["today", "week", "month", "all"];

export type TimelineEntry = {
  key: string;
  table: string;
  id: string;
  moduleSlug: string;
  moduleTitle: string;
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
  const DAY_MS = 24 * 60 * 60 * 1000;
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
  return raw.length > EXCERPT_LENGTH ? `${raw.slice(0, EXCERPT_LENGTH).trimEnd()}…` : raw;
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
): Promise<TimelineEntry[]> {
  const modules = moduleSlug
    ? LINKABLE_MODULES.filter((m) => m.slug === moduleSlug)
    : LINKABLE_MODULES;
  const cutoff = rangeCutoffIso(range);

  const perModule = await Promise.all(
    modules.map(async (config) => {
      let query = supabase
        .from(config.table)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(PER_MODULE_LIMIT);
      if (cutoff) query = query.gte("created_at", cutoff);

      const { data, error } = await query;
      if (error || !data) {
        if (error) logApiError("timeline:loadTimelineEntries", error, { table: config.table });
        return [] as TimelineEntry[];
      }

      return (data as Record<string, unknown>[]).map(
        (row): TimelineEntry => ({
          key: `${config.table}:${row.id}`,
          table: config.table,
          id: String(row.id),
          moduleSlug: config.slug,
          moduleTitle: config.title,
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

  if (merged.length === 0) return merged;

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

  return merged.map((entry) => ({
    ...entry,
    linked: linkedByKey.get(entry.key) ?? [],
  }));
}
