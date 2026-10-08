#!/usr/bin/env node
/*
 * CAN owner-manual.test.mjs SEE THE MANUAL LEAD THE OWNER TO NOTHING?
 *
 * A page that moved, a button renamed on screen, a question MASTER asks
 * with no section, a file renamed, an npm script that is not there, a
 * setting name that is not one; a manual that says the product goes to
 * the next provider where it does not, or leaves out where it does.
 *
 * Run: node scripts/tests/owner-manual.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/owner-manual.test.mjs";
const OWNER = "docs/OWNER.md";
const EL = "messages/el.json";
const SPELLING = "src/lib/websites-greek-spelling-check.ts";

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
  {
    name: "the manual says every provider failure goes to the next one",
    file: OWNER,
    from: "   χρεώνεται, αλλά το Ionexa **δεν** πηγαίνει μόνο του σε άλλον πάροχο.",
    to: "   χρεώνεται, και το Ionexa πηγαίνει μόνο του στον επόμενο πάροχο.",
    expect: "...and says what Chat does when its provider fails",
  },
  {
    name: "the manual leaves out a tool that does go to the next provider",
    file: OWNER,
    from: "   Coding, οι βοηθοί,",
    to: "   οι βοηθοί,",
    expect: "the manual names every one of them",
  },
  {
    name: "a tool the manual names no longer goes to the next provider",
    file: SPELLING,
    from: "    const outcome = await runCompletion(",
    to: "    const outcome = await runCompletionOnce(",
    expect: "...and every name here is still a caller",
  },
];

runMutations({ name: "owner-manual", gate: GATE, targets: [OWNER, EL, SPELLING], mutants: MUTANTS });
