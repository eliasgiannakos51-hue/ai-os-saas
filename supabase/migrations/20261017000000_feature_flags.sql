-- ---------------------------------------------------------------------------
-- SWITCHES FOR NEW TOOLS AND BIG CHANGES (2026-10-05, MASTER Μέρος 13 Β).
--
-- «Κάθε νέο εργαλείο και κάθε μεγάλη αλλαγή βγαίνει πίσω από διακόπτη που
-- ανοίγω και κλείνω από τη σελίδα διαχειριστή, χωρίς νέο deploy. Πρώτα
-- ανοίγει μόνο για μένα και τον λογαριασμό δοκιμής. Μετά για όλους.»
--
-- One row per switch: who sees the thing behind it — nobody ('off'), the
-- owner and the test account ('staff'), or everyone. Which switches exist
-- is the code's list (src/lib/flags/flags.ts); this table holds only the
-- owner's choice for each. A switch with no row here is 'staff': a new
-- tool is never shown to customers by the absence of a row.
--
-- Read and written ONLY by the server with the service role
-- (src/lib/flags/flags.ts, src/app/api/system-health/flags/route.ts);
-- the signed-in role has no access at all.
--
-- Idempotent: create table if not exists; the check is named and replaced.
-- How to check it after running: /api/health lists feature_flags
-- (src/lib/health/schema-canaries.ts); /dashboard/system-health shows the
-- switches.
-- How to undo: drop table public.feature_flags;  Every switch then reads
-- as 'staff' again — new tools hidden from customers, visible to you.
-- ---------------------------------------------------------------------------

create table if not exists public.feature_flags (
  key text primary key,
  audience text not null default 'staff',
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table public.feature_flags drop constraint if exists feature_flags_audience_values;
alter table public.feature_flags
  add constraint feature_flags_audience_values check (audience in ('off', 'staff', 'everyone'));

alter table public.feature_flags enable row level security;
revoke all on public.feature_flags from anon, authenticated;
