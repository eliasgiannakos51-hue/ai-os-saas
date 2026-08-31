#!/usr/bin/env node
/*
 * CAN THE CRON-FIRING GATE GO RED?
 *
 * scripts/tests/cron-firing.test.mjs asserts that an agent is never
 * created on a date that does not exist, and never REFUSED on a date that
 * does. Both halves were broken at once before it existed, so a gate that
 * only catches one of them would have shipped this fix half-done.
 *
 * Every defect below is put back into the real source and the gate has to
 * notice. They are the defects that were actually there, plus the ones a
 * plausible rewrite of the fix would introduce:
 *
 *   THE HORIZON THAT WAS TOO SHORT. 400 days. Every caller reads a null
 *   from nextRunAt as "this schedule never fires", so a real leap-day
 *   schedule was refused with a sentence telling the user it is
 *   impossible. The screen looks like validation working.
 *
 *   FEBRUARY WITH 28 DAYS. The single most tempting simplification in
 *   this file, and it silently deletes the 29th of February from the
 *   product — the one day of the year this whole module has to get right.
 *
 *   THE CHECK REMOVED. canEverFire always true, which is the tree as it
 *   was: "0 8 31 2 *" accepted, an agent created, credits charged, and a
 *   row the dispatcher can never select.
 *
 *   THE CHECK TOO EAGER. Forget that Vixie cron ORs the two day fields
 *   and "0 0 30 2 1" — a perfectly good every-Monday schedule — is
 *   refused as impossible. Over-rejection is the failure mode a fix like
 *   this introduces, and it is invisible until a user hits it.
 *
 *   some/every. One character, and the check flips from "at least one
 *   month can host this day" to "every month must", which refuses the
 *   31st of January.
 *
 *   THE NULL PUT BACK. `?? null` in the adopt route — the original
 *   defect. And the reservation not released, which is the half that
 *   costs money rather than the half that costs a run.
 *
 * Run: node scripts/tests/cron-firing.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/cron-firing.test.mjs";
const CRON = "src/lib/agents/cron-expression.ts";
const ADOPT = "src/app/api/agents/templates/adopt/route.ts";

const MUTANTS = [
  // ------------------------------------------------------------------
  // THE HORIZON THAT WAS TOO SHORT.
  // ------------------------------------------------------------------
  {
    name: "the horizon goes back to 400 days, so a real leap-day schedule is called impossible",
    file: CRON,
    from: "const MAX_DAYS_AHEAD = 2922;",
    to: "const MAX_DAYS_AHEAD = 400;",
  },
  {
    name: "the horizon is 1461 days — four years, which forgets that 2100 is not a leap year",
    file: CRON,
    from: "const MAX_DAYS_AHEAD = 2922;",
    to: "const MAX_DAYS_AHEAD = 1461;",
  },

  // ------------------------------------------------------------------
  // FEBRUARY WITH 28 DAYS.
  // ------------------------------------------------------------------
  {
    name: "February is 28 days, which deletes the 29th of February from the product",
    file: CRON,
    from: "  if (month === 2) return 29;",
    to: "  if (month === 2) return 28;",
  },
  {
    name: "every month is given 30 days, which refuses the 31st of January",
    file: CRON,
    from: "  if (month === 2) return 29;\n  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;",
    to: "  if (month === 2) return 29;\n  return 30;",
  },
  {
    name: "every month is given 31 days, which accepts the 31st of February again",
    file: CRON,
    from: "  if (month === 2) return 29;\n  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;",
    to: "  return 31;",
  },

  // ------------------------------------------------------------------
  // THE CHECK REMOVED — the tree exactly as it was.
  // ------------------------------------------------------------------
  {
    name: "canEverFire always says yes, which is the defect as it shipped",
    file: CRON,
    from: "  if (!fields.dayOfMonthRestricted || fields.dayOfWeekRestricted) return true;",
    to: "  return true;\n  // eslint-disable-next-line no-unreachable",
  },
  {
    name: "validateAgentCron stops asking, so only two of the three routes are guarded again",
    file: CRON,
    from: "  if (!canEverFire(parsed.fields)) {",
    to: "  if (false && !canEverFire(parsed.fields)) {",
  },

  // ------------------------------------------------------------------
  // THE CHECK TOO EAGER — over-rejection.
  // ------------------------------------------------------------------
  {
    name: "the day-of-week OR rule is forgotten, so a good every-Monday schedule is refused",
    file: CRON,
    from: "  if (!fields.dayOfMonthRestricted || fields.dayOfWeekRestricted) return true;",
    to: "  if (!fields.dayOfMonthRestricted) return true;",
  },
  {
    name: "some becomes every, so a day is only allowed if EVERY selected month can host it",
    file: CRON,
    from: "  return fields.month.some((month) =>\n    fields.dayOfMonth.some((day) => day <= maxDayInMonth(month))\n  );",
    to: "  return fields.month.every((month) =>\n    fields.dayOfMonth.every((day) => day <= maxDayInMonth(month))\n  );",
  },
  {
    name: "the comparison loses its equals, so the last day of every month becomes impossible",
    file: CRON,
    from: "    fields.dayOfMonth.some((day) => day <= maxDayInMonth(month))",
    to: "    fields.dayOfMonth.some((day) => day < maxDayInMonth(month))",
  },

  // ------------------------------------------------------------------
  // THE NULL PUT BACK.
  // ------------------------------------------------------------------
  {
    name: "the adopt route falls back to a null next_run_at again",
    file: ADOPT,
    from: "        next_run_at: nextRun.toISOString(),",
    to: "        next_run_at: nextRunAt(validated.draft.scheduleCron, new Date(), validated.draft.timezone)?.toISOString() ?? null,",
  },
  {
    name: "the adopt route refuses but keeps the money — the reservation is never released",
    file: ADOPT,
    from: "    if (!nextRun) {\n      await releaseReservation(user.id, reservationId);",
    to: "    if (!nextRun) {",
  },
];

let caught = 0;
const missed = [];

for (const m of MUTANTS) {
  const original = readFileSync(m.file, "utf8");
  const edits = m.edits ?? [{ from: m.from, to: m.to }];
  const stale = edits.find((e) => !original.includes(e.from));
  if (stale) {
    missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
    console.log(`  STALE   ${m.name}\n          anchor not found in ${m.file}`);
    continue;
  }
  let mutated = original;
  for (const e of edits) mutated = mutated.replace(e.from, e.to);
  if (mutated === original) {
    missed.push({ ...m, why: "the mutation left the file byte-identical — it is not a defect" });
    console.log(`  NO-OP   ${m.name}`);
    continue;
  }
  writeFileSync(m.file, mutated);
  // DECIDED BY THE EXIT CODE, never by grepping stdout for FAIL: a gate
  // that dies on a syntax error and prints nothing has still gone red.
  let failed = false;
  let detail = "";
  try {
    execFileSync("node", [GATE], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    failed = true;
    const out = String(e.stdout || "") + String(e.stderr || "");
    detail = (out.split("\n").find((l) => l.includes("FAIL")) || out.split("\n")[0] || "").trim();
  } finally {
    writeFileSync(m.file, original);
  }
  if (failed) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          ${detail.slice(0, 130)}`);
  } else {
    missed.push({ ...m, why: "the gate stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}`);
  }
}

try {
  execFileSync("node", [GATE], { stdio: "pipe" });
} catch {
  console.log(`\nBASELINE IS RED (${GATE}) — a mutation was not restored. Check \`git diff\`.`);
  process.exit(1);
}
console.log("\nbaseline: the gate is green on the unmutated tree");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length) {
  console.log(missed.map((m) => `  - ${m.name}\n    ${m.why}`).join("\n"));
  process.exit(1);
}
