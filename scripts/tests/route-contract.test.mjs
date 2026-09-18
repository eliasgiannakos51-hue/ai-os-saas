// IS THIS ROUTE IN ANY CONVERSATION AT ALL?
//
// Four gates ask good questions of narrow populations, and each one
// derives its own from the tree:
//
//   route-write-bound      39 routes that INSERT — what bounds them
//   resource-ownership     66 that act on an id from the request — whose
//   route-spend-inventory  36 that reach a model — what it costs
//   security-posture       every endpoint — who is asking
//
// Each is right, and none of them can see its own edge. The question this
// file asks is the one left over: of the 143 routes in this tree, is there
// one that NO population contains — a route nothing anywhere asks anything
// of, because it happened not to insert, not to take an id, not to call a
// model and not to be noticed?
//
// WHY NOT "ASK ALL FOUR OF ALL 143". Because that was measured, and it is
// the wrong shape: 429 cells, 105 of which would need a written reason,
// and roughly a hundred of those would read "this route takes nothing and
// returns a list; there is nothing to own and nothing to bound". A
// register of a hundred sentences nobody reads is worse than none —
// docs/shapes.md records the same ratio failing once already, when asking
// "which routes have no rate limit" of 143 returned 67 and most were
// correct. The absence has to be asked where it is a defect.
//
// TWO CONDITIONS THIS FILE IS HELD TO, and they are the whole design:
//
//   THE SCANNER GUARANTEES, NOT THE TABLE. The register below cannot put
//   a route INTO a population and cannot make one pass a check. Every
//   answer is derived from the route's own source by the same detectors
//   the four gates use; a declaration only records that being outside all
//   of them is intended, and it is checked BOTH ways.
//
//   A REASON IS AN ARGUMENT, NOT AN ASSURANCE. "This is fine", "by
//   design", "safe" and "intentional" are refused by name and by shape:
//   an entry has to say what the route DOES, and name the mechanism or
//   the fact that makes the absence correct. That is checked mechanically
//   below, because a register whose reasons are assurances is a list of
//   promises with the same evidentiary value as no list.
//
// Run: node scripts/tests/route-contract.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  AUTHENTICATES,
  CRON,
  STRIPE_SIG,
  FROM_REQUEST,
  BOUNDS,
  identityOf,
  matching,
  ownershipTable,
  securityInvokerFunctions,
} from "./lib/route-mechanisms.mjs";

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

// Comments stripped. This file's own header names half these mechanisms,
// and a route whose COMMENT mentions checkRateLimit is the case the whole
// exercise exists to stop counting as bounded.
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const SOURCE = new Map(routes.map((f) => [f, strip(readFileSync(f, "utf8"))]));

check(`routes found (${routes.length})`, routes.length >= 100, "the walk found almost nothing");

