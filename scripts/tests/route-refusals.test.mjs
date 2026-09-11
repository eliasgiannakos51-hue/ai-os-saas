// THE GUARD THAT 132 ROUTES REPEAT, AND NOBODY WAS WATCHING.
//
// V5 #14 removed one guard at a time and ran the whole unit suite after
// each. `if (!user) return NextResponse.json(… { status: 401 })` — the
// line that stands between an anonymous request and a user's data, in
// 132 places — could be DELETED with the suite green. So could
// `if (!apiKey) …` in 25 routes, `if (!isAdminEmail(user.email)) …` in
// the owner-only ones, `if (!reservation.ok) …` in 18, and
// `if (!affordable.ok) …` in 8. Eight of the nine shapes tested had no
// witness at all.
//
// THIS FILE IS THE WITNESS. It does not test that the guards are
// correct — a static read cannot — it tests that they are THERE, in the
// right order, in every route that needs one. Delete any of them and
// this goes red naming the file.
//
// WHY ORDER AND NOT PRESENCE. A refusal after the work has begun is not
// a refusal: the row has been read, the model has been called, the hold
// has been taken. So each section finds the point where the route
// obtains the thing, the point where it refuses, and the point where it
// starts spending, and requires them in that sequence.
//
// WHY NOT THE PARSER, when V5 #13's lesson was to use it: the property
// here is genuinely textual ORDER within one function body, which is
// what offsets measure directly. The parser is used where SHAPE matters
// — see mutation-anchors.test.mjs — and it is not what matters here.
//
// TWO FALSE POSITIVES THIS SCAN HAD BEFORE IT SHIPPED, both worth
// keeping in view because they are how a scan like this lies:
//   · `if (!user || !user.email)` is a refusal. A pattern anchored on
//     `!user)` called two routes unguarded that guard themselves fine.
//   · matching `reserveCredits` anywhere in the file matched the IMPORT
//     line, putting the "work" hundreds of lines before the refusal.
// Both were caught by reading the routes the scan accused. The counts
// below are the honest ones: every route in all three populations
// refuses, and the exception table is empty.
//
// Run: node scripts/tests/route-refusals.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}

function routeFiles(dir = "src/app/api", out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) routeFiles(p, out);
    else if (e === "route.ts") out.push(p);
  }
  return out;
}
const ROUTES = routeFiles();

/**
 * ROUTES ALLOWED TO SKIP A REFUSAL, with the reason.
 *
 * EMPTY, and that is the finding rather than an oversight: all 113
 * routes that read a user refuse a missing one, all 23 that take a hold
 * refuse a failed one, all 19 that read a row by id refuse a missing one.
 * The table exists so the first exception has to be argued for in
 * writing, and so it can be checked both ways when it is.
 */
export const EXEMPT = {};

/**
 * Where the statement containing `at` begins — the nearest declaration or
 * `await` before it. Used instead of a fixed look-back so a chain with a
 * long argument is still read whole.
 */
function statementStart(src, at) {
  const from = Math.max(0, at - 2000);
  const before = src.slice(from, at);
  let best = 0;
  for (const m of before.matchAll(/(?:const|let|var)\s|await\s/g)) best = m.index;
  return from + best;
}

/** The first offset matching any of these, or -1. */
function firstOf(text, patterns) {
  let best = -1;
  for (const p of patterns) {
    const at = text.search(p);
    if (at !== -1 && (best === -1 || at < best)) best = at;
  }
  return best;
}

/** Every offset in `text` matching any pattern, ascending. */
function allOf(text, patterns) {
  const hits = [];
  for (const p of patterns) {
    const re = new RegExp(p.source, p.flags.includes("g") ? p.flags : `${p.flags}g`);
    for (const m of text.matchAll(re)) hits.push(m.index);
  }
  return [...new Set(hits)].sort((a, b) => a - b);
}

/**
 * One population, checked for the sequence obtain -> refuse -> spend.
 *
 * EVERY OBTAIN SITE, NOT THE FIRST. Checking only the first was a real
 * hole and its own mutation found it: api/agents/templates/adopt takes
 * TWO holds — an affordability check and then a reservation — and with
 * only the first inspected, deleting the reservation's refusal left the
 * affordability refusal standing in for it and the gate stayed green.
 * A route with two holds needs two refusals.
 *
 * Each site is judged in the window from itself to the NEXT site, so one
 * refusal cannot answer for a hold taken later in the same handler.
 */
