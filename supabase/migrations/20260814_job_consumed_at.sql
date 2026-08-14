-- "I started a build, changed page, came back — and it charged me twice."
--
-- THE BUG THIS CLOSES. Background jobs already survive the page closing
-- (20260812_background_jobs.sql): the worker finishes, the row records the
-- result. But the only query the client used to find its way back —
-- /api/jobs?kind=… — filtered on status in ('queued','running'). A job that
-- FINISHED while the user was on another page was therefore invisible to
-- the page that would have shown it. The draft existed, was paid for, and
-- could not be reached. The user's only move was to ask for it again, and
-- the second request was a second real charge.
--
-- Returning finished jobs as well is not enough on its own: then every
-- reload for the rest of time re-offers the same preview, and "here is the
-- thing you already dismissed" is its own kind of broken. What is missing
-- is a record of whether the user has SEEN the result.
--
-- That is this column. It is not "the job finished" (finished_at already
-- says that) and not "the user acted on it" (the agent row says that) — it
-- is "this result has been put in front of the user", written the moment a
-- preview is rendered or explicitly discarded. Three states, and each one
-- has exactly one honest answer:
--
--   done, consumed_at null, < 24h   -> offer it; they never saw it
--   done, consumed_at set            -> do not; they saw it
--   done, older than 24h             -> do not, seen or not; a day-old
--                                       draft is not what they came for
--
-- Idempotent: safe to run more than once.

alter table public.ai_jobs
  add column if not exists consumed_at timestamptz;

-- The resume query: "my newest finished job of this kind that I have not
-- been shown yet". Partial on exactly the rows that query can match, so it
-- stays small however many finished-and-seen jobs pile up behind it.
create index if not exists ai_jobs_unconsumed_idx
  on public.ai_jobs (user_id, kind, created_at desc)
  where consumed_at is null and status = 'done';

comment on column public.ai_jobs.consumed_at is
  'When the result was SHOWN to the user (preview rendered, or explicitly discarded) — not when the job finished. Null means the result has never been on screen, which is what makes it safe to offer on the next visit instead of letting the user pay to produce it a second time.';

-- No new policy. ai_jobs is still select-own from the browser and
-- service-role for every write: the consume endpoint checks ownership and
-- writes through the admin client, exactly as the worker does. A client
-- that could update this column directly could also mark someone else's
-- job seen, which is a way to make a stranger lose a draft they paid for.
