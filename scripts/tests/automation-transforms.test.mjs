// Run: node scripts/tests/automation-transforms.test.mjs
// The four data boxes that really change the text (lib/automations/transforms.ts),
// and the runner's use of them only behind "automation-real-logic".
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";

let pass = 0, fail = 0;
function check(name, ok, detail = "") { if (ok) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`); } }

const { applyTransform, REAL_TRANSFORM_KINDS } = await loadTs("src/lib/automations/transforms.ts");
const t = (box, text) => applyTransform({ id: "x", ...box }, text);

console.log("\n== 1. limit ==");
check("keeps the first N lines", t({ kind: "limit", maxItems: 2 }, "a\nb\nc\nd") === "a\nb");
check("blank lines are not items", t({ kind: "limit", maxItems: 2 }, "a\n\n\nb\nc") === "a\nb");
check("fewer items than the limit is untouched", t({ kind: "limit", maxItems: 9 }, "a\nb") === "a\nb");

console.log("\n== 2. sort ==");
check("ascending, numbers as numbers", t({ kind: "sort", field: "x", direction: "asc" }, "Item 10\nItem 2\nItem 1") === "Item 1\nItem 2\nItem 10");
check("descending is the reverse", t({ kind: "sort", field: "x", direction: "desc" }, "b\na\nc") === "c\nb\na");
check("by a named field when lines carry it", t({ kind: "sort", field: "price", direction: "asc" }, "a, price: 30\nb, price: 5\nc, price: 100") === "b, price: 5\na, price: 30\nc, price: 100");
check("Greek: accents do not push a word to the end", t({ kind: "sort", field: "x", direction: "asc" }, "Βήτα\nΆλφα") === "Άλφα\nΒήτα");

console.log("\n== 3. remove_duplicates ==");
check("drops repeated lines, keeps the first", t({ kind: "remove_duplicates", field: "x" }, "a\nb\na\nc\nb") === "a\nb\nc");
check("case does not make a line new", t({ kind: "remove_duplicates", field: "x" }, "Anna\nanna") === "Anna");
check("by a named field", t({ kind: "remove_duplicates", field: "id" }, "id: 1, n: a\nid: 2, n: b\nid: 1, n: c") === "id: 1, n: a\nid: 2, n: b");

console.log("\n== 4. set ==");
check("appends each assignment as a line", t({ kind: "set", assignments: [{ field: "status", value: "new" }] }, "a") === "a\nstatus: new");
check("an empty field name is skipped", t({ kind: "set", assignments: [{ field: " ", value: "x" }] }, "a") === "a");
check("with no text the assignments stand alone", t({ kind: "set", assignments: [{ field: "k", value: "v" }] }, "") === "k: v");

console.log("\n== 5. the runner uses them only behind the switch ==");
const runner = readFileSync("src/lib/automations/runner.ts", "utf8").replace(/\/\/.*$/gm, "");
check("the four kinds are the ones handled", [...REAL_TRANSFORM_KINDS].sort().join() === "limit,remove_duplicates,set,sort");
check("applyTransform runs only when realLogicOn", /if \(realLogicOn && REAL_TRANSFORM_KINDS\.has\(box\.kind\)\) \{\s*text = applyTransform\(box, text\);/.test(runner));
check("it comes BEFORE the pass-through branch", runner.indexOf("applyTransform(box, text)") > 0 && runner.indexOf("applyTransform(box, text)") < runner.indexOf('box.kind === "sort" || box.kind === "limit"'));

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
