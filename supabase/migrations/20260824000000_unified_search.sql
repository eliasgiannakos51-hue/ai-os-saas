-- ============================================================================
-- ONE SEARCH INDEX FOR EVERYTHING
-- ============================================================================
--
-- WHAT WAS THERE. Four separate searches — the command palette, AI Memory,
-- each module list, and files — and the palette's own implementation was
-- ONE RPC PER TABLE: twenty-four round trips, fanned out per keystroke,
-- over the headline column only. It could not see a file's contents, a
-- website, an agent, a mission or a help article, and it had no ranking
-- beyond the order the promises happened to settle in.
--
-- Twenty-four round trips is the reason it could never be fast. No index
-- fixes it; the network does not care how quick each query is.
--
-- SO: ONE TABLE, kept current by triggers, read by ONE function.
--
--   * one round trip per keystroke instead of twenty-four
--   * one GIN index instead of none
--   * ranking, because ts_rank needs a tsvector to rank
--   * filters (kind, module, date) are ordinary columns
--   * file CONTENTS are searchable, because extracted_text is indexed
--
-- WHY 'simple' AND NOT 'english'. This app generates and stores content
-- in ten languages. An English stemmer applied to Greek does not fail
-- loudly — it silently stems the wrong things, and "Πωλήσεις" and
-- "πωλήσεις" become different lexemes while "running" and "run" merge.
-- 'simple' plus search_fold (lower + unaccent + final sigma) plus prefix
-- matching is the honest choice for text whose language we do not know
-- per row.
--
-- WHERE EMBEDDINGS GO LATER. This table is the seam. A future migration
-- adds `embedding vector(N)` and an ivfflat index beside the existing
-- GIN, and search_all gains a second ranking term — no new table, no
-- second sync path, no re-plumbing of the API or the UI. The row for a
-- thing already exists and already carries its text; only the ranking
-- changes.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

create extension if not exists unaccent;
create extension if not exists pg_trgm;

-- ----------------------------------------------------------------------
-- 1. The index
-- ----------------------------------------------------------------------
create table if not exists public.search_index (
  id uuid primary key default gen_random_uuid(),

  -- NULL means "belongs to everybody" — today only help articles, which
  -- are product documentation rather than anybody's data. The RLS policy
  -- below is what makes that a deliberate rule and not an accident.
  user_id uuid references auth.users(id) on delete cascade,

  -- 'module' | 'chat' | 'file' | 'website' | 'agent' | 'research'
  -- | 'mission' | 'help'. Text rather than an enum so a ninth source
  -- does not need a migration — the same decision ai_jobs.kind made.
  kind text not null,
  -- Which module, for rows of kind 'module'. The filter the UI offers.
  module_slug text,

  -- Where the row came from, and the uniqueness that makes the trigger
  -- an upsert rather than an append.
  source_table text not null,
  source_id uuid not null,

  title text not null default '',
  -- The searchable body. Truncated at insert (see search_index_sync):
  -- a 2MB extracted PDF indexed whole would make this table larger than
  -- the data it points at, and nothing beyond the first pages changes
  -- whether the document matches.
  body text not null default '',

  href text not null,
  occurred_at timestamptz not null default now(),

  -- GENERATED, so it cannot drift from the text beside it. A tsvector
  -- maintained by hand is a tsvector that is wrong after the first
  -- migration that forgets to update it.
  --
  -- The title is weighted A and the body D, so a file NAMED "invoice"
  -- outranks one that merely mentions the word — which is what a person
  -- typing "invoice" means.
  document tsvector generated always as (
    setweight(to_tsvector('simple', public.search_fold(coalesce(title, ''))), 'A') ||
    setweight(to_tsvector('simple', public.search_fold(coalesce(body, ''))), 'D')
  ) stored,

  created_at timestamptz not null default now(),

  constraint search_index_source_unique unique (source_table, source_id)
);

create index if not exists search_index_document_idx
  on public.search_index using gin (document);
-- The filters, and the "recent first" tiebreak within a rank.
create index if not exists search_index_user_kind_idx
  on public.search_index (user_id, kind, occurred_at desc);
create index if not exists search_index_user_time_idx
  on public.search_index (user_id, occurred_at desc);

alter table public.search_index enable row level security;

drop policy if exists "search_index_select_own" on public.search_index;
create policy "search_index_select_own" on public.search_index
  for select using (auth.uid() = user_id or user_id is null);

-- AND THE ROLE NEEDS THE GRANT, not only the policy.
--
-- RLS decides WHICH ROWS a role may see; it does not grant the role
-- access to the table in the first place. Without this, search_all —
-- which is SECURITY INVOKER precisely so the policy applies — fails with
-- "permission denied for table search_index" for every signed-in
-- browser, while every test that queries as the owner passes. Caught by
-- running the query as `authenticated` in scripts/tests/unified-search.dbtest.mjs.
--
-- SELECT ONLY. See below for why nothing may write.
grant select on public.search_index to authenticated;

