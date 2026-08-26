// Does the write re-assert what it read?
//
// pack-rate-race.dbtest.mjs proves the SQL semantics: a conditional UPDATE
// converges on the true minimum under any interleaving, an unconditional
// one loses the cheaper rate. What it CANNOT prove is that the TypeScript
// still emits the conditional form — it talks to Postgres directly, so
// reverting billing/credits.ts would leave it green.
//
// This is that half. It reads the function bodies and checks the PROPERTY:
//
//   A WRITE THAT DEPENDS ON A VALUE MUST RE-ASSERT THAT VALUE.
//
// Either the value never leaves the database (the comparison is in the
// WHERE clause), or the row is CLAIMED — the update is filtered on the old
// value and its result decides whether the rest of the work happens. A read
// in TypeScript followed by an unconditional write is the shape that loses
// one of two concurrent writers, every time, silently.
//
// Structural, not textual: the function body is extracted by counting
// braces and the method chain is parsed, so renaming a variable or
// reflowing the call does not defeat it — only removing the guard does.
//
// Run: node scripts/tests/write-guards.test.mjs
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

/** The body of `export ... function name(`, by brace count. */
function functionBody(source, name) {
  const at = source.search(new RegExp(`function\\s+${name}\\s*\\(`));
  if (at < 0) return null;
  const open = source.indexOf("{", source.indexOf(")", at));
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
}

/**
 * Every `.update({...})` call in `body`, with the chain that follows it up
 * to the statement's semicolon. The chain is what carries the filters, and
 * reading it whole is what makes this a check on the CALL rather than on
 * whether a substring happens to appear somewhere in the function.
 */
function updateChains(body) {
  const chains = [];
  let from = 0;
  for (;;) {
    const at = body.indexOf(".update(", from);
    if (at < 0) break;
    const end = body.indexOf(";", at);
    chains.push(body.slice(at, end < 0 ? body.length : end));
    from = at + 8;
  }
  return chains;
}

/**
 * What a `.update({...})` writes, as the set of NAMES a filter would have to
 * mention to re-assert it.
 *
 * A literal key gives the column name. A COMPUTED key — `.update({ [column]:
 * value })` — does not: the column is chosen at runtime, and the filter that
 * re-asserts it is written `.or(\`${column}.is.null,...\`)`, where the
 * literal never appears. RUNTIME STRINGS ARE INVISIBLE TO A TEXT SEARCH, and
 * the first version of this gate failed on exactly that — it resolved the
 * variable to its two possible literals and then went looking for literals
 * that are not in the source.
 *
 * So a computed key returns BOTH: the variable name, which is what the
 * filter will mention, and the literals it can hold, which is what a
 * hard-coded filter would mention. Either satisfies the check; neither being
 * present does not.
 */
