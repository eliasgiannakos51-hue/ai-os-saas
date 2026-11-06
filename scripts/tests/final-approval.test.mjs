// THE FINAL-APPROVAL REPORT MUST GO RED ON EACH THING IT CLAIMS TO CHECK.
//
// A report that says READY for every input looks exactly like a working
// one (CLAUDE.md, «A detector that says yes to everything»). So each rule
// gets a good fixture that passes AND a broken fixture that fails on that
// rule's id alone — the broken one is the evidence the check can fail.
//
// Run: node scripts/tests/final-approval.test.mjs
import { evaluate, verdict, section, undoNote, render } from "../final-approval.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
}

const GOOD_BODY = `## Τι αλλάζει\nx\n\n## Πώς γυρίζει πίσω\n1. Στη σελίδα του PR πάτα Revert και μετά merge.\n\n## Migrations\nΝΕΑ MIGRATIONS ΝΑ ΤΡΕΞΕΙΣ: 20261101000000_x.sql\n`;
const GOOD_SQL = "-- How to undo: drop table public.x; nothing else reads it.\ncreate table public.x();";
const files = { "supabase/migrations/20261028000000_tool_notify_subscriptions.sql": GOOD_SQL };
const GOOD = {
  changed: ["src/lib/flags/flags.ts", "scripts/tests/a.test.mjs", "docs/PROGRESS.md", "supabase/migrations/20261028000000_tool_notify_subscriptions.sql"],
  readFile: (f) => files[f] ?? null,
  body: GOOD_BODY,
  gatesExit: 0,
};
const ids = (r, status) => r.filter((x) => x.status === status).map((x) => x.id);
const without = (o, ...drop) => ({ ...o, changed: o.changed.filter((f) => !drop.includes(f)) });

console.log("== a complete change is READY ==");
const good = evaluate(GOOD);
check("every check passes", ids(good, "fail").length === 0 && ids(good, "unverified").length === 0, JSON.stringify(good));
check("verdict is READY", verdict(good) === "READY");

console.log("\n== each rule goes red on its own ==");
const noUndo = evaluate({ ...GOOD, readFile: () => "create table public.x();" });
check("a migration with no undo note fails migration-undo", ids(noUndo, "fail").some((i) => i.startsWith("migration-undo:")) && verdict(noUndo) === "NOT READY");
const shortUndo = evaluate({ ...GOOD, readFile: () => "-- How to undo: no\nselect 1;" });
check("a one-word undo note fails (too short to be an instruction)", ids(shortUndo, "fail").some((i) => i.startsWith("migration-undo:")));
const noBack = evaluate({ ...GOOD, body: "## Πώς γυρίζει πίσω\n<!-- steps go here -->\n" });
check("an empty «Πώς γυρίζει πίσω» (only a comment) fails", ids(noBack, "fail").includes("pr-body:undo-steps"));
const noHeading = evaluate({ ...GOOD, body: "## Τι αλλάζει\nsomething\n" });
check("a body without the heading fails", ids(noHeading, "fail").includes("pr-body:undo-steps"));
const noLine = evaluate({ ...GOOD, body: "## Πώς γυρίζει πίσω\nRevert the PR on GitHub, then merge it.\n" });
check("migrations added but no ΝΑ ΤΡΕΞΕΙΣ line fails", ids(noLine, "fail").includes("pr-body:migrations-line"));
const noPlan = evaluate(without(GOOD, "docs/PROGRESS.md"));
check("code changed without PROGRESS/QUEUE fails plan-updated", ids(noPlan, "fail").includes("plan-updated"));
const noTest = evaluate(without(GOOD, "scripts/tests/a.test.mjs"));
check("src/ changed without a test file fails test-with-code", ids(noTest, "fail").includes("test-with-code"));
const redGates = evaluate({ ...GOOD, gatesExit: 1 });
check("gates exit 1 fails gates", ids(redGates, "fail").includes("gates"));

console.log("\n== what was not checked is said, never passed ==");
const noGates = evaluate({ ...GOOD, gatesExit: null });
check("no gates result is UNVERIFIED, not pass", ids(noGates, "unverified").includes("gates") && !ids(noGates, "pass").includes("gates"));
const noBodyGiven = evaluate({ ...GOOD, body: null });
check("no PR body given is UNVERIFIED, not pass", ids(noBodyGiven, "unverified").includes("pr-body"));
check("UNVERIFIED alone does not fail the verdict", verdict(noGates) === "READY");
check("the rendered report says how many were not verified", /NOT verified/.test(render(noGates)));

console.log("\n== only what applies is asked ==");
const docsOnly = evaluate({ changed: ["docs/FEATURES.md"], readFile: () => null, body: GOOD_BODY, gatesExit: 0 });
check("a docs-only change owes no test and no plan update", !ids(docsOnly, "fail").length && !docsOnly.some((r) => r.id === "test-with-code" || r.id === "plan-updated"));
const noMig = evaluate({ ...GOOD, changed: ["src/lib/flags/flags.ts", "scripts/tests/a.test.mjs", "docs/QUEUE.md"], body: "## Πώς γυρίζει πίσω\nRevert the PR on GitHub, then merge it.\n" });
check("no migration means no ΝΑ ΤΡΕΞΕΙΣ line is demanded", !noMig.some((r) => r.id === "pr-body:migrations-line"));

console.log("\n== the readers ==");
check("section() drops comments and stops at the next heading", section("## A\n<!-- c -->\nhello\n## B\nno", "A") === "hello");
check("section() returns null when the heading is absent", section("## A\nx", "B") === null);
check("undoNote() ignores the marker inside SQL", undoNote("select 'How to undo: x';") === null);

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
