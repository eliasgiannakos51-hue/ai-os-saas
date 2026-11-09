#!/usr/bin/env node
/*
 * CAN cost-estimate-remaining.test.mjs SEE THE BALANCE HINT BREAK?
 *
 * An admin account shown a balance number that is never really spent, a
 * balance shown before it has actually been read (a false zero), the
 * drawn line and the field registration saying two different things, the
 * decision re-copied by hand instead of read from the one tested module,
 * and the richer sentence missing or identical to the plain one in a
 * language.
 *
 * Run: node scripts/tests/cost-estimate-remaining.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/cost-estimate-remaining.test.mjs";
const HINT = "src/components/credits/credits-hint.ts";
const VIEW = "src/components/credits/cost-estimate.tsx";
const EN = "messages/en.json";

const MUTANTS = [
  {
    name: "an admin account is shown a balance number too",
    file: HINT,
    from: "return isAdmin || remaining === null ? \"approx\" : \"approxWithRemaining\";",
    to: 'return remaining === null ? "approx" : "approxWithRemaining";',
    expect: "admin: the plain key, whatever the number",
  },
  {
    name: "a balance not yet read is shown as zero",
    file: HINT,
    from: "return isAdmin || remaining === null ? \"approx\" : \"approxWithRemaining\";",
    to: 'return isAdmin ? "approx" : "approxWithRemaining";',
    expect: "balance not read yet (null): the plain key",
  },
  {
    name: "the field registration keeps saying only the price",
    file: VIEW,
    from: "const inField = useFieldCost(credits > 0 ? text(credits) : null);",
    to: 'const inField = useFieldCost(credits > 0 ? t("approx", { count: credits }) : null);',
    expect: "one function builds the text",
  },
  {
    name: "the component re-derives the key by hand instead of the tested module",
    file: VIEW,
    from: 'import { creditsHintKey } from "@/components/credits/credits-hint";',
    to: 'const creditsHintKey = (remaining: number | null, isAdmin: boolean) => (isAdmin ? "approx" : "approxWithRemaining") as "approx" | "approxWithRemaining";',
    expect: "the decision comes from the pure, tested module",
  },
  {
    name: "English's richer sentence is dropped back to the plain one",
    file: EN,
    from: '"approxWithRemaining": "~{count, plural, one {# credit} other {# credits}} · {remaining, plural, one {# credit} other {# credits}} left"',
    to: '"approxWithRemaining": "~{count, plural, one {# credit} other {# credits}}"',
    expect: 'en: it is a different sentence from the plain "approx"',
  },
];

runMutations({
  name: "cost-estimate-remaining",
  gate: GATE,
  targets: [HINT, VIEW, EN],
  mutants: MUTANTS,
});
