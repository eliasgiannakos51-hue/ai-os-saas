import DEFAULT_TABLE from "@/lib/ai/routing/model-table.json";
import { catalogModel, type CatalogModel } from "@/lib/ai/providers/catalog";
import { CATEGORIES, isCategory, type Category } from "@/lib/ai/routing/categorize";
import { TIERS, TIER_MODELS, isTier, type Tier } from "@/lib/ai/routing/tiers";

/**
 * THE MODEL TABLE (BUILD-SPECS 2.13 Β): configuration, not code.
 *
 * For every category × tier: a primary model, a fallback from another
 * provider where one exists, the longest wait before the fallback, and
 * the quality score with the date it was measured. A new model enters by
 * a row here — model-table.json in the repository, or the whole table in
 * the AI_MODEL_TABLE environment variable, which changes it without a
 * deploy of code (scenario 6).
 *
 * WHAT IS NOT IN THE TABLE: prices. The brief asks for "cost per 1,000
 * tokens" per row, and expandModelTable() prints it — read from
 * src/lib/ai/providers/catalog.ts, which ai-providers.test.mjs already
 * holds equal to the billing price list. A second copy of every price in
 * a JSON file is a second place for a price change to be missed.
 *
 * WHAT IS NOT DECIDED HERE YET: cheaper primaries. Until the quality set
 * of 2.13 Γ (QUEUE E.4) has measured a cheaper model passing the bar for a
 * category, the primaries are the tier models of tiers.ts — the hypothesis
 * the app was built on — and `quality` is null, which the admin page
 * shows as "not measured" rather than as a score.
 */

export type TableRow = {
  primary: string;
  fallback: string | null;
  maxWaitMs: number;
  /** Score on the quality set, 0–1, and when it was measured. Null until
   *  E.4 measures it. */
  quality: { score: number; measuredAt: string } | null;
};

export type ModelTable = {
  version: string;
  tiers: Record<Tier, TableRow>;
  /** "category:tier" → row, for the combinations that differ. */
  overrides: Record<string, TableRow>;
};

export const MODEL_TABLE_ENV_VAR = "AI_MODEL_TABLE";

/** The longest a fallback may be held back. Above this the user is
 *  waiting on a provider that has already failed them. */
export const MAX_WAIT_CEILING_MS = 120_000;
export const MAX_WAIT_FLOOR_MS = 5_000;

export type TableProblem = { where: string; problem: string };

function checkRow(where: string, row: unknown, problems: TableProblem[]): row is TableRow {
  if (!row || typeof row !== "object") {
    problems.push({ where, problem: "not an object" });
    return false;
  }
  const r = row as Record<string, unknown>;
  const primary = typeof r.primary === "string" ? catalogModel(r.primary) : null;
  if (!primary) problems.push({ where, problem: `primary "${String(r.primary)}" is not in the catalog` });
  if (r.fallback !== null && r.fallback !== undefined) {
    const fallback = typeof r.fallback === "string" ? catalogModel(r.fallback) : null;
    if (!fallback) {
      problems.push({ where, problem: `fallback "${String(r.fallback)}" is not in the catalog` });
    } else if (primary) {
      if (fallback.id === primary.id) problems.push({ where, problem: "fallback is the primary" });
      // SAME TIER OR BETTER, the rule substituteModel already keeps for
      // failover: a fallback that quietly answers with a weaker model is
      // a quality cut nobody chose.
      const order: CatalogModel["tier"][] = ["small", "mid", "large"];
      if (order.indexOf(fallback.tier) < order.indexOf(primary.tier)) {
        problems.push({ where, problem: `fallback ${fallback.id} is weaker than primary ${primary.id}` });
      }
    }
  }
  const wait = r.maxWaitMs;
  if (typeof wait !== "number" || !Number.isFinite(wait) || wait < MAX_WAIT_FLOOR_MS || wait > MAX_WAIT_CEILING_MS) {
    problems.push({ where, problem: `maxWaitMs must be ${MAX_WAIT_FLOOR_MS}–${MAX_WAIT_CEILING_MS}` });
  }
  if (r.quality !== null && r.quality !== undefined) {
    const q = r.quality as Record<string, unknown>;
    if (typeof q.score !== "number" || q.score < 0 || q.score > 1 || typeof q.measuredAt !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(q.measuredAt)) {
      problems.push({ where, problem: "quality must be { score 0–1, measuredAt YYYY-MM-DD }" });
    }
  }
  return problems.every((p) => p.where !== where);
}

