-- "Done — 0 credits." on an account that is never charged.
--
-- WHAT IT LOOKED LIKE. An owner ran an agent and was told it cost zero,
-- then read the same zero in the run history, while the margin report on
-- the next page showed real euros of Anthropic spend for the same run.
-- Two numbers about one event that cannot both be right, on the screens a
-- person uses to understand their own costs. Zero is arithmetically true —
-- admins and beta testers are not charged — and it says the opposite of
-- what happened: it reads as billing being broken.
--
-- WHAT WAS ALREADY THERE. settleReservation has computed
-- wouldHaveChargedCredits since the bypass path existed, precisely so a
-- free row is distinguishable from a broken one, and writes it into
-- ai_cost_log.metadata. That answers "was it recorded" — it was, on every
-- bypass settlement. It simply never came back out: SettlementResult did
-- not carry it, so no surface could show it.
--
-- WHY A COLUMN RATHER THAN A JOIN. The run history reads agent_runs and
-- nothing else. Reaching the number through ai_cost_log would mean joining
-- a table the browser cannot see (service-role only) on a metadata key,
-- per row, to render a list. The value is decided once at settlement and
-- never changes, so it belongs on the row it describes.
--
-- NULLABLE, and the null means something: "this run was really charged —
-- credits_charged is the answer". A zero here would claim the run would
-- have been free, which is a different and false statement.
--
-- NUMBERED 20260817000002 THOUGH IT WAS WRITTEN ON THE 18TH. The prefix is
-- an ordering key, not a date, and 20260818000000_function_grants.sql has
-- to run LAST — it loops over pg_proc and can only cover routines that
-- already exist. This file creates no routine, so the grants pass has
-- nothing to do for it either way; sorting it before rather than after is
-- what keeps "function grants is always the last file" true by inspection
-- instead of by argument.
--
-- Idempotent: add-column-if-not-exists, safe to run more than once. No
-- backfill — runs that happened before this column existed genuinely do
-- not have the number anywhere except ai_cost_log.metadata, and inventing
-- one from a later price would misreport history. Those rows keep null and
-- the UI says "unlimited" without a figure, which is true.

alter table public.agent_runs
  add column if not exists would_have_charged_credits int;

comment on column public.agent_runs.would_have_charged_credits is
  'On an account that is never charged (admin, beta tester), what this run WOULD have cost in credits. NULL means the run was actually charged — credits_charged is the real figure then. Written by lib/agents/execute-agent.ts from settleReservation; the same number is in the matching ai_cost_log row metadata.';

-- No policy change. agent_runs is already select-own from the browser and
-- service-role for every write (20260803000000_baseline_schema.sql); a new
-- column inherits both, and a column-level grant would be the wrong tool
-- here because nothing in a browser writes to this table at all.
