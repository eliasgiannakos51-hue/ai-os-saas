/**
 * A PROJECT IS A NAMED GROUPING, AND MEMBERSHIP IS ONE LEVEL DEEP.
 *
 * Redesign phase 2. The contract the pages, the routes, the context
 * builder and scripts/tests/projects.test.mjs all read — pure, so the
 * gate can execute it rather than describe it.
 *
 * NOT TRANSITIVE, DECIDED RATHER THAN OMITTED. A mission in a project
 * does not drag its steps in; a website does not drag its form
 * submissions in. Two reasons, and the second is the one that settled it:
 * a transitive membership makes every read walk a graph, and it makes the
 * CONTENTS OF A FOLDER something a person has to compute instead of
 * something they can see. `projectMembers` returns exactly the rows that
 * were added, and there is deliberately no function here that expands
 * them.
 *
 * MEMBERSHIP IS AN EDGE, NOT A COLUMN. public.entity_links already links
 * any two rows a person owns, with a relationship_type and no constraint
 * on the table names, and docs/projects.md measured that the read cost is
 * not where this feature's money goes. So no existing table changes.
 */
import { LINKABLE_MODULES } from "@/lib/knowledge-graph";
import { CLASSIFIER_MODULES } from "@/lib/classifier-modules";

/** The relationship_type that means "this row is in that project". */
export const IN_PROJECT = "in_project";

/** The table a project row lives in — the target side of the edge. */
export const PROJECTS_TABLE = "projects";

export const PROJECT_STATUSES = ["active", "done", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && (PROJECT_STATUSES as readonly string[]).includes(value);
}

export const MAX_NAME_CHARS = 120;
export const MIN_NAME_CHARS = 2;
export const MAX_GOAL_CHARS = 2_000;

export type NameVerdict = { ok: true; name: string } | { ok: false; reason: "too_short" | "too_long"; limit: number };

export function checkProjectName(raw: unknown): NameVerdict {
  const name = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (name.length < MIN_NAME_CHARS) return { ok: false, reason: "too_short", limit: MIN_NAME_CHARS };
  if (name.length > MAX_NAME_CHARS) return { ok: false, reason: "too_long", limit: MAX_NAME_CHARS };
  return { ok: true, name };
}

export function clampGoal(raw: unknown): string {
  return String(raw ?? "").trim().slice(0, MAX_GOAL_CHARS);
}

/**
 * How many things one project may hold.
 *
 * A CAP, BECAUSE THE CONTEXT BUDGET BELOW IS DIVIDED BY IT. A project of
 * four hundred rows would give a project-scoped chat one row per member
 * and be worse than no project at all; the ceiling is the honest place to
 * say so rather than letting the context silently thin out.
 */
export const MAX_MEMBERS = 200;

/**
 * Which tables a project may hold, derived rather than listed.
 *
 * lib/knowledge-graph.ts is the registry of what entity_links can point
 * at, and a project that accepted a table the link picker cannot resolve
 * a headline for would show a row of blanks.
 */
export function projectMemberTables(): string[] {
  return LINKABLE_MODULES.map((m) => m.table);
}

export function isProjectMemberTable(table: unknown): boolean {
  return typeof table === "string" && projectMemberTables().includes(table);
}

/**
 * A PROJECT ID GOES INTO A POSTGREST FILTER STRING, SO IT IS CHECKED FIRST.
 *
 * The edges of a project cannot be selected with `.eq()` alone — the
 * membership row may be written in either direction, so the read is an
 * `.or(...)` whose operands are built by string concatenation, and a
 * value with a comma or a parenthesis in it would be parsed as more
 * filter rather than as an id. RLS still stands behind it (the rows are
 * the caller's own either way), but "the injection could only reach your
 * own rows" is a reason to be careful, not a reason to skip it.
 *
 * Every caller that builds that filter — the project page, the members
 * route and lib/user-context.ts — goes through `projectEdgeFilter`, which
 * refuses anything that is not a uuid.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The uuid shape, and nothing about whose row it is — that is a read's job. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** The `.or(...)` that reads a project's edges in both directions. Throws on anything but a uuid. */
export function projectEdgeFilter(projectId: string): string {
  if (!isUuid(projectId)) throw new Error("projectEdgeFilter: not a project id");
  return `and(target_table.eq.${PROJECTS_TABLE},target_id.eq.${projectId}),and(source_table.eq.${PROJECTS_TABLE},source_id.eq.${projectId})`;
}

