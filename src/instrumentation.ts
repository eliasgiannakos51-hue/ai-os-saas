// Runs once when the server process starts (Next's instrumentation hook,
// enabled in next.config.mjs).
//
// RUNTIME ONLY, deliberately. Validating the environment at BUILD time
// would fail deploys for variables that are only set at runtime — a build
// gate that depends on runtime configuration is a broken gate, and this
// project has already lost a deploy to a build doing work it should not.
// So this only ever LOGS: never throws, never exits, never blocks a boot.
export async function register() {
  // The Edge runtime has no access to the full process env and re-runs per
  // request; reporting there would be both wrong and noisy.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportEnvOnce } = await import("@/lib/env-check");
  reportEnvOnce();
}
