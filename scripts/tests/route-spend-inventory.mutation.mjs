#!/usr/bin/env node
/*
 * CAN route-spend-inventory.test.mjs SEE A ROUTE LEAVE THE SYSTEM?
 *
 * The gate exists because the OTHER billing gate asks "do you settle
 * correctly", and a route that never settles is not asked anything. So
 * every mutant here is a route quietly stepping outside a bound, in one of
 * the ways it has actually happened in this tree:
 *
 *   1-2. a scope is changed to one another route already uses. Nothing
 *        breaks, nothing logs, and the two routes now share one budget —
 *        the first caller to exhaust it locks out the second.
 *   3.   the limiter is consumed and its answer thrown away. This is the
 *        shape a limiter decays into: the call stays, the refusal goes.
 *   4-5. the export guard is deleted from a PDF route. This is the exact
 *        defect the round of 2026-09-16 fixed, re-introduced.
 *   6.   startJob stops taking the hold. Every background job — website
 *        generation, mission planning, files/ask, research — runs free,
 *        and the eight routes that reach the billing system only through
 *        startJob fall out of it at once. This is the mutant that drives
 *        the FIRST check, the one that asks who is not here.
 *
 * Run: node scripts/tests/route-spend-inventory.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/route-spend-inventory.test.mjs";
const GUARD = "src/lib/export-guard.ts";
const NOTIFY = "src/app/api/notifications/channels/route.ts";
const PPTX = "src/app/api/presentations/[id]/pptx/route.ts";
const MISSION = "src/app/api/mission/[id]/pdf/route.ts";
const START_JOB = "src/lib/jobs/start-job.ts";

// One line, for the reason in the shape note at the top of
// scripts/tests/lib/mutation-runner.mjs.
const EXPORT_BLOCK = ['    // Free on purpose — this was paid for when it was written — but not', '    // unbounded: see lib/export-guard.ts for why those are two questions.', '    if (!(await allowExport(user.id))) {', '      return NextResponse.json({ error: "too_many_exports" }, { status: 429 });', '    }', '', ''].join("\n");

// Top-level declaration, under the name the reader looks for — see the
// SHAPE note in scripts/tests/lib/mutation-runner.mjs.
const MUTANTS = [
  {
    name: "the four exports start eating the file-download budget instead of their own",
    file: GUARD,
    from: '    scope: "document_export",',
    to: '    scope: "file_download",',
    expect: "declared scope document_export",
  },
  {
    name: "the two test-message routes are given one shared budget",
    file: NOTIFY,
    from: '      scope: "notification_channel_test",',
    to: '      scope: "delivery_channel_test",',
    expect: "declared scope notification_channel_test",
  },
  {
    name: "the channel test consumes its limiter and ignores the answer",
    file: NOTIFY,
    from: `    if (!limited.allowed) {
      return NextResponse.json(
        { error: "too_many_tests" },
        { status: 429 }
      );
    }`,
    to: "",
    expect: "never answers 429",
  },
  {
    name: "the .pptx export goes back to unbounded",
    file: PPTX,
    from: EXPORT_BLOCK,
    to: "",
    expect: "never answers 429",
  },
  {
    name: "the mission-plan PDF goes back to unbounded",
    file: MISSION,
    from: EXPORT_BLOCK,
    to: "",
    expect: "never answers 429",
  },
  {
    name: "every background job stops holding credits",
    file: START_JOB,
    from: "  const reservation = await reserveCredits(userId, reserve, kind, reserveMetadata);",
    to: '  const reservation = { ok: true, reservationId: "", reserved: 0 } as Awaited<ReturnType<typeof reserveCredits>>;',
    expect: "either reserves credits or is declared",
  },
];

runMutations({
  name: "route-spend-inventory",
  gate: GATE,
  targets: [GUARD, NOTIFY, PPTX, MISSION, START_JOB],
  mutants: MUTANTS,
});
