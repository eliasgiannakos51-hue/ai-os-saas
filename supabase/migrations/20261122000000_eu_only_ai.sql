-- ---------------------------------------------------------------------------
-- «ΜΟΝΟ ΕΥΡΩΠΗ» (agent/mistral, 2026-11-07): the account's own promise
-- that every AI call this product makes for it is served by a provider
-- physically in the EU — Mistral AI (lib/ai/providers/catalog.ts's
-- PROVIDER_REGION), never a silent fallback to Anthropic, OpenAI, Google
-- or Groq, all four of which are US companies.
--
-- How to undo: alter table public.user_credits drop column if exists eu_only_ai;
--   (every account's setting is forgotten; runCompletion then resolves
--   "not EU-only" for everyone, which is the same as today before this
--   migration ever ran. Nothing in Discord, a website, or any other
--   feature is affected — this column is read by exactly one function,
--   lib/ai/providers/eu-only.ts's resolveAccountEuOnly.)
--
-- Default false: the setting is an opt-in promise, not a restriction
-- turned on for every existing account the moment this column exists.
-- ---------------------------------------------------------------------------

alter table public.user_credits
  add column if not exists eu_only_ai boolean not null default false;

comment on column public.user_credits.eu_only_ai is
  '«Μόνο Ευρώπη»: when true, lib/ai/providers/complete.ts refuses rather than route any AI call for this account to a non-EU provider. Written only by api/settings/eu-only/route.ts through the service role, filtered to the caller''s own id — the select_own_user_credits policy already lets the account read its own row.';