export function auditRoutes(files, { obtain, refuse, work, qualify, bind, refuseFor }) {
  const population = [];
  const missing = [];
  const late = [];
  for (const entry of files) {
    // A path, or a {file, src} pair. The pair is what lets the positive
    // control below feed the analyser a route that does NOT exist on
    // disk, without writing a fixture file into the tree.
    const file = typeof entry === "string" ? entry : entry.file;
    // COMMENTS ARE NOT CODE, and this scan learned it the way the rest of
    // the repository did. api/nav/track/route.ts explains itself with
    // "comes from auth.getUser() rather than from the body"; unstripped,
    // that sentence is an obtain site with no refusal after it, and the
    // gate accused a route that guards itself on the next line.
    const raw = typeof entry === "string" ? readFileSync(file, "utf8") : entry.src;
    const src = stripComments(raw);
    const all = allOf(src, obtain);
    // A QUALIFIER, because not every match of the same shape asks the
    // same question. `.eq("id", params.id)` on a SELECT needs a refusal
    // for the row that is not there; on an UPDATE or DELETE there is no
    // row to refuse — the `.eq("user_id", …)` beside it is the guard, and
    // write-guards.test.mjs and user-scoped-queries.test.mjs are what
    // watch that. Without this, the scan accused a delete of failing to
    // check a row it never read.
    const sites = qualify ? all.filter((at) => qualify(src, at)) : all;
    if (sites.length === 0) continue;
    population.push(file);
    sites.forEach((at, i) => {
      const end = i + 1 < sites.length ? sites[i + 1] : src.length;
      const window = src.slice(at, end);
      // THE REFUSAL MUST NAME WHAT WAS OBTAINED, where the spec says so.
      //
      // Without it, any later `.ok` in the same handler answered for the
      // hold: api/agents/templates/adopt takes an affordability check and
      // then a reservation, and deleting the reservation's refusal left
      // `if (filled.ok)` — a hundred lines further on, about something
      // else entirely — standing in for it. Its own mutation found that.
      let patterns = refuse;
      if (bind) {
        // THE NEAREST DECLARATION BEFORE THE CALL, not the first one in a
        // look-back slice. `String.match` returns the earliest hit, which
        // bound three routes to a variable declared several statements
        // above the hold and then asked for a refusal naming it.
        const from = Math.max(0, at - 260);
        const before = src.slice(from, at);
        let name = null;
        for (const m of before.matchAll(bind)) name = m[1] ?? m[2] ?? m[3] ?? name;
        // No declaration at all means this match was not a call being
        // assigned — an import line, say — and nothing can refuse it.
        patterns = name ? refuseFor(name) : [/$a^/];
      }
      const r = firstOf(window, patterns);
      if (r === -1) {
        missing.push(sites.length > 1 ? `${file} (site ${i + 1} of ${sites.length})` : file);
        return;
      }
      const w = firstOf(window, work);
      if (w !== -1 && w < r) late.push(`${file} — work at ${w} before the refusal at ${r}`);
    });
  }
  return { population, missing, late };
}

