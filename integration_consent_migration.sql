-- ============================================================================
-- Integration consent — the record of what a person actually agreed to.
--
-- Standalone, additive, idempotent. Safe to run on a project that already
-- has v3_integrations_migration.sql applied.
--
-- WHY A SEPARATE TABLE FROM user_integrations.
--
-- user_integrations answers "is this connected right now". That is not the
-- same question as "did this person agree, when, and to what wording" —
-- and the second question is the one that matters when somebody asks why
-- an AI has been reading their mail. A grant that is deleted on disconnect
-- (which user_integrations rows are, by design, because erasure means the
-- token goes) takes the evidence of consent with it. So consent is kept
-- separately, revoked rather than deleted, and outlives the connection it
-- authorised.
--
-- WHAT IS RECORDED, and why each column is here:
--   * the exact SCOPES the user was shown, not the ones we later asked for
--   * the VERSION of the consent wording, so "they agreed" can be checked
--     against what the screen actually said at the time
--   * the PURPOSE in the words the user read, because "what data" without
--     "what for" is not informed consent under GDPR Art. 4(11)
--   * granted_at and revoked_at, both to the second
--
-- WHAT IS NOT RECORDED: no IP address, no raw user agent, no device
-- fingerprint. Those would be new personal data collected in the name of
-- protecting personal data, and none of them is needed to answer any of
-- the questions above.
-- ============================================================================

create table if not exists public.integration_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Same provider vocabulary as user_integrations. Gmail and Drive stay
  -- separate here for the same reason they are separate there: agreeing to
  -- let the AI read your files is not agreeing to let it read your mail.
  provider text not null check (provider in ('gmail', 'google_drive', 'slack')),

  -- The scopes AS SHOWN ON THE CONSENT SCREEN. Copied at grant time rather
  -- than read back from the provider registry later: if a future release
  -- widens a scope, this row must still say what this person agreed to.
  scopes text[] not null default '{}',

  -- Identifies the wording. Bumping it in lib/integrations/consent.ts
  -- invalidates every existing consent and forces a fresh screen — which
  -- is the point: silently reusing an old agreement for new wording is how
  -- consent records become decoration.
  consent_version text not null,

  -- Why, in the user's language, exactly as displayed.
  purpose text not null,

  granted_at timestamptz not null default now(),

  -- Null means live. Revoking sets this; the row is never deleted while
  -- the account exists, because the question "was there ever consent for
  -- this, and when did it end" has to stay answerable.
  revoked_at timestamptz,
  revoke_reason text
    check (revoke_reason is null or revoke_reason in ('user_revoked', 'superseded'))
);

-- The hot query: "does this user have a live consent for this provider at
-- the current wording version". Partial, because revoked rows are history
-- and never participate in that check.
create unique index if not exists integration_consents_active_key
  on public.integration_consents (user_id, provider)
  where revoked_at is null;

create index if not exists integration_consents_user_granted_idx
  on public.integration_consents (user_id, granted_at desc);

alter table public.integration_consents enable row level security;

-- The user can READ their own consent history. That is the whole point of
-- keeping it: it is their record, about them.
drop policy if exists "select_own_integration_consents" on public.integration_consents;
create policy "select_own_integration_consents" on public.integration_consents
  for select using (auth.uid() = user_id);

-- DELIBERATELY NO INSERT, UPDATE OR DELETE POLICY.
--
-- A consent record a client can write is not evidence of anything — a
-- browser that can insert "granted" can insert it without a human ever
-- seeing the screen, and a browser that can update can rewrite what was
-- agreed to after the fact. Only the service-role client writes here, from
-- api/integrations/[provider]/consent, which is the one code path that has
-- actually rendered the wording being agreed to.
--
-- Revocation is a write too, and goes through the same route for the same
-- reason. The user's right to revoke is served by that endpoint always
-- succeeding, not by handing them an UPDATE grant on their own audit log.
--
-- Erasure is covered: the user_id foreign key cascades from auth.users, so
-- deleting the account deletes the consent history with it.

-- ----------------------------------------------------------------------------
-- Convenience view for the Settings screen: current state per provider,
-- newest first, with the live one (if any) distinguishable at a glance.
-- Security-invoker so it is subject to the caller's RLS rather than the
-- definer's — a view is not a way around the policies above.
-- ----------------------------------------------------------------------------
create or replace view public.integration_consent_history
with (security_invoker = true)
as
  select
    id,
    user_id,
    provider,
    scopes,
    consent_version,
    purpose,
    granted_at,
    revoked_at,
    revoke_reason,
    (revoked_at is null) as is_active
  from public.integration_consents
  order by granted_at desc;
