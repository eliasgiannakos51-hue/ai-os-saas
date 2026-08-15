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

  // THE COMBINED CEILING, checked against the environment this process is
  // actually running with.
  //
  // The build gate (scripts/tests/combined-ceiling.test.mjs) proves the
  // ceiling holds for the shipped defaults and across every permitted env
  // value. It cannot prove it for THIS deployment, because the build has no
  // access to the production environment — which is the same reason
  // env-check exists and runs here rather than at build time. A deployment
  // whose CREDIT_MARGIN_* or FREE_CHAT_MESSAGES_* combination lands over
  // 25% should say so in the logs on the first boot after the change, not
  // wait to be noticed in a margin report a month later.
  //
  // Logs only. Never throws, never blocks a boot.
  const { combinedCeilingTable } = await import("@/lib/billing/free-allowances");
  const { COMBINED_MARGIN_TARGET } = await import("@/lib/billing/ceiling");
  for (const row of combinedCeilingTable()) {
    if (row.withinCeiling) continue;
    const detail = row.allowances.map((a) => `${a.id}=EUR${a.costEur.toFixed(2)}`).join(" ");
    // eslint-disable-next-line no-console
    console.error(
      `[billing:combinedCeilingBreached] ${row.planSlug}: credits EUR ${row.creditCostEur.toFixed(2)} + ${detail}` +
        ` = EUR ${row.totalCostEur.toFixed(2)}` +
        (row.priceEur === null
          ? " (absolute cap exceeded)"
          : ` = ${((row.totalShare ?? 0) * 100).toFixed(1)}% of EUR ${row.priceEur}` +
            ` — combined ${(row.combinedMargin ?? 0).toFixed(2)}x, target ${COMBINED_MARGIN_TARGET}x`)
    );
  }
}
