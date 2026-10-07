#!/usr/bin/env node
/*
 * CAN regenerate-cost.test.mjs SEE A REGENERATE START WITHOUT THE CREDITS,
 * OR THE BUTTON CALL A CHARGED RUN FREE AGAIN?
 *
 * Run: node scripts/tests/regenerate-cost.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/regenerate-cost.test.mjs";
const ROUTE = "src/app/api/websites/[id]/regenerate/route.ts";
const WORKSPACE = "src/components/website-builder/website-builder-workspace.tsx";

const MUTANTS = [
  {
    name: "the regenerate starts without asking the balance",
    file: ROUTE,
    from: "    if (!isAdminEmail(user.email) && !(await hasActiveBetaBypass(user))) {",
    to: "    if (false) {",
    expect: "only admin and beta skip it",
  },
  {
    name: "the balance is asked for nothing",
    file: ROUTE,
    from: "hasEnoughCredits(user.id, estimate.reserveCredits, plan)",
    to: "hasEnoughCredits(user.id, 0, plan)",
    expect: "against the estimate of the same action",
  },
  {
    name: "the refusal goes back to an English sentence",
    file: ROUTE,
    from: '            code: "insufficient_credits",',
    to: '            error: "Not enough credits.",',
    expect: "refuses with a code the screen translates",
  },
  {
    name: "the button says free again",
    file: WORKSPACE,
    from: '                      {t("regeneratePaid", {',
    to: '                      {t("regenerateFree")}{false && t("regeneratePaid", {',
    expect: "...and no longer says free",
  },
];

runMutations({ name: "regenerate-cost", gate: GATE, targets: [ROUTE, WORKSPACE], mutants: MUTANTS });
