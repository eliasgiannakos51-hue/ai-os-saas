// "No credit activity yet" — on an account whose ai_cost_log was full.
//
// WHAT WENT WRONG. Settings -> Billing reads credit_transactions. That
// table is a ledger of BALANCE MOVEMENTS, and settle_reservation only
// writes to it when it actually charges:
//
//     if p_credits_to_charge > 0 then
//       update public.user_credits ...
//       insert into public.credit_transactions ...
//     end if;
//
// An admin/beta account is charged 0 by design, and a free chat message
// is charged 0 too. So every AI action such an account performed left a
// row in ai_cost_log and NOTHING in credit_transactions, and the panel
// correctly reported an empty ledger — while being completely wrong about
// what the user had actually done.
//
// The query was never the bug, which is why reading it looks fine. The
// bug is that a history of what you DID was being sourced from a table
// that only records what you PAID.
//
// Run: node scripts/tests/credit-visibility.test.mjs
import { readFileSync } from "node:fs";
import { schemaSql } from "./lib/schema-sql.mjs";

let pass = 0,
  fail = 0;
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
function checkTrue(name, cond, detail) {
  check(name, Boolean(cond), true);
  if (!cond && detail) console.log(`        ${detail}`);
}

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);
const page = readFileSync("src/app/dashboard/settings/page.tsx", "utf8");
const panel = readFileSync("src/components/settings/credit-history.tsx", "utf8");
// Was `supabase_full_project_backup.sql` — a snapshot of one project at
// one moment. The migrations are what a database is actually built from.
const backup = schemaSql();

console.log("== 1. the cause, asserted so it cannot be forgotten ==");
// If this ever changes — if settle_reservation starts writing a
// zero-amount transaction row — the merge below becomes a double-count
// and this test says so.
checkTrue(
  "settle_reservation writes a credit_transactions row ONLY when it charges",
  /if p_credits_to_charge > 0 then[\s\S]{0,600}insert into public\.credit_transactions/.test(backup)
);
checkTrue(
  "so a zero-charge settlement leaves no ledger row at all",
  !/insert into public\.credit_transactions[\s\S]{0,200}values \(p_user_id, 0/.test(backup)
);

console.log("\n== 2. the history reads what the user DID, not only what they paid ==");
checkTrue("it still reads the balance ledger", /from\("credit_transactions"\)/.test(page));
checkTrue("and now also reads the AI activity log", /from\("ai_cost_log"\)/.test(page));
checkTrue("scoped to this user", /\.eq\("user_id", user\.id\)/.test(page));
// Only zero-charge rows, or every real charge would appear twice — once
// from the ledger and once from the cost log.
checkTrue("taking ONLY the zero-charge rows, to avoid double-counting", /\.eq\("credits_charged", 0\)/.test(page));
checkTrue("bounded, like the ledger query", /from\("ai_cost_log"\)[\s\S]{0,300}\.limit\(\d+\)/.test(page));

console.log("\n== 3. a bypass row says what it WOULD have cost ==");
// "Unlimited" alone tells an owner nothing about whether pricing works.
checkTrue("the panel accepts the free actions", /freeActions/.test(panel));
checkTrue("it reads wouldHaveChargedCredits from the row's metadata", /wouldHaveChargedCredits/.test(page));
checkTrue("and renders it", /wouldHaveCost/.test(panel));
checkTrue("labelled Unlimited rather than a misleading 0", /t\("unlimited"\)/.test(panel));
// A missing value must not render "would have cost undefined".
checkTrue("a missing would-have is omitted, not printed", /row\.wouldHave !== null &&/.test(panel));
checkTrue(
  "and it is null-guarded on the way in",
  /typeof meta\.wouldHaveChargedCredits === "number" \? meta\.wouldHaveChargedCredits : null/.test(page)
);

console.log("\n== 4. balance after each charge ==");
checkTrue("the panel takes the current balance", /currentBalance/.test(panel));
checkTrue("the page actually supplies it", /creditsRow\?\.credits_remaining/.test(page));
checkTrue("...from a real query", /from\("user_credits"\)[\s\S]{0,120}credits_remaining/.test(page));
// The reconstruction only walks rows that MOVED the balance. Including a
// zero-charge row would leave the running total unchanged but shift which
// row each balance is attributed to.
checkTrue("only ledger rows carry a balance", /kind === "tx" && row\.balanceAfter !== null/.test(panel));
checkTrue("and it walks backwards from today", /running -= tx\.amount/.test(panel));

// The arithmetic itself, on the shape the page produces.
const balance = 24_868;
const txs = [
  { amount: -132, id: "a" },
  { amount: -16, id: "b" },
  { amount: 25000, id: "c" },
];
let running = balance;
const after = txs.map((tx) => {
  const b = running;
  running -= tx.amount;
  return b;
});
check("newest row shows today's balance", after[0], 24_868);
check("the row before it had 132 more", after[1], 25_000);
check("and before the grant, 25,000 less", after[2], 25_016);
checkTrue("the oldest balance is the pre-grant one", after[2] - txs[2].amount === 16);

console.log("\n== 5. an empty history is the only thing that says 'nothing yet' ==");
checkTrue("the empty state is translated, not hardcoded English", !/No credit activity yet\./.test(panel));
checkTrue("it uses a message key", /t\("noCreditActivity"\)/.test(panel));
for (const key of ["noCreditActivity", "balanceAfter", "unlimited", "wouldHaveCost"]) {
  const missing = LOCALES.filter((l) => typeof messages[l]?.settings?.billing?.[key] !== "string");
  check(`settings.billing.${key} in every locale`, missing, []);
}
// Machine feature names must not reach the user raw.
checkTrue("action types are humanised", /function humanise/.test(panel));
check("website_generate reads as words", "website_generate".replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), "Website Generate");

