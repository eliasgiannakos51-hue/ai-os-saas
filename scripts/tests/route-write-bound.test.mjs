// A ROUTE THAT GROWS A TABLE, AND NOTHING THAT STOPS IT.
//
// rate-limits.test.mjs is a good gate and it asks a good question: of the
// routes that ARE rate limited, is the scope right, is the identifier the
// account rather than the IP, does a refusal answer 429? Every route it
// iterates is one that already calls checkRateLimit.
//
// So "which routes have no limit at all" was a question nothing asked,
// and the answer on 2026-09-16 was 67 of 143. Most of those are correct:
// a bound is not always a rate limit, and this tree had at least eight
// other kinds — a credit reservation, a cron secret, a plan cap, a seat
// count, a Stripe signature, an owner-only gate, a unique constraint, a
// state precondition. Asking "is it rate limited" of all 143 would have
// produced 67 false positives, which is how a scan gets deleted.
//
// THE QUESTION THAT SURVIVES CONTACT is narrower: which routes INSERT a
// row — grow a table, rather than change one that exists — and what
// bounds the number of times a caller may do it? Four had no answer:
//
//   nav/track              one nav_events row per navigation. The
//                          highest-write path in the product, pruned at
//                          90 days, unbounded inside the window.
//   data-analysis/upload   MAX_UPLOAD_BYTES bounds ONE upload; nothing
//                          bounded how many.
//   mission/schedule-step  its only guard was "this step is already
//                          completed" — a property of the STEP, not of
//                          the caller.
//   auth/device-check      one row per fingerprint the CALLER supplies,
//                          and each new device also sends an email.
//
// THE RULE. Every route that inserts names its bound, and the bound is
// one this file can see in the source or one declared below with the
// argument. A declared bound that can be checked IS checked: a unique
// constraint has to exist in the migrations.
//
// Run: node scripts/tests/route-write-bound.test.mjs
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

// Comments stripped: this file's own header names half these mechanisms,
// and a route whose comment merely MENTIONS checkRateLimit is the case
// the whole exercise exists to stop counting as bounded.
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SOURCE = new Map(routes.map((f) => [f, strip(readFileSync(f, "utf8"))]));

check(`routes found (${routes.length})`, routes.length >= 100, "the walk found almost nothing");

