-- ============================================================================
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
--   * `on conflict do nothing`, so rows the triggers have kept current
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

-- The generated `document` column calls this. If it is missing, the
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
    ['ideas','module','name','problem','/dashboard','ideas','created_at'],
    ['competitors','module','company','product','/dashboard/competitors','competitors','created_at'],
    ['research','module','topic','summary','/dashboard/research','research','created_at'],
    ['finance_entries','module','description','','/dashboard/finance','finance','created_at'],
    ['learning_entries','module','topic','','/dashboard/learning','learning','created_at'],
    ['trades','module','symbol','notes','/dashboard/trading','trading','created_at'],
    ['decisions','module','idea_names','','/dashboard/decisions','decisions','created_at'],
    ['products','module','product_name','','/dashboard/products','products','created_at'],
    ['content','module','topic','','/dashboard/content','content','created_at'],
    ['leads','module','lead_name','next_steps','/dashboard/sales','sales','created_at'],
    ['feedback','module','summary','','/dashboard/feedback','feedback','created_at'],
    ['metrics','module','metric_name','','/dashboard/analytics','analytics','created_at'],
    ['automations','module','task_name','','/dashboard/automation','automation','created_at'],
    ['ai_websites','module','name','','/dashboard/websites','websites','created_at'],
    ['ai_apps','module','name','','/dashboard/apps','apps','created_at'],
    ['ai_images','module','prompt','','/dashboard/images','images','created_at'],
    ['ai_videos','module','prompt','','/dashboard/videos','videos','created_at'],
    ['ai_coding_requests','module','title','','/dashboard/coding','coding','created_at'],
    ['ai_data_analysis_requests','module','title','','/dashboard/data-analysis','data-analysis','created_at'],
    ['ai_presentations','module','title','','/dashboard/presentations','presentations','created_at'],
    ['ai_campaigns','module','name','','/dashboard/campaigns','campaigns','created_at'],
    ['chat_conversations','chat','title','','/dashboard/chat','','created_at'],
    ['user_files','file','filename','extracted_text','/dashboard/files','','uploaded_at'],
    ['user_websites','website','name','description','/dashboard/websites','','created_at'],
    ['ai_agents','agent','name','description','/dashboard/agents','','created_at'],
    ['user_agents','agent','name','description','/dashboard/agents','','created_at'],
    ['research_reports','research','topic','','/dashboard/deep-research','','created_at'],
    ['ai_missions','mission','goal','','/dashboard/mission','','created_at'],
    ['help_articles','help','title','body','/help','','created_at']
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
