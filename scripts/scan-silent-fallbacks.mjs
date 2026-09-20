#!/usr/bin/env node
/*
 * A FALLBACK THAT DOES NOT SAY IT WAS USED.
 *
 * THE INSTANCE, 2026-09-19. ci-build.mjs spawned `npm run build`, got
 * ENOENT because PATH had been swept into the sentinel list, and
 * printed "The build FAILS in a deployed environment (exit null)". The
 * build had never started. Three CI reports were read against that
 * output before anybody noticed it was measuring nothing.
 *
 * The owner's generalisation: "the silent recovery is what made the
 * three failures invisible. A fallback MUST report that it was used —
 * otherwise it hides the bug it exists to protect against."
 *
 * WHAT COUNTS AS SILENT. A recovery path that produces a plausible
 * value and tells nobody:
 *
 *   EMPTY CATCH      catch {} or catch { /* comment only *\/ }
 *   SWALLOWED        catch (e) { return <default> } with no log, no
 *                    throw, and nothing added to the result
 *   ?? ON A CALL     foo() ?? DEFAULT — a failure that returns
 *                    null becomes the default with no trace
 *   RETRY            a second attempt with different arguments, where
 *                    nothing records that the first was needed
 *
 * WHAT IS NOT A FINDING, and most of the tree is this. A catch that
 * LOGS is doing exactly what this rule asks. A catch on a probe whose
 * whole contract is "returns null when it cannot ask" — navFreshness,
 * derivedDataHealth — reports through its own return value, which is
 * the report. A default for a value that was never expected to be
 * there is not a fallback; it is a default.
 *
 * So this prints three columns: catches that log, catches that return
 * a value silently, and catches that do neither. The middle column is
 * the one to read.
 *
 * Run: node scripts/scan-silent-fallbacks.mjs
 *      node scripts/scan-silent-fallbacks.mjs --json
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { stripComments } from "./check-mutation-markers.mjs";

const ROOTS = ["src"];

export function sourceFiles(roots = ROOTS) {
  const out = [];
  const walk = (dir) => {
    for (const entry of [...readdirSync(dir)].sort()) {
      const full = `${dir}/${entry}`;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(full)) out.push(full);
    }
  };
  for (const r of roots) walk(r);
  return out;
}

/** The block starting at `open`, brace-matched. */
function blockAt(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  return "";
}

/** Does this catch body tell anybody it ran? */
const REPORTS = /logApiError|logError|console\.(error|warn|log)|captureException|reportError|Sentry|raise|track\(|notify|degraded|\bthrow\b/;

/**
 * Does the value it produces CARRY the failure?
 *
 * The first version of this scan reported 172 "silent recoveries" and
 * the first six were `catch { return NextResponse.json({ ok: false,
 * error: "Invalid request body." }, { status: 400 }) }`. That is not a
 * silent fallback — it is the loudest thing a route can do. A caller
 * cannot miss a 400.
 *
 * So a recovery counts as silent only when what it produces LOOKS LIKE
 * A REAL ANSWER: no ok:false, no error field, no 4xx/5xx, no explicit
 * null or empty result that a typed caller has to handle. A number, a
 * string, a populated object — something the caller will use as though
 * the work had succeeded.
 */
const CARRIES_FAILURE =
  /ok:\s*false|success:\s*false|\berror\b|status:\s*[45]\d\d|return\s+null\b|return\s+undefined\b|return\s+\[\]|return\s+\{\s*\}|"unchecked"|'unchecked'|failed|Failed/;

export function catches(files = sourceFiles()) {
  const out = [];
  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const src = stripComments(raw);
    for (const m of src.matchAll(/\}\s*catch\s*(?:\(([^)]*)\))?\s*\{/g)) {
      const open = src.indexOf("{", m.index + m[0].length - 1);
      const body = blockAt(src, open);
      const bare = body.trim();
      out.push({
        file,
        // A catch that rethrows or logs has reported. A catch that
        // returns a value carrying the failure — a 400, an ok:false, a
        // null a typed caller must handle — has also reported, through
        // the value. What is left is a plausible answer with no trace.
        reports: REPORTS.test(body) || CARRIES_FAILURE.test(body),
        recovers: /\breturn\b|=[^=]/.test(body),
        empty: bare === "",
        line: raw.slice(0, m.index).split("\n").length,
        preview: bare.replace(/\s+/g, " ").slice(0, 72),
      });
    }
  }
  return out;
}

/** `something(...) ?? fallback` — a call whose failure becomes a value. */
export function nullishOnCalls(files = sourceFiles()) {
  const out = [];
  for (const file of files) {
    const raw = readFileSync(file, "utf8");
    const src = stripComments(raw);
    for (const m of src.matchAll(/\b([A-Za-z_$][\w$.]*)\([^()\n]{0,120}\)\s*\?\?\s*([^;,\n)]{1,40})/g)) {
      out.push({
        file,
        call: m[1],
        fallback: m[2].trim(),
        line: raw.slice(0, m.index).split("\n").length,
      });
    }
  }
  return out;
}

export function summary() {
  const all = catches();
  return {
    files: sourceFiles().length,
    total: all.length,
    reporting: all.filter((c) => c.reports).length,
    silentRecovery: all.filter((c) => !c.reports && c.recovers),
    silentEmpty: all.filter((c) => !c.reports && !c.recovers && c.empty),
    silentOther: all.filter((c) => !c.reports && !c.recovers && !c.empty).length,
    nullish: nullishOnCalls().length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = summary();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(s, null, 2));
    process.exit(0);
  }
  console.log(`== ${s.total} catch blocks across ${s.files} files in src ==\n`);
  console.log(`  ${String(s.reporting).padStart(4)}  log, rethrow, or return a value that CARRIES the failure`);
  console.log(`  ${String(s.silentRecovery.length).padStart(4)}  RECOVER SILENTLY — return or assign a value, and tell nobody`);
  console.log(`  ${String(s.silentEmpty.length).padStart(4)}  are empty: the error is discarded and execution continues`);
  console.log(`  ${String(s.silentOther).padStart(4)}  neither\n`);

  console.log("-- THE ONES THAT PRODUCE A VALUE AND SAY NOTHING --\n");
  for (const c of s.silentRecovery.slice(0, 30)) {
    console.log(`   ${c.file}:${c.line}`);
    console.log(`       ${c.preview}`);
  }
  if (s.silentRecovery.length > 30) console.log(`   ... and ${s.silentRecovery.length - 30} more`);

  console.log(`\n-- AND ${s.nullish} CALLS WHOSE FAILURE BECOMES A DEFAULT (foo() ?? x) --\n`);
  for (const n of nullishOnCalls().slice(0, 10)) {
    console.log(`   ${n.file}:${n.line}  ${n.call}() ?? ${n.fallback}`);
  }

  console.log(
    "\n  REPORTS; DOES NOT GATE. A catch that returns a value silently is\n" +
      "  not automatically wrong — a probe whose contract is 'null when it\n" +
      "  cannot ask' reports through its return value, and that IS the\n" +
      "  report. What this cannot tell you is whether the CALLER looks.\n" +
      "  Settle one by making the inner call fail and seeing whether\n" +
      "  anything anywhere says so."
  );
}
