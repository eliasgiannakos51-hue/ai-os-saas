-- ONE-TIME BACKFILL: credentials that were written before anything scrubbed.
--
-- Until today, logApiError() wrote a provider's raw error message to
-- production_errors.error_message and .stack_trace, and
-- /dashboard/system-health renders both as text. user_websites.error_message
-- had the same shape on one path. The runtime is fixed (lib/scrub-secrets.ts,
-- applied in lib/log-error.ts and in the website generator), but rows written
-- before that fix are still in the table and still rendered.
--
-- THE SOURCE OF TRUTH IS src/lib/scrub-secrets.ts. This is a backfill, not a
-- second implementation: it runs over the rows that exist and then has
-- nothing left to do. The rules below mirror that file — if a prefix is added
-- there, it does NOT need adding here, because new rows are scrubbed on the
-- way in.
--
-- Idempotent by construction: the UPDATE only touches rows where scrubbing
-- would change something, so a second run matches nothing. No DROP, no
-- TRUNCATE, no unqualified DELETE — the owner's error history is kept, with
-- the credentials taken out of it.

create or replace function public.scrub_secret_text(p_text text)
returns text
language sql
immutable
as $fn$
  -- Postgres uses \y for a word boundary, not \b (\b is backspace here).
  -- The order matches the TypeScript: specific rules first so a recognised
  -- token is labelled with what it was, catch-all last so it only sees what
  -- nothing else claimed.
  select case when p_text is null then null else
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              p_text,
              'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}',
              '[redacted-jwt]', 'g'),
            '\y(sb|sbp|re|sk|pk|rk|whsec)_[A-Za-z0-9_-]{12,}',
            '[redacted-token]', 'g'),
          '\y\d{8,12}:[A-Za-z0-9_-]{30,}\y',
          '[redacted-bot-token]', 'g'),
        '([a-z][a-z0-9+.-]*://)[^/@\s]+:[^/@\s]+@',
        '\1[redacted-userinfo]@', 'g'),
      '\y[A-Za-z0-9_-]{40,}\y',
      '[redacted-opaque]', 'g')
  end;
$fn$;

comment on function public.scrub_secret_text(text) is
  'Backfill mirror of src/lib/scrub-secrets.ts. New rows are scrubbed by the application; this exists for rows written before that was true.';

-- A pure text function has no privilege of its own, and it is still revoked:
-- every function in this schema is reachable over PostgREST by whatever role
-- holds EXECUTE, and "it only reformats text" is an argument, not a grant.
revoke all on function public.scrub_secret_text(text) from public;
revoke all on function public.scrub_secret_text(text) from anon;
revoke all on function public.scrub_secret_text(text) from authenticated;
grant execute on function public.scrub_secret_text(text) to service_role;

do $$
declare
  v_errors integer := 0;
  v_sites integer := 0;
begin
  if to_regclass('public.production_errors') is not null then
    update public.production_errors
       set error_message = public.scrub_secret_text(error_message),
           stack_trace   = public.scrub_secret_text(stack_trace)
     where error_message is distinct from public.scrub_secret_text(error_message)
        or stack_trace   is distinct from public.scrub_secret_text(stack_trace);
    get diagnostics v_errors = row_count;
  end if;

  if to_regclass('public.user_websites') is not null then
    update public.user_websites
       set error_message = public.scrub_secret_text(error_message)
     where error_message is distinct from public.scrub_secret_text(error_message);
    get diagnostics v_sites = row_count;
  end if;

  raise notice 'scrubbed % production_errors row(s), % user_websites row(s)', v_errors, v_sites;
end;
$$;
