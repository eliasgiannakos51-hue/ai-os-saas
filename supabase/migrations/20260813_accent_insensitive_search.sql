-- ============================================================================
-- Accent-insensitive search.
--
-- DEFECT this replaces (app/api/search/route.ts): every module table was
-- searched with
--
--     .ilike(config.headlineKey, "%" + query + "%")
--
-- `ilike` folds case and nothing else. Verified against a real PostgreSQL 16:
--
--     select 'Καφές' ilike '%καφε%';             -- false
--     select unaccent('Καφές') ilike '%καφε%';   -- true
--
-- So a Greek user searching "καφε" found nothing named "Καφές" — and since
-- upper-case Greek is conventionally written WITHOUT accents ("ΚΑΦΕΣ") while
-- lower case keeps them, the same word typed two ordinary ways did not match
-- itself. The same defect existed in nine client components; see
-- lib/text/search-match.ts.
--
-- Safe to run more than once.
-- ============================================================================

create extension if not exists unaccent;
create extension if not exists pg_trgm;


-- ----------------------------------------------------------------------------
-- 1. An IMMUTABLE unaccent.
--
-- The bare `unaccent(text)` is STABLE, not IMMUTABLE, because it resolves its
-- dictionary at call time — and a STABLE function cannot be used in an index
-- expression. Naming the dictionary explicitly removes that dependency, which
-- is what makes the wrapper honestly immutable rather than merely labelled so.
--
-- (The standing caveat: if the unaccent dictionary FILE is ever edited, any
-- index built on this must be REINDEXed. That is true of every immutable
-- unaccent wrapper and is why this is a named function rather than an inline
-- expression — there is exactly one place to find.)
-- ----------------------------------------------------------------------------
create or replace function public.immutable_unaccent(p_text text)
returns text
language sql
immutable
parallel safe
strict
set search_path = public, pg_catalog
as $$
  select public.unaccent('public.unaccent'::regdictionary, p_text)
$$;


-- ----------------------------------------------------------------------------
-- 2. search_fold — the one definition of "the same text, for searching".
--
-- Must agree with foldForMatch in lib/text/unicode-patterns.ts, or the client
-- and the server will disagree about what matches.
--
--   lower()             — case
--   immutable_unaccent  — accents (ά→α, ü→u, é→e)
--   translate ς→σ       — Greek FINAL SIGMA, which is a positional variant of
--                         the same letter. Without it, lower('ΚΑΦΕΣ')='καφεσ'
--                         never equals 'καφές', and the two most natural ways
--                         to type one Greek word still fail to match.
--
-- lower() is applied after unaccent so the two orders cannot diverge on
-- characters whose accented upper-case form unaccents differently.
-- ----------------------------------------------------------------------------
create or replace function public.search_fold(p_text text)
returns text
language sql
immutable
parallel safe
strict
set search_path = public, pg_catalog
as $$
  select translate(lower(public.immutable_unaccent(p_text)), 'ς', 'σ')
$$;


-- ----------------------------------------------------------------------------
-- 3. search_headline — one searchable table, folded on both sides.
--
-- PostgREST cannot express `unaccent(col) ilike unaccent(pattern)` through
-- its filter syntax: a filter's left-hand side is a column, never a function
-- call. So the search moves into a function.
--
-- SECURITY INVOKER (the default, stated here because it is the whole point):
-- the function runs as the CALLING user, so every row-level security policy
-- on the target table still applies. A SECURITY DEFINER version of this would
-- be a read-anything-in-the-database primitive.
--
-- The table name is dynamic, so it is validated three ways before it reaches
-- format(): it must be an ordinary table in `public`, it must have row-level
-- security ENABLED, and it must have a `user_id` column. That is the shape of
-- every per-user module table and of nothing else, so a caller cannot point
-- this at an unprotected table. format('%I') then quotes the identifier.
-- ----------------------------------------------------------------------------
create or replace function public.search_headline(
  p_table text,
  p_column text,
  p_pattern text,
  p_limit integer default 4
)
returns table (id uuid, headline text)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  v_sql text;
  v_has_created_at boolean;
