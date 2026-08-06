// Reproduction test for "photos from a previous project appeared in the
// new website".
//
// ROOT CAUSE. Reference images are uploaded to a path scoped to the USER
// and nothing else:
//
//     `${userId}/${uniqueSuffix}-${sanitizedFilename}`   (buildReferenceImagePath)
//
// The storage RLS policy checks only that the first segment is auth.uid(),
// so it stops one user reading another's images — and stops nothing else.
// Then the generation worker took the list of paths to use straight from
// the REQUEST BODY:
//
//     referenceImagePaths = Array.isArray(body?.referenceImagePaths)
//       ? body.referenceImagePaths.filter(p => typeof p === "string")...
//       : [];
//
// with no check that those paths had anything to do with this website.
// Any stale path still sitting in client state — a generation that failed,
// a form the user closed, an abandoned clarification — was accepted and
// baked into the next site. The website_reference_images table, which is
// the only place the association is actually recorded, was not written
// until AFTER generation had already finished, so the server had nothing
// to check against even if it had wanted to.
//
// THE FIX. The association is now recorded when the pending row is created
// (step 2, api/websites/generate), and the worker (step 3,
// api/websites/generate/process) reads the paths from the DATABASE by
// websiteId instead of trusting the caller. Cross-project contamination
// stops being something to guard against and becomes unrepresentable.
//
// Run:  node scripts/tests/reference-image-scoping.test.mjs
// Live: PGTEST=1 node scripts/tests/reference-image-scoping.test.mjs
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

let pass = 0,
  fail = 0,
  skipped = 0;
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

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const PROCESS = "src/app/api/websites/generate/process/route.ts";
const START = "src/app/api/websites/generate/route.ts";
const processSrc = stripComments(readFileSync(PROCESS, "utf8"));
const startSrc = stripComments(readFileSync(START, "utf8"));

