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
// A ROUTE THAT SENDS A MESSAGE OUTWARD NEEDS A RATE LIMIT SPECIFICALLY.
//
// A PLAN CAP IS A PRESENCE CHECK, AND A CEILING OF INFINITY IS NOT A
// CEILING. /api/team/invite was cleared by the section above because
// `seat_count` appears in it, and that seat check is real — on
// Professional. lib/team/seat-limits.ts sets Ultimate and Enterprise to
// POSITIVE_INFINITY and the route skips the seat branch entirely for
// teamSeatsIncluded plans and for isAdmin, deliberately, because those
// have no per-seat charge. So on exactly the accounts with no cap,
// nothing bounded the route — and the next thing it does is send an
// email to an address THE CALLER SUPPLIED, from this product's domain.
//
// security-posture.test.mjs already makes this argument about
// /api/contact: "the recipient is FIXED to ADMIN_EMAILS ... which is the
// difference between a contact form and an open relay". Nothing made it
// about the route where the recipient is not fixed.
//
// So for these, a reservation or a plan cap is not enough. It is a rate
// limit, a cron secret, or a written reason.
// Built from parts rather than written whole: gate-import-paths.test.mjs
// resolves every `@/…` literal a gate contains against the tree, and
// `@/lib/email/send-` is a PREFIX, not a module — spelled out it reads as
// a broken import.
const EMAIL_SENDER_PREFIX = ["@/lib", "email", "send-"].join("/");
const SENDS_OUTWARD = new RegExp(`from "${EMAIL_SENDER_PREFIX}|sendTelegram|sendDiscord|dispatchNotification`);
const senders = routes.filter((f) => SENDS_OUTWARD.test(SOURCE.get(f)));
check(`routes that send a message outward (${senders.length})`, senders.length >= 5, "the outbound detector matched almost nothing");

const SENDS_WITHOUT_A_LIMIT = {
  "src/app/auth/callback/route.ts":
    "the OAuth landing. It sends the welcome email once, on the exchange of a single-use code the provider minted — a loop of this route exchanges nothing twice, so there is no second email to send.",
  "src/app/api/billing/cancel/route.ts":
    "the cancellation email. It is reached only with an ACTIVE subscription and the route refuses with 400 otherwise, so a second call finds nothing active and never reaches the send.",
  "src/app/api/cron/scheduled-runs/route.ts": "cron, behind CRON_SECRET; the caller is Vercel and the recipients are rows it found.",
  "src/app/api/weekly-digest/route.ts": "cron, behind CRON_SECRET; same posture as the job above.",
};
const unboundedSenders = senders.filter(
  (f) => !boundsOf(f).includes("rate_limit") && !boundsOf(f).includes("cron_secret") && !SENDS_WITHOUT_A_LIMIT[f]
);
check(
  "every route that sends outward is rate limited, or says what stops a loop",
  unboundedSenders.length === 0,
  unboundedSenders.length
    ? `sends a message and has no limiter:\n        ${unboundedSenders.join("\n        ")}\n        ` +
      "A plan cap does not count here: it can be Infinity, and on the plans where it is, the route is unbounded."
    : ""
);
const staleSenders = Object.keys(SENDS_WITHOUT_A_LIMIT).filter(
  (f) => !senders.includes(f) || boundsOf(f).includes("rate_limit")
);
check(
  "no send-without-a-limit entry has gone stale",
  staleSenders.length === 0,
  staleSenders.map((f) => (senders.includes(f) ? `${f}: it is rate limited now — drop the entry` : `${f}: it sends nothing any more`)).join("\n        ")
);

// ---------------------------------------------------------------------
// A ROUTE THAT HANDS THE CALLER A FILE NEEDS A LIMIT TOO.
//
// The population that matters is "hands back a file", not "renders a
// document". Four routes were bounded on 2026-09-16 because they render
// a PDF or a .pptx; /api/data-analysis/[id]/export was not, because it
// renders nothing — it serialises EVERY ROW of an uploaded spreadsheet
// into CSV or JSON on each request, which is the same egress and the same
// CPU without a renderer in the middle. Found by asking what leaves the
// server rather than what is built on it.
//
// The header is set by lib/pdf/render.ts for the PDF routes and inline by
// the others, so both spellings count.
const HANDS_BACK_A_FILE = /Content-Disposition|pdfResponse\s*\(/;
const fileServers = routes.filter((f) => HANDS_BACK_A_FILE.test(SOURCE.get(f)));
check(`routes that hand back a file (${fileServers.length})`, fileServers.length >= 5, "the attachment detector matched almost nothing");

const EXPORT_GUARD = /allowExport\s*\(/;
// A RESERVATION COUNTS HERE AND DOES NOT COUNT IN THE SECTION ABOVE, and
// the difference is the point. For an outbound message, a credit hold
// bounds the money and not the number of emails. For a file, a route that
// charges per call IS bounded by the balance: /api/documents/[id]/pdf
// runs a model call and reserves against it, so a loop stops when the
// account runs out. The four free export routes have no such floor, which
// is why they carry a limiter instead.
const unboundedFileServers = fileServers.filter(
  (f) =>
    !EXPORT_GUARD.test(SOURCE.get(f)) &&
    !boundsOf(f).includes("rate_limit") &&
    !boundsOf(f).includes("cron_secret") &&
    !boundsOf(f).includes("reservation")
);
check(
  "every route that hands back a file is bounded",
  unboundedFileServers.length === 0,
  unboundedFileServers.length
    ? `no limiter and no export guard:\n        ${unboundedFileServers.join("\n        ")}\n        ` +
      "Free because it was already paid for is the answer to a different question; see lib/export-guard.ts."
    : ""
);

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
check(
  "control: the invite route is seen to send outward",
  senders.includes("src/app/api/team/invite/route.ts"),
  "the route that could send unbounded email to caller-chosen addresses is not in the outbound population"
);
check(
  "control: ...and to be rate limited, not merely seat-capped",
  boundsOf("src/app/api/team/invite/route.ts").includes("rate_limit"),
  "the seat cap is Infinity on Ultimate and Enterprise, so it is not what bounds this"
);
check(
  "control: the spreadsheet export is seen to hand back a file",
  fileServers.includes("src/app/api/data-analysis/[id]/export/route.ts"),
  "the route that serialises every row of an upload is not in the attachment population"
);
check(
  "control: a PDF route counts even though it never writes the header itself",
  fileServers.includes("src/app/api/mission/[id]/pdf/route.ts"),
  "lib/pdf/render.ts sets Content-Disposition for these, so the helper has to count"
);
check("control: the Stripe webhook is bounded by its signature, not a limiter", boundsOf(STRIPE).includes("stripe_signature") && !boundsOf(STRIPE).includes("rate_limit"), "if this route ever gains a rate limit the control is simply stale — say so here");

console.log(`\n        ${inserters.length} inserting routes · ${inserters.filter((r) => boundsOf(r.file).length).length} bounded in code · ${Object.keys(DECLARED).length} declared`);
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
