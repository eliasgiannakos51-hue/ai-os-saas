-- REPAIR 5.2 — db_exposure_report
-- Source: supabase/migrations/20260917000000_db_exposure_report.sql
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- Run the numbered files IN ORDER. Each is safe to run twice.

do $exposuregrants$
begin
  execute 'revoke all on function public.db_exposure_report() from public';
  execute 'revoke all on function public.db_exposure_report() from anon';
  execute 'revoke all on function public.db_exposure_report() from authenticated';
  execute 'grant execute on function public.db_exposure_report() to service_role';
end $exposuregrants$;

comment on function public.db_exposure_report() is
  'Eight counts describing what this database exposes: extensions in public, functions anon may execute, relations anon may read, bare PUBLIC grants, tables without RLS, grants with no matching policy, unpinned SECURITY DEFINER functions, and default privileges for anon. Read by /dashboard/system-health. service_role only — the counts are a map of where to attack this database.';