/** Every problem in a candidate table. Empty means it may be used. */
export function validateModelTable(candidate: unknown): TableProblem[] {
  const problems: TableProblem[] = [];
  if (!candidate || typeof candidate !== "object") return [{ where: "table", problem: "not an object" }];
  const t = candidate as Record<string, unknown>;
  if (typeof t.version !== "string" || t.version.length === 0) problems.push({ where: "version", problem: "missing" });
  const tiers = (t.tiers ?? {}) as Record<string, unknown>;
  for (const tier of TIERS) checkRow(`tiers.${tier}`, tiers[tier], problems);
  for (const key of Object.keys(tiers)) {
    if (!isTier(key)) problems.push({ where: `tiers.${key}`, problem: "not a tier" });
  }
  const overrides = (t.overrides ?? {}) as Record<string, unknown>;
  if (typeof overrides !== "object") problems.push({ where: "overrides", problem: "not an object" });
  for (const [key, row] of Object.entries(overrides)) {
    const [category, tier] = key.split(":");
    if (!isCategory(category) || !isTier(tier)) {
      problems.push({ where: `overrides.${key}`, problem: 'key must be "category:tier"' });
      continue;
    }
    checkRow(`overrides.${key}`, row, problems);
  }
  // NEVER CHEAPER WITHOUT A NUMBER (2.13 scenario 7, before the quality
  // set exists). A primary with no measured quality must be the model the
  // tier already runs on; anything else needs its score and date first.
  if (problems.length === 0) {
    for (const r of unmeasuredChallengers(candidate as ModelTable)) {
      problems.push({ where: `${r.category}:${r.tier}`, problem: `${r.primary} has no measured quality and is not the tier's model (${TIER_MODELS[r.tier]})` });
    }
  }
  return problems;
}

/** Rows whose primary is not the tier's incumbent and has no quality
 *  score behind it. */
export function unmeasuredChallengers(table: ModelTable): ExpandedRow[] {
  return expandModelTable(table).filter((r) => r.quality === null && r.primary !== TIER_MODELS[r.tier]);
}

export type LoadedTable = {
  table: ModelTable;
  source: "env" | "default";
  /** Set when AI_MODEL_TABLE was present and refused. The default is used
   *  instead — a typo in an environment variable must not stop every
   *  request — and the admin page shows why. */
  rejected: TableProblem[] | null;
};

export function loadModelTable(env: Record<string, string | undefined> = process.env): LoadedTable {
  const raw = env[MODEL_TABLE_ENV_VAR];
  if (raw && raw.trim().length > 0) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { table: DEFAULT_TABLE as ModelTable, source: "default", rejected: [{ where: MODEL_TABLE_ENV_VAR, problem: "not valid JSON" }] };
    }
    const problems = validateModelTable(parsed);
    if (problems.length === 0) return { table: parsed as ModelTable, source: "env", rejected: null };
    return { table: DEFAULT_TABLE as ModelTable, source: "default", rejected: problems };
  }
  return { table: DEFAULT_TABLE as ModelTable, source: "default", rejected: null };
}

/** The row that serves one category × tier: the override if there is one,
 *  the tier's row otherwise. */
export function rowFor(table: ModelTable, category: Category, tier: Tier): TableRow {
  return table.overrides[`${category}:${tier}`] ?? table.tiers[tier];
}

export type ExpandedRow = TableRow & {
  category: Category;
  tier: Tier;
  primaryProvider: string;
  fallbackProvider: string | null;
  /** USD per 1,000 tokens, from the catalog. */
  inputPer1k: number;
  outputPer1k: number;
  fromOverride: boolean;
};

/** All 40 combinations, the way the brief asks to see them. */
export function expandModelTable(table: ModelTable): ExpandedRow[] {
  const rows: ExpandedRow[] = [];
  for (const category of CATEGORIES) {
    for (const tier of TIERS) {
      const row = rowFor(table, category, tier);
      const primary = catalogModel(row.primary);
      const fallback = row.fallback ? catalogModel(row.fallback) : null;
      rows.push({
        ...row,
        category,
        tier,
        primaryProvider: primary?.provider ?? "unknown",
        fallbackProvider: fallback?.provider ?? null,
        inputPer1k: primary ? primary.inputPerMTok / 1000 : NaN,
        outputPer1k: primary ? primary.outputPerMTok / 1000 : NaN,
        fromOverride: `${category}:${tier}` in table.overrides,
      });
    }
  }
  return rows;
}