// ---------------------------------------------------------------------
// THE FOUR QUESTIONS, EACH WITH THE POPULATION IT IS A DEFECT IN.
//
// `asks` is what puts a route in the population; `answers` is what the
// route must then show. Both are derived from source. The detectors are
// the ones the four gates already use — same spellings, so a route that
// route-write-bound calls bounded is bounded here too, and the day one of
// them learns a new idiom this file learns it in the same edit.
// ---------------------------------------------------------------------
// THE DETECTORS COME FROM ONE PLACE.
//
// This file used to carry a COPY of resource-ownership's five ownership
// predicates and route-write-bound's eight bounds. Two copies of a rule
// is two rules: the day one of them learned that `.rpc()` through the
// caller's client is RLS — which happened on 2026-09-18 — the other went
// on calling eight routes unowned, and nothing would have said which was
// right. scripts/tests/lib/route-mechanisms.mjs is the single definition
// and the controls at the bottom of BOTH files exercise it.
const invokerFns = securityInvokerFunctions();
const OWNERSHIP = ownershipTable(invokerFns);
const INSERTS = /\.from\(\s*"[a-z_0-9]+"\s*\)\s*\n?\s*\.insert\s*\(/;
const REACHES_MODEL = /\bmessages\s*\.\s*(create|stream)\s*\(|generativelanguage\.googleapis\.com|api\.groq\.com|api\.openai\.com|api\.elevenlabs\.io/;
const RATE_LIMITED = BOUNDS.rate_limit;
const SPEND = {
  reservation: (s) => /\breserveCredits\s*\(|\bstartJob\s*\(|\bsettleReservation\s*\(/.test(s),
  affordability: (s) => /hasEnoughCredits\s*\(/.test(s),
  free_allowance: (s) => /consumeFreeChat/.test(s),
};
const any = matching;

const QUESTIONS = [
  {
    id: "identity",
    asks: () => true,
    // SEVEN MECHANISMS, and the last four are why this file exists. The
    // first version knew session, cron_secret and stripe_signature — the
    // three every other gate knows — and reported login, signup, the OAuth
    // callback and the deletion confirmation as answering NOTHING about
    // who is asking. All four verify an identity; they just do not verify
    // a SESSION, because they are the routes that create one. The list
    // lives in lib/route-mechanisms.mjs with the rest.
    answers: identityOf,
  },
  { id: "ownership", asks: (s) => AUTHENTICATES.test(s) && !CRON.test(s) && FROM_REQUEST.test(s), answers: (s) => any(OWNERSHIP, s) },
  { id: "bound", asks: (s) => INSERTS.test(s), answers: (s) => any(BOUNDS, s) },
  { id: "spend", asks: (s) => REACHES_MODEL.test(s), answers: (s) => any(SPEND, s) },
];

const contract = new Map();
for (const f of routes) {
  const src = SOURCE.get(f);
  const row = {};
  for (const q of QUESTIONS) row[q.id] = q.asks(src) ? q.answers(src) : null; // null = not in this population
  contract.set(f, row);
}

// EVERY POPULATION HAS A FLOOR. A detector that stops matching empties its
// population, and an empty population answers every question about it.
for (const q of QUESTIONS) {
  const n = routes.filter((f) => contract.get(f)[q.id] !== null).length;
  // THE FLOORS ARE NOT THE SAME NUMBER, and 'spend' is the one worth
  // explaining. route-spend-inventory.test.mjs answers that question with
  // a transitive import graph to depth 3 and finds 36 routes; the
  // detector here reads the route FILE only and finds 6. It is a weaker
  // instrument on purpose — this file needs to know whether a route is in
  // the conversation, not what it costs — and the number is floored at
  // what a file-local scan can honestly see rather than at what the
  // better gate sees. Holding it to 36 would be this file claiming a
  // reach it does not have.
  const FLOOR = { identity: routes.length, ownership: 20, bound: 20, spend: 5 }[q.id];
  check(
    `the '${q.id}' population is real (${n} routes, floor ${FLOOR})`,
    q.id === "identity" ? n === routes.length : n >= FLOOR,
    `'${q.id}' contains ${n} routes — its detector has stopped matching, and an empty population passes every check over it`
  );
  const answered = routes.filter((f) => (contract.get(f)[q.id] ?? []).length > 0).length;
  check(
    `…and most of it answers (${answered} of ${n})`,
    answered >= n * 0.5,
    `only ${answered} routes answer '${q.id}' — the answer detector, not the tree, is what changed`
  );
}

// ---------------------------------------------------------------------
// THE QUESTION THIS FILE IS FOR: a route no population contains.
// ---------------------------------------------------------------------
// WHAT A ROUTE HAS, IRRESPECTIVE OF WHO ASKED.
//
// A route can be bounded and still be in no population: the `bound`
// question is keyed on INSERT, so /api/contact — a rate-limited public
// form that writes through a helper — is never asked. Reporting that as
// "nothing asks it" and stopping there would be true and useless. So
// every mechanism the four tables know is collected for every route, and
// a declaration has to NAME the ones the route has. The scanner then
// verifies the naming, which is what makes an entry evidence rather than
// a claim: take the rate limit out of /api/contact and its entry stops
// matching, in the same run.
const observedFor = (f) => {
  const src = SOURCE.get(f);
  return [
    ...QUESTIONS[0].answers(src).map((k) => `identity:${k}`),
    ...any(OWNERSHIP, src).map((k) => `ownership:${k}`),
    ...any(BOUNDS, src).map((k) => `bound:${k}`),
    ...any(SPEND, src).map((k) => `spend:${k}`),
  ].sort();
};

const askedNothing = routes.filter((f) => {
  const row = contract.get(f);
  // `identity` asks every route, so being "asked nothing" means every
  // question either skipped it or got no mechanism back.
  return QUESTIONS.every((q) => row[q.id] === null || row[q.id].length === 0);
});

// ---------------------------------------------------------------------
// THE REGISTER. It records that being outside every population is
// intended. It cannot put a route into one — see `contract` above, which
// is built before this object exists and never reads it.
// ---------------------------------------------------------------------
const OUTSIDE_EVERY_POPULATION = {
  "src/app/api/contact/route.ts": {
    has: ["bound:rate_limit"],
    why:
      "the public contact form, reachable with no account because that is what a contact form is for. It has no identity to check and no row of anybody's to own. What stops it being a mail relay is checkRateLimit with scope \"contact_form\", plus a honeypot field named _hp that is read before anything else is validated, so a bot filling every input is refused without a database round trip.",
  },
  "src/app/r/[code]/route.ts": {
    has: [],
    why:
      "the affiliate share link. No session, because a share link is followed by somebody with no account yet. It touches NO database at all — deliberately never validating the code against affiliate_codes, because a route that answered differently for a real code would enumerate them one guess at a time — and its whole body reads a path segment, sets the REFERRAL_COOKIE and redirects to /signup. Nothing to own, nothing inserted, no model called, and the attribution happens later in auth/callback where a real user exists.",
  },
  "src/app/s/[subdomain]/route.ts": {
    has: [],
    why:
      "serves a published customer site to the open internet, which is what publishing IS — a session here would mean nobody could read the page. It reads one published_sites row by subdomain and returns the stored html_content; it writes nothing, so there is no row to own and no insert to bound. Its traffic ceiling is upstream: maxPublishedSitesForPlan in api/websites/[id]/publish decides how many sites an account may have live at once.",
  },
  "src/app/s/[subdomain]/[page]/route.ts": {
    has: [],
    why:
      "a sub-page of the same published site, read out of the same published_sites snapshot row's pages array rather than from user_websites, and returned as stored html. Public by definition and read-only, with the same upstream ceiling: maxPublishedSitesForPlan bounds how many sites exist to be served.",
  },
  "src/app/s/[subdomain]/sitemap.xml/route.ts": {
    has: [],
    why:
      "the sitemap of a published site. A sitemap behind a login is a sitemap no crawler can fetch, which is the entire point of having one. It reads the same published_sites row and emits XML derived from its pages list; it writes nothing and calls nothing.",
  },
  "src/app/s/[subdomain]/robots.txt/route.ts": {
    has: [],
    why:
      "the robots.txt of a published site — the one file on the internet defined by being fetchable without credentials. It reads the same published_sites row to decide whether the site is live and emits text; it writes nothing.",
  },
};

const undeclared = askedNothing.filter((f) => !OUTSIDE_EVERY_POPULATION[f]);
check(
  `every route outside every population is declared (${askedNothing.length} of ${routes.length})`,
  undeclared.length === 0,
  undeclared.join("\n        ") +
    "\n        Nothing anywhere asks this route anything. Either it belongs in one of the four populations, or say here what it does and why being outside all of them is right."
);

// BOTH WAYS. A declaration for a route that has since joined a population
// — gained a session, started inserting, begun calling a model — is a
// sentence that has stopped being true, and it reads as coverage.
const stale = Object.keys(OUTSIDE_EVERY_POPULATION).filter((f) => !askedNothing.includes(f));
check(
  "no declaration outlives what it was written about",
  stale.length === 0,
  stale
    .map((f) => {
      if (!SOURCE.has(f)) return `${f}: no such route`;
      const row = contract.get(f);
      const joined = QUESTIONS.filter((q) => (row[q.id] ?? []).length > 0).map((q) => `${q.id}=${row[q.id].join("+")}`);
      return `${f}: it answers ${joined.join(", ")} now — drop the entry`;
    })
    .join("\n        ")
);

// ---------------------------------------------------------------------
// CONDITION ONE, MADE MECHANICAL: THE SCANNER GUARANTEES, NOT THE TABLE.
//
// Each entry states the mechanisms its route HAS, and those are compared
// against what the scanner derives from the route's own source. The table
// cannot add one and cannot hide one: it can only agree or go red. Take
// the rate limit out of /api/contact and its `has` stops matching in the
// same run that removes it, without anybody remembering this file exists.
// ---------------------------------------------------------------------
const mismatched = [];
for (const [route, d] of Object.entries(OUTSIDE_EVERY_POPULATION)) {
  if (!SOURCE.has(route)) continue;
  const observed = observedFor(route);
  const declared = [...d.has].sort();
  if (JSON.stringify(observed) !== JSON.stringify(declared)) {
    mismatched.push(
      `${route}: declared [${declared.join(", ") || "nothing"}] but the scanner finds [${observed.join(", ") || "nothing"}]`
    );
  }
}
check(
  `every declaration's mechanisms match what the scanner finds (${Object.keys(OUTSIDE_EVERY_POPULATION).length} declared)`,
  mismatched.length === 0,
  mismatched.join("\n        ") +
    "\n        The register records what is there; it does not decide it. Update the entry, or put the mechanism back."
);

// ---------------------------------------------------------------------
// CONDITION TWO: A REASON IS AN ARGUMENT, NOT AN ASSURANCE.
//
// The failure this refuses is specific and it is the one a register
// actually dies of: an entry built entirely out of reassurance. The
// refused vocabulary is the ASSURANCE pattern below rather than a list
// repeated in prose here — deliberately, because
// scripts/tests/comment-claims.test.mjs runs a census of comment blocks
// containing exactly those words, and a comment quoting them to explain
// why they are refused reads to that gate as a limitation being confessed.
// Fourth time in this project that prose has been read as code; the
// pattern is the record, and a reader wanting the list reads it.
//
// Such a sentence is compatible with every possible state of the code,
// which makes it worth exactly nothing, and it is what a person writes at
// the end of an afternoon. So a reason has to be long enough to contain
// an argument, must not be built out of those words, and must NAME
// something — a file, a function, a table, a status code — that a reader
// can go and check.
// ---------------------------------------------------------------------
const ASSURANCE = /\b(safe by design|by design|intentional(ly)?|on purpose|this is fine|it'?s fine|no issue|not a problem|nothing to worry|as intended|works as expected)\b/i;
const NAMES_SOMETHING = /\b[a-zA-Z_][\w]*\.(ts|tsx|sql)\b|\b[a-z_]+\s*\(\)|\b[a-z][a-zA-Z]*[A-Z][a-zA-Z]*\b|\b[0-9]{3}\b|\b[a-z_]{3,}_[a-z_]{3,}\b/;

const weak = [];
for (const [route, d] of Object.entries(OUTSIDE_EVERY_POPULATION)) {
  const why = d.why;
  if (why.length < 120) weak.push(`${route}: too short to be an argument (${why.length} chars)`);
  if (ASSURANCE.test(why)) weak.push(`${route}: "${why.match(ASSURANCE)[0]}" is an assurance, not a reason`);
  if (!NAMES_SOMETHING.test(why)) weak.push(`${route}: names nothing a reader can go and check`);
}
check(
  `every reason is an argument rather than an assurance (${Object.keys(OUTSIDE_EVERY_POPULATION).length} declared)`,
  weak.length === 0,
  weak.join("\n        ")
);

// ---------------------------------------------------------------------
// AND THE REGISTER CANNOT REACH THE ANSWERS.
//
// The condition was "the scanner guarantees, not the table", and the way
// that goes wrong is a register that quietly starts excusing a route from
// a population it IS in. So: no declared route may be one that a question
// asked and got no answer from — that is a gap, not an exemption, and it
// belongs in the four gates rather than here.
// ---------------------------------------------------------------------
const excusingAGap = Object.keys(OUTSIDE_EVERY_POPULATION).filter((f) => {
  const row = contract.get(f);
  return row && QUESTIONS.some((q) => row[q.id] !== null && row[q.id].length === 0 && q.id !== "identity");
});
check(
  "no declaration excuses a route that a question actually asked",
  excusingAGap.length === 0,
  excusingAGap.join("\n        ") +
    "\n        This route is inside a population and answers nothing. That is the gap the narrow gate exists for; it cannot be waived here."
);

// ---------------------------------------------------------------------
// CONTROLS — they drive the detectors rather than restating them.
// ---------------------------------------------------------------------
check("control: a session counts as identity", QUESTIONS[0].answers("const { data: { user } } = await supabase.auth.getUser();").includes("session"));
check("control: a cron secret does too", QUESTIONS[0].answers("if (!checkCronAuth(request)) return x;").includes("cron_secret"));
check("control: a Stripe signature does too", QUESTIONS[0].answers("const event = stripe.webhooks.constructEvent(body, sig, key);").includes("stripe_signature"));
check("control: a route with none answers nothing", QUESTIONS[0].answers("export async function GET() { return NextResponse.json({}); }").length === 0);
check("control: an insert puts a route in the bound population", QUESTIONS[2].asks('await supabase.from("leads").insert({ x: 1 });'));
check("control: an update does not", !QUESTIONS[2].asks('await supabase.from("leads").update({ x: 1 });'), "an update cannot be looped into unbounded storage; widening this would flood the population with routes the question is not about");
check(
  "control: a limiter with no scope is not a bound",
  !RATE_LIMITED('const l = await checkRateLimit({ identifier: user.id }); if (!l.allowed) return x;'),
  "deleting the scope line leaves checkRateLimit in place, and a presence check goes on calling that bounded"
);
check("control: a limiter nobody branches on is not either", !RATE_LIMITED('await checkRateLimit({ scope: "x", identifier: user.id });'));
check("control: all three together are", RATE_LIMITED('const l = await checkRateLimit({ scope: "x", identifier: user.id }); if (!l.allowed) return x;'));
check("control: a model call puts a route in the spend population", QUESTIONS[3].asks("const r = await anthropic.messages.create({});"));
check("control: an ownership claim in a comment does not count", Object.values(OWNERSHIP).every((t) => !t(strip('// reads it with .eq("user_id", user.id)\nconst x = 1;'))));
// THE THREE MECHANISMS THE SWEEP OF 2026-09-18 ADDED, each driven rather
// than described — and the pair that separates an RPC scoped by RLS from
// one that bypasses it, which is the whole reason the migrations are read.
check(
  "control: an RPC through the caller's client is ownership when the function is SECURITY INVOKER",
  OWNERSHIP.rls_rpc('const supabase = createClient();\nawait supabase.rpc("search_all_localized", {});')
);
check(
  "control: ...and is NOT when the function is SECURITY DEFINER",
  !OWNERSHIP.rls_rpc('const supabase = createClient();\nawait supabase.rpc("chat_memory_record", {});'),
  "a DEFINER function runs as its owner and bypasses every policy; counting it as ownership would clear a route that has none"
);
check(
  "control: the invoker set is read from the migrations and is not empty",
  invokerFns.has("search_all_localized") && invokerFns.size >= 3,
  `${invokerFns.size} functions found — an empty set would make rls_rpc always false, which reads as 'stricter' and is just blind`
);
check(
  "control: the caller's client handed to a helper is ownership",
  OWNERSHIP.client_handed_on("const supabase = createClient();\nconst s = await suggestEntityLinks(supabase, t, id);")
);
check(
  "control: a helper given user.id is ownership",
  OWNERSHIP.scoped_helper("const rows = await listDeliveryChannels(user.id);")
);
check(
  "control: ...and a rate limiter given the same id is not",
  !OWNERSHIP.scoped_helper('const l = await checkRateLimit({ scope: "x", identifier: user.id });'),
  "counting `identifier: user.id` as an ownership check would clear all 143 routes at once"
);
check("control: an assurance is refused", ASSURANCE.test("intentional — safe by design"));
check("control: an argument naming a file is not", !ASSURANCE.test("it reads published_sites by subdomain and writes nothing; the ceiling is maxPublishedSitesForPlan"));
check("control: a reason naming nothing checkable is caught", !NAMES_SOMETHING.test("it does not need one and never will, so there is nothing more to say here"));

for (const q of QUESTIONS) {
  const inPop = routes.filter((f) => contract.get(f)[q.id] !== null).length;
  const answered = routes.filter((f) => (contract.get(f)[q.id] ?? []).length > 0).length;
  console.log(`        ${q.id.padEnd(10)} asked of ${String(inPop).padStart(3)} · answered by ${String(answered).padStart(3)}`);
}
console.log(`        ${"".padEnd(10)} ${askedNothing.length} route(s) in no population, all declared`);
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
