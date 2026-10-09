#!/usr/bin/env node
/*
 * CAN plan-limit-writes.test.mjs SEE A SOLD LIMIT COME OPEN AGAIN?
 *
 *   1. the 2026-10-08 migration no longer takes the project create away
 *   2. the ledger forgets a row of the pricing page
 *   3. the policy reader stops seeing a dropped policy, so every table
 *      that lost its insert would read as still open — and every
 *      server-written one as fine for the wrong reason
 *   3b. ...or a revoke
 *   4. the catalog reader finds no quantity rows, so nothing is checked
 *   5. an audit row the ledger leans on is marked fixed while the ledger
 *      still calls it open
 *
 * Run: node scripts/tests/plan-limit-writes.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/plan-limit-writes.test.mjs";
const MIGRATION = "supabase/migrations/20261023100000_projects_site_versions_server_written.sql";
const AUDIT = "docs/SECURITY-AUDIT.md";

const MUTANTS = [
  {
    name: "the migration no longer takes the project create away",
    file: MIGRATION,
    from: "drop policy if exists projects_insert_own on public.projects;\nrevoke insert on public.projects from anon, authenticated;\n",
    to: "",
    expect: "projects: the account cannot create projects rows",
  },
  {
    name: "the ledger forgets the projects row",
    file: GATE,
    from: '  projects: { rows: ["projects"], countedIn: "src/app/api/projects/route.ts", countedBy: \'.from("projects")\' },\n',
    to: "",
    expect: "every one is in the ledger",
  },
  {
    name: "the reader stops seeing a dropped policy",
    file: GATE,
    from: "      else if (m[8]) pol(m[8]).delete(m[6] ?? m[7]);",
    to: "      else if (m[8]) void 0;",
    expect: "...its insert policy seen created, then dropped",
  },
  {
    name: "the reader stops seeing a revoke",
    file: GATE,
    from: '(m[9].toLowerCase() === "revoke" ? set.add(v) : set.delete(v));',
    to: "set.delete(v);",
    expect: "...its INSERT seen granted, then revoked",
  },
  {
    name: "the catalog reader finds no quantity rows",
    file: GATE,
    from: 'return cell?.type === "value" || cell?.type === "unlimited";',
    to: 'return cell?.type === "quantity";',
    expect: "the catalog was read",
  },
  {
    name: "the research row is marked fixed while the ledger calls it open",
    file: AUDIT,
    from: "| ΑΣ-4.13 | Το μηνιαίο όριο έρευνας | ανοιχτό |",
    to: "| ΑΣ-4.13 | Το μηνιαίο όριο έρευνας | διορθώθηκε |",
    expect: "deepResearch: still open as ΑΣ-4.13",
  },
];

runMutations({ name: "plan-limit-writes", gate: GATE, targets: [GATE, MIGRATION, AUDIT], mutants: MUTANTS });
