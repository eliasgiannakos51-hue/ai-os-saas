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

// EVERY job the route starts early, not just the email.
//
// The email was the first one, and while it was the only one this suite
// could get away with asserting the literal shape `Promise.race([
// welcomeEmail,` at the end. It is not the only one any more: a signup
// that arrived through a referral link also starts the affiliate
// attribution write early, for exactly the same reason (nobody presses
// "Create account" to wait for somebody else's commission to be
// recorded).
//
// So the property is the general one: every promise started before the
// critical path must be inside the ONE residual race at the end. A
// background job left out of it is a write that a frozen serverless
// invocation may simply never perform — the failure the residual wait
// exists to prevent — and it would leave this file's shape assertions
// entirely happy.
const BACKGROUND_JOBS = [
  { name: "the welcome email", promise: "welcomeEmail", startedBy: "const welcomeEmail = sendWelcomeEmail(email)" },
  {
    name: "the affiliate attribution",
    promise: "referralAttribution",
    startedBy: "const referralAttribution = referralCode",
  },
];

console.log("== 1. the background work overlaps the critical path, instead of following it ==");
const grantAt = src.indexOf("await grantCredits(");
const signInAt = src.indexOf("supabase.auth.signInWithPassword(");
const raceMatch = /await Promise\.race\(\[[\s\S]*?\n {4}\]\);/.exec(src);
const awaitedAt = raceMatch ? raceMatch.index : -1;
const raceBlock = raceMatch?.[0] ?? "";
for (const job of BACKGROUND_JOBS) {
  const startedAt = src.indexOf(job.startedBy);
  check(`${job.name} is started`, startedAt > 0);
  check(`  BEFORE the credit grant`, startedAt > 0 && grantAt > 0 && startedAt < grantAt);
  check(`  and before the sign-in`, startedAt > 0 && signInAt > 0 && startedAt < signInAt);
  check(`  but only awaited after both`, awaitedAt > grantAt && awaitedAt > signInAt);
  check(`  and it IS awaited — inside the residual race`, new RegExp(`\\b${job.promise}\\b`).test(raceBlock));
}
// Started-and-not-awaited-for-several-statements is exactly the shape that
// takes a process down on an unexpected rejection.
check("the welcome email cannot reject unhandled", /sendWelcomeEmail\(email\)\.catch\(/.test(src));
check("nor can the attribution write", /attributeReferral\(\{[\s\S]*?\}\)\.catch\(/.test(src));

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
check(
  "it is still awaited, not fired and forgotten",
  /await Promise\.race\(\[/.test(src) && /setTimeout\(resolve, WELCOME_EMAIL_RESIDUAL_MS\)/.test(raceBlock)
);
// And the race is a FLOOR on the background work, not a race between the
// jobs: Promise.all, so the shorter one finishing does not release the
// wait while the other is still in flight.
check(
  "the residual budget covers all the background work, not the first job to finish",
  BACKGROUND_JOBS.length < 2 || /Promise\.all\(\[/.test(raceBlock)
);

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
