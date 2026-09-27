/*
 * WHAT KIND OF PLACE IS THE BOT POINTED AT?
 *
 * A billable check driven against a deployment with no provider key does
 * not find a broken product. It finds an empty environment — and reports
 * BROKEN, which is the product blamed for where the harness was aimed.
 * It is the same shape as the fifteen red builds of 2026-09-19..26: an
 * instrument running somewhere that does not look like production, with
 * nothing anywhere saying so.
 *
 * IT ASKS THE TARGET, NOT THIS MACHINE. /api/health answers from
 * lib/ai/providers/registry.ts — the same function a real generation
 * resolves its chain through — so "can this deployment call a model" is
 * answered by the deployment, about itself. Reading this machine's
 * ANTHROPIC_API_KEY instead would be the same mistake one level in.
 *
 * IT LIVES IN ITS OWN FILE SO IT CAN BE RUN BY A GATE. scripts/e2e-bot.mjs
 * is a top-level script: importing it starts a run. A unit gate may not
 * bind a port either (billing-coverage.test.mjs §10, and the reason is
 * that a gate needing a working network is a coin flip), so the fetch is
 * a parameter and scripts/tests/bot-environment.test.mjs passes a fake
 * one. The function under test is then the real one, with no server and
 * no network anywhere in the run.
 *
 * THREE ANSWERS, NOT TWO. A deployment too old to carry the `ai` field
 * has not said "no key" — it has said nothing, and the difference
 * matters: refusing to spend against a target that never answered would
 * turn this into a gate on the deploy's age.
 */

/**
 * @param {string} base - the target's origin, no trailing slash
 * @param {(url: string, init?: object) => Promise<{ json(): Promise<any> }>} [fetchImpl]
 */
export async function preflight(base, fetchImpl = globalThis.fetch) {
  try {
    const res = await fetchImpl(`${base}/api/health`, { headers: { Accept: "application/json" } });
    const body = await res.json();
    const ai = body?.ai;
    if (!ai || typeof ai.canCallModel !== "boolean") {
      return { known: false, why: "this deployment's /api/health does not report `ai` — it predates the field" };
    }
    return {
      known: true,
      canCallModel: ai.canCallModel,
      providers: Array.isArray(ai.providers) ? ai.providers : [],
      missing: Array.isArray(ai.missing) ? ai.missing : [],
      schemaOk: body?.schema?.ok,
    };
  } catch (err) {
    return { known: false, why: `/api/health did not answer: ${err?.message ?? err}` };
  }
}

/** The banner line, kept here so the gate reads the same sentence the
 *  operator does rather than a restatement of it. */
export function preflightLine(pre) {
  if (!pre.known) return `  target can call a model: UNKNOWN — ${pre.why}`;
  if (pre.canCallModel) return `  target can call a model: YES (${pre.providers.join(", ")})`;
  return `  target can call a model: NO\n           ${pre.missing.join("; ") || "no provider key"}`;
}
