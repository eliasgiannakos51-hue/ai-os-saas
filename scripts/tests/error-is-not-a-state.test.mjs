// A DISCARDED QUERY ERROR MUST NOT BECOME A ROUTING DECISION.
//
// /dashboard/overview went down in production this way, and it did not
// look like a crash:
//
//   const { data: onboardingState } = await supabase        // no `error`
//     .select("completed_at, skipped_at, home_seen_at")
//   if (!onboardingState?.completed_at && !onboardingState?.skipped_at)
//     redirect("/onboarding");
//
// home_seen_at arrives in 20260914000000_home_seen_at.sql. Against a
// database where that migration has not been applied, PostgREST answers
// 400 — "column user_onboarding.home_seen_at does not exist". `data` is
// then null, the error was thrown away, and null was read as "this user
// has not onboarded". Every account, every visit, bounced to /onboarding
// on the one route that selects the column.
//
// Three things this explains, and they are why it was mistaken for the
// known React #310:
//   - PERMANENT, not intermittent. #310 was 2 in 7.
//   - ONLY that route. It is the only one selecting that column.
//   - THE ERROR BOUNDARY NEVER FIRED, and was not broken. Nothing threw.
//     redirect() is ordinary control flow, and a boundary catches
//     exceptions, not decisions.
//
// The rule: a redirect may be gated on the RESULT of a read only when the
// read is known to have SUCCEEDED. "I could not tell" and "the answer is
// no" are different answers, and only one of them may move a user.
//
// Static, and honest about it: it reads the shape, not the behaviour.
// What it can prove is that no site has the shape that failed.
//
// Run: node scripts/tests/error-is-not-a-state.test.mjs
import { readFileSync, globSync } from "node:fs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}

const files = globSync("src/**/*.{ts,tsx}");
check(`there are source files to scan (${files.length})`, files.length > 500, String(files.length));

// ---------------------------------------------------------------------
console.log("\n== a discarded error may not gate a redirect ==");
const offenders = [];
let destructures = 0;
let gated = 0;
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    // A destructure that takes `data` and NOT `error`.
    const m = lines[i].match(/(?:const|let)\s*\{\s*data:\s*(\w+)\s*\}\s*=\s*await/);
    if (!m) continue;
    destructures++;
    const name = m[1];
    const window = lines.slice(i, i + 25).join("\n");
    if (!/redirect\s*\(/.test(window)) continue;
    // ...where a condition mentioning that binding reaches a redirect.
    const gate = new RegExp(`if\\s*\\([^)]*\\b${name}\\b[^)]*\\)\\s*\\{?[\\s\\S]{0,120}?redirect\\s*\\(`);
    if (!gate.test(window)) continue;
    gated++;
    offenders.push(`${f}:${i + 1}  { data: ${name} } — error discarded, then gates a redirect`);
  }
}
console.log(`        ${destructures} data-only destructure(s) of an awaited call; ${gated} reach a redirect`);
check(
  `no discarded query error gates a redirect (${offenders.length})`,
  offenders.length === 0,
  offenders.join("\n        ") +
    "\n        Read the error. A failed read is not an answer, and must not move a user."
);

// THE SCAN MUST BE ABLE TO SEE THE ORIGINAL DEFECT, or it is asserting
// nothing. Rebuilt here exactly as it was written, and matched.
console.log("\n== the scan can see the shape it exists for ==");
{
  const original = [
    '  const { data: onboardingState } = await supabase',
    '    .from("user_onboarding")',
    '    .select("completed_at, skipped_at, home_seen_at")',
    '    .eq("user_id", user.id)',
    '    .maybeSingle();',
    '',
    '  if (!onboardingState?.completed_at && !onboardingState?.skipped_at) {',
    '    redirect("/onboarding");',
    '  }',
  ];
  const m = original[0].match(/(?:const|let)\s*\{\s*data:\s*(\w+)\s*\}\s*=\s*await/);
  const name = m?.[1];
  const window = original.join("\n");
  const gate = new RegExp(`if\\s*\\([^)]*\\b${name}\\b[^)]*\\)\\s*\\{?[\\s\\S]{0,120}?redirect\\s*\\(`);
  check("it matches the destructure", Boolean(name), String(name));
  check("...and the redirect it gates", gate.test(window));
}

// AND IT MUST NOT MATCH THE FIX, or the rule is unsatisfiable and the
// next person deletes it.
console.log("\n== and it accepts a read whose error is checked ==");
{
  const fixed = [
    '  let { data: onboardingState, error: onboardingError } = await supabase',
    '    .from("user_onboarding")',
    '    .select("completed_at, skipped_at, home_seen_at")',
    '    .maybeSingle();',
    '',
    '  if (!onboardingError && !onboardingState?.completed_at) {',
    '    redirect("/onboarding");',
    '  }',
  ].join("\n");
  check("the fixed shape is not flagged", !/(?:const|let)\s*\{\s*data:\s*(\w+)\s*\}\s*=\s*await/.test(fixed));
}

// ---------------------------------------------------------------------
console.log("\n== the page that went down reads its error ==");
{
  const page = readFileSync("src/app/dashboard/overview/page.tsx", "utf8");
  check("overview reads the user_onboarding error", /error:\s*onboardingError/.test(page));
  check("...and will not redirect on a failed read", /!onboardingError\s*&&/.test(page),
    "a redirect gated only on the data is the bug this file is named after");
  check("...and falls back to the columns that predate the newest migration",
    /\.select\("completed_at, skipped_at"\)/.test(page),
    "a deploy ahead of its migration should degrade, not bounce the user");
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