export type ProjectMemberRef = { table: string; id: string };

export type EdgeRow = {
  source_table?: unknown;
  source_id?: unknown;
  target_table?: unknown;
  target_id?: unknown;
  relationship_type?: unknown;
};

/**
 * The rows in a project, from the edges — and NOTHING ELSE.
 *
 * The absence is the feature. There is deliberately no second pass that
 * takes the missions it found and adds their steps, or the websites and
 * adds their submissions: what went in is what comes out, and
 * scripts/tests/projects.test.mjs feeds this a mission whose steps are
 * linked to IT rather than to the project and proves they stay out.
 */
export function projectMembers(edges: ReadonlyArray<EdgeRow>, projectId: string): ProjectMemberRef[] {
  const out: ProjectMemberRef[] = [];
  const seen = new Set<string>();
  for (const edge of edges ?? []) {
    if (!edge || edge.relationship_type !== IN_PROJECT) continue;
    // The edge is written member -> project. The other direction is read
    // too, so a row written the other way round is not silently lost.
    let table: unknown = null;
    let id: unknown = null;
    if (edge.target_table === PROJECTS_TABLE && edge.target_id === projectId) {
      table = edge.source_table;
      id = edge.source_id;
    } else if (edge.source_table === PROJECTS_TABLE && edge.source_id === projectId) {
      table = edge.target_table;
      id = edge.target_id;
    } else continue;
    if (!isProjectMemberTable(table) || typeof id !== "string" || !id) continue;
    const key = `${table}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ table: String(table), id });
    if (out.length >= MAX_MEMBERS) break;
  }
  return out;
}

/** The distinct tables a project touches. */
export function projectModuleTables(members: ReadonlyArray<ProjectMemberRef>): string[] {
  return [...new Set(members.map((m) => m.table))];
}

/**
 * The modules a project-scoped chat ACTUALLY READS — what the budget divides by.
 *
 * Not the same list as `projectModuleTables`, and the difference is the
 * point: a project may hold files, conversations and posts, and none of
 * those is scanned into the chat's context (lib/user-context.ts walks
 * CLASSIFIER_MODULES and nothing else). Dividing the budget by the wider
 * list would print a smaller number on the project page than the chat
 * actually uses — a screen and a prompt disagreeing about the same
 * quantity, which is the shape this repository keeps finding and fixing.
 */
export function projectContextModules(members: ReadonlyArray<ProjectMemberRef>): string[] {
  const scanned = new Set(CLASSIFIER_MODULES.map((m) => m.table));
  return projectModuleTables(members).filter((t) => scanned.has(t));
}

// ---------------------------------------------------------------------
// THE CONTEXT BUDGET, AND WHY A PROJECT IS WORTH ANYTHING AT ALL
// ---------------------------------------------------------------------
/**
 * Rows per module a chat sends when it is NOT in a project.
 *
 * PER_MODULE_LIMIT in lib/user-context.ts, named here so the arithmetic
 * below is against the real number rather than a remembered one, and so
 * the gate can compare the two and go red if either moves alone.
 */
export const ROWS_PER_MODULE_UNSCOPED = 5;

/** The thirteen the unscoped reader walks (lib/classifier-modules.ts). */
export const UNSCOPED_MODULE_COUNT = 13;

/**
 * The same budget, spent on fewer modules.
 *
 * THIS IS THE WHOLE ARGUMENT FOR PROJECTS. Unscoped, a chat reads five
 * rows from each of thirteen modules: sixty-five headlines, most of them
 * about work the question is not about. Scoped to a project that touches
 * three, the SAME sixty-five buys twenty rows each — the depth at which
 * "what did we decide about pricing" can actually be answered.
 *
 * The budget is a count of ROWS and is held constant on purpose: a
 * project must not be a way to quietly spend more per message. It is the
 * same money, spent on the modules the person said they cared about.
 */
export const CONTEXT_ROW_BUDGET = ROWS_PER_MODULE_UNSCOPED * UNSCOPED_MODULE_COUNT;

export function rowsPerModuleInProject(moduleCount: number): number {
  const modules = Math.max(1, Math.floor(moduleCount));
  // Never fewer than the unscoped number: a project that touches every
  // module is no worse than no project, it is simply no better.
  return Math.max(ROWS_PER_MODULE_UNSCOPED, Math.floor(CONTEXT_ROW_BUDGET / modules));
}
