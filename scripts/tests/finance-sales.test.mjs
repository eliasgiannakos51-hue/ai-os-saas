// FINANCES AND SALES (MASTER 16, package 18), behind the switch
// "finance-sales": «πλήρωσα 50 ευρώ ρεύμα» is recorded; a contact moves
// from stage to stage with a reminder.
//
// What would be wrong quietly:
//
//   A WRONG ENTRY IN SOMEBODY'S BOOKS. A sentence read as income when it
//   was an expense, or 3020 when it said 30 and 20. Section 1 reads
//   sentences in ten languages and requires every doubtful one ASKED,
//   never written.
//
//   A STAGE THE DATABASE REFUSES. The code's stages and the column's CHECK
//   must be the same list; section 2 reads the migration.
//
//   A REMINDER SENT TWICE, OR NEVER. Section 3 holds the job to marking a
//   reminder before delivering it, and the move to clearing that mark.
//
// Run: node scripts/tests/finance-sales.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};
const read = (f) => stripComments(readFileSync(f, "utf8"));
const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));

const Q = await loadTs("src/lib/finance/quick-entry.ts");
const S = await loadTs("src/lib/sales/stages.ts");
const MIGRATION = "supabase/migrations/20261023000000_lead_stages.sql";

console.log("== 1. a sentence about money, in ten languages — or a question ==");
{
  const CASES = [
    ["πλήρωσα 50 ευρώ ρεύμα", "expense", 50, "ρεύμα"],
    ["Πλήρωσα 50€ για ρεύμα", "expense", 50, "ρεύμα"],
    ["εισέπραξα 1.200,50 € από τον Νίκο", "income", 1200.5, "από τον Νίκο"],
    ["paid 12.5 for coffee", "expense", 12.5, "coffee"],
    ["received $1,250 from ACME", "income", 1250, "from ACME"],
    ["pagué 30 euros de gasolina", "expense", 30, "gasolina"],
    ["j'ai payé 40 € l'électricité", "expense", 40, "l'électricité"],
    ["bezahlt 15 Euro Strom", "expense", 15, "Strom"],
    ["ricevuto 200 euro dal cliente", "income", 200, "dal cliente"],
    ["recebi 80 euros de aluguer", "income", 80, "aluguer"],
    ["付了50欧元电费", "expense", 50, "电费"],
    ["電気代 50ユーロ 払った", "expense", 50, "電気代"],
    ["دفعت 50 يورو كهرباء", "expense", 50, "كهرباء"],
  ];
  const wrong = CASES.filter(([s, type, amount, description]) => {
    const r = Q.readMoneySentence(s);
    return !(r.ok && r.entry.type === type && r.entry.amount === amount && r.entry.description === description);
  });
  ok(`every sentence read right: which way, how much, what for (${CASES.length - wrong.length}/${CASES.length})`, CASES.length === 13 && wrong.length === 0, wrong.map(([s]) => `${s} → ${JSON.stringify(Q.readMoneySentence(s))}`).join("\n        "));
  const ask = (s) => { const r = Q.readMoneySentence(s); return r.ok ? [] : r.missing; };
  ok("no amount: asked, not written", JSON.stringify(ask("πλήρωσα ρεύμα")) === '["amount"]');
  ok("two amounts: asked — which is the money is the person's to say", JSON.stringify(ask("πλήρωσα 30 και 20 ευρώ")) === '["amount"]' && JSON.stringify(ask("πλήρωσα 50 € στις 3/10")) === '["amount"]');
  ok("no direction: asked", JSON.stringify(ask("ρεύμα 50 ευρώ")) === '["type"]');
  ok("both directions: asked, not guessed", JSON.stringify(ask("πήρα 300 ευρώ και πλήρωσα")) === '["type"]');
  ok("a zero, or more than ten million, is not an amount", JSON.stringify(ask("πλήρωσα 0 ευρώ")) === '["amount"]' && JSON.stringify(ask("πλήρωσα 20000000 ευρώ")) === '["amount"]');
  ok("a verb inside another word is not the verb («unpaid» is not «paid»)", JSON.stringify(ask("unpaid invoice 50 euros")) === '["type"]' && JSON.stringify(ask("απλήρωτος λογαριασμός 50 ευρώ")) === '["type"]');
}

