#!/usr/bin/env node
/*
 * THE BACKFILL, GENERATED FROM THE LIST THE TRIGGERS USE.
 *
 * 20260824000000_unified_search.sql attaches a trigger and backfills in
 * ONE loop over ONE array, for the reason its own comment gives: "a
 * table added to only one of two lists gets a silently empty half of the
 * index."
 *
 * A second backfill, typed out by hand, would be exactly that second
 * list. So this reads the array out of that migration and emits the SQL
 * from it. scripts/tests/search-backfill.test.mjs holds the two in step
 * BOTH ways, so neither can gain a table the other does not have.
 *
 * WHY A SECOND BACKFILL AT ALL. Reported 2026-09-19: ⌘K found no content
 * for an account with 88 records. The original backfill runs inside the
 * migration, once, and `on conflict do nothing` — so if that DO block
 * ever errored partway (a missing search_fold, a table that did not
 * exist yet), the tables after the failure have a trigger and no rows,
 * and nothing anywhere says so. A trigger only writes a row when its
 * SOURCE row is next edited, so an account that stopped editing is
 * invisible for ever.
 *
 * Run: node scripts/db/emit-search-backfill.mjs            # prints it
 *      node scripts/db/emit-search-backfill.mjs --write    # writes the migration
 */
import { readFileSync, writeFileSync } from "node:fs";

export const SOURCE = "supabase/migrations/20260824000000_unified_search.sql";
export const TARGET = "supabase/migrations/20260919000000_search_index_backfill.sql";

/** The `specs` array of the unified-search migration, as rows of 7. */
export function readSpecs(sql = readFileSync(SOURCE, "utf8")) {
  const start = sql.indexOf("specs constant text[][] := array[");
  if (start === -1) throw new Error(`no specs array in ${SOURCE}`);
  const end = sql.indexOf("];", start);
  const block = sql.slice(start, end);
  const rows = [];
  for (const m of block.matchAll(/\[((?:'[^']*'\s*,\s*){6}'[^']*')\]/g)) {
    rows.push(m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, "")));
  }
  if (rows.length === 0) throw new Error("the specs array parsed to nothing");
  return rows;
}

export function emit(specs = readSpecs()) {
  const lines = specs.map(
    (s) => `    [${s.map((c) => `'${c.replace(/'/g, "''")}'`).join(",")}]`
  );
  return `-- ============================================================================
-- BACKFILL THE SEARCH INDEX FOR ROWS THAT WERE NEVER INDEXED
-- ============================================================================
--
-- Reported 2026-09-19: an account with 88 records found nothing in ⌘K.
-- The index is filled by triggers attached in
-- 20260824000000_unified_search.sql, which backfills in the same loop —
-- ONCE. If that DO block ever stopped partway, every table after the
-- failure has a trigger and no rows, and a trigger only writes a row
-- when its SOURCE row is next edited. An account that stopped editing
-- stays invisible for ever, and nothing reports it.
--
-- This re-runs the backfill on its own, prints what it found, and is
-- safe to run any number of times:
--   * no DROP, no TRUNCATE, no unqualified DELETE
--   * \`on conflict do nothing\`, so rows the triggers have kept current
--     are never overwritten with older text
--   * a table that does not exist is skipped, not fatal
--   * the triggers are re-attached, because a missing one is the other
--     half of the same failure
--
-- GENERATED from the spec array of 20260824000000_unified_search.sql by
-- scripts/db/emit-search-backfill.mjs. Do not edit by hand: a second
-- hand-written list is the exact thing that migration's own comment
-- warns about. scripts/tests/search-backfill.test.mjs holds the two in
-- step both ways.
-- ============================================================================

-- The generated \`document\` column calls this. If it is missing, the
-- unified-search migration never completed and THAT has to run first.
do $$
begin
  if to_regprocedure('public.search_fold(text)') is null then
    raise exception 'public.search_fold(text) is missing — run 20260824000000_unified_search.sql first';
  end if;
  if to_regclass('public.search_index') is null then
    raise exception 'public.search_index is missing — run 20260824000000_unified_search.sql first';
  end if;
end $$;

do $$
declare
  specs constant text[][] := array[
${lines.join(",\n")}
  ];
  v_body_expr text;
  v_before bigint;
  v_after bigint;
  v_added bigint;
  v_total bigint := 0;
begin
  for i in 1 .. array_length(specs, 1) loop
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = specs[i][1]
    ) then
      raise notice '% : table absent, skipped', rpad(specs[i][1], 26);
      continue;
    end if;

    -- The trigger, re-attached. A backfill without one goes stale the
    -- moment the next row is written.
    execute format('drop trigger if exists %I on public.%I',
      'search_index_' || specs[i][1], specs[i][1]);
    execute format(
      'create trigger %I after insert or update or delete on public.%I '
      'for each row execute function public.search_index_sync(%L, %L, %L, %L, %L, %L)',
      'search_index_' || specs[i][1], specs[i][1],
      specs[i][2], specs[i][3], specs[i][4], specs[i][5], specs[i][6], specs[i][7]
    );

    execute format('select count(*) from public.search_index where source_table = %L', specs[i][1])
      into v_before;

    v_body_expr := case when specs[i][4] = '' then '''''' else format('left(coalesce(%I, ''''), 20000)', specs[i][4]) end;
    execute format(
      'insert into public.search_index '
      '  (user_id, kind, module_slug, source_table, source_id, title, body, href, occurred_at) '
      'select %s, %L, %L, %L, id, coalesce(%I, ''''), %s, %L, coalesce(%I, now()) '
      'from public.%I '
      'on conflict (source_table, source_id) do nothing',
      case when specs[i][1] = 'help_articles' then 'null::uuid' else 'user_id' end,
      specs[i][2], nullif(specs[i][6], ''), specs[i][1],
      specs[i][3], v_body_expr, specs[i][5], specs[i][7],
      specs[i][1]
    );

    execute format('select count(*) from public.search_index where source_table = %L', specs[i][1])
      into v_after;
    v_added := v_after - v_before;
    v_total := v_total + v_added;

    -- The href is the one column that can change without the source row
    -- changing, so it is reconciled. Qualified, and a no-op when right.
    execute format(
      'update public.search_index set href = %L where source_table = %L and href <> %L',
      specs[i][5], specs[i][1], specs[i][5]
    );

    raise notice '% : % row(s) now indexed (% added)',
      rpad(specs[i][1], 26), v_after, v_added;
  end loop;

  raise notice '----';
  raise notice 'added % row(s) in total', v_total;
  if v_total = 0 then
    raise notice 'nothing was added: either the index was already complete, or';
    raise notice 'these tables hold no rows for any account.';
  end if;
end $$;

-- What the index holds now, per source and per account. Read this:
-- a source_table with zero rows whose table has data is the failure
-- above happening again.
select source_table, count(*) as rows, count(distinct user_id) as accounts
from public.search_index
group by source_table
order by rows desc;
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sql = emit();
  if (process.argv.includes("--write")) {
    writeFileSync(TARGET, sql);
    console.log(`wrote ${TARGET} (${(sql.length / 1024).toFixed(1)} KB, ${readSpecs().length} tables)`);
  } else {
    process.stdout.write(sql);
  }
}
