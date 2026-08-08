# Operations Runbook (V3 Task 15 — Launch Readiness)

The operational half of launch readiness: backups you can actually
restore, monitoring that actually wakes somebody, and the performance
and encryption facts, stated as they are.

## 1. Backups — and the restore test that makes them real

**What exists.** Supabase runs daily automated backups for every
project; on Pro plan and above, Point-in-Time Recovery (PITR) can be
enabled, giving restore-to-any-minute over the retention window.
The application schema itself is version-controlled in
`supabase_full_project_backup.sql` (idempotent; the RLS gate reads it),
so structure can always be rebuilt from the repo.

**Action required before launch (owner):**
1. Supabase dashboard → Project → Database → Backups: confirm daily
   backups show as succeeding.
2. Enable PITR (Add-on) — the difference between losing "up to a day"
   and "up to two minutes".

**The restore test — run it once BEFORE launch, then quarterly.**
An untested backup is a hope, not a backup:
1. Create a NEW throwaway Supabase project (never restore over prod).
2. Restore the latest backup into it (Backups → Restore → new project),
   or for PITR pick a timestamp from an hour ago.
3. Point a local checkout at it: set `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` to the
   throwaway project's values in `.env.local`, run `npm run build &&
   npx next start`.
4. Log in with a real (restored) account and verify: entries render,
   an import's rows are present, credit balance matches expectation.
5. Record the date, the backup timestamp used, and the wall-clock time
   the restore took, at the bottom of this file. That number IS your
   real RTO.
6. Delete the throwaway project.

**Restore-test log** (append one line per test):

| Date | Backup point | Restore minutes | Verified by |
|------|--------------|-----------------|-------------|
| _pending — run before launch_ | | | |

## 2. Monitoring

**Uptime.** `GET /api/health` is the probe endpoint: public, cheap,
answers 200 `{ok:true,db:true,ms:<n>}` only when the DATABASE
round-trips, 503 otherwise — a monitor pointed at `/` would call a
dead-database app "up". Point an external monitor (UptimeRobot,
Better Stack, Pingdom — any of them) at
`https://<your-domain>/api/health`, 1-minute interval, alerting to the
owner's email AND phone push. This must be an EXTERNAL service: a
monitor hosted in the same infrastructure goes down with it.

**Errors → owner.** Already wired in-app: `logApiError` feeds the
error-alert email (`src/lib/email/error-alert.ts`, sent to
`ADMIN_EMAILS` with its own cooldown so an error storm is one email,
not a thousand), browser-side crashes beacon to `/api/client-error`,
and margin anomalies alert via `margin-alert.ts`. `ADMIN_EMAILS` must
be set in production for any of these to reach a person.

**Response times / error rates.** Vercel's dashboard provides
per-route p75 latency, error rate and Web Vitals out of the box
(Observability tab; enable Web Analytics + Speed Insights on the
project). `/api/health` also returns its own DB round-trip `ms`, which
the uptime monitor graphs over time for free — a slow creep there is
the database asking for attention.

## 3. Encryption at rest

- **Database & storage**: Supabase encrypts all data at rest with
  AES-256 (disk-level, applied to Postgres and Storage buckets alike),
  and TLS in transit. No action required; stated here so the DPA's
  claim is traceable.
- **Secrets**: only in Vercel/Supabase environment configuration —
  never in the repo (the security suite greps for leaked keys).
- **Application-level hashing**: account-deletion tokens are stored
  only as hashes (see the GDPR export's exclusion note); passwords are
  handled entirely by Supabase Auth (bcrypt).
- **Card data**: never touches this infrastructure — Stripe holds it.

## 4. Performance & connection pooling

- **Router Cache**: `staleTimes.dynamic = 0` (next.config.mjs) — every
  dynamic navigation refetches; the refresh bug this fixed is
  documented there.
- **Connection pooling**: the app talks to Postgres exclusively through
  Supabase's PostgREST HTTP API and Supabase's connection pooler
  (Supavisor) sits in front of the database — serverless functions
  never hold direct Postgres connections, so connection exhaustion
  under burst is handled at the platform layer. No pgbouncer to run.
- **Page weight**: `next build` prints first-load JS per route; the
  smoke test (`routes-smoke.prodtest.mjs`) fails any route that
  horizontally overflows at 375px and, as of Task 15, any route whose
  median server render in the production harness exceeds its budget.
- **Web Vitals (LCP, CLS, INP)**: measured on real traffic via Vercel
  Speed Insights (enable on the project). Local harness numbers are
  not Web Vitals; the harness asserts server latency, the field data
  asserts user experience.

## 5. Cron jobs (vercel.json)

| Path | Schedule | Purpose |
|------|----------|---------|
| /api/cron/scheduled-runs | 0 9 * * * | scheduled mission steps |
| /api/cron/agent-runs | */15 * * * * | autonomous agents |
| /api/cron/lifecycle-emails | 0 8 * * * | day-1/3/7/14/30 emails + shipped-request notices |

All fail closed without `CRON_SECRET` (see `lib/cron-auth.ts`).
`/api/cron/reset-credits` and `/api/weekly-digest` exist but are not
scheduled — wire them in vercel.json when wanted.
