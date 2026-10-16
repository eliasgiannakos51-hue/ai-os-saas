#!/usr/bin/env node
/*
 * CAN team-grant.test.mjs SEE THE REMOVAL GO BACK TO SAYING «DONE»
 * WHEN IT DID NOTHING?
 *
 * The route has two halves — take back the tier the team lent, and
 * delete the row that records the loan. Each mutant puts back one of
 * the three ways the old version could finish the second half and skip
 * the first while still answering ok: true.
 *
 * Run: node scripts/tests/team-remove-order.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/team-grant.test.mjs";
const ROUTE = "src/app/api/team/remove/route.ts";

const MUTANTS = [
  {
    name: "a failed metadata write is a log line again, and the answer is «done»",
    file: ROUTE,
    from: `          stage: "revoke_access",
        });
        return NextResponse.json(
          { ok: false, error: "Could not remove member. Please try again." },
          { status: 500 }
        );`,
    to: `          stage: "revoke_access",
        });`,
    expect: "a revoke that failed is a refusal",
  },
  {
    name: "a member account that cannot be read is skipped rather than refused",
    file: ROUTE,
    from: `      if (getUserError || !memberData?.user) {
        logApiError("/api/team/remove", getUserError ?? new Error("member account not found"), {
          stage: "get_member_user",
        });
        return NextResponse.json(
          { ok: false, error: "Could not remove member. Please try again." },
          { status: 500 }
        );
      }`,
    to: `      if (getUserError || !memberData?.user) {
        logApiError("/api/team/remove", getUserError ?? new Error("member account not found"), {
          stage: "get_member_user",
        });
      }`,
    expect: "a member account that cannot be read is a refusal",
  },
  {
    // The old shape exactly: the caller is told it worked before the
    // row has gone, so the revoke above it can fail quietly.
    name: "«done» is answered before the member is removed",
    file: ROUTE,
    from: "    // THE SERVER'S WRITE (20261014000000_server_written_tables.sql): a",
    to: `    if (member.member_user_id) return NextResponse.json({ ok: true });

    // THE SERVER'S WRITE (20261014000000_server_written_tables.sql): a`,
    expect: "nothing answers «done» before the member is actually removed",
  },
];

runMutations({ name: "team-remove-order", gate: GATE, targets: [ROUTE], mutants: MUTANTS });
