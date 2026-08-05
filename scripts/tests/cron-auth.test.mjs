// Reproduction test for the cron fail-OPEN gap found in the V1+V2 audit.
//
// All three scheduler-triggered routes used to guard themselves like this:
//
//     const secret = process.env.CRON_SECRET;
//     if (secret) { ...401 on mismatch... }
//
// so a deployment that never set CRON_SECRET served them to the entire
// internet. The blast radius:
//
//   GET /api/cron/reset-credits  -> rewrites EVERY account's balance
//   GET /api/cron/scheduled-runs -> spends real Anthropic money for every user
//   GET /api/weekly-digest       -> emails the entire user base
//
// This test drives the real checkCronAuth() with real Request objects
// under each env combination, and separately asserts that no route has
// quietly reintroduced its own inline `if (secret)` guard.
//
// Run: node scripts/tests/cron-auth.test.mjs
import { readFileSync } from "node:fs";
import ts from "typescript";

let pass = 0,
  fail = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual),
    e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}
function checkTrue(name, cond) {
  check(name, Boolean(cond), true);
}

// cron-auth.ts is dependency-free apart from node:crypto, so it can be
// transpiled and imported directly. A counter is appended to the source so
// each load is a distinct module (Node caches data: URIs by content) —
// necessary because the module is re-imported per env scenario.
let loadCounter = 0;
function loadCronAuth() {
  const src = readFileSync("src/lib/cron-auth.ts", "utf8") + `\nexport const __n = ${loadCounter++};\n`;
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
}

const ENV_KEYS = ["CRON_SECRET", "VERCEL_ENV", "VERCEL", "NODE_ENV"];
async function withEnv(env, fn) {
  const saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  try {
    const mod = await loadCronAuth();
    return await fn(mod.checkCronAuth);
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const req = (headers = {}) => new Request("https://ionexa.example/api/cron/reset-credits", { headers });

console.log("== 1. THE BUG: no CRON_SECRET must NOT mean open access ==");

// The exact production shape: deployed to Vercel, nobody set the secret.
await withEnv({ VERCEL_ENV: "production", VERCEL: "1", NODE_ENV: "production" }, (checkCronAuth) => {
  const r = checkCronAuth(req());
  check("unauthenticated request on Vercel production is REFUSED", r.ok, false);
  check("  ...with 503, not a silent success", r.status, 503);
  checkTrue("  ...and the message does not name the missing variable", !/CRON_SECRET/.test(r.error));
});

// Preview deployments are public URLs too — same rule.
await withEnv({ VERCEL_ENV: "preview", VERCEL: "1", NODE_ENV: "production" }, (checkCronAuth) => {
  check("a preview deployment is refused too", checkCronAuth(req()).ok, false);
});

// A non-Vercel production host (self-hosted / Docker / any Node process).
await withEnv({ NODE_ENV: "production" }, (checkCronAuth) => {
  check("a non-Vercel production process is refused", checkCronAuth(req()).ok, false);
});

// Sending a made-up secret must not help when none is configured — the
// route is off, not guessable.
await withEnv({ VERCEL_ENV: "production", VERCEL: "1", NODE_ENV: "production" }, (checkCronAuth) => {
  check(
    "guessing a secret does not open an unconfigured route",
    checkCronAuth(req({ authorization: "Bearer anything" })).ok,
    false
  );
});

console.log("\n== 2. local development still works without a secret ==");
await withEnv({ NODE_ENV: "development" }, (checkCronAuth) => {
  check("localhost dev with no secret is allowed", checkCronAuth(req()).ok, true);
});
await withEnv({}, (checkCronAuth) => {
  check("no NODE_ENV at all (bare `node`) is treated as local", checkCronAuth(req()).ok, true);
});
// ...but a deployment is never "local", even if NODE_ENV is unset/wrong.
await withEnv({ VERCEL: "1" }, (checkCronAuth) => {
  check("VERCEL=1 alone is enough to disqualify 'local'", checkCronAuth(req()).ok, false);
});

console.log("\n== 3. with a secret configured, the check is a real check ==");
await withEnv({ CRON_SECRET: "s3cret-value", VERCEL_ENV: "production", VERCEL: "1" }, (checkCronAuth) => {
  check("correct Bearer token accepted", checkCronAuth(req({ authorization: "Bearer s3cret-value" })).ok, true);
  check("x-cron-secret header accepted", checkCronAuth(req({ "x-cron-secret": "s3cret-value" })).ok, true);

  const wrong = checkCronAuth(req({ authorization: "Bearer wrong-value" }));
  check("wrong token rejected", wrong.ok, false);
  check("  ...with 401", wrong.status, 401);

  check("missing header rejected", checkCronAuth(req()).ok, false);
  check("raw secret without the Bearer prefix rejected", checkCronAuth(req({ authorization: "s3cret-value" })).ok, false);
  // A prefix of the real secret must not pass — this is what a naive
  // startsWith comparison would let through.
  check("a prefix of the secret rejected", checkCronAuth(req({ authorization: "Bearer s3cret" })).ok, false);
  check("the secret plus a suffix rejected", checkCronAuth(req({ authorization: "Bearer s3cret-value-x" })).ok, false);
  check("empty x-cron-secret rejected", checkCronAuth(req({ "x-cron-secret": "" })).ok, false);
});

// timingSafeEqual throws when the two buffers differ in length; the guard
// has to compare lengths first or a wrong-length token becomes a 500.
await withEnv({ CRON_SECRET: "abc", VERCEL: "1" }, (checkCronAuth) => {
  let threw = false;
  try {
    checkCronAuth(req({ authorization: "Bearer a-much-longer-token" }));
  } catch {
    threw = true;
  }
  check("a different-length token does not throw", threw, false);
});

console.log("\n== 4. every cron route actually uses the shared guard ==");
const ROUTES = [
  "src/app/api/cron/reset-credits/route.ts",
  "src/app/api/cron/scheduled-runs/route.ts",
  "src/app/api/weekly-digest/route.ts",
];
for (const file of ROUTES) {
  const src = readFileSync(file, "utf8");
  checkTrue(`${file}: imports checkCronAuth`, src.includes('from "@/lib/cron-auth"'));
  checkTrue(`${file}: calls it`, src.includes("checkCronAuth(request)"));
  // The regression to prevent: reintroducing the inline fail-open guard.
  check(
    `${file}: no inline 'if (secret)' fail-open guard`,
    /const secret = process\.env\.CRON_SECRET/.test(src),
    false
  );
  // The guard must be the FIRST thing the handler does — before any admin
  // client is built or any work is started.
  const bodyStart = src.indexOf("export async function GET");
  const guardAt = src.indexOf("checkCronAuth(request)", bodyStart);
  const adminAt = src.indexOf("createAdminClient()", bodyStart);
  checkTrue(`${file}: guard runs before any admin/database work`, guardAt > 0 && (adminAt < 0 || guardAt < adminAt));
  // And it must RETURN on failure, not merely log.
  checkTrue(
    `${file}: a failed check returns immediately`,
    /if \(!auth\.ok\) \{\s*return NextResponse\.json\(/.test(src)
  );
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
