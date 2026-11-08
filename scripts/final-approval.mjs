#!/usr/bin/env node
/*
 * FINAL APPROVAL — «ΤΕΛΕΙΩΣΕ» ΜΕ ΑΠΟΔΕΙΞΕΙΣ, ΟΧΙ ΜΕ ΛΟΓΙΑ.
 *
 * Autonomy level 1: it READS a change and REPORTS. It never edits a file,
 * never merges, never calls the network. The owner decides.
 *
 * WHY IT EXISTS. This repository's own history is a list of things that
 * said "done" and were not: `docs/v5-list.md` described finished work as
 * still to do (CLAUDE.md, «The plan is updated in the SAME commit»), two
 * migrations were never pasted and a feature broke in production
 * (CLAUDE.md, «Migrations are applied by hand»), and a green local build
 * sat on top of a red gate. Every rule below is one of CLAUDE.md's rules
 * turned into a check on the diff, so "is this really finished?" has an
 * answer that does not depend on who is asked.
 *
 * WHAT IT WILL NOT DO: it never says the gates passed. Gates are only
 * "verified" when the caller passes `--gates-exit <code>` from a run it
 * actually made; otherwise the report says UNVERIFIED and lists it.
 * A check that cannot be run is reported as not run, never as passed.
 *
 * Run: node scripts/final-approval.mjs [--base origin/main] [--head HEAD]
 *        [--body-file pr-body.md] [--gates-exit 0] [--json]
 *      Exit code: 0 = READY, 1 = NOT READY (at least one failed check).
 *      UNVERIFIED items alone do not make it exit 1; they are printed.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

/** One check result. status: "pass" | "fail" | "unverified". */
const result = (id, status, detail) => ({ id, status, detail });

/** Text of a «## heading» section, comments and whitespace removed. */
export function section(body, heading) {
  const lines = String(body ?? "").split("\n");
  const at = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (at < 0) return null;
  const rest = [];
  for (let i = at + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) rest.push(lines[i]);
  return rest.join("\n").replace(/<!--[\s\S]*?-->/g, "").trim();
}

/** The undo note of a migration header, or null. Same shape migration-undo.test.mjs reads. */
export function undoNote(sql) {
  const lines = sql.split("\n").filter((l) => l.startsWith("--")).map((l) => l.replace(/^--\s?/, ""));
  const at = lines.findIndex((l) => /^(How to undo:|No undo:)/.test(l.trim()));
  if (at < 0) return null;
  const parts = [lines[at].trim().replace(/^(How to undo:|No undo:)\s*/, "")];
  for (let i = at + 1; i < lines.length && lines[i].trim() !== ""; i++) parts.push(lines[i].trim());
  return parts.join(" ").trim();
}

const isMigration = (f) => /^supabase\/migrations\/[^/]+\.sql$/.test(f);
const isCode = (f) => /^(src|scripts)\//.test(f) && !/^scripts\/tests\//.test(f);
const isTest = (f) => /^scripts\/tests\/.+\.(test|mutation|dbtest|itest|prodtest)\.mjs$/.test(f);
const isPlanDoc = (f) => /^docs\/(PROGRESS|QUEUE)\.md$/.test(f);

/** The pure core: files changed (added/modified), a reader for new file text, the PR body, the gates exit code. */
export function evaluate({ changed, readFile, body, gatesExit }) {
  const out = [];
  const migrations = changed.filter(isMigration);

  // 1. Every new migration says how to undo it.
  for (const m of migrations) {
    const note = undoNote(readFile(m) ?? "");
    const ok = note !== null && note.length >= 20;
    out.push(result(`migration-undo:${m}`, ok ? "pass" : "fail", ok ? "has an undo note" : "add `-- How to undo: …` or `-- No undo: …` (≥ 20 chars)"));
  }

  // 2. The PR body, when we were given one.
  if (body == null) {
    out.push(result("pr-body", "unverified", "no --body-file given; «Πώς γυρίζει πίσω» and the migrations line were not checked"));
  } else {
    const back = section(body, "Πώς γυρίζει πίσω");
    out.push(result("pr-body:undo-steps", back && back.length >= 10 ? "pass" : "fail", back && back.length >= 10 ? "«Πώς γυρίζει πίσω» is filled in" : "«Πώς γυρίζει πίσω» is missing or empty"));
    if (migrations.length > 0) {
      const has = /ΝΕΑ MIGRATIONS ΝΑ ΤΡΕΞΕΙΣ:/.test(body);
      out.push(result("pr-body:migrations-line", has ? "pass" : "fail", has ? "names the migrations to run" : "migrations were added but the body has no `ΝΕΑ MIGRATIONS ΝΑ ΤΡΕΞΕΙΣ:` line"));
    }
  }

  // 3. The plan is updated in the SAME change as the work.
  if (changed.some(isCode)) {
    const touched = changed.some(isPlanDoc);
    out.push(result("plan-updated", touched ? "pass" : "fail", touched ? "docs/PROGRESS.md or docs/QUEUE.md changed with the code" : "code changed but neither docs/PROGRESS.md nor docs/QUEUE.md did (CLAUDE.md: same commit)"));
  }

  // 4. Code that changed should come with a test that changed. Reported, not gated by the rule's own history.
  if (changed.some((f) => f.startsWith("src/")) && !changed.some(isTest)) {
    out.push(result("test-with-code", "fail", "files under src/ changed and no scripts/tests/* file did"));
  }

  // 5. The gates: never assumed.
  if (gatesExit == null) out.push(result("gates", "unverified", "not run by this report; pass --gates-exit <code> from a real `npm run gates`"));
  else out.push(result("gates", gatesExit === 0 ? "pass" : "fail", `npm run gates exited ${gatesExit}`));

  return out;
}

export const verdict = (results) => (results.some((r) => r.status === "fail") ? "NOT READY" : "READY");

export function render(results) {
  const mark = { pass: "PASS", fail: "FAIL", unverified: "UNVERIFIED" };
  const lines = [`# Final approval: ${verdict(results)}`, ""];
  for (const r of results) lines.push(`- ${mark[r.status]}  ${r.id} — ${r.detail}`);
  const un = results.filter((r) => r.status === "unverified");
  if (un.length) lines.push("", `${un.length} item(s) were NOT verified; READY means "no check failed", not "everything was checked".`);
  return lines.join("\n");
}

const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 64e6 }).trim();

function main(argv) {
  const arg = (name, dflt) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : dflt;
  };
  const base = arg("--base", "origin/main");
  const head = arg("--head", "HEAD");
  const bodyFile = arg("--body-file", null);
  const gates = arg("--gates-exit", null);
  const changed = git("diff", "--name-only", "--diff-filter=AM", `${base}...${head}`).split("\n").filter(Boolean);
  const readFile = (f) => { try { return git("show", `${head}:${f}`); } catch { return null; } };
  const body = bodyFile && existsSync(bodyFile) ? readFileSync(bodyFile, "utf8") : null;
  const results = evaluate({ changed, readFile, body, gatesExit: gates == null ? null : Number(gates) });
  console.log(argv.includes("--json") ? JSON.stringify({ verdict: verdict(results), results }, null, 2) : render(results));
  process.exit(verdict(results) === "READY" ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
