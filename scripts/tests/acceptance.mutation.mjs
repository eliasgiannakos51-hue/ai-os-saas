#!/usr/bin/env node
/*
 * CAN acceptance.test.mjs SEE A FINAL CHECK THAT CHECKS LESS THAN IT SAYS?
 *
 * A line of Part 16 with no task; a check named that does not exist; a
 * task not built that names a check anyway; a built task that names none
 * and says nothing; a state outside the three words; a switch that is
 * not declared; npm run acceptance not running the runner.
 *
 * Run: node scripts/tests/acceptance.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/acceptance.test.mjs";
const DOC = "docs/ACCEPTANCE.md";
const PKG = "package.json";

const MUTANTS = [
  {
    name: "a line of Part 16 has no task",
    file: DOC,
    from: "### Α13. Slides με γράφημα από αρχείο\n- Πακέτο: 13",
    to: "### Α13. Slides με γράφημα από αρχείο\n- Πακέτο: 113",
    expect: "...and each is the task with its own number",
  },
  {
    name: "a task names a check that does not exist",
    file: DOC,
    from: "`scripts/tests/flows.prodtest.mjs`",
    to: "`scripts/tests/flow.prodtest.mjs`",
    expect: "is a file that exists",
  },
  {
    name: "a task not built names a check, which would measure nothing of it",
    file: DOC,
    from: "- Αυτόματα: χειροκίνητο: το πακέτο δεν έχει φτιαχτεί\n- Σήμερα: δεν φτιάχτηκε (βήμα Η της σειράς)\n\n### Α21.",
    to: "- Αυτόματα: `scripts/tests/routes-smoke.prodtest.mjs`\n- Σήμερα: δεν φτιάχτηκε (βήμα Η της σειράς)\n\n### Α21.",
    expect: "a task not built names no check to run",
  },
  {
    name: "a built task names no check and says nothing",
    file: DOC,
    from: "- Αυτόματα: χειροκίνητο: θέλει αληθινό email",
    to: "- Αυτόματα: κανένας, θέλει αληθινό email",
    expect: "how it runs is a check, or «χειροκίνητο:» and why",
  },
  {
    name: "a state outside the three words",
    file: DOC,
    from: "- Σήμερα: φτιαγμένο\n\n## ΑΠΟ ΤΗΝ ΕΓΓΡΑΦΗ",
    to: "- Σήμερα: έτοιμο\n\n## ΑΠΟ ΤΗΝ ΕΓΓΡΑΦΗ",
    expect: "today is one of",
  },
  {
    name: "a task names a switch that is not declared",
    file: DOC,
    from: "- Σήμερα: φτιαγμένο, πίσω από τον διακόπτη `first-task`",
    to: "- Σήμερα: φτιαγμένο, πίσω από τον διακόπτη `first-tasks`",
    expect: "is declared",
  },
  {
    name: "npm run acceptance does not run the runner",
    file: PKG,
    from: '"acceptance": "node scripts/acceptance.mjs"',
    to: '"acceptance": "node scripts/acceptance.mjs --list"',
    expect: "npm run acceptance runs the runner",
  },
];

runMutations({ name: "acceptance", gate: GATE, targets: [DOC, PKG], mutants: MUTANTS });
