-- Admin audit log (directive 42, Κομμάτι 9).
--
-- Every admin action is logged: who, what, when. The admin dashboard reads
-- this table to show the audit trail, and every admin API route writes to
-- it before (or in the same transaction as) the action.
--
-- SECURITY DEFINER + revoked from every signed-in role: only the service-
-- role client can write or read, so a compromised session token cannot
-- tamper with the log or learn what admin actions were taken.
--
-- How to undo: DROP TABLE IF EXISTS admin_audit_log CASCADE;

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_email text    NOT NULL,
  action      text    NOT NULL,
  target_user_id uuid NULL,
  detail      jsonb   NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Fast lookups: by time (the default view), by target user (the user
-- detail pane), by admin (accountability).
CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx
  ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_user_idx
  ON admin_audit_log (target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS admin_audit_log_admin_email_idx
  ON admin_audit_log (admin_email, created_at DESC);

-- NO RLS: the table is accessed only through the service-role client
-- (createAdminClient), which bypasses RLS. Enabling RLS with no policies
-- would make a future accidental use of the user client silently return
-- no rows — safer than leaking, but confusing. The REVOKE below is the
-- real guard.
REVOKE ALL ON admin_audit_log FROM authenticated, anon;

COMMENT ON TABLE admin_audit_log IS
  'Every admin action: who (admin_email), what (action + detail), when (created_at), on whom (target_user_id). Service-role only.';
