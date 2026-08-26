// Every module path a gate spells out must resolve to a real file.
//
// THE SHAPE. Around thirty assertions across twenty gates check that one
// file imports another by matching the PATH as a string or a regex:
//
//     ok("chat route imports buildCachedSystem",
//        /import \{ buildCachedSystem \} from "@\/lib\/ai\/cached-system"/.test(src));
//
// TypeScript cannot see inside that regex. Rename the module and the
// compiler is happy, the app is correct, and the gate quietly stops
// matching. What happens next depends on which way the assertion points:
//
//   - "X imports Y"      -> goes RED. Annoying, and loudly wrong, so it is
//                           fixed within the hour.
//   - "nothing imports Y" -> stays GREEN, forever, looking at zero files.
//
// The second happened in this repository, in the same session that found
// it. owner-only-access.test.mjs filtered client components for
// /from "@\/lib\/admin"/ and asserted the result was empty. lib/admin.ts
// became lib/auth/admin-emails.ts; the filter matched nothing; the check
// passed. A rename turned a real guarantee into a permanently true
// statement about an empty list.
//
// THE FIX IS NOT "STOP CHECKING IMPORTS" — a gate that says "this route
// goes through the shared helper" is worth having. It is that a path
// written into a gate must be PROVEN to exist, so a rename breaks it
// immediately and visibly rather than silently.
//
// Run: node scripts/tests/gate-import-paths.test.mjs
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