console.log("\n== 6. the counter cannot read the balance before the charge lands ==");
// The Website Builder generates in a BACKGROUND worker. The client polls
// user_websites and, the moment status stops being pending/processing,
// refreshes the credits counter. The worker used to write
// status: "completed" BEFORE calling settleReservation, so the client
// reliably read the balance a moment too early — which is exactly the
// "counter does not update until I reload" report. Every client was
// already calling refresh; the ordering was the bug.
const worker = readFileSync("src/app/api/websites/generate/process/route.ts", "utf8");
const settleAt = worker.indexOf("const settlement = await settleReservation(");
const finalStatusAt = worker.indexOf('status: isFlagged ? "flagged" : "completed"');
checkTrue("the worker settles", settleAt > 0);
checkTrue("the final status exists", finalStatusAt > 0);
checkTrue("and is written only AFTER settlement", finalStatusAt > settleAt);
checkTrue("the save before settlement leaves it processing", /html_content: htmlContent,[\s\S]{0,500}status: "processing",/.test(worker));
// The client's trigger, so the pairing is asserted from both ends.
const wb = readFileSync("src/components/website-builder/website-builder-workspace.tsx", "utf8");
checkTrue("the client keeps polling while processing", /status === "pending" \|\| record\.status === "processing"/.test(wb));
checkTrue("and refreshes once it stops", /refreshCredits\(\)/.test(wb));

