-- PUBLIC COULD EXECUTE A SECURITY DEFINER FUNCTION.
--
-- FOUND BY RUNNING scripts/tests/role-grants.dbtest.mjs, 2026-09-13,
-- against a local Postgres built from bootstrap-supabase.sql plus every
-- migration. It failed on one line:
--
--     FAIL  every holding is on the named list
--           PUBLIC EXECUTE on function public.prune_project_links()
--
-- and the catalogue agreed: proacl carried `=X/postgres`, which is the
-- spelling of "PUBLIC may EXECUTE". PUBLIC includes anon.
--
-- WHY IT MATTERS MORE THAN AN ORDINARY GRANT. prune_project_links is
-- `security definer` — it runs with the definer's privileges, so row
-- level security does not apply to what it deletes. A SECURITY DEFINER
-- function that PUBLIC may call is the shape privilege escalation takes;
-- that the body is scoped by `old.user_id` is a second line of defence,
-- not a reason to leave the first one open.
--
-- WHY IT IS NOT EXPLOITABLE AS IT STANDS, stated so nobody reads this as
-- a live incident: the function returns `trigger` and takes no arguments,
-- so a direct call raises "can only be called as a trigger". The defect
-- is the grant, and a grant that is wrong today is a grant that is wrong
-- when the function changes shape.
--
-- EVERY COMPARABLE FUNCTION IN THIS SCHEMA ALREADY DOES THIS. The
-- baseline revokes PUBLIC on reserve_credits, settle_reservation,
-- release_reservation, release_expired_reservations, record_site_view and
-- prune_integration_sync_log — the last of which is the same kind of
-- trigger sweeper as this one. 20261001000000_projects.sql created the
-- function and did not carry the line.
--
-- Postgres grants EXECUTE to PUBLIC on every new function by default,
-- which is why this has to be said rather than assumed.

revoke all on function public.prune_project_links() from public;

-- AND FROM authenticated, WHICH IS THE HALF I GOT WRONG FIRST.
--
-- The first draft of this migration revoked PUBLIC and then granted
-- EXECUTE to `authenticated, service_role`, on the reasoning that the end
-- state should be readable here. Running
-- scripts/tests/grants-and-policies.dbtest.mjs said otherwise:
--
--     FAIL  only the 9 argued-for functions are callable by a signed-in
--           user (13)
--           unexpected: ... prune_project_links
--
-- That gate's rule is the right one: a signed-in user may call a short,
-- deliberate list directly, and everything else goes through a server
-- route on the service role, which is where the "who is asking" check
-- lives. A TRIGGER function needs neither — it runs as part of the DELETE
-- on public.projects, under the table owner, and is never invoked by
-- name. Granting it to `authenticated` added a database entry point to
-- the browser in the act of closing one.
--
-- service_role keeps EXECUTE only because it owns nothing here and the
-- trigger fires under its writes too.
revoke all on function public.prune_project_links() from authenticated;
grant execute on function public.prune_project_links() to service_role;


-- ----------------------------------------------------------------------
-- AND TWO MORE THE SAME GATE NAMED, from 20261003's chat-memory round
-- ----------------------------------------------------------------------
--
--     FAIL  only the 9 argued-for functions are callable by a signed-in
--           user (12)
--           unexpected: chat_memory_prunable, chat_memory_record,
--                       prune_chat_memory
--
-- chat_memory_record STAYS granted to authenticated, and is added to that
-- gate's argued-for list instead. It is called with the USER'S OWN
-- client from lib/chat/memory.ts — deliberately, because chat_memory has
-- no UPDATE policy and the function is how a repeated fact bumps a
-- counter instead of inserting a sixth identical row. That is an exposure
-- with a reason, which is exactly what the list is for.
--
-- THE OTHER TWO HAVE NO SUCH CALLER. chat_memory_prunable and
-- prune_chat_memory are named only by src/lib/health/schema-canaries.ts,
-- read by /api/health — which builds its client with createAdminClient(),
-- i.e. the service role. Nothing reaches them from a browser, so the
-- authenticated grant is surface with no user behind it.

revoke all on function public.chat_memory_prunable(integer, integer) from authenticated;
revoke all on function public.prune_chat_memory(integer, integer) from authenticated;
