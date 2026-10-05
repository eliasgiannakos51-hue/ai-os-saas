// EVERY NEW TOOL AND BIG CHANGE SHIPS BEHIND A SWITCH THE OWNER TURNS
// WITHOUT A DEPLOY (MASTER Μέρος 13 Β, 2026-10-05).
//
// The rule (src/lib/flags/flags.ts) is RUN: who 'off', 'staff' and
// 'everyone' let in; that the test account counts as staff; that an
// unknown key or audience is refused. The route and the page are read with
// comments stripped: the switch is owner-only, written with the service
// role, and the table is closed to the signed-in role. Every key in FLAGS
// must be read somewhere in src/ outside the flags files, so a switch is
// never a row on a page that turns nothing.
//
// Run: node scripts/tests/feature-flags.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "../check-mutation-markers.mjs";
import { loadTs } from "./load-ts.mjs";

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

console.log("== 1. who each setting lets in, run ==");
const src = readFileSync("src/lib/flags/flags.ts", "utf8");
// The pure half, without the database and logging imports: everything
// above readFlagAudiences, with isAdminEmail stood in by ADMIN_EMAILS.
const pure = stripComments(src)
  .replace(/^import[^\n]*\n/gm, "")
  .split("export async function readFlagAudiences")[0]
  .replace("if (isAdminEmail(email)) return true;", "if (email.trim().toLowerCase() === \"owner@example.com\") return true;")
  .replace("export { FLAG_AUDIENCES, type FlagAudience };", readFileSync("src/lib/flags/audience.ts", "utf8").replace(/\/\*\*[\s\S]*?\*\//, ""));
const { mkdtempSync, writeFileSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const dir = mkdtempSync(join(tmpdir(), "flags-"));
writeFileSync(join(dir, "flags.ts"), pure);
const flags = await loadTs(join(dir, "flags.ts"));
// The owner stands in for ADMIN_EMAILS above; the test accounts are passed
// the way process.env.TEST_ACCOUNT_EMAILS would hand them over.
const env = "bot@example.com, qa@example.com";
check("'everyone' lets a customer in", flags.audienceAllows("everyone", false) === true);
check("'staff' lets the owner in and a customer not", flags.audienceAllows("staff", true) === true && flags.audienceAllows("staff", false) === false);
check("'off' lets nobody in, not even the owner", flags.audienceAllows("off", true) === false && flags.audienceAllows("off", false) === false);
check("the owner is staff", flags.isStaffEmail("Owner@Example.com", env) === true);
check("the test account is staff, from TEST_ACCOUNT_EMAILS", flags.isStaffEmail("qa@example.com", env) === true);
check("a customer is not", flags.isStaffEmail("someone@example.com", env) === false && flags.isStaffEmail(null, env) === false);
check("a switch with no row reads as staff, never everyone", flags.DEFAULT_AUDIENCE === "staff");
check("only the three settings are accepted", ["off", "staff", "everyone"].every(flags.isFlagAudience) && !flags.isFlagAudience("all") && !flags.isFlagAudience(""));
check("only declared keys are accepted", Object.keys(flags.FLAGS).every(flags.isFlagKey) && !flags.isFlagKey("toString") && !flags.isFlagKey("nope"));

console.log("\n== 2. reading fails towards staff ==");
const code = stripComments(src);
check("the read starts every switch at the default", /const out = Object\.fromEntries\(Object\.keys\(FLAGS\)\.map\(\(k\) => \[k, DEFAULT_AUDIENCE\]\)\)/.test(code));
check("...takes only a declared key with a valid setting from the table", /if \(isFlagKey\(row\.key\) && isFlagAudience\(row\.audience\)\) out\[row\.key\] = row\.audience;/.test(code));
check("...and on any error keeps the defaults", /\} catch \(err\) \{\s*logApiError\("flags:read", err\);\s*\}\s*return out;/.test(code));

console.log("\n== 3. the switch is the owner's ==");
const route = stripComments(readFileSync("src/app/api/system-health/flags/route.ts", "utf8"));
check("signed in, and a 404 to anyone but the owner", /if \(!user\) return NextResponse\.json\(\{ ok: false \}, \{ status: 401 \}\);/.test(route) && /if \(!isAdminEmail\(user\.email\)\) return NextResponse\.json\(\{ ok: false \}, \{ status: 404 \}\);/.test(route));
check("only a declared key and a valid setting are written", /if \(!isFlagKey\(body\?\.key\) \|\| !isFlagAudience\(body\?\.audience\)\)/.test(route));
check("written with the service role", /await createAdminClient\(\)\s*\.from\("feature_flags"\)\s*\.upsert\(/.test(route));
const page = stripComments(readFileSync("src/app/dashboard/system-health/page.tsx", "utf8"));
check("the panel is on the owner-only page, after its own check", page.indexOf("if (!isAdminEmail(user.email)) notFound();") >= 0 && page.indexOf("if (!isAdminEmail(user.email)) notFound();") < page.indexOf("await readFlagAudiences()") && /<FeatureFlags\b/.test(page));
const mig = readFileSync("supabase/migrations/20261017000000_feature_flags.sql", "utf8").replace(/--.*$/gm, "");
check("the table is closed to the signed-in role", /enable row level security/.test(mig) && /revoke all on public\.feature_flags from anon, authenticated;/.test(mig) && !/create policy/i.test(mig));
check("...and holds only the three settings", /check \(audience in \('off', 'staff', 'everyone'\)\)/.test(mig));

console.log("\n== 4. every switch turns something ==");
function walk(d, out = []) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}
const readers = walk("src").filter((f) => !f.startsWith(join("src", "lib", "flags")) && !f.includes("system-health"));
const unread = Object.keys(flags.FLAGS).filter((k) => !readers.some((f) => stripComments(readFileSync(f, "utf8")).includes(`isFeatureOn("${k}"`)));
check(`every declared switch is read with isFeatureOn somewhere (${Object.keys(flags.FLAGS).length})`, unread.length === 0, unread.join(", "));

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
