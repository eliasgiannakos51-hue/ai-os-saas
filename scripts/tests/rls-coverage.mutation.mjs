#!/usr/bin/env node
/*
 * CAN rls-coverage.test.mjs SEE A TABLE LEFT OPEN?
 *
 * The check it replaces asserted `rlsStatements >= 40` over the whole
 * corpus, so every mutant below would have moved that number UP or left
 * it alone. None of them would have gone red.
 *
 *   1. a table keeps its grants to authenticated and loses its RLS. This
 *      is every row of it readable by every account that has signed up.
 *   2. ai_presentations drops out of the loop that protects it — the
 *      table /dashboard/presentations reads by id, and whose export
 *      routes' comments say "row level security decides whether this deck
 *      may be read".
 *   3. a loop takes its table list from the catalogue instead of a
 *      literal array. Nothing is unprotected, but this gate can no longer
 *      SEE what is protected, which is the failure it must announce
 *      rather than absorb.
 *   4. somebody adds a table and forgets RLS entirely.
 *   5. a migration turns RLS back off.
 *
 * Run: node scripts/tests/rls-coverage.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/rls-coverage.test.mjs";
const BASELINE = "supabase/migrations/20260803000000_baseline_schema.sql";
const TRANSITIONS = "supabase/migrations/20260927000000_transition_suggestions.sql";

const MUTANTS = [
  {
    name: "a table granted to authenticated loses its row level security",
    file: TRANSITIONS,
    from: "alter table public.transition_suggestions enable row level security;",
    to: "",
    expect: "granted to a client role while unprotected",
  },
  {
    name: "ai_presentations drops out of the loop that protects it",
    file: BASELINE,
    from: "      'ai_presentations', 'ai_campaigns'",
    to: "      'ai_campaigns'",
    expect: "every table this schema creates has row level security",
  },
  {
    name: "a loop takes its tables from the catalogue, so the gate goes blind",
    file: BASELINE,
    from: "    select unnest(array[\n      'ai_coding_requests', 'ai_data_analysis_requests', 'ai_documents',\n      'ai_presentations', 'ai_campaigns'\n    ])",
    to: "    select tablename from pg_tables where schemaname = 'public'",
    expect: "cannot read",
  },
  {
    name: "somebody adds a table and forgets row level security",
    file: TRANSITIONS,
    from: "create table if not exists public.transition_suggestions (",
    to: "create table if not exists public.forgotten_table (a int);\n\ncreate table if not exists public.transition_suggestions (",
    expect: "every table this schema creates has row level security",
  },
  {
    name: "a migration turns row level security back off",
    file: TRANSITIONS,
    from: "alter table public.transition_suggestions enable row level security;",
    to: "alter table public.transition_suggestions enable row level security;\nalter table public.rate_limit_log disable row level security;",
    expect: "no migration disables row level security",
  },
];

runMutations({
  name: "rls-coverage",
  gate: GATE,
  targets: [BASELINE, TRANSITIONS],
  mutants: MUTANTS,
});