-- NO INSERT, UPDATE OR DELETE POLICY. Every row is written by a trigger
-- running as the table owner; a user who could write here could put a
-- row with any href into their own search results, and an href is a link
-- the product invites them to trust.

-- ----------------------------------------------------------------------
-- 2. One trigger function for every source
-- ----------------------------------------------------------------------
-- Driven by TG_ARGV so twenty-nine tables share one implementation
-- rather than twenty-nine near-copies that drift:
--   0 kind   1 title column   2 body column ('' for none)
--   3 href   4 module_slug ('' for none)   5 timestamp column
--
-- Columns are read through to_jsonb(NEW), so a table whose column is
-- named differently needs an argument, not a new function.
create or replace function public.search_index_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_title text;
  v_body text;
  v_when timestamptz;
  v_user uuid;
begin
  if (tg_op = 'DELETE') then
    delete from public.search_index
      where source_table = tg_table_name and source_id = old.id;
    return old;
  end if;

  v_row := to_jsonb(new);
  v_title := coalesce(v_row ->> tg_argv[1], '');
  v_body := case when tg_argv[2] = '' then '' else coalesce(v_row ->> tg_argv[2], '') end;
  -- 20,000 characters is far past the point where more text changes
  -- whether a document matches, and it keeps one enormous PDF from
  -- dominating the table.
  v_body := left(v_body, 20000);
  v_when := coalesce((v_row ->> tg_argv[5])::timestamptz, now());
  v_user := nullif(v_row ->> 'user_id', '')::uuid;

  insert into public.search_index
    (user_id, kind, module_slug, source_table, source_id, title, body, href, occurred_at)
  values (
    v_user,
    tg_argv[0],
    nullif(tg_argv[4], ''),
    tg_table_name,
    new.id,
    v_title,
    v_body,
    tg_argv[3],
    v_when
  )
  on conflict (source_table, source_id) do update
    set title = excluded.title,
        body = excluded.body,
        href = excluded.href,
        occurred_at = excluded.occurred_at,
        user_id = excluded.user_id,
        module_slug = excluded.module_slug,
        kind = excluded.kind;

  return new;
end;
$$;

-- ----------------------------------------------------------------------
-- 3. Attach it, and backfill, in one loop over one list
-- ----------------------------------------------------------------------
-- ONE LIST, so attaching a trigger and backfilling the rows it will
-- maintain cannot disagree about which tables exist. A table added to
-- this list gets both; a table added to only one of two lists gets a
-- silently empty half of the index.
do $$
declare
  specs constant text[][] := array[
    -- table, kind, title col, body col, href, module_slug, time col
    -- Ideas is the dashboard root, NOT /dashboard/ideas: that path goes to
    -- /dashboard/[module], whose getModule() does not know "ideas", so it
    -- renders notFound(). Caught by the href check in
    -- scripts/tests/unified-search.test.mjs.
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
    -- Everything the old palette could not see at all.
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
begin
  for i in 1 .. array_length(specs, 1) loop
    -- A table listed here that does not exist is a real possibility on a
    -- partially-migrated database, and it must not take the whole
    -- migration down.
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = specs[i][1]
    ) then
      continue;
    end if;

    execute format('drop trigger if exists %I on public.%I',
      'search_index_' || specs[i][1], specs[i][1]);
    execute format(
      'create trigger %I after insert or update or delete on public.%I '
      'for each row execute function public.search_index_sync(%L, %L, %L, %L, %L, %L)',
      'search_index_' || specs[i][1], specs[i][1],
      specs[i][2], specs[i][3], specs[i][4], specs[i][5], specs[i][6], specs[i][7]
    );

    -- BACKFILL. `on conflict do nothing` rather than an update: rerunning
    -- this migration must not rewrite rows the triggers have since kept
    -- current with newer values.
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

    -- AND RECONCILE THE LINK. The backfill above deliberately does not
    -- touch existing rows, and a trigger only rewrites a row when its
    -- SOURCE row is next edited — so a corrected route would otherwise
    -- reach nothing already indexed. The href is the one column that can
    -- change without the source changing, so it is reconciled here.
    --
    -- Qualified by source_table and by inequality. Never an unqualified
    -- UPDATE, and a no-op on a database that is already right.
    execute format(
      'update public.search_index set href = %L where source_table = %L and href <> %L',
      specs[i][5], specs[i][1], specs[i][5]
    );
  end loop;
end $$;

