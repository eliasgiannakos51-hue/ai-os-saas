// THE ROUTES THAT FOLLOWED NO PATTERN.
//
// Every gate in this project asks whether a route does one particular
// thing: does it authenticate, does it bound, does it charge the caller,
// does it scope to the owner. Each is a good question and each is asked
// of the routes that are in its population.
//
// A DIFFERENT QUESTION, and the one the owner asked: which routes look
// unlike the rest of the tree at all? Not "fails check X" — "was written
// somewhere off to the side, where the habits that make the other checks
// applicable were never picked up". A route like that is where the next
// finding lives, because every population-based gate has to notice it
// first, and the reason it is missing from one is usually the reason it
// is missing from several.
//
// SIX HABITS, and they are habits rather than rules — derived from what
// the majority actually keep rather than from what a linter would like.
// Measured 2026-09-17 over 143 routes: 96 keep all six, 131 keep five or
// more, and exactly two keep three or fewer.
//
// Both of those two were explicable, which is the answer to "are there
// more like the one you found":
//
//   src/app/r/[code]        2 of 6, and correct. The affiliate share
//                           link: the visitor is a stranger by
//                           definition, it touches NO database, it never
//                           validates the code against the table (which
//                           would make it an oracle for enumerating real
//                           codes), and it always redirects to /signup.
//                           There is nothing to authenticate, refuse or
//                           log.
//   src/app/api/sample-data 3 of 6, and one of those was a real gap:
//                           auth and a rate limit, but no try/catch and
//                           no logApiError, so an unexpected throw was an
//                           unlogged 500 and production_errors never
//                           heard about it. Wrapped in the same commit as
//                           this file.
//
// Run: node scripts/tests/house-style.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let pass = 0,
  fail = 0;
function check(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const routes = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry === "route.ts") routes.push(full.replace(/\\/g, "/"));
  }
})("src/app");
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SOURCE = new Map(routes.map((f) => [f, strip(readFileSync(f, "utf8"))]));
check(`routes walked (${routes.length})`, routes.length >= 100, "the walk found almost nothing");

const HABITS = {
  /** Knows who is asking, by any of the four means this tree uses. */
  identity: /auth\s*\.\s*getUser\s*\(|getCurrentUser(?:Result)?\s*\(|checkCronAuth\s*\(|constructEvent\s*\(/,
  /** Can say no, with a status a caller can act on. */
  refuses: /status:\s*40[0-9]|status:\s*503/,
  /** An unexpected failure reaches production_errors instead of vanishing. */
  logs: /logApiError\s*\(/,
  /** ...which requires something to catch it. */
  guardsBody: /try\s*\{/,
  /** Not cached by accident: every route here serves per-account data. */
  dynamic: /export const dynamic/,
  /** Reads its input from the request rather than from ambient state. */
  typedBody: /await request\.json\(\)|request\.formData\(\)|searchParams|params\./,
};
const keptBy = (f) => Object.entries(HABITS).filter(([, re]) => re.test(SOURCE.get(f))).map(([k]) => k);

for (const habit of Object.keys(HABITS)) {
  const n = routes.filter((f) => keptBy(f).includes(habit)).length;
  check(`'${habit}' is a habit the tree actually keeps (${n} routes)`, n >= 40, `only ${n} routes match — this is not a house habit, or the pattern has stopped matching`);
}

// ---------------------------------------------------------------------
// THE OUTLIERS. A floor of FOUR, because five-of-six is ordinary — a GET
// with no body reads nothing from the request, a webhook logs through its
// own path — and a gate that demanded six would be a linter nobody
// believes rather than a question about shape.
// ---------------------------------------------------------------------
const OFF_THE_PATH = {
  "src/app/r/[code]/route.ts":
    "the affiliate share link. The visitor is a stranger by definition — requiring a session would defeat the only thing the URL is for. It touches NO database, so there is nothing to fail or log; it never validates the code against the table, because that would make it an oracle for enumerating real codes; and it always redirects to /signup rather than anywhere the code asks for. Two of six, and every one of the four it drops is dropped on purpose.",
};

const outliers = routes
  .filter((f) => keptBy(f).length <= 3 && !OFF_THE_PATH[f])
  .map((f) => `${f} — keeps ${keptBy(f).length}/6: ${keptBy(f).join(", ") || "none"}`);
check(
  "no route keeps three or fewer of the six house habits",
  outliers.length === 0,
  outliers.length
    ? `${outliers.join("\n        ")}\n        ` +
      "A route written off the usual path is where the next finding lives: the habits it skipped are what make the other gates applicable to it. Bring it back, or declare it here with what it drops and why."
    : ""
);

const staleOutliers = Object.keys(OFF_THE_PATH).filter((f) => !routes.includes(f) || keptBy(f).length > 3);
check(
  "no outlier declaration has gone stale",
  staleOutliers.length === 0,
  staleOutliers
    .map((f) => (!routes.includes(f) ? `${f}: no such route` : `${f}: it keeps ${keptBy(f).length}/6 now — drop the entry`))
    .join("\n        ")
);
for (const [f, why] of Object.entries(OFF_THE_PATH)) {
  check(`${f}: the reason is an argument`, why.length >= 80, why);
}

// THE SHAPE OF THE DISTRIBUTION, asserted rather than printed. A tree
// where half the routes keep four of six is a tree with no house style,
// and every gate that leans on one is then leaning on nothing.
const conforming = routes.filter((f) => keptBy(f).length >= 5).length;
check(
  `most routes keep five or six (${conforming} of ${routes.length})`,
  conforming >= Math.floor(routes.length * 0.85),
  "the house style has stopped being the majority, which makes 'outlier' meaningless"
);

// ---------------------------------------------------------------------
// CONTROLS, driving keptBy on text of their own.
// ---------------------------------------------------------------------
function habitsIn(text) {
  return Object.entries(HABITS).filter(([, re]) => re.test(text)).map(([k]) => k);
}
check("control: a bare handler keeps nothing", habitsIn("export async function GET() { return Response.json({}); }").length === 0);
check(
  "control: the ordinary shape keeps them all",
  habitsIn(
    'export const dynamic = "force-dynamic";\nexport async function POST(request: Request) {\n' +
      "  const { data: { user } } = await supabase.auth.getUser();\n" +
      '  if (!user) return NextResponse.json({}, { status: 401 });\n' +
      "  try { const body = await request.json(); return NextResponse.json(body); }\n" +
      '  catch (err) { logApiError("/x", err); return NextResponse.json({}, { status: 500 }); }\n}'
  ).length === 6
);
check(
  "control: a habit named only in a comment does not count",
  habitsIn(strip("// this one calls logApiError and has a try { } around it\nexport async function GET() {}")).length === 0,
  "the comment stripper is not running"
);

console.log(`\n        ${routes.length} routes · ${conforming} keep 5–6 · ${routes.filter((f) => keptBy(f).length === 6).length} keep all six · ${Object.keys(OFF_THE_PATH).length} declared off the path`);
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