console.log("\n== 2. the stages are the column's own ==");
{
  const sql = readFileSync(MIGRATION, "utf8");
  const checked = (sql.match(/check \(stage in \(([^)]+)\)\)/) ?? [])[1]?.match(/'(\w+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
  ok(`the code's stages are the CHECK's, in order (${checked.join(", ")})`, checked.length === 6 && JSON.stringify(checked) === JSON.stringify(S.LEAD_STAGES));
  ok("a contact moves forward one stage at a time, and a closed one does not", S.nextStage("new") === "contacted" && S.nextStage("contacted") === "meeting" && S.nextStage("meeting") === "proposal" && S.nextStage("proposal") === "won" && S.nextStage("won") === null && S.nextStage("lost") === null);
  const now = new Date("2026-10-08T10:00:00Z");
  ok("a reminder is a time ahead, within a year", S.readReminder("2026-10-11T09:00:00Z", now).ok && S.readReminder("2026-10-11T09:00:00Z", now).at === "2026-10-11T09:00:00.000Z" && S.readReminder(null, now).at === null);
  ok("...a past one, one past a year, or a word is refused", !S.readReminder("2026-10-07T09:00:00Z", now).ok && !S.readReminder("2027-12-01T09:00:00Z", now).ok && !S.readReminder("Τρίτη", now).ok && !S.readReminder(42, now).ok);
  ok("the migration says how to undo it, and adds every column the code writes", /-- How to undo: alter table public\.leads drop column if exists stage,/.test(sql) && ["stage", "stage_changed_at", "remind_at", "reminded_at"].every((c) => new RegExp(`add column if not exists ${c}\\b`).test(sql)));
  ok("...with the index the reminder job reads by", /create index if not exists leads_due_reminders_idx\s+on public\.leads \(remind_at\)\s+where remind_at is not null and reminded_at is null;/.test(sql));
}