-- ----------------------------------------------------------------------
-- 4. The one query
-- ----------------------------------------------------------------------
-- The query the user typed, turned into something tsquery understands.
--
-- PREFIX ON THE LAST TERM is what makes this work AS YOU TYPE: somebody
-- three letters into "invoice" is not searching for the word "inv", and
-- a search that returns nothing until the word is finished is a search
-- nobody waits for.
--
-- plainto_tsquery cannot express that, so the terms are assembled here —
-- from the FOLDED text, so the query and the index agree about what a
-- word is, and quoted with the literal-token form so a user typing ":*"
-- or "&" gets those characters rather than a syntax error.
create or replace function public.search_query(p_query text)
returns tsquery
language plpgsql
immutable
parallel safe
set search_path = public, pg_catalog
as $$
declare
  v_terms text[];
  v_parts text[] := '{}';
  v_term text;
  i integer;
begin
  if p_query is null then return null; end if;
  v_terms := array_remove(
    regexp_split_to_array(public.search_fold(p_query), '[^[:alnum:]]+'),
    ''
  );
  if array_length(v_terms, 1) is null then return null; end if;

  for i in 1 .. array_length(v_terms, 1) loop
    v_term := v_terms[i];
    -- Every term but the last is a whole word; the last one is a prefix.
    if i = array_length(v_terms, 1) then
      v_parts := v_parts || (quote_literal(v_term) || ':*');
    else
      v_parts := v_parts || quote_literal(v_term);
    end if;
  end loop;

  return to_tsquery('simple', array_to_string(v_parts, ' & '));
exception
  when others then
    -- A query that cannot be parsed returns NOTHING rather than raising:
    -- a search box that 500s on a stray character is worse than one that
    -- finds nothing for it.
    return null;
end;
$$;


-- SECURITY INVOKER, deliberately. The RLS policy above is what scopes
-- results to the caller; a definer function here would have to
-- re-implement that check, and a search that gets it wrong returns
-- somebody else's data with a link to it.
create or replace function public.search_all(
  p_query text,
  p_kinds text[] default null,
  p_module text default null,
  p_since timestamptz default null,
  p_limit integer default 40
)
returns table (
  kind text,
  module_slug text,
  source_table text,
  source_id uuid,
  title text,
  snippet text,
  href text,
  occurred_at timestamptz,
  rank real
)
language sql
stable
-- SECURITY INVOKER, stated rather than left to the default, because it is
-- the whole security model of this function: it runs as the CALLING user,
-- so the RLS policy on search_index is what scopes the result. A SECURITY
-- DEFINER version of this is a read-anything-in-the-database primitive
-- with a link to every row it finds.
security invoker
set search_path = public, pg_catalog
as $$
  with q as (
    select public.search_query(p_query) as tsq
  )
  select
    s.kind,
    s.module_slug,
    s.source_table,
    s.source_id,
    s.title,
    -- THE PREVIEW, built by Postgres from the same folded text the match
    -- was made on. Falls back to the first line of the body when the
    -- match was in the title, because a headline with no highlight is
    -- still the most useful thing to show.
    coalesce(
      nullif(ts_headline('simple', public.search_fold(s.body), q.tsq,
        'StartSel=<<,StopSel=>>,MaxWords=18,MinWords=6,MaxFragments=1,FragmentDelimiter= … '), ''),
      left(s.body, 140)
    ) as snippet,
    s.href,
    s.occurred_at,
    ts_rank(s.document, q.tsq) as rank
  from public.search_index s, q
  where q.tsq is not null
    and s.document @@ q.tsq
    and (p_kinds is null or s.kind = any (p_kinds))
    and (p_module is null or s.module_slug = p_module)
    and (p_since is null or s.occurred_at >= p_since)
  order by ts_rank(s.document, q.tsq) desc, s.occurred_at desc
  limit greatest(least(p_limit, 200), 1);
$$;

-- ----------------------------------------------------------------------
-- 5. Grants
-- ----------------------------------------------------------------------
-- The standing rule, applied here because 20260818000000_function_grants
-- loops over pg_proc and runs BEFORE this file.
--
-- search_all and search_query ARE granted to authenticated: they are how
-- a signed-in browser searches, and search_all is SECURITY INVOKER so
-- RLS scopes what it can see. search_index_sync is NOT — it is a trigger
-- function running as the table owner, and nothing should ever call it
-- directly.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'search_all(text, text[], text, timestamptz, integer)',
    'search_query(text)'
  ]
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('revoke all on function public.%s from anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;

  execute 'revoke all on function public.search_index_sync() from public';
  execute 'revoke all on function public.search_index_sync() from anon';
  execute 'revoke all on function public.search_index_sync() from authenticated';
  execute 'grant execute on function public.search_index_sync() to service_role';
end $$;
