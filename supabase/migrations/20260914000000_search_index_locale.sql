-- ===========================================================================
-- TEN COPIES OF EVERY HELP ARTICLE WERE COMPETING FOR THE SAME QUERY.
--
-- THE BUG, in one sentence: a Greek user searching ⌘K could be handed the
-- PORTUGUESE copy of the answer they asked for.
--
-- help_articles is one row per (slug, locale) — deliberately, and the
-- 20260816 migration explains why: `triggers` are the phrasings a user
-- actually types, and a French user does not type Greek. That decision was
-- right. What nobody joined up is that search_index_sync() indexes every
-- one of those rows, search_index has no locale column, and search_all has
-- nothing to filter on. So all ten translations of all 27 articles sit in
-- the index at once, ranked against each other by ts_rank, and the winner
-- is whichever translation happens to score highest for the query — which
-- for a short query is frequently not the language the reader speaks.
--
-- User content is NOT affected and must not be: a row a user wrote has no
-- language the product knows, and filtering it by locale would hide their
-- own notes from them. Hence a NULLABLE column where null means "belongs
-- to every language", which is the same convention search_index.user_id
-- already uses for "belongs to everybody".
--
-- WHAT THIS FILE DOES
--   1. locale + group_key on search_index.
--   2. search_index_sync() populates both, generically — it reads columns
--      through to_jsonb(NEW), so a table without them yields null and
--      needs no argument and no special case.
--   3. Backfills the rows that are already there.
--   4. search_all gains p_locale and filters on it, with an English
--      fallback for articles not yet translated into the reader's language.
--
-- THE PERFORMANCE CONSTRAINT FROM 20260911 STILL HOLDS AND IS RE-CHECKED
-- AT THE BOTTOM: search_all must have an EMPTY proconfig. One `set
-- search_path` clause is what stopped it inlining and cost 746ms at twenty
-- thousand rows. Every name below is schema-qualified so the path cannot
-- reach it, and the self-check fails the migration if proconfig comes back
-- non-empty.
-- ===========================================================================

-- --------------------------------------------------------------------------
-- 1. The columns.
-- --------------------------------------------------------------------------
alter table public.search_index add column if not exists locale text;

-- WHAT MAKES TWO ROWS THE SAME DOCUMENT IN DIFFERENT LANGUAGES.
--
-- Needed for the fallback: "show the English copy only when this reader's
-- language does not have one" cannot be asked without knowing which rows
-- are translations of each other. For help_articles that is the slug.
-- Null everywhere else, because nothing else is translated.
alter table public.search_index add column if not exists group_key text;

-- The fallback clause looks up (group_key, locale); the main filter looks
-- up locale. Partial, because the overwhelming majority of rows are user
-- content with a null locale and indexing those helps nothing.
create index if not exists search_index_locale_group_idx
  on public.search_index (group_key, locale)
  where locale is not null;

-- --------------------------------------------------------------------------
-- 2. The trigger populates them.
--
-- GENERICALLY, through to_jsonb(NEW), for the same reason the title and
-- body columns are read that way: twenty-nine tables share one
-- implementation, and a table that has no `locale` column yields null here
-- rather than needing a new argument. That also means a table that GAINS a
-- locale column starts being filtered correctly with no migration.
-- --------------------------------------------------------------------------
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
  v_locale text;
  v_group text;
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
  -- NULL FOR EVERY USER TABLE, which is the point: their own rows are not
  -- in a language this product knows and must never be filtered by one.
  v_locale := nullif(v_row ->> 'locale', '');
  v_group := nullif(v_row ->> 'slug', '');

  insert into public.search_index
    (user_id, kind, module_slug, source_table, source_id, title, body, href,
     occurred_at, locale, group_key)
  values (
    v_user,
    tg_argv[0],
    nullif(tg_argv[4], ''),
    tg_table_name,
    new.id,
    v_title,
    v_body,
    tg_argv[3],
    v_when,
    v_locale,
    v_group
  )
  on conflict (source_table, source_id) do update set
    user_id     = excluded.user_id,
    kind        = excluded.kind,
    module_slug = excluded.module_slug,
    title       = excluded.title,
    body        = excluded.body,
    href        = excluded.href,
    occurred_at = excluded.occurred_at,
    locale      = excluded.locale,
    group_key   = excluded.group_key;

  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- 3. Backfill.
