-- ---------------------------------------------------------------------------
-- COMPANY INTEGRITY + ATTRIBUTION: two sets of counts for the company's own
-- agents `data-quality` and `attribution` (docs/PROGRESS.md 2026-11-08).
--
-- company_integrity(): seven STATED invariants, each a count of rows that
-- break it. It is not "the data is right": it is these seven things, and the
-- agent says so. A count of zero means "no row breaks this rule", nothing more.
--   credit_rows_negative          user_credits.credits_remaining < 0
--   users_without_credit_row      live accounts with no user_credits row
--   referrals_converted_no_date   status 'converted' and converted_at is null
--   referrals_void_no_reason      status 'void' and void_reason null or blank
--   self_referrals                an affiliate recorded as referring themselves
--   live_commissions_on_void      commission not 'reversed' on a 'void' referral
--   cost_rows_negative            ai_cost_log row with a negative cost or charge
--
-- company_attribution(): the ONLY acquisition source this product records is
-- an affiliate link (public.affiliate_referrals). Every other sign-up is
-- "not attributed", which is NOT the same as "organic": no UTM tag, referrer
-- or landing page is stored anywhere. Counts only, never a list of accounts.
--   users_new_7d, users_new_prev_7d   accounts created in each window
--   referrals_new_7d, referrals_new_prev_7d   affiliate referrals created in each
--   referrals_total, referrals_converted, referrals_void   all time
--   affiliates_active             affiliates with status 'active'
--
-- SECURITY DEFINER, search_path pinned, executable by service_role only: the
-- figures are the company's business, not a customer's.
--
-- Idempotent: create or replace. How to check it after running:
-- npm run db:pending; /api/health lists both functions.
-- How to undo: drop function if exists public.company_integrity();
--   drop function if exists public.company_attribution();
--   (removes these two functions only; no table or other function is touched).
-- ---------------------------------------------------------------------------

create or replace function public.company_integrity()
returns table (metric text, value bigint)
language sql
stable
security definer
set search_path = public, pg_catalog
as $integrity$
  select 'credit_rows_negative'::text, count(*)::bigint from public.user_credits where credits_remaining < 0
  union all select 'users_without_credit_row', count(*) from auth.users u
    where u.deleted_at is null
      and not exists (select 1 from public.user_credits c where c.user_id = u.id)
  union all select 'referrals_converted_no_date', count(*) from public.affiliate_referrals
    where status = 'converted' and converted_at is null
  union all select 'referrals_void_no_reason', count(*) from public.affiliate_referrals
    where status = 'void' and (void_reason is null or btrim(void_reason) = '')
  union all select 'self_referrals', count(*) from public.affiliate_referrals r
    join public.affiliates a on a.id = r.affiliate_id
    where a.user_id = r.referred_user_id
  union all select 'live_commissions_on_void', count(*) from public.affiliate_commissions k
    join public.affiliate_referrals r on r.id = k.referral_id
    where r.status = 'void' and k.status <> 'reversed'
  union all select 'cost_rows_negative', count(*) from public.ai_cost_log
    where real_cost_eur < 0 or real_cost_usd < 0 or credits_charged < 0;
$integrity$;

create or replace function public.company_attribution()
returns table (metric text, value bigint)
language sql
stable
security definer
set search_path = public, pg_catalog
as $attribution$
  select 'users_new_7d'::text, count(*)::bigint from auth.users
    where deleted_at is null and created_at >= now() - interval '7 days'
  union all select 'users_new_prev_7d', count(*) from auth.users
    where deleted_at is null
      and created_at >= now() - interval '14 days' and created_at < now() - interval '7 days'
  union all select 'referrals_new_7d', count(*) from public.affiliate_referrals
    where created_at >= now() - interval '7 days'
  union all select 'referrals_new_prev_7d', count(*) from public.affiliate_referrals
    where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days'
  union all select 'referrals_total', count(*) from public.affiliate_referrals
  union all select 'referrals_converted', count(*) from public.affiliate_referrals where status = 'converted'
  union all select 'referrals_void', count(*) from public.affiliate_referrals where status = 'void'
  union all select 'affiliates_active', count(*) from public.affiliates where status = 'active';
$attribution$;

do $integritygrants$
begin
  execute 'revoke all on function public.company_integrity() from public';
  execute 'revoke all on function public.company_integrity() from anon';
  execute 'revoke all on function public.company_integrity() from authenticated';
  execute 'grant execute on function public.company_integrity() to service_role';
  execute 'revoke all on function public.company_attribution() from public';
  execute 'revoke all on function public.company_attribution() from anon';
  execute 'revoke all on function public.company_attribution() from authenticated';
  execute 'grant execute on function public.company_attribution() to service_role';
end $integritygrants$;

comment on function public.company_integrity() is
  'Seven counts of rows that break a stated rule, for the data-quality agent. Counts only, never a list of accounts.';
comment on function public.company_attribution() is
  'Account and affiliate-referral counts for the attribution agent. Affiliate links are the only recorded source. Counts only.';
