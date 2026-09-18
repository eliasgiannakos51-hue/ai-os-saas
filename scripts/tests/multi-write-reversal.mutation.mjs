#!/usr/bin/env node
/*
 * WOULD THE THREE DEFECTS OF 2026-09-19 COME BACK UNNOTICED?
 *
 * Each mutation below restores one of them exactly as it stood. Every
 * other gate in the tree stays green through all three — that is what
 * made them survive: each route is allowed to write, each write is
 * bounded, each caller is the owner. What nothing asked was what is left
 * when the second write does not happen.
 *
 *   1-2  the scheduled run that matched nothing kept its hold, while the
 *        branch four lines above released one.
 *   3-5  the recurring add-on with a null subscription item was skipped
 *        and then marked cancelled — delivery stopped, billing did not.
 *   6-8  the rollback restored a home page and left the sub-pages at the
 *        newer version.
 *   9-10 the gate's own population and stripper.
 *
 * Run: node scripts/tests/multi-write-reversal.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/multi-write-reversal.test.mjs";
const CRON = "src/app/api/cron/scheduled-runs/route.ts";
const ADDONS = "src/app/api/billing/addons/route.ts";
const ROLLBACK = "src/app/api/published/[id]/rollback/route.ts";

const MUTANTS = [
  {
    name: "a scheduled run that matched nothing keeps its hold again",
    file: CRON,
    from: "          await releaseReservation(userId, runReservationId);\n          await admin\n            .from(\"scheduled_agent_runs\")\n            .update({ status: \"failed\", result: result.message, executed_at: new Date().toISOString() })",
    to: "          await admin\n            .from(\"scheduled_agent_runs\")\n            .update({ status: \"failed\", result: result.message, executed_at: new Date().toISOString() })",
    expect: "matched nothing releases its hold",
  },
  {
    // The neighbour that was always correct. If the pair can be
    // half-right in one direction it can be half-right in the other.
    name: "the failed-call branch beside it stops releasing",
    file: CRON,
    from: "        if (!result.ok) {\n          await releaseReservation(userId, runReservationId);",
    to: "        if (!result.ok) {",
    expect: "failed-call branch beside it",
  },
  {
    name: "a recurring add-on with no item id is skipped again",
    file: ADDONS,
    from: "      if (!itemId) {\n        itemId = await recoverSubscriptionItemId(stripe, user, slug);",
    to: "      if (!itemId) continue;\n      if (false) {\n        itemId = await recoverSubscriptionItemId(stripe, user, slug);",
    expect: "never skipped",
  },
  {
    // The recovery lookup goes blind: it compiles, it returns null every
    // time, and the route then refuses every cancellation. Red on the
    // clause that says HOW the id is recovered, not on the one that says
    // a failure refuses — which is the distinction worth keeping.
    name: "the recovery stops looking at the subscription's items",
    file: ADDONS,
    from: "    return subscription.items.data.find((i) => i.price.id === priceId)?.id ?? null;",
    to: "    void subscription;\n    return null;",
    expect: "recovered from the account's subscription",
  },
  {
    // The dangerous direction: a failed recovery falls through to the
    // local cancellation instead of refusing.
    name: "a failed recovery cancels locally anyway",
    file: ADDONS,
    from: "            { status: 502 }\n          );\n        }\n        // Write it back",
    to: "            { status: 200 }\n          );\n        }\n        // Write it back",
    expect: "refuses rather than cancelling locally",
  },
  {
    name: "the rollback stops reading the version's pages",
    file: ROLLBACK,
    from: '.select("id, html_content, pages, version_number")',
    to: '.select("id, html_content, version_number")',
    expect: "reads the version's pages",
  },
  {
    name: "the rollback writes the home page and not the sub-pages",
    file: ROLLBACK,
    from: "        pages: restoredPages.length > 0 ? restoredPages : null,\n        status: \"live\",",
    to: "        status: \"live\",",
    expect: "writes them back to the published snapshot",
  },
  {
    // The sub-pages go live without being scanned — the case
    // api/websites/[id]/publish gives its own reason for refusing.
    name: "only the home page is scanned on the way out",
    file: ROLLBACK,
    from: "    const issues = [html, ...restoredPages.map((pg) => pg.html)].flatMap((doc) =>",
    to: "    const issues = [html].flatMap((doc) =>",
    expect: "scans every document it is about to serve",
  },
  {
    // The population going empty: every clause above is about three named
    // routes, and the floor is what says the question is still being
    // asked of a real set rather than of three files somebody listed.
    name: "the write detector stops matching, so the population empties",
    file: GATE,
    from: "const writesIn = (src) =>",
    to: "const writesIn = () => 0;\nconst __unused = (src) =>",
    expect: "two or more distinct writes",
  },
  {
    // Two of the three routes quote their old broken form while
    // explaining why it is gone. Without the stripper the explanation
    // reads as the defect.
    name: "the comment stripper stops running, so the note about the fix reads as the fix",
    file: GATE,
    from: 'const strip = (t) => t.replace(/\\/\\*[\\s\\S]*?\\*\\//g, "").replace(/^\\s*\\/\\/.*$/gm, "");',
    to: "const strip = (t) => t;",
    expect: "never skipped",
  },
];

runMutations({ name: "multi-write-reversal", gate: GATE, targets: [GATE, CRON, ADDONS, ROLLBACK], mutants: MUTANTS });
