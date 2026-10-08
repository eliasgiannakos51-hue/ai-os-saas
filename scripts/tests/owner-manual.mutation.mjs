#!/usr/bin/env node
/*
 * CAN owner-manual.test.mjs SEE THE MANUAL LEAD THE OWNER TO NOTHING?
 *
 * A page that moved, a button renamed on screen, a question MASTER asks
 * with no section, a file renamed, an npm script that is not there, a
 * setting name that is not one.
 *
 * Run: node scripts/tests/owner-manual.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/owner-manual.test.mjs";
const OWNER = "docs/OWNER.md";
const EL = "messages/el.json";

const MUTANTS = [
  {
    name: "the manual links to a page that moved",
    file: OWNER,
    from: "https://ai-os-saas-five.vercel.app/dashboard/routing",
    to: "https://ai-os-saas-five.vercel.app/dashboard/model-routing",
    expect: "...each opens a page or a route that exists",
  },
  {
    name: "a button the manual names is renamed on screen",
    file: EL,
    from: '"exportAll": "Εξαγωγή Όλων των Δεδομένων"',
    to: '"exportAll": "Λήψη των δεδομένων μου"',
    expect: "...each is a word on screen today",
  },
  {
    name: "a question MASTER asks has no section",
    file: OWNER,
    from: "## Τι κάνω αν χρήστης ζητήσει επιστροφή χρημάτων",
    to: "## Επιστροφές",
    expect: "...and each is a heading here, in its own words",
  },
  {
    name: "the manual names a file that is not there",
    file: OWNER,
    from: "`docs/MIGRATIONS-HOWTO.md`",
    to: "`docs/MIGRATIONS.md`",
    expect: "exist",
  },
  {
    name: "the manual names an npm script that is not there",
    file: OWNER,
    from: "npm run db:pending",
    to: "npm run db:check",
    expect: "npm scripts named",
  },
  {
    name: "the manual names a setting that is not one",
    file: OWNER,
    from: "`GROQ_API_KEY`",
    to: "`GROQ_KEY`",
    expect: "are ones the code or the key inventory knows",
  },
];

runMutations({ name: "owner-manual", gate: GATE, targets: [OWNER, EL], mutants: MUTANTS });
