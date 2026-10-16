#!/usr/bin/env node
/*
 * CAN research-monthly-cap.test.mjs SEE THE ALLOWANCE BECOME
 * REFUNDABLE AGAIN?
 *
 * The cap is the per-account ceiling on the most expensive action in
 * the product. Each mutant puts back one of the ways it stopped being
 * one: counting rows the account can delete, treating a failed count
 * as zero, counting plans that produced no report, and letting the
 * screen keep its own opinion of the number.
 *
 * Run: node scripts/tests/research-monthly-cap.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/research-monthly-cap.test.mjs";
const COUNTER = "src/lib/research/research-usage.ts";
const ROUTE = "src/app/api/research/route.ts";
const PAGE = "src/app/dashboard/deep-research/page.tsx";

const MUTANTS = [
  {
    name: "the count is taken over the reports that still exist",
    file: COUNTER,
    from: `      .from("ai_cost_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("feature", "research_plan")`,
    to: `      .from("research_reports")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)`,
    expect: "it reads the append-only cost log, not the reports",
  },
  {
    // The filter with no precedent: a database that rejects it must not
    // turn every research request into a 503.
    name: "a rejected JSON filter becomes a refusal instead of a fallback",
    file: COUNTER,
    from: "  if (!exact.error) return exact.count ?? 0;",
    to: "  if (true) return exact.error ? null : exact.count ?? 0;",
    expect: "a rejected JSON filter falls back instead of refusing",
  },
  {
    name: "the fallback drops more than the filter it was rejected for",
    file: COUNTER,
    from: "  const all = await planningSettlements();",
    to: '  const all = await createAdminClient().from("ai_cost_log").select("id", { count: "exact", head: true }).eq("user_id", userId);',
    expect: "the fallback query drops that filter and nothing else",
  },
  {
    name: "a count that could not be taken reads as zero",
    file: COUNTER,
    from: '    logApiError("research:countRunsThisMonth", all.error, { userId, stage: "fallback" });\n    return null;',
    to: '    logApiError("research:countRunsThisMonth", all.error, { userId, stage: "fallback" });\n    return 0;',
    expect: "a count that could not be taken is null, not zero",
  },
  {
    name: "a plan that produced no report spends an allowance",
    file: COUNTER,
    from: '  const exact = await planningSettlements().eq("metadata->>outcome", "planned");',
    to: "  const exact = await planningSettlements();",
    expect: "...and only where a plan actually came back usable",
  },
  {
    // The half that made the old comment on the page a promise rather
    // than a fact: two queries that mean the same thing today.
    name: "the screen counts for itself again",
    file: PAGE,
    from: "    countResearchRunsThisMonth(user.id),",
    to: `    supabase
      .from("research_reports")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", new Date().toISOString())
      .then((r) => r.count),`,
    expect: "the screen asks the one counter",
  },
  {
    name: "the route lets a failed count through instead of refusing",
    file: ROUTE,
    from: `      if (used === null) {
        return NextResponse.json({ ok: false, error: "Could not check your research allowance." }, { status: 503 });
      }`,
    to: "      if (used === null) { /* carry on */ }",
    expect: "the route refuses when the count could not be taken",
  },
];

runMutations({ name: "research-monthly-cap", gate: GATE, targets: [COUNTER, ROUTE, PAGE], mutants: MUTANTS });
