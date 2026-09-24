// A FALLBACK THAT DOES NOT SAY IT WAS USED.
//
// THE INSTANCE, 2026-09-19. ci-build.mjs spawned `npm run build`, got
// ENOENT because PATH had been swept into the sentinel list, and
// printed "The build FAILS in a deployed environment (exit null)". The
// build had never started, and three CI reports were read against that
// output before anybody noticed it was measuring nothing.
//
// The owner's rule: a fallback MUST report that it was used, or it
// hides the bug it exists to protect against.
//
// AND THE ONE IT LED TO, which is the reason this file exists. The
// command palette did:
//
//     const results = res.ok && data.ok ? data.results : [];
//     searchCacheRef.current.set(key, results);
//
// A 500 from /api/search became an empty array, was CACHED as one, and
// the panel said "No matches for …". /api/search returns exactly that
// 500 for every error it meets — including a search index that has
// never been backfilled, which is the state this project was in.
//
// So "⌘K finds nothing" and "⌘K is broken" produced the IDENTICAL
// screen. The owner reported the first, twice, while living with the
// second; a whole round went into proving the matcher was right before
// anybody could see that the request had failed. And because the empty
// array was cached, retyping the same query never even retried.
//
// Run: node scripts/tests/silent-fallbacks.test.mjs
import { readFileSync, readdirSync } from "node:fs";
import { stripComments } from "../check-mutation-markers.mjs";
import { summary } from "../scan-silent-fallbacks.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const palette = readFileSync("src/components/dashboard/command-palette.tsx", "utf8");
const code = stripComments(palette);

