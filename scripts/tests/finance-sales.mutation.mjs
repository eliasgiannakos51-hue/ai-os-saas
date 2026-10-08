#!/usr/bin/env node
/*
 * CAN finance-sales.test.mjs SEE A WRONG ENTRY WRITTEN, A STAGE THE
 * DATABASE REFUSES, OR A REMINDER SENT TWICE OR NEVER?
 *
 * Two amounts read as one, a sentence with no direction written anyway,
 * both directions read as an expense, a verb found inside another word,
 * a doubtful sentence written, a contact moved without its owner, a move
 * that keeps the old reminder's mark, a reminder delivered before it is
 * marked, the job reading reminders already sent, a past reminder taken.
 *
 * Run: node scripts/tests/finance-sales.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/finance-sales.test.mjs";
const QUICK_LIB = "src/lib/finance/quick-entry.ts";
const STAGES_LIB = "src/lib/sales/stages.ts";
const QUICK = "src/app/api/finance/quick/route.ts";
const STAGE = "src/app/api/sales/[id]/stage/route.ts";
const CRON = "src/app/api/cron/lead-reminders/route.ts";

const MUTANTS = [
  {
    name: "two amounts are read as the first",
    file: QUICK_LIB,
    from: "  const picked = numbers.length === 1 ? numbers[0] : null;",
    to: "  const picked = numbers[0] ?? null;",
    expect: "two amounts: asked",
  },
  {
    name: "a sentence with no direction is read as an expense",
    file: QUICK_LIB,
    from: '  const type = out === into ? null : out ? "expense" : "income";',
    to: '  const type = into ? "income" : "expense";',
    expect: "no direction: asked",
  },
  {
    name: "a verb is found inside another word",
    file: QUICK_LIB,
    from: '  return new RegExp(`(^|[^\\\\p{L}])${word.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}($|[^\\\\p{L}])`, "u").test(folded);',
    to: "  return folded.includes(word);",
    expect: "a verb inside another word is not the verb",
  },
  {
    name: "a zero amount is an amount",
    file: QUICK_LIB,
    from: "  return Number.isFinite(n) && n > 0 && n <= MAX_AMOUNT ?",
    to: "  return Number.isFinite(n) && n >= 0 && n <= MAX_AMOUNT ?",
    expect: "a zero, or more than ten million, is not an amount",
  },
  {
    name: "a doubtful sentence is written anyway",
    file: QUICK,
    from: '    if (!reading.ok) return NextResponse.json({ ok: false, code: "not_understood", missing: reading.missing }, { status: 422 });',
    to: "",
    expect: "a doubtful sentence is NOT written",
  },
  {
    name: "a contact is moved without its owner",
    file: STAGE,
    from: '      .eq("id", params.id)\n      .eq("user_id", user.id)',
    to: '      .eq("id", params.id)',
    expect: "...of the person's own contact, by id AND owner",
  },
  {
    name: "a move keeps the last reminder's mark, so the new one never goes",
    file: STAGE,
    from: "remind_at: reminder.at, reminded_at: null })",
    to: "remind_at: reminder.at })",
    expect: "...of the person's own contact, by id AND owner, and a move clears the last reminder",
  },
  {
    name: "a past reminder is taken",
    file: STAGES_LIB,
    from: "  if (ms <= 0 || ms > MAX_REMINDER_DAYS * 86_400_000) return { ok: false };",
    to: "  if (ms > MAX_REMINDER_DAYS * 86_400_000) return { ok: false };",
    expect: "...a past one, one past a year, or a word is refused",
  },
  {
    name: "a reminder is delivered by a run that did not mark it",
    file: CRON,
    from: "      if (!claimed) continue;\n",
    to: "",
    expect: "each is MARKED before it is delivered",
  },
  {
    name: "the job reads reminders already sent",
    file: CRON,
    from: '      .lte("remind_at", now)\n      .is("reminded_at", null)',
    to: '      .lte("remind_at", now)',
    expect: "it reads only reminders that are due and unsent",
  },
];

runMutations({ name: "finance-sales", gate: GATE, targets: [QUICK_LIB, STAGES_LIB, QUICK, STAGE, CRON], mutants: MUTANTS });