console.log("\n== 7. an action reports what it cost ==");
const ctx = readFileSync("src/components/credits/credits-context.tsx", "utf8");
checkTrue("the context exposes reportUsage", /reportUsage: \(payload: unknown\) => Promise<void>/.test(ctx));
checkTrue("refresh returns the new balance, so one message can carry both", /refresh = useCallback\(async \(\): Promise<number \| null>/.test(ctx));
checkTrue("the balance is re-read even when there is no receipt", /const remaining = await refresh\(\);[\s\S]{0,120}if \(!receipt\) return;/.test(ctx));
checkTrue("a bypass says what it would have cost", /unlimitedWouldHaveCost/.test(ctx));
checkTrue("a free message says how many are left", /freeMessage/.test(ctx));
checkTrue("a zero charge does not interrupt anyone", /if \(receipt\.creditsCharged <= 0\) return;/.test(ctx));
// Chat is the highest-traffic path, so its receipt is asserted end to end.
const chatRoute = readFileSync("src/app/api/chat/route.ts", "utf8");
checkTrue("chat returns a receipt on done", /type: "done",[\s\S]{0,200}usage: buildUsageReceipt\(/.test(chatRoute));
checkTrue("carrying the free-message allowance", /freeRemaining: isFreeMessage && freeGrant\?\.granted \? freeGrant\.remaining : null/.test(chatRoute));
// The receipt reader must never turn a successful action into a failure.
const receipt = readFileSync("src/lib/billing/usage-receipt.ts", "utf8");
checkTrue("reading a receipt is total, never throwing", /if \(!payload \|\| typeof payload !== "object"\) return null;/.test(receipt));
for (const key of ["used", "usedWithRemaining", "unlimited", "unlimitedWouldHaveCost", "freeMessage"]) {
  const missing = LOCALES.filter((l) => typeof messages[l]?.credits?.[key] !== "string");
  check(`credits.${key} in every locale`, missing, []);
}

console.log("\n== 8. every AI route returns a receipt, and its client reports it ==");
// Chat was the precedent. These five follow it exactly: the route puts a
// buildUsageReceipt on its response, the client passes that response to
// reportUsage instead of calling refresh and saying nothing.
const PAIRS = [
  ["chat", "src/app/api/chat/route.ts", "src/components/chat/chat-workspace.tsx"],
  ["create-studio/detect", "src/app/api/create-studio/detect/route.ts", "src/components/create/studio-chat.tsx"],
  ["records/ask", "src/app/api/records/ask/route.ts", "src/components/records/ask-ai-modal.tsx"],
  ["text-actions", "src/app/api/text-actions/route.ts", "src/components/text-actions/text-actions-textarea.tsx"],
  ["reflection/generate", "src/app/api/reflection/generate/route.ts", "src/components/reflection/reflection-generator.tsx"],
  ["websites/status", "src/app/api/websites/status/route.ts", "src/components/website-builder/website-builder-workspace.tsx"],
];
for (const [label, routeFile, clientFile] of PAIRS) {
  const route = readFileSync(routeFile, "utf8");
  const client = readFileSync(clientFile, "utf8");
  checkTrue(`${label}: route builds a receipt`, /buildUsageReceipt\(/.test(route));
  // The Website Builder is the one exception, and legitimately so: it
  // settles in a background worker, so its figure comes from the settled
  // cost-log row rather than a settlement variable in the same request.
  checkTrue(
    `${label}: from the real settled figure, not a guess`,
    /settlement\.creditsCharged/.test(route) || /Number\(data\.credits_charged\)/.test(route)
  );
  checkTrue(`${label}: returned under \`usage\``, /usage: buildUsageReceipt\(|record, usage \}/.test(route));
  checkTrue(`${label}: client reports it`, /reportUsage\(/.test(client));
}
// The streaming clients must capture the terminal event, or reportUsage
// gets nothing and silently degrades to a bare refresh.
for (const f of [
  "src/components/chat/chat-workspace.tsx",
  "src/components/records/ask-ai-modal.tsx",
  "src/components/create/studio-chat.tsx",
]) {
  checkTrue(`${f.split("/").pop()} captures the done event`, /if \(event\.type === "done"\) usageEvent = event;/.test(readFileSync(f, "utf8")));
}
// The Website Builder settles in a worker, so it has no response to
// attach to — the figure is read back from the settled cost-log row.
const statusRoute = readFileSync("src/app/api/websites/status/route.ts", "utf8");
checkTrue("the status route reads the settled row", /from\("ai_cost_log"\)/.test(statusRoute));
checkTrue("scoped to this website", /contains\("metadata", \{ websiteId \}\)/.test(statusRoute));
checkTrue("and only once the row is terminal", /record\.status === "completed" \|\| record\.status === "flagged"/.test(statusRoute));
checkTrue("best-effort — a missing row never fails the poll", /catch \{\s*\n\s*return null;/.test(statusRoute));
// text-actions never touched the credits context at all, so its balance
// change was invisible even on the next navigation.
checkTrue("the text-actions client now uses the credits context", /useCredits\(\)/.test(readFileSync("src/components/text-actions/text-actions-textarea.tsx", "utf8")));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
