#!/usr/bin/env node
/*
 * CAN routing-report.test.mjs SEE A WRONG SUM, OR THE PAGE OPEN UP?
 *
 * Scenario 11 is "the admin page shows correct sums", so each mutant is
 * a sum that is plausibly wrong: revenue counted in credits instead of
 * euros, an average over the wrong count, tier shares over rows that
 * have no tier, a projection priced at the model that actually ran, an
 * unreadable log reported as 0%. Scenario 10 is the owner gate, broken
 * the two ways it could be: the check removed, and the component made
 * shippable to a browser.
 *
 * Run: node scripts/tests/routing-report.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/routing-report.test.mjs";
const REPORT = "src/lib/billing/routing-report.ts";
const PAGE = "src/app/dashboard/costs/page.tsx";
const COMPONENT = "src/components/costs/router-report.tsx";

const MUTANTS = [
  {
    name: "revenue counted in credits, not euros",
    file: REPORT,
    from: "revenueEur += num(row.credits_charged) * perCredit;",
    to: "revenueEur += num(row.credits_charged);",
    expect: "revenue €18.20",
  },
  {
    name: "the average divides by the wrong count",
    file: REPORT,
    from: "avgCostPerRequestEur: rows.length > 0 ? costEur / rows.length : null,",
    to: "avgCostPerRequestEur: rows.length > 0 ? costEur / (rows.length + 1) : null,",
    expect: "average per request",
  },
  {
    name: "tier shares divided by every row, decided or not",
    file: REPORT,
    from: "share: b.requests / decided",
    to: "share: b.requests / rows.length",
    expect: "tier shares",
  },
  {
    name: "an unreadable provider log reads as 0% fallback",
    file: REPORT,
    from: "let fallbackShare: number | null = null;",
    to: "let fallbackShare: number | null = 0;",
    expect: "an unreadable provider log is null",
  },
  {
    name: "the projection prices the tokens at the model that ran",
    file: REPORT,
    from: "repriceUsd(usage, routing!.model as string)",
    to: "repriceUsd(usage, model)",
    expect: "projected €2.295",
  },
  {
    name: "the owner check is removed from the page",
    file: PAGE,
    from: "  if (!isAdminEmail(user.email)) notFound();\n",
    to: "",
    expect: "the page refuses everyone but the owner",
  },
  {
    name: "the router section becomes a client component",
    file: COMPONENT,
    from: 'import Link from "next/link";',
    to: '"use client";\nimport Link from "next/link";',
    expect: "server component",
  },
];

runMutations({
  name: "routing-report",
  gate: GATE,
  targets: [GATE, REPORT, PAGE, COMPONENT],
  mutants: MUTANTS,
});
