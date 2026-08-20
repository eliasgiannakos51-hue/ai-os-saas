// WHAT THE PERSON SIGNING UP IS WAITING FOR.
//
// The route does five things: rate limit, create the user, grant the
// signup credits, send a welcome email, sign in. Only four of them are
// things the user is waiting FOR — nobody presses "Create account" to
// receive a marketing email.
//
// It was ten seconds, then three. The three had one obvious passenger: the
// welcome email sat in the middle of the chain with a 2.5s cap, so its
// latency was added to the total in full. It is now STARTED as soon as the
// account exists and only its remainder is awaited at the end, so it
// overlaps the credit grant and the sign-in instead of following them.
//
// This suite checks the ORDER, because the order is the fix — a test that
// measured a wall clock here would be measuring this machine's Supabase
// latency, which is not the property that changed. The real end-to-end
// number comes from the deployment itself (IONEXA_DIAG=1 prints the stage
// timings, and e2e/reported-bugs.e2e.ts measures the whole request).
//
// Run: node scripts/tests/signup-latency.test.mjs
import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const raw = readFileSync("src/app/api/signup/route.ts", "utf8");
const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("== 1. the email overlaps the work, instead of following it ==");
const startedAt = src.indexOf("const welcomeEmail = sendWelcomeEmail(email)");
const grantAt = src.indexOf("await grantCredits(");
const signInAt = src.indexOf("supabase.auth.signInWithPassword(");
const awaitedAt = src.indexOf("await Promise.race([\n      welcomeEmail,");
check("the send is started", startedAt > 0);
check("BEFORE the credit grant", startedAt > 0 && grantAt > 0 && startedAt < grantAt);
check("and before the sign-in", startedAt > 0 && signInAt > 0 && startedAt < signInAt);
check("but only awaited after both", awaitedAt > grantAt && awaitedAt > signInAt);
// Started-and-not-awaited-for-several-statements is exactly the shape that
// takes a process down on an unexpected rejection.
check("the started promise cannot reject unhandled", /sendWelcomeEmail\(email\)\.catch\(/.test(src));

console.log("\n== 2. the residual wait is a tail, not the whole send ==");
const residual = /const WELCOME_EMAIL_RESIDUAL_MS = (\d+);/.exec(src);
check("there is a named residual budget", Boolean(residual));
check(
  `it is small (${residual?.[1]}ms), because the send has already been running`,
  Number(residual?.[1]) <= 500
);
check("the old 2.5s serial cap is gone", !/setTimeout\(resolve, 2500\)/.test(src));
// A promise abandoned at response time may never run to completion on a
// serverless platform — hence a residual wait rather than none at all.
check("it is still awaited, not fired and forgotten", /await Promise\.race\(\[\s*welcomeEmail/.test(src));

console.log("\n== 3. every stage is still measurable from the deployment ==");
for (const stage of ["rate_limit", "create_user", "grant_credits", "welcome_email", "sign_in"]) {
  check(`${stage} is marked`, new RegExp(`mark\\("${stage}"\\)`).test(src));
}
check("the timings are printed behind the diagnostic flag", /diagLog\(`\[signup\] stage timings/.test(src));
check("and the flag is IONEXA_DIAG", /IONEXA_DIAG/.test(readFileSync("src/lib/diag.ts", "utf8")));

console.log("\n== 4. nothing else was added to the critical path ==");
// Every await in the route body, in order. A new one that is not one of
// the five stages is a passenger somebody added without noticing.
const awaits = [...src.matchAll(/await ([A-Za-z_.]+)\(/g)].map((m) => m[1]);
const allowed = new Set([
  "request.json",
  "checkRateLimit",
  "admin.auth.admin.createUser",
  "grantCredits",
  "supabase.auth.signInWithPassword",
  "Promise.race",
  "cookies",
  "headers",
]);
const strangers = awaits.filter((name) => !allowed.has(name));
check(
  `no unexpected awaited call (${awaits.length} awaits: ${[...new Set(awaits)].join(", ")})`,
  strangers.length === 0,
  strangers.join(", ")
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
