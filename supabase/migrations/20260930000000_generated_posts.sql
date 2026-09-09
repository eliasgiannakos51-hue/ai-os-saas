-- ============================================================================
-- GENERATED POSTS (V5 #22)
-- ============================================================================
--
-- One row per generation: the brief, which platforms were asked for, and
-- one post per platform (lib/posts/platforms.ts is the shape of `posts`).
-- Nothing here publishes anything — the roadmap's "Social posting" is
-- the step after this one and is still filed under "soon". The Content
-- tracker (public.content) is untouched: that is where a person TYPES a
-- caption; this is where one is written for them.
--
-- INSERT IS SERVICE-ROLE ONLY, as for code_sessions and
-- data_analysis_questions: the row is created by the route that made the
-- call and knows what it cost. A person who could insert could write
-- themselves a row claiming zero credits for work that cost money, or a
-- post in our voice the model never produced. They may read, retitle and
-- delete their own rows.
--
-- Idempotent. No DROP TABLE, no TRUNCATE, no unqualified DELETE.
-- ============================================================================

create table if not exists public.generated_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  description text not null,
  -- The platforms asked for, in the contract's order. Which ones came
  -- back is what `posts` holds; a platform the model declined is simply
  -- absent there, and the page shows it as such.
  platforms text[] not null default '{}',
  posts jsonb,
  -- The language the posts are written in (resolved from the brief).
  locale text,

  status text not null default 'done' check (status in ('done', 'failed')),
  -- A reason CODE, never a sentence: 'ai_unavailable', 'unusable'.
  error text,
  -- A receipt for the history list, not the ledger.
  credits_charged int not null default 0 check (credits_charged >= 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists generated_posts_user_idx
  on public.generated_posts (user_id, created_at desc);

alter table public.generated_posts enable row level security;

drop policy if exists generated_posts_select_own on public.generated_posts;
create policy generated_posts_select_own on public.generated_posts
  for select using (auth.uid() = user_id);
drop policy if exists generated_posts_update_own on public.generated_posts;
create policy generated_posts_update_own on public.generated_posts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists generated_posts_delete_own on public.generated_posts;
create policy generated_posts_delete_own on public.generated_posts
  for delete using (auth.uid() = user_id);

-- A POLICY WITHOUT A GRANT IS A LOCKED DOOR; a GRANT WITHOUT A POLICY is
-- the door the 20260926 sweep closes. The three verbs with a policy are
-- granted, insert is revoked (the route writes through the service role),
-- and anon holds nothing.
grant select, update, delete on public.generated_posts to authenticated;
revoke insert on public.generated_posts from authenticated;
revoke all on public.generated_posts from anon;

drop trigger if exists set_updated_at on public.generated_posts;
create trigger set_updated_at before update on public.generated_posts
  for each row execute function public.set_updated_at();