--
-- The trigger only fires on write, so every row already in the index has a
-- null locale — including the help articles this migration exists for. A
-- migration that fixes the mechanism and leaves the data behind is a
-- migration that looks applied and changes nothing.
--
-- Guarded by to_regclass: help_articles is created by 20260816, and a
-- database where that has not run must not fail here — it has no rows to
-- backfill either.
-- --------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.help_articles') is not null then
    update public.search_index s
       set locale = a.locale,
           group_key = a.slug
      from public.help_articles a
     where s.source_table = 'help_articles'
       and s.source_id = a.id
       and (s.locale is distinct from a.locale or s.group_key is distinct from a.slug);
    raise notice 'search_index: backfilled locale/group_key for help_articles';
  else
    raise notice 'search_index: help_articles absent, nothing to backfill';
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- 4. A NEW FUNCTION NAME, and the old one becomes a forwarder.
--
-- THREE ATTEMPTS, AND THE FIRST TWO ARE WORTH RECORDING because both look
-- correct and both break something.
--
--   (a) Add p_locale with a default and DROP the five-argument function.
--       Breaks the property unified-search.dbtest.mjs protects: it
--       RE-RUNS 20260824000000_unified_search.sql to prove a migration is
--       safe to apply twice, and that file re-creates the five-argument
--       search_all. With a defaulted sixth argument, a five-argument call
--       then matches BOTH and Postgres answers "function is not unique" —
--       a search box that breaks the second time somebody pastes an old
--       file, which is the worst possible moment to find out.
--
--   (b) Add p_locale with NO default so the two signatures can never be
--       confused. Postgres refuses outright: "input parameters after one
--       with a default value must also have defaults".
--
--   (c) A DIFFERENT NAME. No signature overlaps, so nothing can ever be
--       ambiguous, and re-running any old migration is safe forever. The
--       old name survives as a forwarder, so every existing caller —
--       lib/health/schema-canaries.ts, the dbtests, anybody typing it into
--       the SQL editor — keeps working, and there is still exactly ONE
--       copy of the query.
create or replace function public.search_all_localized(
  p_query text,
  p_kinds text[] default null,
  p_module text default null,
  p_since timestamptz default null,
  p_limit integer default 40,
  -- NULL means "no language preference" and returns the pre-existing
  -- behaviour, which is what the forwarder below passes.
  p_locale text default null
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
-- NO `set search_path`. See 20260911: it is what stopped this function
-- inlining, and every name below is qualified so the path cannot reach it.
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
      nullif(
        pg_catalog.ts_headline(
          'simple'::pg_catalog.regconfig,
          public.search_fold(s.body),
          q.tsq,
          'StartSel=<<,StopSel=>>,MaxWords=18,MinWords=6,MaxFragments=1,FragmentDelimiter= … '
        ),
        ''
      ),
      pg_catalog."left"(s.body, 140)
    ) as snippet,
    s.href,
    s.occurred_at,
    pg_catalog.ts_rank(s.document, q.tsq) as rank
  from public.search_index s, q
  where q.tsq is not null
    and s.document OPERATOR(pg_catalog.@@) q.tsq
    and (p_kinds is null or s.kind OPERATOR(pg_catalog.=) any (p_kinds))
    and (p_module is null or s.module_slug OPERATOR(pg_catalog.=) p_module)
    and (p_since is null or s.occurred_at OPERATOR(pg_catalog.>=) p_since)
    -- THE LANGUAGE FILTER, and each of its three arms is load-bearing.
    --
    --   locale is null      the user's own rows. Never filtered — they are
    --                       not in a language this product assigned, and
    --                       hiding somebody's own notes because of a
    --                       language setting would be a far worse bug than
    --                       the one this migration fixes.
    --   locale = p_locale   the reader's own language.
    --   the 'en' fallback   an article that has no copy in the reader's
    --                       language. The 20260816 seed guarantees English
    --                       is complete for all 27 slugs, so this arm can
    --                       never leave a query with nothing; and it is
    --                       scoped by group_key so it only fills a genuine
    --                       gap rather than shadowing a translation that
    --                       does exist.
    and (
      p_locale is null
      or s.locale is null
      or s.locale OPERATOR(pg_catalog.=) p_locale
      or (
        s.locale OPERATOR(pg_catalog.=) 'en'
        and not exists (
          select 1
            from public.search_index t
           where t.group_key OPERATOR(pg_catalog.=) s.group_key
             and t.locale OPERATOR(pg_catalog.=) p_locale
        )
      )
    )
  order by pg_catalog.ts_rank(s.document, q.tsq) desc, s.occurred_at desc
  limit greatest(least(p_limit, 200), 1);
