# Data Breach Response Plan (V3 Task 15)

The plan you follow ON THE DAY, written before the day. GDPR's 72-hour
supervisory-authority clock starts at AWARENESS, not at understanding —
which is why the first steps are about establishing facts fast.

## Roles

Solo-operator reality: the owner is Incident Commander, Communicator
and Engineer. The value of naming the roles anyway is knowing which hat
you are wearing when you make a decision.

## Phase 1 — Contain (first hour)

1. **Confirm signal.** Sources: error-alert email, uptime monitor,
   a user report via /contact marked security, Supabase logs.
2. **Contain without destroying evidence.** In order of preference:
   rotate the leaked credential (Supabase service key / CRON_SECRET /
   Stripe key / Resend key — all rotatable from their dashboards
   without downtime); disable the affected route by env flag or
   redeploy; Supabase → Auth → revoke sessions if account takeover is
   suspected. Do NOT delete logs or rows — copy them out first.
3. **Snapshot.** Trigger a manual Supabase backup immediately so the
   compromised state is preserved for analysis.

## Phase 2 — Assess (same day)

Answer in writing, timestamped:
- What data categories were accessible/exfiltrated? (map to the GDPR
  export manifest — it is the complete inventory of personal data.)
- Which accounts? (RLS means most bugs scope to one account; a
  service-role key leak scopes to all.)
- Root cause, and is it closed?

## Phase 3 — Notify

- **Supervisory authority**: within 72h of awareness if there is any
  risk to individuals (Art. 33). Filing late with good notes beats
  filing nothing.
- **Affected users**: without undue delay when high risk (Art. 34) —
  plain language: what happened, what data, what we did, what they
  should do (rotate password, watch for phishing). Send via Resend to
  affected accounts only; the welcome-email infrastructure lists all
  senders.
- **Sub-processors**: if the breach originated there (Supabase/Vercel/
  Anthropic/Stripe/Resend), their notification obligations run to us;
  ours to users still stand.

## Phase 4 — Post-incident (within 2 weeks)

Written post-mortem: timeline, root cause, blast radius, what detection
missed, and at least one gate added to `scripts/tests/` that would have
caught it — this codebase's convention is that every incident class
gets a permanent regression gate.

## Contact points

- Security reports in: /contact (marked security) → ADMIN_EMAILS.
- Supabase support, Vercel support, Stripe dashboard, Resend dashboard:
  credentials in the owner's password manager, NOT in this repo.
