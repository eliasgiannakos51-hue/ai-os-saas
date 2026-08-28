// EVERY ENVIRONMENT VARIABLE THIS APP READS, FOUND TWO WAYS.
//
// A grep for `process.env.X` finds 51 of them and misses 73, because the
// other 73 are named as STRINGS and read through `process.env[name]`:
//
//     export const FILE_LIMIT_ENV_VARS: Record<PlanSlug, string> = {
//       free: "FILE_LIMIT_FREE",
//       ...
//
// That is the same blind spot as a Recharts `dataKey` or a Supabase
// `.from("table")` — a name the compiler never checks and a scanner
// walks straight past. It is why "fifteen undocumented variables" was
// wrong by a factor of four.
//
// So both forms are collected, and the second is deliberately narrow: an
// ALL_CAPS_WITH_UNDERSCORES literal, at least eight characters, appearing
// as an object VALUE or an array element, in a file that mentions
// process.env at all. That shape excludes "POST" and "S256" (no
// underscore) without an exemption list.
import { readFileSync, readdirSync } from "node:fs";

/** Names that belong to the platform or the test rig, not to a deployment. */
export const NOT_A_DEPLOYMENT_SETTING = new Set([
  // Vercel and Node set these themselves.
  "NODE_ENV", "VERCEL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL",
  "NEXT_RUNTIME", "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA", "NEXT_PUBLIC_BUILD_ID",
  // The agent proxy in the development container.
  "HTTPS_PROXY", "X",
  // Only the gates and scripts read these.
  "PGDATABASE", "PGTEST_URL", "DATABASE_URL", "TEST_DATABASE_URL", "CHROMIUM_PATH",
  "AUDIT_PAGES", "HAZE_PAGES", "SKIP_BUILD", "SUPABASE_DELAY_MS", "PROD_BASE_URL",
  "BASE_URL", "DIAGNOSE_HEADER",
  // NOT MAX_FUNCTION_DURATION. It was in this list for one run, on the
  // assumption that only scripts/apply-function-limits.mjs read it — and
  // lib/function-limits.ts reads it too, as `env.MAX_FUNCTION_DURATION`,
  // which is a third spelling neither collector above would catch on its
  // own. env-check.ts naming it is what saved this.
]);

const ENV_NAME = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/;

export function sourceFiles(root = "src") {
  const out = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
  })(root);
  return out;
}

/** name -> the first file that reads it. */
export function envVarsReadByCode(root = "src") {
  const found = new Map();
  const note = (name, file) => {
    if (ENV_NAME.test(name) && !found.has(name)) found.set(name, file);
  };
  for (const file of sourceFiles(root)) {
    const source = readFileSync(file, "utf8");
    for (const m of source.matchAll(/process\.env\.([A-Z0-9_]+)/g)) note(m[1], file);
    // THE IDENTIFIER PATTERN RUNS ON EVERY FILE. Gating this on the file
    // mentioning `process.env` was wrong: lib/ai/batch/batch-policy.ts
    // declares BATCH_ENABLED_ENV_VAR = "AI_BATCH_ENABLED" and never
    // touches process.env itself — the value is read through an injected
    // env object, which is exactly how this codebase keeps its policy
    // functions testable. The name is no less real for that.
    for (const m of source.matchAll(/\w*(?:ENV_VAR|ENV_VARS|Env)\w*\s*(?::[^=\n]*)?=\s*"([A-Z][A-Z0-9_]*)"/g)) {
      if (m[1].length >= 8) note(m[1], file);
    }
    if (!/process\.env/.test(source)) continue;
    // An object value or an array element that is shaped like an env name.
    for (const m of source.matchAll(/(?::\s*|\[\s*|,\s*)"([A-Z][A-Z0-9_]*)"/g)) {
      if (m[1].length >= 8) note(m[1], file);
    }
    // A LONE CONSTANT, which the pattern above cannot see because there is
    // no colon, comma or bracket in front of it:
    //
    //     export const PROVIDER_ORDER_ENV_VAR = "AI_PROVIDER_ORDER";
    //
    // Restricted to identifiers that say ENV, so this does not sweep up
    // every uppercase string constant in the codebase. Three variables —
    // AI_PROVIDER_ORDER, AI_FAILOVER_ENABLED and AI_BATCH_ENABLED — are
    // declared only this way and were missing from the first count.
  }
  // env-check.ts is itself a registry read through process.env[name].
  for (const m of readFileSync("src/lib/env-check.ts", "utf8").matchAll(/name:\s*"([A-Z0-9_]+)"/g)) {
    note(m[1], "src/lib/env-check.ts");
  }
  for (const name of NOT_A_DEPLOYMENT_SETTING) found.delete(name);
  return found;
}

/** The names `.env.local.example` documents, in order. */
export function envVarsInExample(path = ".env.local.example") {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => (line.match(/^([A-Z0-9_]+)=/) || [])[1])
    .filter(Boolean);
}
