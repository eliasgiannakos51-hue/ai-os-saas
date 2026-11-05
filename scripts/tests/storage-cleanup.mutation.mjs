#!/usr/bin/env node
/*
 * CAN storage-cleanup.test.mjs SEE A LIVE PHOTOGRAPH GO?
 *
 * The first mutant IS the code this replaced: every in-use table read
 * once, with `.limit(50_000)`, against a stand-in that answers at most
 * 1,000 rows as a hosted project does. The rest each take away one of
 * the things that now hold — paging to an empty page rather than a short
 * one, the order the cursor walks, the throw on a failed or empty page,
 * the count after the read, the ceiling, the dry run, the population of
 * HTML tables, the sub-pages — and two take the route back to reading or
 * answering on its own. The last takes the cap out of the stand-in, which
 * is the control: without it the first mutant would pass.
 *
 * Run: node scripts/tests/storage-cleanup.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/storage-cleanup.test.mjs";
const LIB = "src/lib/websites/storage-cleanup.ts";
const ROUTE = "src/app/api/cron/website-storage-cleanup/route.ts";
const STAND_IN = "scripts/tests/lib/postgrest-max-rows.mjs";

const MUTANTS = [
  {
    name: "the sweep reads each table once with .limit(50_000), as it did before 2026-11-05",
    file: LIB,
    from: "  const before = await countRows(client, table);\n  let cursor: string | null = null;\n  let read = 0;\n  for (;;) {\n    let query = client.from(table).select(`id, ${columns}`).order(\"id\", { ascending: true });\n    if (cursor !== null) query = query.gt(\"id\", cursor);\n    const { data, error } = await query.limit(IN_USE_PAGE_SIZE);\n    if (error) throw new IncompleteReadError(`reading ${table} failed after ${read} rows: ${describe(error)}`);\n    if (!Array.isArray(data)) throw new IncompleteReadError(`reading ${table} returned no rows array after ${read} rows`);\n    if (data.length === 0) break;\n    for (const row of data as Record<string, unknown>[]) onRow(row);\n    const last = (data[data.length - 1] as Record<string, unknown>).id;\n    if (typeof last !== \"string\" || (cursor !== null && last <= cursor)) {\n      throw new IncompleteReadError(`reading ${table}: the cursor did not advance past ${String(cursor)}`);\n    }\n    cursor = last;\n    read += data.length;\n    if (read > MAX_IN_USE_ROWS) throw new IncompleteReadError(`${table} holds more than ${MAX_IN_USE_ROWS} rows`);\n  }\n  const after = await countRows(client, table);\n  if (read < after) {\n    throw new IncompleteReadError(`read ${read} rows of ${table}, which holds ${after} (held ${before} when the read began)`);\n  }\n  return read;\n}",
    to: "  const { data, error } = await client.from(table).select(`id, ${columns}`).limit(50_000);\n  if (error) throw error;\n  for (const row of (data ?? []) as Record<string, unknown>[]) onRow(row);\n  return (data ?? []).length;\n}",
    expect: "...having read every row past the first 1,000",
  },
  {
    name: "the read stops on the first page that comes back short",
    file: LIB,
    from: "    cursor = last;\n    read += data.length;\n",
    to: "    cursor = last;\n    read += data.length;\n    if (data.length < IN_USE_PAGE_SIZE) break;\n",
    expect: "...having read all 450 rows, 100 at a time",
  },
  {
    name: "the read is not ordered by the key its cursor walks",
    file: LIB,
    from: ".select(`id, ${columns}`).order(\"id\", { ascending: true });",
    to: ".select(`id, ${columns}`);",
    expect: "the run completes",
  },
  {
    name: "a failed page is taken as the end of the table",
    file: LIB,
    from: "    if (error) throw new IncompleteReadError(`reading ${table} failed",
    to: "    if (error) break;\n    if (error) throw new IncompleteReadError(`reading ${table} failed",
    expect: "...and the error says which read failed",
  },
  {
    name: "a page with no rows array is taken as the end of the table",
    file: LIB,
    from: "    if (!Array.isArray(data)) throw new IncompleteReadError(",
    to: "    if (!Array.isArray(data)) break;\n    if (!Array.isArray(data)) throw new IncompleteReadError(",
    expect: "...and says so",
  },
  {
    name: "the count after the read is not compared with what was read",
    file: LIB,
    from: "  if (read < after) {",
    to: "  if (read < after && after < 0) {",
    expect: "the photograph only that row embeds survives",
  },
  {
    name: "a count that came back empty is taken as zero",
    file: LIB,
    from: "  if (typeof count !== \"number\" || !Number.isFinite(count)) {",
    to: "  if (count === undefined) {",
    expect: "a count that comes back empty deletes nothing",
  },
  {
    name: "a folder that cannot be listed is skipped",
    file: LIB,
    from: "      if (error) throw new IncompleteReadError(`listing ${userId} failed",
    to: "      if (error) break;\n      if (error) throw new IncompleteReadError(`listing ${userId} failed",
    expect: "a folder that cannot be listed stops the run",
  },
  {
    name: "the ceiling is not applied",
    file: LIB,
    from: "  if (orphans.length > ceiling) {",
    to: "  if (orphans.length > Infinity) {",
    expect: "half the bucket orphaned: nothing is deleted",
  },
  {
    name: "a dry run deletes",
    file: LIB,
    from: "  if (dryRun) {\n    deleted = orphans.length;\n  } else {",
    to: "  if (dryRun) {\n    deleted = orphans.length;\n  }\n  {",
    expect: "...and deletes nothing",
  },
  {
    name: "the sweep stops reading site_versions",
    file: LIB,
    from: "export const HTML_TABLES = [\"user_websites\", \"published_sites\", \"website_versions\", \"site_versions\"] as const;",
    to: "export const HTML_TABLES = [\"user_websites\", \"published_sites\", \"website_versions\"] as const;",
    expect: "...and the sweep iterates every one of them",
  },
  {
    name: "the sweep ignores sub-pages",
    file: LIB,
    from: "      for (const page of normalisePages(row.pages).pages) addEmbeddedPaths(page.html, embeddedPaths);",
    to: "      void normalisePages;",
    expect: "...including the ones in sub-pages",
  },
  {
    name: "a stopped run is answered as a success",
    file: ROUTE,
    from: "      return NextResponse.json(report, { status: 409 });",
    to: "      return NextResponse.json(report);",
    expect: "...and answered as a failure",
  },
  {
    name: "a stopped run is not logged",
    file: ROUTE,
    from: "      logApiError(\"/api/cron/website-storage-cleanup\", new Error(\"cleanup stopped: over the deletion ceiling\"), {",
    to: "      void ({",
    expect: "a stopped run is logged",
  },
  {
    name: "the route reads a table of its own again",
    file: ROUTE,
    from: "    const report = await runStorageCleanup(admin, { nowMs: Date.now(), dryRun });",
    to: "    await admin.from(\"user_websites\").select(\"html_content\").limit(50_000);\n    const report = await runStorageCleanup(admin, { nowMs: Date.now(), dryRun });",
    expect: "...and has no read or delete of its own",
  },
  {
    name: "the stand-in stops capping, so the old read would pass",
    file: STAND_IN,
    from: "      const slice = rows.slice(offset, offset + Math.min(asked, maxRows));",
    to: "      const slice = rows.slice(offset, offset + asked);",
    expect: "control: the stand-in caps",
  },
];

runMutations({
  name: "storage-cleanup",
  gate: GATE,
  targets: [LIB, ROUTE, STAND_IN],
  mutants: MUTANTS,
});