const DIR = "scripts/tests";
let pass = 0;
const failures = [];
function ok(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

/** "@/lib/x" -> the file it would load, or null. */
/** Comments are not code — and this file's own subject is quoted at length
 *  in several of them. The first version counted the sentence explaining
 *  the lib/admin rename as a broken path, along with every "src/lib/X.ts"
 *  written as an EXAMPLE of the shape. A scanner that fails on its own
 *  rationale teaches people to delete the rationale. */
function stripJs(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

/** Paths a gate names ON PURPOSE that do not exist: fixtures it creates and
 *  deletes, and deliberately-absent samples used to prove a check can fail.
 *  Each is listed with the file that owns it, so an entry cannot silently
 *  start excusing a different gate's stale path. */
const DELIBERATE = new Map([
  ["template-plurals.mutation.mjs", [
    // Written, scanned and removed by the suite to prove the migration
    // scanner notices a file nobody committed.
    "supabase/migrations/20261231000000_stray.sql",
    "supabase/migrations/20261231000000_innocent.sql",
  ]],
  ["test-export-drift.test.mjs", [
    // Sample module names in the drift fixture — never real files.
    "src/lib/x.ts",
    "src/lib/deleted.ts",
    "src/lib/images.ts",
  ]],
  ["icons.test.mjs", [
    // Handed to existsSync through a LOOP VARIABLE, so the literal-argument
    // rule below cannot see it:
    //     for (const f of ["src/app/icon.tsx", "src/app/opengraph-image.tsx"])
    //       if (existsSync(f)) ...
    // Both are Next.js icon conventions this app deliberately does NOT use —
    // it ships static icon.svg and apple-icon.png instead, because the
    // dynamic routes were what the auth middleware kept intercepting.
    "src/app/icon.tsx",
    "src/app/opengraph-image.tsx",
  ]],
  ["gate-import-paths.test.mjs", [
    // This file's own red-proof.
    "@/lib/zz-no-such-module",
  ]],
]);

function resolveAlias(spec) {
  const base = path.join("src", spec.slice("@/".length));
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx", ".json"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  return existsSync(base) ? base : null;
}

const files = readdirSync(DIR)
  .filter((f) => /\.(test|itest|prodtest|dbtest|mutation)\.mjs$/.test(f))
  .sort();

console.log("gate-import-paths");
ok(`the gates were found (${files.length})`, files.length >= 100, `found ${files.length}`);

// ---------------------------------------------------------------------
console.log("\n== every @/… path written into a gate resolves ==");
// ---------------------------------------------------------------------
// Both spellings: the plain string form ("@/lib/x") and the regex form,
// where every slash is backslash-escaped ("@\/lib\/x"). Un-escaping first
// is the whole reason the earlier rename missed one — a search-and-replace
// for "@/lib/admin" does not see "@\/lib\/admin".
// The first segment must START WITH A LETTER. A gate matching an email
// regex contains `@\]\+@/.test(`, which the earlier pattern read as the
// module specifier "@/.test".
const SPEC = /@\\?\/[A-Za-z][A-Za-z0-9_-]*(?:\\?\/[A-Za-z0-9_.-]+)*/g;
let checked = 0;
const broken = [];
for (const file of files) {
  const src = stripJs(readFileSync(path.join(DIR, file), "utf8"));
  // THIS FILE LISTS OTHER FILES' FIXTURES AS DATA, so scanning itself finds
  // every one of them. The allowlist covers its own listing.
  const allowed =
    file === "gate-import-paths.test.mjs"
      ? [...DELIBERATE.values()].flat()
      : DELIBERATE.get(file) ?? [];
  const specs = new Set(
    [...src.matchAll(SPEC)]
      .map((m) => m[0].replace(/\\\//g, "/"))
      // A trailing dot or a bare "@/lib" with nothing after it is prose,
      // not a module specifier.
      .filter((s) => s.length > 3 && !s.endsWith(".") && s.split("/").length >= 2)
  );
  for (const spec of specs) {
    checked++;
    if (!allowed.includes(spec) && !resolveAlias(spec)) broken.push(`${file}: ${spec}`);
  }
}
console.log(`  ....  ${checked} distinct @/ specifiers across ${files.length} gates`);
// A floor: "none is broken" is trivially true of an empty set, and this
// whole file is one regex away from finding nothing.
// Measured today: 45 distinct @/ specifiers across the gates. A floor,
// because "none is broken" is trivially true of an empty set and this
// whole section is one regex away from finding nothing.
ok(`the scan found specifiers to check (${checked})`, checked >= 45, `found ${checked}`);
ok(
  `every @/ path in a gate resolves to a file (${broken.length} broken)`,
  broken.length === 0,
  broken.join("\n        ")
);

// ---------------------------------------------------------------------
console.log("\n== and every src/… path written into a gate resolves ==");
// ---------------------------------------------------------------------
// The other spelling. Mutation suites name their targets as repository
// paths ("src/lib/billing/credits.ts") rather than aliases, and a stale one
// there is the stale-anchor bug by another route — the file is read, comes
// back empty or throws, and the mutation applies to nothing.
// tsx BEFORE ts, sql before nothing: an alternation tries its branches in
// order, so `ts` matched first and every .tsx path was captured as .ts —
// 319 real files reported as missing by this file's own regex.
// NOT PRECEDED BY A PATH CHARACTER. usage-field-coverage names
// node_modules/@anthropic-ai/sdk/resources/messages/messages.d.ts, and
// matching from the middle produced "messages/messages.d.ts", which of
// course does not exist at the repository root.
const REPO_PATH = /(?<![A-Za-z0-9_./-])(?:src|supabase|messages|public)\/[A-Za-z0-9_./[\]-]*\.(?:tsx|ts|sql|json|mjs)/g;

/** A path handed to existsSync() is ABOUT existence, and three gates assert
 *  that a file is GONE:
 *
 *      check("apple-icon.tsx (dynamic route) is gone",
 *            existsSync("src/app/apple-icon.tsx"), false);
 *      check("there is exactly one tab-title helper",
 *            !existsSync("src/lib/page-metadata.ts"));
 *
 *  Flagging those would demand that a file exist in order to prove it does
 *  not. They are also the one form that needs no protection from this gate:
 *  an existsSync assertion checks the filesystem itself, so a rename cannot
 *  make it silently match nothing — it flips, and the gate goes red. */
function existsSyncArguments(src) {
  return new Set([...src.matchAll(/existsSync\(\s*[`"']([^`"']+)[`"']/g)].map((m) => m[1]));
}
let repoChecked = 0;
const repoBroken = [];
for (const file of files) {
  const src = stripJs(readFileSync(path.join(DIR, file), "utf8"));
  const allowed =
    file === "gate-import-paths.test.mjs"
      ? [...DELIBERATE.values()].flat()
      : DELIBERATE.get(file) ?? [];
  const selfChecking = existsSyncArguments(src);
  for (const spec of new Set([...src.matchAll(REPO_PATH)].map((m) => m[0]))) {
    if (selfChecking.has(spec)) continue;
    repoChecked++;
    if (!allowed.includes(spec) && !existsSync(spec)) repoBroken.push(`${file}: ${spec}`);
  }
}
console.log(`  ....  ${repoChecked} distinct repository paths`);
ok(`the scan found repository paths to check (${repoChecked})`, repoChecked >= 100, `found ${repoChecked}`);
ok(
  `every repository path in a gate exists (${repoBroken.length} broken)`,
  repoBroken.length === 0,
  repoBroken.join("\n        ")
);

// ---------------------------------------------------------------------
console.log("\n== the gate can go red ==");
// ---------------------------------------------------------------------
// Proven here rather than asserted, because both checks above are
// "nothing is broken" — the exact shape this file exists to distrust.
ok("a path that does not exist is reported as broken", resolveAlias("@/lib/zz-no-such-module") === null);
ok("...and a path that does exist is not", resolveAlias("@/lib/auth/admin-emails") !== null);
ok("...including one reached through index.ts, if any gate uses that form",
  resolveAlias("@/lib/billing/estimate") !== null);

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ${failures.join("\n  - ")}`
);
process.exit(failures.length === 0 ? 0 : 1);
