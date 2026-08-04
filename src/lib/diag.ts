// Opt-in diagnostic logging.
//
// Several flows (middleware auth, Stripe checkout + webhook, the team
// page gate, Mission Control and Timeline data loads) carry verbose
// tracing that was added to debug them against the real, deployed
// environment — the sandbox can't reach Supabase or Stripe, so a live log
// was the only way to see what actually happened.
//
// The problem with leaving those as bare console.error calls: middleware
// runs on EVERY request, so the tracing writes a line per page view
// forever, at real cost on a hosted log pipeline, and some lines include
// a user id. Deleting them outright would mean re-adding the whole lot by
// hand the next time one of these flows misbehaves in production.
//
// So: keep the call sites, make them silent unless IONEXA_DIAG is set.
// Flip the env var, redeploy, reproduce, read the logs, unset it.
//
// Read once at module load rather than per call — the value cannot change
// within a running process, and this is called from middleware on the hot
// path.
const DIAG_ENABLED = process.env.IONEXA_DIAG === "1";

export function diagLog(message: string): void {
  if (!DIAG_ENABLED) return;
  // console.error, not console.log: this app's hosting captures stderr
  // reliably and treats stdout as best-effort.
  // eslint-disable-next-line no-console
  console.error(message);
}

export function isDiagEnabled(): boolean {
  return DIAG_ENABLED;
}