$$;

-- --------------------------------------------------------------------------
-- 4b. The old name, reduced to a forwarder.
--
-- Every existing caller keeps working unchanged, and there is still only
-- ONE copy of the query itself. A second full copy would be two things to
-- keep in step, and this file exists because two things that should have
-- been in step were not.
--
-- If somebody DOES re-paste 20260824, this forwarder is replaced by that
-- file's full five-argument body. That is not a break: search keeps
-- working, unfiltered, exactly as it did before this migration — and the
-- application calls search_all_localized, so the user-visible fix stays.
-- --------------------------------------------------------------------------
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
security invoker
as $$
  select * from public.search_all_localized(p_query, p_kinds, p_module, p_since, p_limit, null::text);
$$;

revoke all on function public.search_all(text, text[], text, timestamptz, integer) from public;
revoke all on function public.search_all(text, text[], text, timestamptz, integer) from anon;
grant execute on function public.search_all(text, text[], text, timestamptz, integer) to authenticated;
grant execute on function public.search_all(text, text[], text, timestamptz, integer) to service_role;
revoke all on function public.search_all_localized(text, text[], text, timestamptz, integer, text) from public;
revoke all on function public.search_all_localized(text, text[], text, timestamptz, integer, text) from anon;
grant execute on function public.search_all_localized(text, text[], text, timestamptz, integer, text) to authenticated;
grant execute on function public.search_all_localized(text, text[], text, timestamptz, integer, text) to service_role;

-- ---------------------------------------------------------------------------
-- SELF-CHECK. Everything 20260911 asserted, re-asserted for the new
-- signature — a migration that quietly undoes the previous one's guarantees
-- is worse than one that never ran.
-- ---------------------------------------------------------------------------
do $$
declare
  v_config text[];
  v_secdef boolean;
  anon_can boolean;
  auth_can boolean;
  v_rows integer;
  v_cols integer;
begin
  -- THE IMPLEMENTATION, not the forwarder. The forwarder is one line and
  -- its plan does not matter; search_all_localized is the function whose
  -- proconfig decides whether the search box takes 55ms or 746ms.
  select proconfig, prosecdef into v_config, v_secdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.oid::regprocedure::text =
         'search_all_localized(text,text[],text,timestamp with time zone,integer,text)';

  -- The property that matters and is invisible in the function's text.
  if v_config is not null and array_length(v_config, 1) > 0 then
    raise exception 'search_all_localized has a non-empty proconfig (%) — it will not inline and the search box goes back to 700ms', v_config;
  end if;

  if v_secdef then
    raise exception 'search_all_localized became SECURITY DEFINER — it would read every row in the database';
  end if;

  select has_function_privilege('anon', 'public.search_all_localized(text, text[], text, timestamptz, integer, text)', 'execute')
    into anon_can;
  select has_function_privilege('authenticated', 'public.search_all_localized(text, text[], text, timestamptz, integer, text)', 'execute')
    into auth_can;
  if anon_can then
    raise exception 'search_all_localized is executable by anon';
  end if;
  if not auth_can then
    raise exception 'search_all_localized is NOT executable by authenticated — the search box would stop working';
  end if;

  -- The columns this migration exists to add.
  select count(*) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'search_index'
     and column_name in ('locale', 'group_key');
  if v_cols <> 2 then
    raise exception 'search_index is missing locale/group_key (found % of 2)', v_cols;
  end if;

  -- And it still runs, through every argument the new signature takes.
  select count(*) into v_rows
    from public.search_all_localized('zzz_no_such_term_zzz', null, null, null, 5, 'el');
  -- And the forwarder, because a five-argument call is what every
  -- existing caller makes.
  perform count(*) from public.search_all('zzz_no_such_term_zzz', null, null, null, 5);
  raise notice 'search_all smoke test returned % rows for a term that matches nothing', v_rows;
end;
$$;
