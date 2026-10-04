-- THE ACTIVITY TIMELINE OF A WEBSITE GENERATION — V6.2 2.1, slice 5.
--
-- The builder showed rotating "progress" sentences that were not tied to
-- any real phase (components/website-builder/website-builder-workspace.tsx
-- said so in its own comment). The worker
-- (app/api/websites/generate/process/route.ts) now records its five real
-- phases here — preparing, writing, photos, checking, saving — with what
-- each found (pages written, photos placed), and on completion each
-- step's SHARE of the AI cost as a per-mille weight.
--
-- NO MONEY IS STORED. The weights are relative (they sum to about 1000),
-- so this column can reach a browser through any route that returns the
-- row and still says nothing about what a generation cost us.
-- lib/websites/website-timeline.ts turns it into steps with credits, split
-- from the generation's real charge.
--
-- Additive and safe to run twice. Until it is run, the worker's timeline
-- writes fail on the unknown column and are ignored on purpose — they are
-- separate updates, never part of the status or content writes — so an
-- un-migrated database generates websites exactly as before, without a
-- timeline.

alter table public.user_websites
  add column if not exists timeline jsonb not null default '[]'::jsonb;

comment on column public.user_websites.timeline is
  'One entry per generation phase: {at, step, evidence, weight}. Written by api/websites/generate/process; read through lib/websites/website-timeline.ts. Weights are per-mille shares, never money.';