// ---------------------------------------------------------------------
console.log("== 1. the palette tells a failed search from an empty one ==");
ok("a non-ok response is not turned into results",
  /if \(!res\.ok \|\| !data\.ok\) \{/.test(code),
  "`res.ok && data.ok ? data.results : []` makes an outage look like nothing matched");
ok("...it raises a flag instead",
  /if \(!res\.ok \|\| !data\.ok\) \{[\s\S]{0,160}setSearchFailed\(true\)/.test(code));
ok("...and the network half does the same",
  /\} catch \{[\s\S]{0,240}setSearchFailed\(true\)/.test(code));
ok("a successful search lowers the flag again",
  /setSearchFailed\(false\);\s*\n\s*const results/.test(code),
  "a flag that is never cleared turns one outage into a permanent banner");

// ---------------------------------------------------------------------
console.log("\n== 2. a failure is never cached ==");
// The old code cached the empty array it made out of a failure, so
// retyping the same query never retried: one outage froze that query as
// "no matches" for the rest of the session.
{
  const at = code.indexOf("searchCacheRef.current.set(key, results)");
  ok("the cache write exists to be checked", at !== -1);
  const before = code.slice(Math.max(0, at - 700), at);
  ok("...and the failure path returns before reaching it",
    /if \(!res\.ok \|\| !data\.ok\) \{[\s\S]{0,220}return;\s*\n\s*\}/.test(before),
    "a cached failure is an outage that outlives itself");
}

// ---------------------------------------------------------------------
console.log("\n== 3. the user is told, in their own language ==");
ok("the panel renders the failure rather than 'no matches'",
  /searchFailed\s*\n?\s*\?\s*tCommon\("searchFailed"\)/.test(code),
  "saying 'No matches' about a request that never answered is the lie");
ok("...and says so even when page results are on screen",
  /searchFailed && !searching && \(/.test(code),
  "page navigation is matched in the browser and keeps working while the API is down");
for (const locale of LOCALES) {
  const m = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  const text = m.common?.searchFailed;
  ok(`${locale}: common.searchFailed exists`, typeof text === "string" && text.length > 10, String(text));
}
{
  const en = JSON.parse(readFileSync("messages/en.json", "utf8")).common.searchFailed;
  const el = JSON.parse(readFileSync("messages/el.json", "utf8")).common.searchFailed;
  ok("...and Greek is not the English string copied across", en !== el);
  ok("...and it says it is NOT an empty result, which is the whole point",
    /not an empty result/i.test(en), en);
}

// ---------------------------------------------------------------------
console.log("\n== 3b. the population, not the one file it was found in ==");
// ---------------------------------------------------------------------
// WHAT LOOKING FOR THE SECOND ONE ACTUALLY FOUND.
//
// /api/search had a second caller with the identical defect —
// components/library/library-search.tsx, `catch { setResults([]) }` with
// `res.ok` never read. It was repaired, and then the build's route check
// failed on the sentence describing the repair: it named
// /dashboard/library, and there is no such route. The component had been
// an ORPHAN since 2026-09-02, when the merge that chose main's sidebar
// naming deleted its page and left it behind. Nothing had rendered it
// for eighteen days.
//
// So the fix was a deletion, and the real finding moved to
// entry-points.test.mjs: no component under src/components may be
// unreachable from any page. Four were. An orphan keeps its i18n keys
// alive, which is why orphan-i18n-keys.test.mjs read it as healthy.
//
// WHAT STAYS HERE is the population rule, because it is the thing that
// generalises: every component that reaches /api/search must be able to
// tell a failure from an empty answer. Today that is one. A second added
// tomorrow fails here rather than shipping the same bug again.
{
  const callers = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      // The route is reached through a template literal, so the needle is
      // the PATH and not a quoted string: the first version of this looked
      // for `"/api/search?` and found zero, which the floor below caught.
      else if (/\.tsx?$/.test(e.name) && readFileSync(p, "utf8").includes("/api/search?")) callers.push(p);
    }
  };
  walk("src/components");
  ok(`components that call /api/search were found (${callers.length})`,
    callers.length >= 1,
    "an empty list makes the check below pass by ranging over nothing");
  ok("...and the palette is one of them, by name",
    callers.includes("src/components/dashboard/command-palette.tsx"),
    callers.join(", ") + " — a sweep that lost the known caller is measuring the wrong tree");
  const blind = callers.filter((p) => !/res\.ok/.test(stripComments(readFileSync(p, "utf8"))));
  ok(`...and every one of them reads res.ok (${callers.length - blind.length}/${callers.length})`,
    blind.length === 0,
    blind.join(", "));
  // Anchored on the CATCH specifically, not on the identifier appearing
  // anywhere in the file: a component that declares the flag, renders it,
  // and then forgets to raise it on the dropped request has every token
  // this could look for and none of the behaviour. `res.ok` covers the
  // 500; this covers the connection that never answered.
  const silent = callers.filter((p) => {
    const c = stripComments(readFileSync(p, "utf8"));
    return !/\} catch \{[\s\S]{0,240}(?:setSearchFailed|setFailed)\(true\)/.test(c);
  });
  ok(`...and every one raises a flag on the dropped request too (${callers.length - silent.length}/${callers.length})`,
    silent.length === 0,
    silent.join(", ") + " — reading res.ok and then swallowing the network half is the same lie");
}

// ---------------------------------------------------------------------
console.log("\n== 4. the flag does not leak between openings ==");
ok("closing the palette clears it",
  /function close\(\) \{[\s\S]{0,400}setSearchFailed\(false\)/.test(code));
ok("...and so does a query too short to search",
  /q\.length < MIN_QUERY_LENGTH\) \{[\s\S]{0,200}setSearchFailed\(false\)/.test(code));

// ---------------------------------------------------------------------
console.log("\n== 5. the census, so the rest is visible rather than assumed ==");
// REPORTS; DOES NOT GATE the number. src has hundreds of catch blocks
// and most are right — a route returning 400, a probe whose contract is
// "null when it cannot ask". What this holds is that the scan still
// sorts them, because a scan that classifies everything one way stops
// being able to find the next one.
const s = summary();
ok(`catch blocks found in src (${s.total})`, s.total > 400, `${s.total}`);
ok(`...of which report, rethrow or carry the failure (${s.reporting})`,
  s.reporting > s.total / 2,
  `${s.reporting} of ${s.total} — if this collapsed, the classifier stopped sorting`);
ok(`...and some still recover silently (${s.silentRecovery.length}), so the scan is not blind`,
  s.silentRecovery.length > 0 && s.silentRecovery.length < s.total / 4,
  `${s.silentRecovery.length}`);
console.log(
  `\n  ${s.reporting} report · ${s.silentRecovery.length} recover silently · ${s.silentEmpty.length} empty · ${s.silentOther} neither\n` +
  "  Run `node scripts/scan-silent-fallbacks.mjs` for the list. Settle one\n" +
  "  by making the inner call fail and seeing whether anything says so."
);

console.log("");
if (failures.length > 0) {
  console.log(`${pass} passed, ${failures.length} FAILED:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`ALL PASS: ${pass} passed, 0 failed`);
