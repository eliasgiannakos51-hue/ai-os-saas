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
const SCHEDULED = "src/app/api/cron/scheduled-runs/route.ts";
const STATUS = "src/app/api/websites/status/route.ts";
const PROCESS = "src/app/api/websites/generate/process/route.ts";
const DELETE_CONFIRM = "src/app/api/delete-account/confirm/route.ts";
const RUN = "src/app/api/research/[id]/run/route.ts";

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
  // ---- THE SECOND SITTING, 2026-09-18: six writes whose error nobody read ----
  {
    name: "a scheduled run's terminal status goes back to a bare update",
    file: SCHEDULED,
    from: '          if (!(await closeRun(admin, run.id, { status: "failed", result: result.error, executed_at: new Date().toISOString() }, "close_run_failed"))) unclosed++;',
    to: '          await admin\n            .from("scheduled_agent_runs")\n            .update({ status: "failed", result: result.error, executed_at: new Date().toISOString() })\n            .eq("id", run.id);',
    expect: "no bare scheduled_agent_runs write is left beside it",
  },
  {
    name: "closeRun stops reading the result of its own write",
    file: SCHEDULED,
    from: '  const { error } = await admin.from("scheduled_agent_runs").update(patch).eq("id", runId);\n  if (error) {',
    to: '  const { error } = await admin.from("scheduled_agent_runs").update(patch).eq("id", runId);\n  if (false && error) {',
    expect: "every terminal status goes through one checked helper",
  },
  {
    name: "an unclosed run stops reaching the cron's output",
    file: SCHEDULED,
    from: "      deferred,\n      unclosed,",
    to: "      deferred,",
    expect: "counted into the response",
  },
  {
    name: "the stuck-generation email goes back to sending before it marks",
    file: SCHEDULED,
    from: '        const { error: markError } = await admin\n          .from("user_websites")\n          .update({ stuck_notified_at: new Date().toISOString() })',
    to: '        const { data: ownerAuthEarly } = await admin.auth.admin.getUserById(website.user_id);\n        if (ownerAuthEarly?.user?.email) {\n          void sendStuckGenerationEmail({ email: ownerAuthEarly.user.email, userId: website.user_id, websiteName: website.name });\n        }\n        const { error: markError } = await admin\n          .from("user_websites")\n          .update({ stuck_notified_at: new Date().toISOString() })',
    expect: "claimed BEFORE every send in the loop",
  },
  {
    name: "the stopped-generation write stops reporting what was charged",
    file: PROCESS,
    from: '            stage: "save_stopped_status",\n            websiteId,\n            creditsCharged: settlement.creditsCharged,',
    to: '            stage: "save_stopped_status",\n            websiteId,',
    expect: "with the amount charged",
  },
  {
    name: "the reaper goes back to claiming a charge is structurally impossible",
    file: STATUS,
    from: '    // stage: "save_stopped_status", so the case is findable instead of',
    to: "    // findable instead of",
    expect: "no longer claims a charge is structurally impossible",
  },
  {
    name: "the deletion token's give-back stops being checked",
    file: DELETE_CONFIRM,
    from: '        const { error: giveBackError } = await admin\n          .from("account_deletion_requests")\n          .update({ used_at: null })',
    to: '        const giveBack = await admin\n          .from("account_deletion_requests")\n          .update({ used_at: null })',
    expect: "the token give-back is checked",
  },
  {
    name: "a failed give-back still tells the user their link works",
    file: DELETE_CONFIRM,
    from: "        if (giveBackError) {",
    to: "        if (false && giveBackError) {",
    expect: "does not say the link still works",
  },
  {
    name: "the research hand-off strands the hold again",
    file: RUN,
    from: '      logApiError("/api/research/[id]/run", holdError, { stage: "record_reservation", reportId: report.id });\n      await releaseReservation(user.id, reservationId);',
    to: '      logApiError("/api/research/[id]/run", holdError, { stage: "record_reservation", reportId: report.id });',
    expect: "releases rather than stranding the hold",
  },
  {
    // The clearance, not the defect: agent-runs' claim is only safe
    // because a null result is treated as "somebody else has it".
    name: "cron/agent-runs' claim stops failing closed",
    file: AGENTS,
    from: "        if (!claimed || claimed.length === 0) {\n          skipped++;",
    to: "        if (claimed && claimed.length === 0) {\n          skipped++;",
    expect: "fails CLOSED",
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
  targets: [GATE, RES, ANALYSE, AGENTS, SPEAK, SCHEDULED, STATUS, PROCESS, DELETE_CONFIRM, RUN],
  mutants: MUTANTS,
});