begin
  if p_pattern is null or length(p_pattern) = 0 then
    return;
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    p_limit := 4;
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = p_table
      and c.relkind = 'r'
      and c.relrowsecurity
  ) then
    raise exception 'search_headline: "%" is not a row-level-secured table in public', p_table
      using errcode = '42P01';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_table and column_name = 'user_id'
  ) then
    raise exception 'search_headline: "%" has no user_id column', p_table using errcode = '42703';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_table and column_name = p_column
      and data_type in ('text', 'character varying', 'character')
  ) then
    raise exception 'search_headline: "%"."%" is not a text column', p_table, p_column
      using errcode = '42703';
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_table and column_name = 'created_at'
  ) into v_has_created_at;

  -- `escape '\'` keeps the caller's escaping of literal % and _ meaningful
  -- (see likePattern in app/api/search/route.ts). search_fold leaves
  -- backslashes and wildcards untouched, so an escaped pattern survives it.
  v_sql := format(
    'select t.id, t.%I::text
       from public.%I t
      where public.search_fold(t.%I) like public.search_fold($1) escape ''\''
      %s
      limit $2',
    p_column, p_table, p_column,
    case when v_has_created_at then 'order by t.created_at desc nulls last' else '' end
  );

  return query execute v_sql using p_pattern, p_limit;
end;
$$;

-- Search requires a signed-in user; anon has no business calling it.
revoke all on function public.search_headline(text, text, text, integer) from public;
revoke all on function public.search_headline(text, text, text, integer) from anon;
grant execute on function public.search_headline(text, text, text, integer) to authenticated;
grant execute on function public.search_headline(text, text, text, integer) to service_role;


-- ----------------------------------------------------------------------------
-- 4. Indexes.
--
-- `search_fold(col) like '%...%'` cannot use a b-tree — a leading wildcard
-- rules it out — so these are GIN trigram indexes, which pg_trgm makes usable
-- for exactly this shape. Without them the search degrades to a sequential
-- scan per table per keystroke across 22 tables.
--
-- Built with `if not exists` from a data-driven list so a project missing any
-- of these tables (a partially-applied schema) still gets the rest, instead of
-- the whole migration aborting on the first absent table.
-- ----------------------------------------------------------------------------
do $$
declare
  r record;
  v_index text;
begin
  for r in
    select * from (values
      -- The 13 classifier modules (lib/classifier-modules.ts, lib/modules.ts)
      ('ideas',                     'name'),
      ('competitors',               'company'),
      ('research',                  'topic'),
      ('finance_entries',           'description'),
      ('learning_entries',          'topic'),
      ('trades',                    'symbol'),
      ('decisions',                 'idea_names'),
      ('products',                  'product_name'),
      ('content',                   'topic'),
      ('leads',                     'lead_name'),
      ('feedback',                  'summary'),
      ('metrics',                   'metric_name'),
      ('automations',               'task_name'),
      -- The 8 Build modules (lib/build-modules.ts)
      ('ai_websites',               'name'),
      ('ai_apps',                   'name'),
      ('ai_images',                 'prompt'),
      ('ai_videos',                 'prompt'),
      ('ai_coding_requests',        'title'),
      ('ai_data_analysis_requests', 'title'),
      ('ai_presentations',          'title'),
      ('ai_campaigns',              'name'),
      -- Chat titles, searched alongside the modules
      ('chat_conversations',        'title')
    ) as t(tbl, col)
  loop
    -- Skip anything this project does not have, rather than failing.
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.tbl and column_name = r.col
    ) then
      continue;
    end if;

    v_index := format('%s_%s_search_fold_idx', r.tbl, r.col);
    execute format(
      'create index if not exists %I on public.%I using gin (public.search_fold(%I) gin_trgm_ops)',
      v_index, r.tbl, r.col
    );
  end loop;
end;
$$;
