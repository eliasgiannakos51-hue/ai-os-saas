-- ---------------------------------------------------------------------------
-- CONNECT BY ADDRESS (2026-10-26, "ALL TOOLS: ΤΟ ΤΕΛΙΚΟ GRID", Phase 2, tool 1).
--
-- One row per app a person connected by its address — an MCP server that
-- answers over Streamable HTTP. The address and the tools it listed are
-- shown back to the person; the token (when the app wants one) is stored
-- only encrypted, with the same key and the same per-user binding as
-- user_integrations and github_connections (src/lib/integrations/crypto.ts).
--
-- WRITTEN BY THE SERVER ONLY. Every insert, update and delete goes through
-- an API route that authenticates, validates the address (lib/mcp/ssrf.ts),
-- does the handshake and encrypts, and writes with the service role. The
-- person may read their own rows and nothing else; and not even the
-- ciphertext column: select is granted on the other columns only.
--
-- Erased with the account: user_id cascades from auth.users.
-- Idempotent: if not exists, drop policy if exists.
-- How to check it after running: npm run db:pending; /api/health lists
-- mcp_servers.
-- How to undo: drop table if exists public.mcp_servers;
--   (removes every connected-by-address app and its stored token, and
--   nothing else: the apps themselves are untouched, and the person can
--   connect them again.)
-- ---------------------------------------------------------------------------

create table if not exists public.mcp_servers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  url text not null check (char_length(url) between 1 and 2048),
  auth_token_encrypted text,
  tools jsonb not null default '[]'::jsonb,
  tools_checked_at timestamptz,
  status text not null default 'connected' check (status in ('connected', 'error')),
  created_at timestamptz not null default now(),
  constraint mcp_servers_one_url_per_user unique (user_id, url)
);

create index if not exists mcp_servers_user_idx on public.mcp_servers (user_id, created_at desc);

alter table public.mcp_servers enable row level security;

drop policy if exists "Users read own MCP servers" on public.mcp_servers;
create policy "Users read own MCP servers"
  on public.mcp_servers for select
  using (auth.uid() = user_id);

revoke insert, update, delete on public.mcp_servers from anon, authenticated;
revoke select on public.mcp_servers from anon, authenticated;
grant select (id, user_id, name, url, tools, tools_checked_at, status, created_at)
  on public.mcp_servers to authenticated;
