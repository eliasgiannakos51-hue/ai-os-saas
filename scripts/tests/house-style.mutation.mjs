#!/usr/bin/env node
/*
 * CAN house-style.test.mjs SEE A ROUTE WRITTEN OFF TO THE SIDE?
 *
 * The question this gate asks is not "does route X pass check Y" — every
 * other gate asks that. It asks which routes look unlike the tree at all,
 * because a route written somewhere off the usual path is where the next
 * finding lives: the habits it skipped are the ones that make the other
 * gates applicable to it.
 *
 * A NOTE ON WHAT IS NOT MUTATED HERE. Removing ONE logApiError from
 * /api/sample-data does not move this gate, and should not: the threshold
 * is three of six, because five-of-six is ordinary — a GET with no body
 * reads nothing from the request, a webhook logs through its own path —
 * and a gate that fired on a single missing habit would be a linter
 * nobody believes rather than a question about shape. The clauses that
 * carry weight are the register, the distribution and the per-habit
 * floors, and those are what these four drive.
 *
 *   1. the register loses the entry that excuses the one real outlier.
 *   2. the outlier rejoins the house style, so its entry is now false.
 *   3. a habit's pattern stops matching, which would fill the outlier
 *      list with false names rather than leaving it quiet.
 *   4. the house style erodes past the point where "outlier" means
 *      anything at all.
 *
 * Run: node scripts/tests/house-style.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/house-style.test.mjs";
const SHARE = "src/app/r/[code]/route.ts";

const MUTANTS = [
  {
    // THE REGISTER. r/[code] keeps two of six and is right to; the entry
    // is what says so. Without it the gate reports a route that has been
    // deliberate since it was written.
    name: "the one route written off the path loses its written reason",
    file: GATE,
    from: '  "src/app/r/[code]/route.ts":\n    "the affiliate share link.',
    to: '  "src/app/r/[code]/route.ts.unused":\n    "the affiliate share link.',
    expect: "keeps three or fewer of the six house habits",
  },
  {
    // AND THE OTHER DIRECTION. An entry for a route that has since joined
    // the house style is a sentence that has stopped being true — the
    // failure mode lib/absent-on-purpose.mjs exists for.
    name: "the declared outlier quietly rejoins the house style",
    file: SHARE,
    from: "export const dynamic",
    to: 'export async function HEAD(request: Request) {\n  const { data } = await supabase.auth.getUser();\n  try {\n    logApiError("/r", data);\n  } catch {}\n  return NextResponse.json({}, { status: 404 });\n}\nexport const dynamic',
    expect: "outlier declaration has gone stale",
  },
  {
    // THE DETECTOR, not the tree. A habit whose pattern stops matching
    // makes every route look like it dropped that habit, and the outlier
    // list would fill with false names rather than going quiet.
    name: "one habit's pattern stops matching anything",
    file: GATE,
    from: "  logs: /logApiError\\s*\\(/,",
    to: "  logs: /logApiErrorThatNothingCalls\\s*\\(/,",
    expect: "is a habit the tree actually keeps",
  },
  {
    // THE SHAPE ITSELF. If most routes stopped keeping five of six,
    // "outlier" would mean nothing and this gate would be measuring a
    // tree that no longer has a house style to deviate from.
    name: "the house style stops being the majority",
    file: GATE,
    from: "  conforming >= Math.floor(routes.length * 0.85),",
    to: "  conforming >= Math.floor(routes.length * 1.5),",
    expect: "most routes keep five or six",
  },
];

runMutations({
  name: "house-style",
  gate: GATE,
  targets: [SHARE, GATE],
  mutants: MUTANTS,
});
