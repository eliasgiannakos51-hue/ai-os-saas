// Does write-guards.test.mjs catch a reverted guard?
//
// The defects it exists for are DELETIONS — a `.or(...)` removed, a
// `.select()` dropped, a read put back. A gate that reads source text and
// reports PASS looks the same whether it is checking the right thing or
// nothing at all, so each mutation below puts one of those defects back and
// the gate must go red. Two controls must stay GREEN, because a gate that
// fires on any edit is not a check either.
//
// Every mutation runs against a COPY. Nothing here edits the repository.
//
// Run: node scripts/tests/write-guards.mutation.mjs
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = process.cwd();
const GATE = "scripts/tests/write-guards.test.mjs";
const CREDITS = "src/lib/billing/credits.ts";
const OVERAGE = "src/lib/billing/overage-store.ts";
const GENERATE = "src/app/api/websites/generate/process/route.ts";
const DISPATCH = "src/lib/notify/dispatch.ts";

let caught = 0;
let missed = 0;

function run(name, edits, expectRed) {
  const dir = mkdtempSync(path.join(tmpdir(), "wgmut-"));
  try {
    mkdirSync(path.join(dir, "scripts", "tests"), { recursive: true });
    mkdirSync(path.join(dir, "src", "lib", "billing"), { recursive: true });
    mkdirSync(path.join(dir, "src", "lib", "notify"), { recursive: true });
    mkdirSync(path.join(dir, "src", "app", "api", "websites", "generate", "process"), { recursive: true });
    for (const f of [GATE, CREDITS, OVERAGE, GENERATE, DISPATCH]) cpSync(path.join(ROOT, f), path.join(dir, f));

    for (const [file, from, to] of edits) {
      const p = path.join(dir, file);
      const before = readFileSync(p, "utf8");
      if (!before.includes(from)) {
        console.log(`  ERROR ${name}: target not found in ${file}`);
        missed++;
        return;
      }
      writeFileSync(p, before.replace(from, to));
    }

    let red = false;
    let out = "";
    try {
      execFileSync(process.execPath, [GATE], { cwd: dir, encoding: "utf8", stdio: "pipe" });
    } catch (err) {
      red = true;
      out = String(err.stdout ?? "") + String(err.stderr ?? "");
    }

    if (red === expectRed) {
      caught++;
      const line = out.split("\n").find((l) => l.includes("FAIL  ")) ?? "";
      console.log(`  ${expectRed ? "CAUGHT " : "GREEN  "} ${name}${line ? `\n          -> ${line.trim()}` : ""}`);
    } else {
      missed++;
      console.log(`  ${expectRed ? "MISSED " : "FALSE+ "} ${name}  <- gate ${red ? "went red" : "stayed green"}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log("write-guards mutations\n");

// ---- the pack rate ----

// 1. THE ORIGINAL BUG, put back: read, compute, write unconditionally.
run(
  "recordPackPurchaseRate reads before it writes again",
  [
    [
      CREDITS,
      "    const filterValue = pricePerCreditEur.toFixed(8);",
      "    const existing = await getPurchasedPackCreditPriceEur(userId);\n    const filterValue = String(existing ?? pricePerCreditEur);",
    ],
  ],
  true
);

// 2. The guard removed, everything else intact — the write becomes
//    last-writer-wins again and nothing else about the function changes.
run(
  "the .or() re-assertion is dropped from the pack update",
  [
    [
      CREDITS,
      "      .or(\n        `min_pack_credit_price_eur.is.null,min_pack_credit_price_eur.gt.${filterValue}`\n      );",
      "      ;",
    ],
  ],
  true
);

// 3. The minimum computed in TypeScript again.
run(
  "Math.min comes back",
  [
    [
      CREDITS,
      "      .update({ min_pack_credit_price_eur: pricePerCreditEur })",
      "      .update({ min_pack_credit_price_eur: Math.min(pricePerCreditEur, 1) })",
    ],
  ],
  true
);

// 4. The filter kept but pointed at the WRONG column — scoping the row is
//    not re-asserting the value, and the gate must tell them apart.
run(
  "the filter re-asserts user_id instead of the column being written",
  [
    [
      CREDITS,
      "min_pack_credit_price_eur.is.null,min_pack_credit_price_eur.gt.${filterValue}",
      "user_id.not.is.null,user_id.neq.${filterValue}",
    ],
  ],
  true
);

// ---- the overage warning ----

// 5. Marked, but not claimed: no read-back, so nothing knows who won.
run(
  "the overage update stops reading back what it matched",
  [[OVERAGE, '        .select("user_id");', "        ;"]],
  true
);

// 6. The re-assertion dropped from the mark.
run(
  "the overage update stops re-asserting the month column",
  [[OVERAGE, "        .or(`${column}.is.null,${column}.neq.${state.month}`)", ""]],
  true
);

// 7. Claimed correctly, then ignored — the duplicate email is back.
run(
  "the send loop goes back to iterating `due`",
  [[OVERAGE, "for (const level of claimed) {", "for (const level of due) {"]],
  true
);

// 8. The early return removed, so a caller that claimed nothing still runs
//    the send loop.
run(
  "the return-when-nothing-claimed is removed",
  [[OVERAGE, "    if (claimed.length === 0) return;", ""]],
  true
);

// ---- controls: these must NOT turn the gate red ----

// A. A pure rename. The gate parses structure, so a different variable name
//    is not a defect and must not be reported as one.
run(
  "CONTROL: the filter value variable is renamed",
  [
    [CREDITS, "const filterValue = pricePerCreditEur.toFixed(8);", "const asNumeric = pricePerCreditEur.toFixed(8);"],
    [CREDITS, "min_pack_credit_price_eur.gt.${filterValue}", "min_pack_credit_price_eur.gt.${asNumeric}"],
  ],
  false
);

// B. A comment added inside the guarded function.
run(
  "CONTROL: a comment is added next to the update",
  [[CREDITS, "    const admin = createAdminClient();\n    const { error } = await admin\n      .from(\"user_credits\")", "    const admin = createAdminClient();\n    // one round trip, not two\n    const { error } = await admin\n      .from(\"user_credits\")"]],
  false
);

// ---- the website generation claim: the expensive one ----

// 9. THE ORIGINAL BUG: filtered on the id alone, so two POSTs both claim.
run(
  "the generation claim drops both re-assertions",
  [
    [
      GENERATE,
      '      .eq("id", websiteId)\n      .eq("status", "pending")\n      .eq("attempt_count", website.attempt_count)\n      .select("id");',
      '      .eq("id", websiteId)\n      .select("id");',
    ],
  ],
  true
);

// 10. Status kept, count dropped. Two callers CAN see the same 'pending'
//     — the cap check reads the count, so the count is the other half.
run(
  "the generation claim keeps status but drops attempt_count",
  [[GENERATE, '      .eq("attempt_count", website.attempt_count)\n', ""]],
  true
);

// 11. Claimed correctly, then the result thrown away.
run(
  "the empty-claim early return is removed",
  [
    [
      GENERATE,
      "    if (!claimed || claimed.length === 0) {\n      return NextResponse.json({ ok: true, alreadyHandled: true });\n    }",
      "",
    ],
  ],
  true
);

// ---- the notification group count ----

// 12. Back to last-writer-wins on the burst counter.
run(
  "the group_count update stops re-asserting the count",
  [[DISPATCH, '        .eq("group_count", open.groupCount)\n', ""]],
  true
);

// 13. The retry that recomputes from the same stale number — the bug
//     again with an extra round trip in front of it.
run(
  "the retry reuses the stale count instead of re-reading",
  [
    [
      DISPATCH,
      '        const { data: current } = await admin\n          .from("user_notifications")\n          .select("group_count")',
      '        const { data: current } = await admin\n          .from("user_notifications")\n          .select("id")',
    ],
  ],
  true
);

console.log(`\n${missed === 0 ? "PASS" : "FAIL"}  ${caught} correct, ${missed} wrong`);
process.exit(missed === 0 ? 0 : 1);