console.log("== 1. the worker must NOT take its image list from the caller ==");
// This is the bug, stated directly. If the worker reads
// body.referenceImagePaths, any stale client state is authoritative.
check(
  `${PROCESS}: does not read referenceImagePaths from the request body`,
  /body\?\.referenceImagePaths/.test(processSrc),
  false
);
checkTrue(
  `${PROCESS}: loads them from website_reference_images instead`,
  /from\("website_reference_images"\)[\s\S]{0,400}\.eq\("website_id"/.test(processSrc)
);
checkTrue(
  `${PROCESS}: scopes that read by the authenticated user too`,
  /from\("website_reference_images"\)[\s\S]{0,400}\.eq\("user_id", user\.id\)/.test(processSrc)
);

console.log("\n== 2. the association is recorded when the row is created ==");
// Without this, step 3 has nothing to read and every generation silently
// loses its images — a fix that trades one bug for a worse one.
checkTrue(
  `${START}: inserts into website_reference_images`,
  /from\("website_reference_images"\)[\s\S]{0,300}\.insert\(/.test(startSrc)
);
checkTrue(
  `${START}: links each row to the website it just created`,
  /website_id:/.test(startSrc) && /user_id: user\.id/.test(startSrc)
);

console.log("\n== 3. defence in depth: a path must live in the caller's folder ==");
// Storage RLS already blocks a cross-USER read, but relying on a policy in
// another system to enforce an invariant this code depends on is how the
// original bug survived review.
checkTrue(
  "a shared ownership guard exists",
  /export function referenceImagePathBelongsToUser/.test(readFileSync("src/lib/website-reference-image.ts", "utf8"))
);
const { referenceImagePathBelongsToUser } = await import(
  "data:text/javascript;base64," +
    Buffer.from(
      (await import("typescript")).default.transpileModule(
        readFileSync("src/lib/website-reference-image.ts", "utf8"),
        { compilerOptions: { module: 99, target: 9 } }
      ).outputText
    ).toString("base64")
);
const U = "11111111-1111-1111-1111-111111111111";
const V = "22222222-2222-2222-2222-222222222222";
check("own path accepted", referenceImagePathBelongsToUser(`${U}/1700-abc.png`, U), true);
check("another user's path rejected", referenceImagePathBelongsToUser(`${V}/1700-abc.png`, U), false);
check("path traversal rejected", referenceImagePathBelongsToUser(`${U}/../${V}/x.png`, U), false);
check("bare filename rejected", referenceImagePathBelongsToUser("x.png", U), false);
check("empty rejected", referenceImagePathBelongsToUser("", U), false);
check("prefix-collision rejected", referenceImagePathBelongsToUser(`${U}extra/x.png`, U), false);
check("leading slash rejected", referenceImagePathBelongsToUser(`/${U}/x.png`, U), false);
checkTrue(`${START}: applies the guard`, /referenceImagePathBelongsToUser/.test(startSrc));

console.log("\n== 4. the client cannot carry files between projects ==");
const WS = "src/components/website-builder/website-builder-workspace.tsx";
const ws = stripComments(readFileSync(WS, "utf8"));
// The proximate cause the user hit: files were cleared only on SUCCESS, so
// a failed or abandoned generation left them staged for the next one.
//
// What matters is that every exit path clears them — NOT how many times
// the setter is written. Counting `setReferenceImageFiles([])` call sites
// would reward copy-pasting the reset into each handler and fail the
// single shared function, which is the better shape. So: assert one reset
// exists, and that it is CALLED from more than one place.
checkTrue(
  "there is a single reset used by every exit path",
  /function resetGenerationForm\(/.test(ws)
);
const resetCalls = [...ws.matchAll(/(?<!function )resetGenerationForm\(\)/g)].length;
checkTrue(`...called from success, cancel and "+ New" (${resetCalls} call sites)`, resetCalls >= 3);
check(
  "the staged files are cleared in exactly one place",
  [...ws.matchAll(/setReferenceImageFiles\(\[\]\)/g)].length,
  1
);
checkTrue("...which clears the staged files", /function resetGenerationForm\([\s\S]{0,400}setReferenceImageFiles\(\[\]\)/.test(ws));
checkTrue(
  "...and the abandoned-clarification state",
  /function resetGenerationForm\([\s\S]{0,400}setPendingClarification\(null\)/.test(ws)
);

console.log("\n== 5. live: two projects' images stay separate ==");
let conn = null;
try {
  execFileSync("psql", ["-h", "/tmp", "-p", "55432", "-U", "postgres", "-tAc", "select 1"], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  conn = ["-h", "/tmp", "-p", "55432", "-U", "postgres"];
} catch {
  /* no server */
}
if (!conn) {
  skipped++;
  console.log("  SKIP  no Postgres reachable — the live half did NOT run.");
  console.log("        Start one with:  initdb -D /tmp/pgtest -U postgres --auth=trust");
  console.log("                          pg_ctl -D /tmp/pgtest -o '-k /tmp -p 55432' start");
} else {
  const run = (sql) =>
    execFileSync("psql", [...conn, "-v", "ON_ERROR_STOP=1", "-q"], { input: sql, encoding: "utf8" });
  const q = (sql) =>
    execFileSync("psql", [...conn, "-v", "ON_ERROR_STOP=1", "-tAc", sql], { encoding: "utf8" }).trim();

  run(`
    drop schema if exists refimg_test cascade;
    create schema refimg_test;
    create table refimg_test.website_reference_images (
      id bigserial primary key,
      user_id uuid not null,
      website_id uuid not null,
      image_url text not null,
      created_at timestamptz not null default now()
    );
    insert into refimg_test.website_reference_images (user_id, website_id, image_url) values
      ('${U}', '33333333-3333-3333-3333-333333333333', '${U}/old-project-logo.png'),
      ('${U}', '33333333-3333-3333-3333-333333333333', '${U}/old-project-hero.png'),
      ('${U}', '44444444-4444-4444-4444-444444444444', '${U}/new-project-logo.png'),
      ('${V}', '55555555-5555-5555-5555-555555555555', '${V}/other-user.png');
  `);

  // Exactly the query the worker now runs.
  const forNew = q(`select string_agg(image_url, ',' order by image_url)
                    from refimg_test.website_reference_images
                    where website_id = '44444444-4444-4444-4444-444444444444' and user_id = '${U}'`);
  check("the new project sees only its OWN image", forNew, `${U}/new-project-logo.png`);
  checkTrue("...and none from the previous project", !forNew.includes("old-project"));

  const forOld = q(`select count(*) from refimg_test.website_reference_images
                    where website_id = '33333333-3333-3333-3333-333333333333' and user_id = '${U}'`);
  check("the previous project still has both of its own", forOld, "2");

  // The user filter is not decoration: without it a guessed website_id from
  // another account would return that account's images.
  const crossUser = q(`select count(*) from refimg_test.website_reference_images
                       where website_id = '55555555-5555-5555-5555-555555555555' and user_id = '${U}'`);
  check("another user's website returns nothing", crossUser, "0");

  run("drop schema if exists refimg_test cascade;");
}

console.log(
  `\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed${skipped ? `, ${skipped} SKIPPED` : ""}`
);
process.exit(fail === 0 ? 0 : 1);