// An INSERT grows a table. An update or an upsert changes a row that is
// already there, and a delete is the cheap direction — none of the three
// can be looped into unbounded storage.
const INSERT = /\.from\(\s*"([a-z_0-9]+)"\s*\)\s*\n?\s*\.insert\s*\(/g;
const inserters = [];
for (const f of routes) {
  const tables = [...new Set([...SOURCE.get(f).matchAll(new RegExp(INSERT.source, "g"))].map((m) => m[1]))];
  if (tables.length) inserters.push({ file: f, tables });
}
check(`routes that insert a row (${inserters.length})`, inserters.length >= 25, "the insert detector matched almost nothing, so every check below passes vacuously");

// THE EIGHT KINDS OF BOUND THIS TREE ACTUALLY USES. Each is a named
// mechanism, not a shape of code — which is why this is a list and not a
// clever rule.
//
// `rate_limit` is a PREDICATE and not a regex, for a reason a mutant
// found: deleting the `scope:` line from a route leaves `checkRateLimit({`
// in place, and a presence check goes on calling that bounded. A limiter
// is three things — the call, the scope it consumes, and a branch that
// acts on the answer — and the middle one is what a careless edit removes.
//
// THE THIRD ONE IS "ACTS ON", NOT "ANSWERS 429", and the difference was
// bought by writing it the strict way first. /api/transitions/record
// returns `{ ok: true, recorded: false }` with a 200 when it refuses,
// deliberately: the caller is a fire-and-forget beacon, and a 429 would
// raise an error in somebody's browser for a write they never asked for.
// That is a correct design, and the first version of this predicate
// called it unbounded. What matters is that `limited.allowed` is
// BRANCHED ON — a limiter consulted and thrown away is a counter.
const BOUNDS = {
  rate_limit: (src) =>
    /checkRateLimit\s*\(/.test(src) &&
    /scope:\s*"[a-z_0-9]+"/.test(src) &&
    // BOTH IDIOMS. Two thirds of these routes write
    // `const limited = await checkRateLimit(...)` and branch on
    // `!limited.allowed`; the rest destructure — `const { allowed } = ...`
    // — and branch on `!allowed`. A rule that knew only the first called
    // /api/documents and /api/delete-account/request unbounded, which is
    // this file's own subject one level down: the check was sound about
    // the spelling it had met.
    (/if\s*\(\s*!\s*[A-Za-z_$][\w$]*\.allowed\s*\)/.test(src) || /if\s*\(\s*!\s*allowed\s*\)/.test(src)),
  own_limiter: /countRateLimitHits\s*\(|recordRateLimitHit\s*\(/,
  cron_secret: /checkCronAuth\s*\(/,
  reservation: /\breserveCredits\s*\(|\bstartJob\s*\(/,
  plan_cap: /maxProjectsForPlan|MAX_MEMBERS|maxAgentsForAccount|checkAgentActivationCap|seat_count|maxIntegrationsForPlan|storageLimitBytes|maxAgentTemplates/,
  free_allowance: /consumeFreeChat/,
  stripe_signature: /constructEvent\s*\(/,
  owner_only: /isAdminEmail\s*\(/,
};
const matches = (test, src) => (typeof test === "function" ? test(src) : test.test(src));
const boundsOf = (f) => Object.entries(BOUNDS).filter(([, test]) => matches(test, SOURCE.get(f))).map(([k]) => k);

// OVER EVERY ROUTE, not only the inserting ones: the floor is asking
// whether the DETECTOR still works, and two of these eight are used only
// by routes that update rather than insert (a cron sweeping rows, the
// login route counting failures). Requiring an inserting member would
// have made the floor a claim about the tree instead of about the regex.
for (const kind of Object.keys(BOUNDS)) {
  check(
    `at least one route is bounded by '${kind}'`,
    routes.some((f) => boundsOf(f).includes(kind)),
    `nothing satisfies the '${kind}' test — a renamed helper turns this kind of bound off silently and every route using it becomes 'unbound'`
  );
}

// ---------------------------------------------------------------------
// The two whose bound is not in the route's own code.
// ---------------------------------------------------------------------
const DECLARED = {
  "src/app/api/favorites/toggle/route.ts": {
    kind: "unique_constraint",
    table: "user_favorites",
    columns: ["user_id", "table_name", "record_id"],
    why: "a favourite is a SET membership: the unique(user_id, table_name, record_id) constraint means the same row cannot be inserted twice, so the ceiling is the number of things that exist to favourite, not the number of calls.",
  },
  "src/app/api/billing/cancel/route.ts": {
    kind: "state_precondition",
    why: "it refuses with 400 unless the account has an ACTIVE subscription, and the insert it makes is the record of cancelling that subscription. A second call finds nothing active and never reaches the insert, so the row count is bounded by how many times an account has actually subscribed.",
  },
};

const unbounded = inserters
  .filter((r) => boundsOf(r.file).length === 0 && !DECLARED[r.file])
  .map((r) => `${r.file.replace("src/app/api/", "").replace("/route.ts", "")} -> ${r.tables.join(", ")}`);
check(
  "every route that inserts a row names what bounds it",
  unbounded.length === 0,
  unbounded.length
    ? `no bound of any of the eight kinds, and no declaration:\n        ${unbounded.join("\n        ")}\n        ` +
      "Add the bound, or declare it here with the argument for why the row count cannot be driven up."
    : ""
);

// A DECLARED BOUND IS CHECKED WHERE IT CAN BE. The unique constraint is
// the checkable kind: it lives in a migration, and without it the whole
// argument above is false.
const MIGRATION_SQL = readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8").replace(/--[^\n]*/g, ""))
  .join("\n");
check(`the migrations were read (${MIGRATION_SQL.length} chars)`, MIGRATION_SQL.length > 100000);

const brokenDeclarations = [];
for (const [file, entry] of Object.entries(DECLARED)) {
  if (!inserters.some((r) => r.file === file)) {
    brokenDeclarations.push(`${file}: declared here but it no longer inserts anything`);
    continue;
  }
  if (boundsOf(file).length > 0) {
    brokenDeclarations.push(`${file}: it has a ${boundsOf(file).join("/")} bound in code now — drop the entry`);
  }
  if (!entry.why || entry.why.length < 60) {
    brokenDeclarations.push(`${file}: the reason is too short to be an argument`);
  }
  if (entry.kind === "unique_constraint") {
    // The constraint may be written as a table-level UNIQUE(...) or added
    // later by ALTER; both spell the column list, so the columns are what
    // is looked for rather than a statement shape.
    const pattern = new RegExp(
      `unique\\s*\\(\\s*${entry.columns.join("\\s*,\\s*")}\\s*\\)`,
      "i"
    );
    if (!pattern.test(MIGRATION_SQL)) {
      brokenDeclarations.push(
        `${file}: no unique (${entry.columns.join(", ")}) on ${entry.table} in any migration — the argument for this entry is not true of the schema`
      );
    }
  }
}
check("every declared bound is still true of the tree", brokenDeclarations.length === 0, brokenDeclarations.join("\n        "));

// ---------------------------------------------------------------------
// CONTROLS, driving boundsOf and the insert detector rather than
// restating them.
// ---------------------------------------------------------------------
const NAV = "src/app/api/nav/track/route.ts";
check("control: nav/track is seen to insert", inserters.some((r) => r.file === NAV && r.tables.includes("nav_events")), "the insert detector no longer sees the highest-write route in the product");
check("control: ...and to be rate limited now", boundsOf(NAV).includes("rate_limit"), "the bound added on 2026-09-16 is gone or invisible");
const STRIPE = "src/app/api/webhooks/stripe/route.ts";
check(
  "control: a checkRateLimit with no scope is not a bound",
  !matches(BOUNDS.rate_limit, 'await checkRateLimit({ identifier: user.id, maxAttempts: 10 });\nreturn NextResponse.json({}, { status: 429 });'),
  "a limiter that consumes no scope counts every route's calls into one bucket, or none"
);
check(
  "control: ...and one whose answer is never branched on is not either",
  !matches(BOUNDS.rate_limit, 'const limited = await checkRateLimit({ scope: "x", identifier: user.id });'),
  "the limiter is consulted and the answer thrown away"
);
check(
  "control: all three together are",
  matches(BOUNDS.rate_limit, 'const limited = await checkRateLimit({ scope: "x", identifier: user.id });\nif (!limited.allowed) return NextResponse.json({}, { status: 429 });')
);
check(
  "control: the destructured idiom counts too",
  matches(BOUNDS.rate_limit, 'const { allowed } = await checkRateLimit({ scope: "x", identifier: user.id });\nif (!allowed) return NextResponse.json({}, { status: 429 });'),
  "two thirds of the tree writes limited.allowed and the rest destructures; both are the same bound"
);
check(
  "control: a refusal that is not a 429 still counts",
  matches(BOUNDS.rate_limit, 'const limited = await checkRateLimit({ scope: "x", identifier: user.id });\nif (!limited.allowed) return NextResponse.json({ ok: true, recorded: false });'),
  "/api/transitions/record refuses this way on purpose — a beacon must not raise an error in the browser"
);
check("control: the Stripe webhook is bounded by its signature, not a limiter", boundsOf(STRIPE).includes("stripe_signature") && !boundsOf(STRIPE).includes("rate_limit"), "if this route ever gains a rate limit the control is simply stale — say so here");

console.log(`\n        ${inserters.length} inserting routes · ${inserters.filter((r) => boundsOf(r.file).length).length} bounded in code · ${Object.keys(DECLARED).length} declared`);
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