const AUTH = {
  obtain: [/auth\s*\.\s*getUser\s*\(/],
  // `!user`, however the condition continues: `if (!user || !user.email)`
  // is a refusal, and a pattern anchored on `!user)` called two routes
  // unguarded that guard themselves perfectly well.
  refuse: [/if\s*\(\s*!\s*user\b/],
  work: [/\.from\(/, /\.rpc\(/, /messages\.(?:create|stream)\(/, /createAdminClient\(/],
};
const MONEY = {
  // `await` matters: without it the IMPORT line matches and every route
  // looks like it spends before it refuses.
  obtain: [/await\s+reserveCredits\s*\(/, /await\s+hasEnoughCredits\s*\(/, /await\s+canAfford\s*\(/],
  // TWO SHAPES, BOTH REAL GUARDS. Refusing a failed hold is the common
  // one; GATING THE SPEND on a successful one is the other, and
  // api/websites/[id]/submit-form uses it deliberately. That route is the
  // public contact form on a published site, submitted by strangers with
  // no account: it settles against the site OWNER, so an owner who cannot
  // pay gets the submission without a priority tag rather than the
  // visitor getting an error. CREDITS.md carries the same reasoning.
  //
  // Reading only the negative shape put that route on the unguarded list,
  // which would have been an exemption written for a scan's blind spot
  // rather than for the code.
  // The name the hold was assigned to, and the two refusals that may
  // mention it. Anything about a different variable is a different
  // question.
  // Tolerates whatever sits between the name and the call. Requiring
  // `= await` directly accused api/automations/create, which writes
  // `const affordabilityCheck = clarificationPlan ? await hasEnoughCredits(…) : { ok: true }`
  // — a hold taken conditionally is still a hold, and it refuses on the
  // next line.
  // Just the declaration; the obtain pattern already established that a
  // hold is taken here. Tolerates a hold taken conditionally —
  // api/automations/create writes `const affordabilityCheck =
  // clarificationPlan ? await hasEnoughCredits(…) : { ok: true }`.
  bind: /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g,
  refuseFor: (name) => [
    new RegExp(`if\\s*\\(\\s*!\\s*${name}\\s*\\.\\s*ok\\b`),
    new RegExp(`if\\s*\\(\\s*${name}\\s*\\.\\s*ok\\s*\\)`),
  ],
  refuse: [],
  work: [/messages\.(?:create|stream)\(/, /runCompletion\s*\(/],
};
const USER_DATA = {
  obtain: [/\.eq\(\s*["']id["']\s*,\s*params\./],
  // READS ONLY, and the verb is what says so — not the tail of the chain.
  //
  // A write scoped by user_id affects nothing when the row is not yours,
  // which is correct and needs no refusal. Looking only FORWARD for
  // `.maybeSingle()` could not tell a read from a compare-and-set:
  // api/research/[id] updates with `.eq("status", data.status).select("*")
  // .maybeSingle()`, deliberately, so a lost race returns no row and the
  // handler re-reads instead of failing. Reported as an unguarded read,
  // that would have been a true sentence about the wrong statement.
  qualify: (src, at) =>
    /\.single\(\)|\.maybeSingle\(\)/.test(src.slice(at, at + 400)) &&
    // BACK TO THE STATEMENT, not a fixed 400 characters. The verb sits at
    // the head of a chain whose argument can be a long object literal —
    // api/research/[id]'s compare-and-set update writes five fields before
    // it reaches `.eq("id", params.id)` — and a short look-back read it as
    // a plain read that forgot to refuse a missing row.
    !/\.(?:update|delete|insert|upsert)\s*\(/.test(
      src.slice(statementStart(src, at), at)
    ),
  // THE ROW'S OWN NAME, from the destructuring that opens the statement:
  // `const { data: analysis, error } = await supabase…`. A generic
  // `if (!something)` matched whatever `!` came next, so deleting the
  // 404 for a missing row left an unrelated null-check standing in for
  // it — the same hole the money section had, found the same way.
  // Three shapes, because Supabase reads are written all three ways:
  // `const { data: analysis, error }`, the unaliased `const { data, error }`,
  // and a plain `const row = `.
  bind: /(?:const|let|var)\s*\{\s*data\s*:\s*([A-Za-z_$][\w$]*)|(?:const|let|var)\s*\{\s*(data)\b|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g,
  // THREE SHAPES, and the third is a guard too. `if (!row) return 404`
  // and `if (err || !row) …` are the common ones; `if (row) return …`
  // uses the row only when it is there and falls through when it is not,
  // which api/research/[id] does deliberately after a lost compare-and-set
  // race. Reading only the negative shapes called that a missing refusal.
  refuseFor: (name) => [
    new RegExp(`if\\s*\\(\\s*!\\s*${name}\\b`),
    new RegExp(`if\\s*\\([^)]*\\|\\|\\s*!\\s*${name}\\b`),
    new RegExp(`if\\s*\\(\\s*${name}\\s*\\)`),
  ],
  // `if (error || !data)` is a refusal too — the first version required
  // the negation to come first and accused a route that refuses fine.
  refuse: [/if\s*\(\s*!\s*\w/, /if\s*\(\s*\w*[Ee]rror\s*\|\|/],
  work: [/NextResponse\.json\(\s*\{\s*ok:\s*true/],
};

console.log("== 1. every route that reads a user refuses one that is not there ==");
const auth = auditRoutes(ROUTES, AUTH);
check(
  `the api tree was read (${ROUTES.length} route.ts, ${auth.population.length} read a user)`,
  ROUTES.length >= 100 && auth.population.length >= 90,
  `${ROUTES.length} / ${auth.population.length}`
);
check(
  "no route reads a user and then fails to refuse a missing one",
  auth.missing.filter((f) => !EXEMPT[f]).length === 0,
  auth.missing.join("\n        ")
);
check("no route starts work before refusing", auth.late.length === 0, auth.late.join("\n        "));

console.log("\n== 2. every route that takes a hold refuses one it could not take ==");
const money = auditRoutes(ROUTES, MONEY);
check(
  `routes taking a hold were found (${money.population.length})`,
  money.population.length >= 15,
  String(money.population.length)
);
check(
  "no route takes a hold and then fails to refuse a failed one",
  money.missing.filter((f) => !EXEMPT[f]).length === 0,
  money.missing.join("\n        ")
);
check("no route spends before refusing", money.late.length === 0, money.late.join("\n        "));

console.log("\n== 3. every route that reads a row by id refuses a missing one ==");
const data = auditRoutes(ROUTES, USER_DATA);
check(
  `routes reading by a params id were found (${data.population.length})`,
  data.population.length >= 12,
  String(data.population.length)
);
check(
  "no route reads a row by id and then fails to refuse a missing one",
  data.missing.filter((f) => !EXEMPT[f]).length === 0,
  data.missing.join("\n        ")
);

console.log("\n== 4. and the exception table cannot go stale ==");
const stale = Object.keys(EXEMPT).filter(
  (f) => !auth.missing.includes(f) && !money.missing.includes(f) && !data.missing.includes(f)
);
check("no exception describes a route that now refuses", stale.length === 0, stale.join(", "));
for (const [file, reason] of Object.entries(EXEMPT)) {
  check(`${file}: the exception says why`, typeof reason === "string" && reason.length > 40);
}

console.log("\n== 5. the scan can still see a route that does not refuse ==");
// THE POSITIVE CONTROL. Every assertion above is that a list is empty,
// and the cheapest way to empty a list is to stop filling it.
const GUARDED = `const { data: { user } } = await supabase.auth.getUser();\nif (!user) return NextResponse.json({}, { status: 401 });\nawait supabase.from("x").select();`;
const UNGUARDED = `const { data: { user } } = await supabase.auth.getUser();\nawait supabase.from("x").select();`;
const LATE = `const { data: { user } } = await supabase.auth.getUser();\nawait supabase.from("x").select();\nif (!user) return NextResponse.json({}, { status: 401 });`;
const OR_EMAIL = `const { data: { user } } = await supabase.auth.getUser();\nif (!user || !user.email) return NextResponse.json({}, { status: 401 });\nawait supabase.from("x").select();`;
const audit1 = (src) => auditRoutes([{ file: "fixture/route.ts", src }], AUTH);
check("a guarded route passes", audit1(GUARDED).missing.length === 0 && audit1(GUARDED).late.length === 0);
check("an unguarded route is caught", audit1(UNGUARDED).missing.length === 1);
check("a refusal after the work has begun is caught", audit1(LATE).late.length === 1);
check("`if (!user || !user.email)` is a refusal, not a miss", audit1(OR_EMAIL).missing.length === 0);
// AND THE MONEY SHAPES, both of them.
const audit1Money = (src) => auditRoutes([{ file: "fixture/route.ts", src }], MONEY);
check(
  "refusing a failed hold is a guard",
  audit1Money('const r = await reserveCredits(u, 1);\nif (!r.ok) return NextResponse.json({}, { status: 402 });\nawait client.messages.create({});').missing.length === 0
);
check(
  "gating the spend on a successful one is also a guard",
  audit1Money('const a = await hasEnoughCredits(u, 1, p);\nif (a.ok) { await client.messages.create({}); }').missing.length === 0
);
check(
  "spending with neither is caught",
  audit1Money('const r = await reserveCredits(u, 1);\nawait client.messages.create({});').missing.length === 1
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
