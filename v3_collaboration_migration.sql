-- ============================================================================
-- V3 Task 11 — Collaborative projects (missions shared across accounts).
--
-- The "project" is a mission (ai_missions): the one entity in the product
-- with a goal, a plan and a lifecycle. Collaboration here is DISTINCT from
-- the Business plan's team seats and coexists with them: a team seat puts
-- somebody inside the owner's account at the owner's tier; a collaborator
-- is an INDEPENDENT account with its own plan and its own credits that has
-- been granted access to exactly one mission. Nothing a collaborator does
-- is charged to the owner — every AI route charges the session user, and
-- the session user is the collaborator.
--
-- THE PROJECT STAYS WITH THE OWNER. Ownership is never transferred or
-- shared: insert and delete on ai_missions remain owner-only, the owner
-- can revoke any collaborator at any time (delete their row), and deleting
-- the mission cascades every collaboration table away.
--
-- ACCESS IS GRANTED BY EXACTLY ONE CODE PATH. project_collaborators has NO
-- insert policy — deliberately, same reasoning as marketplace_listings: the
-- obvious `with check (auth.uid() = owner_id)` would let an owner mint
-- collaborator rows for users who never consented, and a `with check
-- (auth.uid() = user_id)` would let anyone add themselves to any project.
-- Membership rows are created only by the accept route (service role)
-- after it has verified the token, the invite's status, its age, that the
-- inviter still owns the mission, and that the accepting account's email
-- is the one the invite was addressed to.
-- ============================================================================

-- Invites. Writable by the inviter (owner_id = auth.uid()); the token is
-- what travels in the email. An invite row is NOT access — even a forged
-- row pointing at somebody else's mission grants nothing, because the
-- accept route re-checks that owner_id actually owns project_id before it
-- creates the membership. That check is what makes the permissive insert
-- policy below safe.
create table if not exists public.collaboration_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ai_missions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('editor', 'viewer')),
  -- 32 hex chars from crypto.randomBytes(16) — same entropy budget as the
  -- presentation share slug; this is a credential, not an id.
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_user_id uuid references auth.users(id) on delete set null,
  -- The growth measurement the feature was asked to carry: true when the
  -- account that accepted was CREATED after the invite was sent, i.e. the
  -- invite is what brought them to the product.
  signup_attributed boolean not null default false,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create index if not exists collaboration_invites_owner_idx
  on public.collaboration_invites (owner_id, created_at desc);
create index if not exists collaboration_invites_project_idx
  on public.collaboration_invites (project_id);

alter table public.collaboration_invites enable row level security;

drop policy if exists "select_own_collaboration_invites" on public.collaboration_invites;
create policy "select_own_collaboration_invites" on public.collaboration_invites
  for select using (auth.uid() = owner_id);

drop policy if exists "insert_own_collaboration_invites" on public.collaboration_invites;
create policy "insert_own_collaboration_invites" on public.collaboration_invites
  for insert with check (auth.uid() = owner_id);

-- Owners can revoke (status change) and tidy up. The invitee never
-- touches this table directly — the accept route acts for them.
drop policy if exists "update_own_collaboration_invites" on public.collaboration_invites;
create policy "update_own_collaboration_invites" on public.collaboration_invites
  for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

drop policy if exists "delete_own_collaboration_invites" on public.collaboration_invites;
create policy "delete_own_collaboration_invites" on public.collaboration_invites
  for delete using (auth.uid() = owner_id);

-- Membership. NO insert policy — see the header. No update policy either:
-- changing a role is revoke + reinvite, which keeps every grant an
-- explicit, consented act.
create table if not exists public.project_collaborators (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ai_missions(id) on delete cascade,
  -- Denormalised owner: lets the owner's policies on this table avoid a
  -- join back to ai_missions, and pins WHO granted the access.
  owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create index if not exists project_collaborators_user_idx
  on public.project_collaborators (user_id);
create index if not exists project_collaborators_project_idx
  on public.project_collaborators (project_id);

alter table public.project_collaborators enable row level security;

-- Both sides can see the membership; the owner can revoke it and the
-- collaborator can leave. Those four verbs are the whole lifecycle.
drop policy if exists "select_project_collaborators" on public.project_collaborators;
create policy "select_project_collaborators" on public.project_collaborators
  for select using (auth.uid() = owner_id or auth.uid() = user_id);

drop policy if exists "delete_project_collaborators" on public.project_collaborators;
create policy "delete_project_collaborators" on public.project_collaborators
  for delete using (auth.uid() = owner_id or auth.uid() = user_id);

-- Membership checks for OTHER tables' policies. SECURITY DEFINER on
-- purpose: a policy subquery runs as the querying user, so ai_missions'
-- shared-select policy consulting project_collaborators directly would be
-- filtered by project_collaborators' own RLS — correct here, but fragile
-- (it works only while that table's select policy covers the same rows)
-- and one policy edit away from silent lockout. The function reads with
-- definer rights, takes the project id alone, and answers only for
-- auth.uid() — it cannot be pointed at another user.
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.project_collaborators
    where project_id = p_project_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_project_editor(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.project_collaborators
    where project_id = p_project_id and user_id = auth.uid() and role = 'editor'
  );
$$;

-- The grant that makes sharing real: collaborators can read the mission,
-- editors can update it. Insert and delete are NOT extended — the project
-- stays with the owner. These are additive permissive policies; the
-- owner's own policies above them are untouched.
drop policy if exists "select_shared_ai_missions" on public.ai_missions;
create policy "select_shared_ai_missions" on public.ai_missions
  for select using (public.is_project_member(id));

drop policy if exists "update_shared_ai_missions" on public.ai_missions;
create policy "update_shared_ai_missions" on public.ai_missions
  for update using (public.is_project_editor(id))
  with check (public.is_project_editor(id));

-- Activity. Append-only by construction: no update or delete policy
-- exists, so history cannot be rewritten by anyone, owner included.
create table if not exists public.collaboration_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ai_missions(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('invited', 'joined', 'revoked', 'left', 'step_completed', 'step_reopened')),
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists collaboration_activity_project_idx
  on public.collaboration_activity (project_id, created_at desc);

alter table public.collaboration_activity enable row level security;

drop policy if exists "select_collaboration_activity" on public.collaboration_activity;
create policy "select_collaboration_activity" on public.collaboration_activity
  for select using (
    auth.uid() in (select user_id from public.ai_missions where id = project_id)
    or public.is_project_member(project_id)
  );

-- Writers log only as themselves, and only into projects they belong to.
drop policy if exists "insert_collaboration_activity" on public.collaboration_activity;
create policy "insert_collaboration_activity" on public.collaboration_activity
  for insert with check (
    auth.uid() = actor_id
    and (
      auth.uid() in (select user_id from public.ai_missions where id = project_id)
      or public.is_project_member(project_id)
    )
  );
