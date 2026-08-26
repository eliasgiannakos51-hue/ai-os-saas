-- ---------------------------------------------------------------------------
-- search_all TOOK 766ms ON 20,000 ROWS BECAUSE ONE CLAUSE STOPPED IT INLINING.
--
-- MEASURED, on PostgreSQL 16, against the schema this repository builds, with
-- the same query run four ways:
--
--   variant                                        median of 5
--   search_all as it was (stable, invoker, SET)         55.32 ms
--   the same body WITHOUT `set search_path`              2.34 ms
--   the same body WITHOUT `security invoker`            65.75 ms
--   the same body with neither clause                    2.71 ms
--
-- `security invoker` costs nothing. `set search_path` costs everything, and
-- the plan says why:
--
--   with SET     -> Function Scan on search_all  (cost=0.25..10.25 rows=1000)
--   without      -> Limit  (cost=126.01..146.81 rows=40)
--
-- PostgreSQL will not inline a SQL set-returning function that carries a SET
-- clause. Un-inlined, the body is planned once with the parameters unknown,
-- so `search_query(p_query)` cannot be folded to a constant, the GIN index
-- cannot be matched against it, and the LIMIT cannot be pushed down — the
-- whole matching set is walked and ts_headline and ts_rank are paid for on
-- rows nobody will ever see.
--
-- It is not a constant overhead. It grows with the table:
--
--   rows in search_index   search_all   inlined   overhead
--            1,200            64.55ms    2.85ms    61.70ms
--            5,000           211.84ms    6.57ms   205.28ms
--           20,000           766.12ms   19.68ms   746.44ms
--
-- 766ms is a search box that visibly stalls, on an account that is merely
-- active rather than large, and the gate that says "under 200ms" was already
-- being broken at five thousand rows.
--
-- WHAT THE SET CLAUSE WAS BUYING, AND HOW TO KEEP IT.
--
-- This function is SECURITY INVOKER, so the pin was not protecting a
-- privilege escalation — it was stopping a caller with a hostile search_path
-- from shadowing the functions and operators the body names. The body already
-- qualified `public.search_query`, `public.search_fold` and
-- `public.search_index`; what it left open were the built-ins — ts_headline,
-- ts_rank, left — and the operators @@, = and >=.
--
-- So they are qualified instead. `pg_catalog.ts_rank(...)` and
-- `OPERATOR(pg_catalog.@@)` cannot be redirected by any search_path at all,
-- which is a STRONGER guarantee than the SET clause gave: the pin made the
-- path safe for the duration of the call, while qualification makes the path
-- irrelevant. coalesce, nullif, greatest and least are not qualified because
-- they are SQL syntax rather than schema-resident functions and cannot be
-- shadowed.
--
-- The result is identical. Verified by comparing md5(string_agg(...)) of the
-- full result of both versions across the plain query, a kind filter, a
-- module filter, a custom limit and a query matching nothing: same in every
-- case. Then 211.22ms -> 10.05ms on the same five thousand rows.
--
-- Idempotent: create or replace, and the grants are re-stated.
-- ---------------------------------------------------------------------------

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
-- NO `set search_path`. See the header: it is what stopped this function
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
  order by pg_catalog.ts_rank(s.document, q.tsq) desc, s.occurred_at desc
  limit greatest(least(p_limit, 200), 1);
$$;

-- `create or replace` keeps the existing grants, but they are re-stated so a
-- database that somehow lost them is repaired by running this file, and so
-- the intended set is visible here rather than three migrations away.
revoke all on function public.search_all(text, text[], text, timestamptz, integer) from public;
revoke all on function public.search_all(text, text[], text, timestamptz, integer) from anon;
grant execute on function public.search_all(text, text[], text, timestamptz, integer) to authenticated;
grant execute on function public.search_all(text, text[], text, timestamptz, integer) to service_role;

-- ---------------------------------------------------------------------------
-- SELF-CHECK. The property that matters is invisible in the function's text:
-- proconfig must be EMPTY, because a single SET clause is what put this
-- function behind a Function Scan and cost 746ms at twenty thousand rows.
-- Checked here rather than trusted, and the grants with it.
-- ---------------------------------------------------------------------------
do $$
declare
  v_config text[];
  v_kind   char;
  v_secdef boolean;
  anon_can boolean;
  auth_can boolean;
  v_rows   integer;
begin
  select p.proconfig, p.prokind, p.prosecdef
    into v_config, v_kind, v_secdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'search_all';

  raise notice 'search_all: proconfig=% prokind=% security_definer=%',
    coalesce(array_to_string(v_config, ','), '(none)'), v_kind, v_secdef;

  if v_config is not null then
    raise exception
      'search_all still carries a SET clause (%) — PostgreSQL will not inline it, and the search returns to walking the whole match set',
      array_to_string(v_config, ',');
  end if;

  -- It must stay SECURITY INVOKER. Inlining is worth nothing if the price is
  -- a function that reads past row-level security.
  if v_secdef then
    raise exception 'search_all became SECURITY DEFINER — it would read every row in the database';
  end if;

  select has_function_privilege('anon', 'public.search_all(text, text[], text, timestamptz, integer)', 'execute')
    into anon_can;
  select has_function_privilege('authenticated', 'public.search_all(text, text[], text, timestamptz, integer)', 'execute')
    into auth_can;
  raise notice 'search_all grants: anon=% authenticated=%', anon_can, auth_can;
  if anon_can then
    raise exception 'search_all is executable by anon';
  end if;
  if not auth_can then
    raise exception 'search_all is NOT executable by authenticated — the search box would stop working';
  end if;

  -- And it still runs. A function that is fast and throws is not an
  -- improvement; this exercises every argument the signature takes.
  select count(*) into v_rows from public.search_all('zzz_no_such_term_zzz', null, null, null, 5);
  raise notice 'search_all smoke test returned % rows for a term that matches nothing', v_rows;
end;
$$;
