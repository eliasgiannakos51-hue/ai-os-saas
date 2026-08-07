// Rate-limit coverage (V3 Task 10, SECURITY.md §δ).
//
// The rule being enforced: every endpoint that COSTS something — AI
// tokens, storage rows, email, an outbound request — has a per-user,
// per-time-unit limit. Reads are not scanned; a mutating method is the
// signal that a request might create cost.
//
// Two mechanisms satisfy the rule, because the app genuinely has two:
//
//   checkRateLimit    (lib/rate-limit.ts)        — the general limiter
//   checkAiCallAllowed (lib/ai-circuit-breaker.ts) — the AI routes'
//        hourly per-user cap + platform daily cap + duplicate breaker,
//        strictly stronger than a plain rate limit for model calls
//
// Everything else must be on the justified list below WITH ITS REASON,
// so a new unmetered mutating route is a build failure and adding one
// to the list is a written decision, not a drift. This mirrors
// security-posture.test.mjs §3 (auth), which caught the public-web
// routes only because it scanned everything and demanded justification.
//
// Run: node scripts/tests/rate-limit-coverage.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let pass = 0,
  fail = 0;
function checkTrue(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// Routes that mutate but are deliberately not behind either limiter.
// Every entry names the mechanism that bounds it instead — an entry
// with no real bound does not belong here, it belongs fixed. Where the
// bound is an inline mechanism in the file itself, `mustMatch` pins it
// so deleting the mechanism un-justifies the route in the same commit.
const JUSTIFIED = {
  "src/app/api/auth/login/route.ts": {
    reason:
      "carries its own failed-attempt limiter over rate_limit_log, counting only FAILURES per IP — checkRateLimit would count successes too and lock out a busy legitimate user",
    mustMatch: /MAX_FAILED_ATTEMPTS/,
  },
  "src/app/api/webhooks/stripe/route.ts": {
    reason:
      "authenticated by Stripe's signature; call volume is Stripe's, and every handler is idempotent on the event id",
    mustMatch: /constructEvent|webhook.*signature|stripe-signature/i,
  },
  "src/app/api/websites/[id]/submit-form/route.ts": {
    reason:
      "public form on generated sites; carries its own per-website hourly cap because the caller has no account to key checkRateLimit on",
    mustMatch: /MAX_SUBMISSIONS_PER_HOUR/,
  },
  "src/app/api/billing-portal/route.ts": {
    reason:
      "one authenticated Stripe API call returning a redirect URL for the caller's own customer record; nothing accumulates and Stripe's own limits bound the upstream",
  },
  "src/app/api/entity-links/suggest/route.ts": {
    reason: "pure keyword matching over the caller's own rows; no AI call, no write, no email",
  },
  "src/app/api/favorites/toggle/route.ts": {
    reason:
      "idempotent single-row toggle on the caller's own data; a loop of it converges to one row, not growth",
  },
  "src/app/api/mission/schedule-step/route.ts": {
    reason: "flips scheduling fields on the caller's own existing mission row; nothing is created",
  },
  "src/app/api/system-health/resolve/route.ts": {
    reason: "marks the caller's own error row resolved; a write to an existing row, no growth",
  },
  "src/app/api/team/remove/route.ts": {
    reason: "deletes a membership row; destructive of the caller's own data only, nothing accumulates",
  },
  "src/app/api/documents/[id]/route.ts": {
    reason:
      "PATCH/DELETE on one owned row with length-capped fields; edits replace, deletes shrink — no growth per request",
  },
  "src/app/api/files/[id]/route.ts": {
    reason: "DELETE only: frees the caller's own storage; abuse deletes their own files",
  },
  "src/app/api/research/[id]/route.ts": {
    reason: "DELETE only: removes the caller's own report row",
  },
  "src/app/api/websites/[id]/regenerate/route.ts": {
    reason:
      "single-use by construction: the conditional claim on free_retry_used means the second call finds nothing to win",
    mustMatch: /free_retry_used/,
  },
};

const MUTATING_RE = /export async function (POST|PATCH|PUT|DELETE)\b/;

const routes = walk("src/app").filter((f) => f.endsWith("route.ts"));
const mutating = routes.filter((f) => MUTATING_RE.test(readFileSync(f, "utf8")));
checkTrue(
  `mutating route handlers discovered (${mutating.length})`,
  mutating.length >= 45,
  "the scan found suspiciously few routes — did the route layout move?"
);

for (const file of mutating) {
  const key = file.replace(/\\/g, "/");
  const src = readFileSync(file, "utf8");
  const limited = /checkRateLimit\s*\(/.test(src);
  const breakered = /checkAiCallAllowed\s*\(/.test(src);
  const justified = JUSTIFIED[key];

  if (limited || breakered) {
    pass++;
    console.log(`  PASS  ${key} — ${limited ? "checkRateLimit" : "checkAiCallAllowed"}`);
  } else if (justified) {
    if (justified.mustMatch && !justified.mustMatch.test(src)) {
      fail++;
      console.log(
        `  FAIL  ${key} — justified by an inline mechanism (${justified.mustMatch}) that is no longer in the file`
      );
    } else {
      pass++;
      console.log(`  PASS  ${key} — justified: ${justified.reason}`);
    }
  } else {
    fail++;
    console.log(
      `  FAIL  ${key} mutates but has no rate limit, no AI breaker, and no justification.\n` +
        `        Add checkRateLimit (lib/rate-limit.ts), or if a real mechanism already bounds\n` +
        `        this route, record it in JUSTIFIED with its reason.`
    );
  }
}

// A justification for a file that no longer exists (or no longer
// mutates) is dead weight that will one day vouch for the wrong thing.
const mutatingSet = new Set(mutating.map((f) => f.replace(/\\/g, "/")));
for (const key of Object.keys(JUSTIFIED)) {
  checkTrue(`justified entry still exists and still mutates: ${key}`, mutatingSet.has(key));
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
