#!/usr/bin/env node
/*
 * WOULD THE 2026-09-18 FINDINGS COME BACK UNNOTICED?
 *
 * Each mutation restores one of them exactly as it stood. All of them
 * were green against every other gate in the tree when they shipped:
 * each route was allowed to write, each hold was taken correctly, each
 * caller owned its row. What nothing asked was how the hold ENDED, and
 * whether the thing being charged for was still there afterwards.
 *
 *   1-3   settleReservation writes a zero instead of releasing — the
 *         cost-log row, the two production_errors rows and the owner's
 *         margin-alert email, once per request, during an AI outage.
 *   4-5   api/data-analysis/[id]/analyse charges before it saves, and
 *         logs a failed save instead of refusing.
 *   6-8   api/cron/agent-runs reschedules without looking, so a batched
 *         agent stays due and resubmits every fifteen minutes.
 *   9-11  the register: an unregistered offender, a stale entry, and a
 *         reason that reassures instead of naming a mechanism.
 *   12-13 the gate's own population and stripper.
 *
 * Run: node scripts/tests/reservation-lifecycle.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/reservation-lifecycle.test.mjs";
const RES = "src/lib/billing/reservations.ts";
const ANALYSE = "src/app/api/data-analysis/[id]/analyse/route.ts";
const AGENTS = "src/app/api/cron/agent-runs/route.ts";
const SPEAK = "src/app/api/voice/speak/route.ts";

const MUTANTS = [
  {
    name: "a settlement that measured no call settles a zero again",
    file: RES,
    from: "  if (costs.callCount === 0) {\n    await releaseReservation(userId, reservationId);",
    to: "  if (false) {\n    await releaseReservation(userId, reservationId);",
    expect: "measured no call releases instead",
  },
  {
    // It still releases — but after the RPC has already written the row
    // the release exists to prevent. The half-fix that looks like a fix.
    name: "the release moves to after the RPC has written the row",
    file: RES,
    from: "  if (costs.callCount === 0) {\n    await releaseReservation(userId, reservationId);\n    return {",
    to: "  if (costs.callCount === 0 && realCostUsd < 0) {\n    await releaseReservation(userId, reservationId);\n    return {",
    expect: "measured no call releases instead",
  },
  {
    // The outcome becomes indistinguishable from a broken RPC, which is
    // what every caller branches on.
    name: "the released settlement stops saying it was a release",
    file: RES,
    from: "      settled: false,\n      nothingMeasured: true,",
    to: "      settled: false,\n      nothingMeasured: false,",
    expect: "says so in its result",
  },
  {
    name: "the analysis is charged for before it is saved again",
    file: ANALYSE,
    from: "    const admin = createAdminClient();\n    const { error: saveError } = await admin\n      .from(\"data_analyses\")",
    to: "    const settlementEarly = await settleReservation({\n      userId: user.id,\n      reservationId,\n      feature: \"data_analysis\",\n      costs,\n      plan,\n      bypassCharge: bypass,\n      metadata: { analysisId: params.id },\n    });\n    void settlementEarly;\n    const admin = createAdminClient();\n    const { error: saveError } = await admin\n      .from(\"data_analyses\")",
    expect: "saved BEFORE the charge",
  },
  {
    name: "a failed save is logged and the charge goes through",
    file: ANALYSE,
    from: "      logApiError(\"/api/data-analysis/analyse\", saveError, { stage: \"save_findings\" });\n      await releaseReservation(user.id, reservationId);",
    to: "      logApiError(\"/api/data-analysis/analyse\", saveError, { stage: \"save_findings\" });",
    expect: "releases the hold rather than logging on",
  },
  {
    name: "the batched agent's reschedule goes back to a bare update",
    file: AGENTS,
    from: "              const moved = await rescheduleAgent(\n                admin,\n                agent,\n                { last_run_at: new Date().toISOString(), next_run_at: next?.toISOString() ?? null },\n                \"reschedule_after_batch\"\n              );\n              if (!moved) rescheduleFailures++;",
    to: "              await admin\n                .from(\"user_agents\")\n                .update({ last_run_at: new Date().toISOString(), next_run_at: next?.toISOString() ?? null })\n                .eq(\"id\", agent.id);",
    expect: "no bare next_run_at write remains",
  },
  {
    // The helper survives but stops looking, which is the shape the two
    // original writes had: the statement runs, the result is discarded.
    name: "the helper stops reading the result of its own write",
    file: AGENTS,
    from: "  const { error } = await admin.from(\"user_agents\").update(patch).eq(\"id\", agent.id);\n  if (error) {",
    to: "  const { error } = await admin.from(\"user_agents\").update(patch).eq(\"id\", agent.id);\n  if (false && error) {",
    expect: "ACTS on the error rather than merely destructuring",
  },
  {
    name: "a reschedule that did not land stops reaching the response",
    file: AGENTS,
    from: "      rescheduleFailures,\n      stuckRunsClosed: stuckCount ?? 0,",
    to: "      stuckRunsClosed: stuckCount ?? 0,",
    expect: "counted into the response",
  },
  {
    // voice/speak has exactly one release, so blinding it really does
    // turn the file into an offender rather than leaving a second call
    // behind to satisfy the detector.
    name: "a file reserves without releasing and is not registered",
    file: SPEAK,
    from: "      await releaseReservation(user.id, reservationId);",
    to: "      void reservationId;",
    expect: "voice/speak/route.ts is registered",
  },
  {
    name: "a register entry outlives the file it excuses",
    file: GATE,
    from: '  "src/app/api/insights/generate/route.ts": {\n    mechanism: "settles_unconditionally",',
    to: '  "src/app/api/voice/speak/route.ts": {\n    mechanism: "settles_unconditionally",',
    expect: "is still needed",
  },
  {
    name: "a register reason becomes reassurance",
    file: GATE,
    from: '      "narrateFindings returns per-finding results rather than a failure, so the settle is reached on every path that took a hold.",',
    to: '      "This route has been reviewed and its reservation handling is correct and safe — there is no problem here at all.",',
    expect: "the reason names a mechanism",
  },
  {
    name: "the population scraper goes blind",
    file: GATE,
    from: "const reserves = files.filter((f) => f !== RESERVATIONS && /\\breserveCredits\\s*\\(/.test(SRC.get(f)));",
    to: "const reserves = [];",
    expect: "files that take a credit hold",
  },
  {
    name: "the comment stripper stops running",
    file: GATE,
    from: 'const strip = (t) => t.replace(/\\/\\*[\\s\\S]*?\\*\\//g, "").replace(/^\\s*\\/\\/.*$/gm, "");',
    to: "const strip = (t) => t;",
    expect: "control: the comment stripper runs",
  },
];

runMutations({
  name: "reservation-lifecycle",
  gate: GATE,
  targets: [GATE, RES, ANALYSE, AGENTS, SPEAK],
  mutants: MUTANTS,
});