function writtenColumns(chain, body) {
  const obj = chain.slice(chain.indexOf("(") + 1);
  const names = [...obj.matchAll(/(?:^|[{,\s])([a-z_][a-z0-9_]*)\s*:/gi)].map((m) => m[1]);
  const groups = names.map((n) => ({ label: n, accept: [n] }));

  const computed = [...obj.matchAll(/\[\s*([A-Za-z_$][\w$]*)\s*\]\s*:/g)].map((m) => m[1]);
  for (const v of computed) {
    const accept = [v];
    const decl = new RegExp(`(?:const|let)\\s+${v}\\s*=([^;]+);`).exec(body);
    if (decl) accept.push(...[...decl[1].matchAll(/["'\`]([a-z_][a-z0-9_]*)["'\`]/gi)].map((m) => m[1]));
    groups.push({ label: `[${v}]`, accept: [...new Set(accept)] });
  }
  return groups;
}

/**
 * Does the chain FILTER on every column it writes?
 *
 * `.eq("user_id", ...)` scoping the row is not enough and is not counted —
 * the guard has to mention the column whose old value the write depends on.
 */
function reasserts(chain, groups) {
  const rest = chain.slice(chain.indexOf(")"));
  return groups.every((g) =>
    g.accept.some((name) =>
      new RegExp(`\\.(or|eq|lt|gt|gte|lte|neq|is|filter)\\([^)]*${name}`).test(rest)
    )
  );
}

console.log("write-guards");

// ---------------------------------------------------------------------
console.log("\n== 1. recordPackPurchaseRate does not read before it writes ==");
// ---------------------------------------------------------------------
const creditsSrc = readFileSync(path.join(ROOT, "src/lib/billing/credits.ts"), "utf8");
const packBody = functionBody(creditsSrc, "recordPackPurchaseRate");
check("the function was found", packBody !== null, true);

// THE READ IS THE BUG. Math.min over a value fetched a round trip earlier
// is a decision made from a number that may already be stale.
check(
  "it does not call getPurchasedPackCreditPriceEur",
  (packBody ?? "").includes("getPurchasedPackCreditPriceEur"),
  false
);
check("it does not compute the minimum in TypeScript", /Math\.min\s*\(/.test(packBody ?? ""), false);

const packChains = updateChains(packBody ?? "");
check("it issues exactly one update", packChains.length, 1);

// The property: the column it WRITES is the column it FILTERS on.
const packCols = writtenColumns(packChains[0] ?? "", packBody ?? "");
check("it writes min_pack_credit_price_eur", packCols.map((g) => g.label), ["min_pack_credit_price_eur"]);
check("its update re-asserts the column it writes", reasserts(packChains[0] ?? "", packCols), true);

// ---------------------------------------------------------------------
console.log("\n== 2. the overage warning is CLAIMED, not just marked ==");
// ---------------------------------------------------------------------
const overageSrc = readFileSync(path.join(ROOT, "src/lib/billing/overage-store.ts"), "utf8");
const warnBody = functionBody(overageSrc, "sendOverageWarnings");
check("the function was found", warnBody !== null, true);

const warnChains = updateChains(warnBody ?? "");
check("it still issues an update", warnChains.length >= 1, true);

for (const chain of warnChains) {
  const cols = writtenColumns(chain, warnBody ?? "");
  const label = cols.map((g) => g.label).join(", ");
  check(`update writing [${label}] re-asserts those columns`, reasserts(chain, cols), true);
  // .select() is what turns the update into a claim: without it there is no
  // way to know whether this caller or the other one won.
  const rest = chain.slice(chain.indexOf(")"));
  check(`update writing [${label}] reads back what it matched`, /\.select\(/.test(rest), true);
}

// AND THE SEND MUST DEPEND ON THE CLAIM. An update that is filtered and
// read back, followed by a send that ignores the result, is the same
// duplicate email with more code in front of it.
const sendsFromClaim =
  /const\s+claimed\s*[:=]/.test(warnBody ?? "") &&
  /for\s*\(\s*const\s+\w+\s+of\s+claimed\s*\)/.test(warnBody ?? "");
check("the notification loop iterates what the update claimed", sendsFromClaim, true);
check(
  "it returns early when nothing was claimed",
  /claimed\.length\s*===\s*0[\s\S]{0,40}return/.test(warnBody ?? ""),
  true
);

// ---------------------------------------------------------------------
console.log("\n== 3. the website generation attempt is CLAIMED ==");
// ---------------------------------------------------------------------
// The most expensive one. Two POSTs landing together both read
// `pending, 0`, both cleared the cap, and both ran a full paid AI
// generation — one increment recorded, two Anthropic calls, two credit
// settlements. The route is fired `void fetch(...)` from the browser, so
// a double-click produces it.
const genSrc = readFileSync(
  path.join(ROOT, "src/app/api/websites/generate/process/route.ts"),
  "utf8"
);
const genChain = updateChains(genSrc).find((c) => /attempt_count/.test(c));
check("the attempt_count update was found", genChain !== undefined, true);

const genRest = (genChain ?? "").slice((genChain ?? "").indexOf(")"));
// BOTH values the decision was made from. The status alone is not enough:
// two callers can see the same `pending` and the cap check reads the
// count, so the count is half of what has to hold.
check("it re-asserts the status it read", /\.eq\(\s*["'`]status["'`]/.test(genRest), true);
check("it re-asserts the attempt_count it read", /\.eq\(\s*["'`]attempt_count["'`]/.test(genRest), true);
check("it reads back whether it won", /\.select\(/.test(genRest), true);
// And the claim has to DECIDE something. A compare-and-swap whose result
// is discarded is an expensive no-op.
check(
  "an empty claim stops the generation",
  /claimed[\s\S]{0,80}length\s*===\s*0[\s\S]{0,120}return/.test(genSrc),
  true
);

// ---------------------------------------------------------------------
console.log("\n== 4. the notification group count is CLAIMED ==");
// ---------------------------------------------------------------------
// Absorbing a burst is this function's job, so the concurrent case IS the
// normal case: five agent runs finishing together all read the same
// count, all write +1, and the digest tells the user two things happened
// when five did.
const dispatchSrc = readFileSync(path.join(ROOT, "src/lib/notify/dispatch.ts"), "utf8");
const groupChains = updateChains(dispatchSrc).filter((c) => /group_count/.test(c));
check("the group_count updates were found", groupChains.length >= 1, true);
for (const [i, chain] of groupChains.entries()) {
  const rest = chain.slice(chain.indexOf(")"));
  check(
    `group_count update ${i + 1} re-asserts the count it read`,
    /\.eq\(\s*["'`]group_count["'`]/.test(rest),
    true
  );
}
// A retry that recomputes from the SAME stale number is the bug again
// with an extra round trip in front of it.
check(
  "the retry re-reads the row rather than reusing the stale count",
  /if\s*\(!bumped[\s\S]{0,200}\.select\(\s*["'`]group_count["'`]/.test(dispatchSrc),
  true
);

console.log(`\n${fail === 0 ? "PASS" : "FAIL"}  ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
