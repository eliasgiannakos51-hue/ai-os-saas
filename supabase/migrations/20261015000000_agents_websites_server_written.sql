-- ---------------------------------------------------------------------------
-- AGENTS AND SITES ARE WRITTEN BY THE SERVER ONLY (2026-10-05).
--
-- Fixed access control on public.user_agents and public.user_websites.
--   user_agents    the account reads its agents; INSERT, UPDATE and DELETE
--                  go through src/app/api/agents/route.ts and
--                  src/app/api/agents/[id]/route.ts (plan gate, activation
--                  cap, schedule rule, prompt sanitising), written with the
--                  service role and scoped to the caller.
--   user_websites  the account reads and DELETES its sites (the builder's
--                  delete button writes through the browser); INSERT and
--                  UPDATE go through src/app/api/websites/generate/route.ts,
--                  .../generate/process/route.ts, .../status/route.ts,
--                  .../edit/route.ts and .../[id]/regenerate/route.ts, each
--                  scoped by id AND user_id. A pending row now exists only
--                  after the start route's plan and fair-use checks, and a
--                  site's status moves only through the server.
--
-- Idempotent: drop policy if exists, revoke.
-- How to check it after running: the SELF-CHECK at the end raises if the
-- account can still write what it should not, or lost what it keeps;
-- scripts/tests/server-written-tables.dbtest.mjs checks it on a real Postgres.
-- How to undo: see NEEDS 29 in docs/NEEDS-FROM-ELIAS.md.
-- ---------------------------------------------------------------------------

drop policy if exists "insert_own_user_agents" on public.user_agents;
drop policy if exists "update_own_user_agents" on public.user_agents;
drop policy if exists "delete_own_user_agents" on public.user_agents;
revoke insert, update, delete on public.user_agents from anon, authenticated;

drop policy if exists "insert_own_user_websites" on public.user_websites;
drop policy if exists "update_own_user_websites" on public.user_websites;
revoke insert, update on public.user_websites from anon, authenticated;

-- ---------------------------------------------------------------------------
-- SELF-CHECK.
-- ---------------------------------------------------------------------------
do $$
declare
  v text;
begin
  foreach v in array array['INSERT', 'UPDATE', 'DELETE'] loop
    if has_table_privilege('authenticated', 'public.user_agents', v) then
      raise exception 'user_agents: authenticated can still %', v;
    end if;
  end loop;
  foreach v in array array['INSERT', 'UPDATE'] loop
    if has_table_privilege('authenticated', 'public.user_websites', v) then
      raise exception 'user_websites: authenticated can still %', v;
    end if;
  end loop;
  if not has_table_privilege('authenticated', 'public.user_websites', 'DELETE')
     or not has_any_column_privilege('authenticated', 'public.user_websites', 'SELECT')
     or not has_any_column_privilege('authenticated', 'public.user_agents', 'SELECT') then
    raise exception 'agents and sites: authenticated lost read, or the site delete';
  end if;
end;
$$;
