-- ============================================================================
-- WHICH PROVIDER SERVED WHICH CALL, AND WHY
-- ============================================================================
--
-- The brief's (στ). A multi-provider layer whose routing cannot be read
-- back is a layer nobody can debug: "the answers got worse on Tuesday" is
-- unanswerable without a record of who was actually answering on Tuesday.
--
-- ONE ROW PER ATTEMPT, NOT PER REQUEST. A request that failed over twice
-- writes three rows sharing a request_id, and that is the whole point:
-- the successful row alone would say "openai served it" and lose the fact
-- that Anthropic 529'd first, which is the part an operator needs.
--
-- WHAT IS NOT IN HERE. No prompt, no completion, no system text, no tool
-- arguments — nothing the model was shown or said. This table answers
-- "who, when, how did it go, what did it cost in latency"; the tokens and
-- the money are already in ai_cost_log and are not duplicated.
--
-- CACHE_KEPT IS THE COLUMN THAT EARNS THIS TABLE. Failover is otherwise
-- invisible when it works: the answer is right, the user notices nothing,
-- and a prompt cache that stopped being honoured shows up only as a bill
-- that drifted. A boolean per attempt makes it a query.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

create table if not exists public.ai_provider_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Nullable: a cron-driven batch poll has no user in the room. Not a
  -- sentinel uuid — a fake owner is worse than an honest absence, because
  -- it makes "system did this" and "this user did this" the same query.
  user_id uuid references auth.users(id) on delete cascade,

  -- Ties the attempts of one request together.
  request_id uuid not null,
  attempt_index int not null check (attempt_index >= 0),

  purpose text not null,
  provider text not null,
  model text not null,

  outcome text not null check (outcome in (
    'success', 'unsupported', 'server_error', 'rate_limited', 'timeout',
    'network_error', 'bad_request', 'auth_error', 'overloaded', 'unknown_error'
  )),
  -- Null for a timeout or a socket error, and that is a real distinction:
  -- "the service said no" and "we never heard back" call for different
  -- operational responses.
  http_status int,
  latency_ms int not null default 0 check (latency_ms >= 0),

  -- One phrase. "primary for chat (from default)", "failover after
  -- anthropic/overloaded".
  reason text not null default '',

  -- Null when the request carried no cacheable prefix to lose.
  cache_kept boolean
);

create index if not exists ai_provider_log_created_idx on public.ai_provider_log (created_at desc);
create index if not exists ai_provider_log_user_idx on public.ai_provider_log (user_id, created_at desc);
create index if not exists ai_provider_log_request_idx on public.ai_provider_log (request_id);
-- The operational query this table exists for: "what failed over, and
-- what stopped caching, in the last hour".
create index if not exists ai_provider_log_outcome_idx
  on public.ai_provider_log (outcome, created_at desc)
  where outcome <> 'success';

alter table public.ai_provider_log enable row level security;

-- The owner may read their own rows. It is their account's operational
-- record and it appears in their GDPR export
-- (lib/gdpr/user-data-registry.ts).
drop policy if exists ai_provider_log_select_own on public.ai_provider_log;
create policy ai_provider_log_select_own
  on public.ai_provider_log for select using (auth.uid() = user_id);

-- NO INSERT, UPDATE OR DELETE POLICY. Only the routing layer writes here,
-- through the service role. A user who could write this could fabricate
-- the record of which provider answered them.
grant select on public.ai_provider_log to authenticated;
revoke insert, update, delete on public.ai_provider_log from authenticated;
revoke all on public.ai_provider_log from anon;