console.log("\n== 3. the routes, and the reminder job ==");
{
  const quick = read("src/app/api/finance/quick/route.ts");
  ok("a sentence is read before the user, and refused when it is not one", quick.indexOf("request.json()") < quick.indexOf("auth.getUser()"));
  ok("the switch is asked before anything is written", /if \(!\(await isFeatureOn\("finance-sales", user\)\)\) return NextResponse\.json\(\{ ok: false, code: "not_enabled" \}, \{ status: 403 \}\);/.test(quick));
  ok("a doubtful sentence is NOT written: 422, with what is missing", /if \(!reading\.ok\) return NextResponse\.json\(\{ ok: false, code: "not_understood", missing: reading\.missing \}, \{ status: 422 \}\);/.test(quick) && quick.indexOf("if (!reading.ok)") < quick.indexOf('.from("finance_entries")'));
  ok("the entry is the person's, written with their own session, and asks no model", /\.from\("finance_entries"\)\s*\.insert\(\{\s*user_id: user\.id,\s*description: reading\.entry\.description,\s*type: reading\.entry\.type,\s*amount: reading\.entry\.amount,/.test(quick) && !/createAdminClient|anthropic|runCompletion|reserveCredits/i.test(quick));
  const stage = read("src/app/api/sales/[id]/stage/route.ts");
  ok("a move is to a stage that exists, with a reminder that is one", /if \(!isUuid\(params\.id\) \|\| !isLeadStage\(body\.stage\)\) return/.test(stage) && /if \(!reminder\.ok\) return NextResponse\.json\(\{ ok: false, code: "bad_reminder" \}/.test(stage));
  ok("...of the person's own contact, by id AND owner, and a move clears the last reminder", /\.from\("leads"\)\s*\.update\(\{ stage: body\.stage, stage_changed_at: new Date\(\)\.toISOString\(\), remind_at: reminder\.at, reminded_at: null \}\)\s*\.eq\("id", params\.id\)\s*\.eq\("user_id", user\.id\)/.test(stage) && /if \(!row\) return NextResponse\.json\(\{ ok: false, code: "not_found" \}, \{ status: 404 \}\);/.test(stage));
  ok("...behind the switch", /isFeatureOn\("finance-sales", user\)/.test(stage));
  const cron = read("src/app/api/cron/lead-reminders/route.ts");
  ok("the job is the cron's own: CRON_SECRET first", cron.indexOf("checkCronAuth(request)") > 0 && cron.indexOf("checkCronAuth(request)") < cron.indexOf("createAdminClient()"));
  ok("it reads only reminders that are due and unsent", /\.lte\("remind_at", now\)\s*\.is\("reminded_at", null\)/.test(cron));
  ok("each is MARKED before it is delivered, and only by the run that marked it", /\.update\(\{ reminded_at: now \}\)\s*\.eq\("id", lead\.id\)\s*\.is\("reminded_at", null\)/.test(cron) && /if \(!claimed\) continue;/.test(cron) && cron.indexOf("if (!claimed) continue;") < cron.indexOf("createNotification("));
  ok("...then said in the bell, in the person's language, and pushed where they opted in", /const t = emailTranslator\(await emailLocaleFor\(String\(lead\.user_id\)\)\);/.test(cron) && /await createNotification\(\{ userId: String\(lead\.user_id\), source: "sales", title, body, url \}\);/.test(cron) && /await sendPushToUser\(String\(lead\.user_id\), "mission_reminders"/.test(cron));
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  ok("it is scheduled, every quarter of an hour", vercel.crons.some((c) => c.path === "/api/cron/lead-reminders" && c.schedule === "*/15 * * * *"));
}

console.log("\n== 4. the screens ==");
{
  const page = read("src/app/dashboard/[module]/page.tsx");
  ok("Finances and Sales get their part only with the switch", /\(moduleConfig\.slug === "finance" \|\| moduleConfig\.slug === "sales"\) && \(await isFeatureOn\("finance-sales", user\)\)/.test(page) && /\{financeSales && moduleConfig\.slug === "finance" \? <FinanceQuickEntry \/> : null\}/.test(page) && /\{financeSales && moduleConfig\.slug === "sales" \? \(\s*<SalesStages/.test(page));
  const quick = read("src/components/finance/finance-quick-entry.tsx");
  ok("the sentence is sent as written, and what was missing is said", /body: JSON\.stringify\(\{ text: sentence \}\)/.test(quick) && /missing\.includes\("amount"\) && missing\.includes\("type"\) \? t\("missingBoth"\)/.test(quick));
  ok("...and what was recorded is said, one press from the entry", /t\(body\.entry\.type === "income" \? "doneIncome" : "doneExpense"/.test(quick) && /href: `\/dashboard\/finance\?record=\$\{encodeURIComponent\(String\(body\.entry\.id\)\)\}`/.test(quick));
  const stages = read("src/components/sales/sales-stages.tsx");
  ok("a move sends the stage and the reminder, at nine on the chosen day", /body: JSON\.stringify\(\{ stage: c\.stage, remindAt \}\)/.test(stages) && /new Date\(`\$\{c\.day\}T09:00:00`\)\.toISOString\(\)/.test(stages));
  ok("the next stage is offered first, with a reminder three days on", /stage: nextStage\(stageOf\(lead\)\) \?\? stageOf\(lead\), day: dateInput\(new Date\(now \+ 3 \* DAY_MS\)\)/.test(stages));
  ok("reminders that are due are listed first", /const due = leads\.filter\(\(l\) => l\.remind_at && new Date\(l\.remind_at\)\.getTime\(\) <= now\);/.test(stages) && /data-testid="sales-due"/.test(stages));
}

console.log("\n== 5. the words, the switch, the canary ==");
{
  for (const l of LOCALES) {
    const fq = messages[l].dashboard?.financeQuick ?? {};
    const sa = messages[l].dashboard?.sales ?? {};
    const missing = [
      ...["title", "placeholder", "save", "hint", "doneExpense", "doneIncome", "open", "missingAmount", "missingType", "missingBoth", "failed"].filter((k) => typeof fq[k] !== "string"),
      ...["title", "empty", "dueTitle", "moveTo", "remind", "move", "remindOn", "badReminder", "failed"].filter((k) => typeof sa[k] !== "string"),
      ...S.LEAD_STAGES.filter((s) => typeof sa.stages?.[s] !== "string").map((s) => `stages.${s}`),
    ];
    ok(`${l}: every sentence, every stage, and a reminder that names the contact and the stage`, missing.length === 0 && /\{name\}/.test(sa.reminder?.title ?? "") && /\{stage\}/.test(sa.reminder?.body ?? "") && /\{amount\}/.test(fq.doneExpense ?? ""), missing.join(", "));
  }
  ok('the switch "finance-sales" is declared', /\n  "finance-sales": "/.test(readFileSync("src/lib/flags/flags.ts", "utf8")));
  ok("/api/health can tell whether the migration ran", /table: "leads",\s*column: "stage",\s*migration: "20261023000000_lead_stages\.sql",/.test(readFileSync("src/lib/health/schema-canaries.ts", "utf8")));
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exitCode = failures.length ? 1 : 0;
