-- ---------------------------------------------------------------------------
-- THE DRAFT DESK: one row per draft a company writing agent made for the
-- owner (docs/PROGRESS.md 2026-11-07δ). The owner types a brief into
-- /dashboard/system-health, one of the roles in
-- src/lib/company-agents/drafting.ts writes a draft, and it waits here as
-- `pending` until he approves or rejects it. Approving changes this row
-- and NOTHING ELSE: no message is sent, nothing is published or merged.
--
-- WHO WRITES: /api/company-agents/drafts (create) and
-- /api/company-agents/drafts/[id] (decide), service-role client, behind
-- isAdminEmail(). WHO READS: the same owner-only page. RLS is on, there is
-- no policy and every grant is revoked from anon and authenticated, so no
-- signed-in customer can read or write a row.
--
-- `sources` is jsonb because only the web-searching roles have any, and
-- null means "this role does not search" while [] means "it searched and
-- found nothing to cite" — the same distinction the provider layer keeps.
-- `cost_usd` is the model's list price for this one draft, from the same
-- accumulator the rest of the app prices with; null if it could not be priced.
-- `truncated` records a draft cut off at the token ceiling, so it is never
-- read as finished.
--
-- Idempotent: if not exists. How to check it after running:
-- npm run db:pending; /api/health lists company_agent_drafts.
-- How to undo: drop table if exists public.company_agent_drafts;
--   (removes the saved drafts and nothing else: no other table, function
--   or policy is created or touched here).
-- ---------------------------------------------------------------------------

create table if not exists public.company_agent_drafts (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  created_at timestamptz not null default now(),
  brief text not null,
  draft text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_at timestamptz,
  model text,
  truncated boolean not null default false,
  cost_usd numeric,
  sources jsonb
);

create index if not exists company_agent_drafts_created_idx
  on public.company_agent_drafts (created_at desc);

alter table public.company_agent_drafts enable row level security;

revoke all on public.company_agent_drafts from anon;
revoke all on public.company_agent_drafts from authenticated;
