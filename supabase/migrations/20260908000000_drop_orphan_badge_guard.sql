-- ============================================================================
-- A GUARD FOR A DESIGN THAT NO LONGER EXISTS
-- ============================================================================
--
-- WHAT IT IS. `guard_badge_removal_columns()` and the trigger
-- `guard_badge_removal` on public.published_sites protect three columns —
-- badge_removal_paid_until, badge_removal_auto_renew and
-- badge_removal_expiry_notified_at — against being written by anybody but
-- the service role.
--
-- WHY IT IS BEING REMOVED. That design is not in this repository. It was
-- created by a loose `v4_badge_removal_migration.sql` at the root of a
-- branch that was never merged, run by hand against the live database, and
-- superseded by 20260905000000_badge_removal_credits.sql — which stores the
-- same fact in a separate table, site_badge_removals, with column-level
-- grants (`grant update (auto_renew, cancelled_at)`) doing the job the
-- trigger was written to do.
--
-- So the trigger fires on EVERY update of published_sites — every publish,
-- every rename, every page edit — to defend columns that nothing in the
-- application has read since 20260905 shipped. Measured: zero references
-- to any of the three column names anywhere in src/ or scripts/, and
-- site_shows_badge() reads site_badge_removals and nothing else.
--
-- And it was never reliable, which is the argument that settles it: a
-- database rebuilt from this directory would not have it. A guard that
-- disappears when the schema is rebuilt is not a guard, it is a local
-- condition.
--
-- ============================================================
-- THE COLUMNS ARE NOT DROPPED
-- ============================================================
--
-- They hold the ONLY record of who had paid under the old design. Dropping
-- them is unrecoverable and is a separate decision from dropping the
-- trigger, so this file does not take it.
--
-- AND IT DOES NOT INVENT THE MISSING ROWS EITHER. The tempting move is to
-- write a site_badge_removals row for every site with a live
-- badge_removal_paid_until. That row needs credits_charged, and the old
-- design never recorded what was charged — so the number would be today's
-- list price standing in for a purchase whose real price nobody wrote
-- down, and a fabricated charge record is worse than an honest gap.
--
-- What this file does instead is COUNT them and say so, loudly, so the
-- decision is made by somebody who can look at the payments.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE, and no
-- column is dropped.
-- ============================================================================

-- ----------------------------------------------------------------------
-- 1. Report before removing
-- ----------------------------------------------------------------------
-- Runs FIRST and on its own, because after the drop there is no reason to
-- come back and look. Guarded on the column existing at all: in a database
-- built from this directory it never did, and this file must be a no-op
-- there rather than an error.
do $$
declare
  n_live int := 0;
  n_uncovered int := 0;
  ids text;
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'published_sites'
       and column_name = 'badge_removal_paid_until'
  ) then
    raise notice 'old badge columns absent — nothing to report';
    return;
  end if;

  execute $q$
    select count(*) from public.published_sites
     where badge_removal_paid_until is not null
       and badge_removal_paid_until > now()
  $q$ into n_live;

  -- The ones that matter: cover that was paid for under the old design and
  -- has no equivalent row under the new one. Those sites are showing the
  -- badge again today, and have been since 20260905 shipped — this file
  -- did not cause that and cannot fix it, but it is the last chance to
  -- notice before the evidence stops being obvious.
  execute $q$
    select count(*), coalesce(string_agg(p.id::text, ', ' order by p.id), '')
      from public.published_sites p
     where p.badge_removal_paid_until is not null
       and p.badge_removal_paid_until > now()
       and not exists (
         select 1 from public.site_badge_removals r
          where r.site_id = p.id
            and r.covers_month = date_trunc('month', now())::date
       )
  $q$ into n_uncovered, ids;

  raise notice 'old design: % site(s) with live cover, % of them with no new-design row', n_live, n_uncovered;
  if n_uncovered > 0 then
    raise notice 'sites whose paid cover is not represented in site_badge_removals: %', ids;
    raise notice 'these are NOT backfilled here — the old design never recorded what was charged';
  end if;
end $$;

-- ----------------------------------------------------------------------
-- 2. The trigger, then the function
-- ----------------------------------------------------------------------
-- In that order. Dropping the function first would fail on the dependency;
-- `if exists` on both so a database built from this directory — where
-- neither was ever created — runs this file cleanly.
drop trigger if exists guard_badge_removal on public.published_sites;
drop function if exists public.guard_badge_removal_columns();

-- ----------------------------------------------------------------------
-- 3. Check it actually went
-- ----------------------------------------------------------------------
do $$
declare
  n_trg int;
  n_fn int;
begin
  select count(*) into n_trg
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'published_sites'
     and t.tgname = 'guard_badge_removal'
     and not t.tgisinternal;

  select count(*) into n_fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'guard_badge_removal_columns';

  if n_trg > 0 or n_fn > 0 then
    raise exception 'orphan badge guard survived: % trigger(s), % function(s)', n_trg, n_fn;
  end if;

  raise notice 'orphan badge guard removed; the three columns are untouched';
end $$;

notify pgrst, 'reload schema';
