# Diagnostics

Read-only SQL you run in the Supabase editor to ask the database a
question. Nothing here creates, alters or deletes anything, and nothing
here is a migration — `supabase/migrations/` is an ordered path that must
replay from empty in filename order, and a file in it that is not a step
on that path is a category error. `scripts/tests/db-migrations.test.mjs`
enforces that, which is how this directory came to exist.

## check-what-is-missing.sql

Answers "which migrations have not actually landed?".

It exists because `20260819000001_ai_jobs_visibility_repair.sql` records
something this project has hit more than once: a large SQL paste through
the Supabase editor can stop part-way **without reporting an error**. So
"I ran the migrations" and "the objects exist" are different statements,
and the application cannot tell the difference — it simply behaves as
though a feature was never built.

Run it first, then run only the files it lists as MISSING, in filename
order.
