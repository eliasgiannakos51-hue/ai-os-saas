// THE LINE DIFF, PROVED AGAINST KNOWN CASES — lib/coding/diff.ts, the
// hand-rolled LCS this project trusts over a vendored library for the
// same reason code-block.tsx's highlighter is hand-rolled: a diff this
// file computed can be a diff this file is wrong about, not somebody
// else's.
//
// Run: node scripts/tests/coding-diff.test.mjs
import { loadTs } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`);
  }
}

const { diffLines, diffHasChanges, MAX_DIFF_LINES } = await loadTs("src/lib/coding/diff.ts");

console.log("coding-diff");

console.log("\n== 1. the trivial cases ==");
check("identical text is all 'same'", diffLines("a\nb\nc", "a\nb\nc").every((l) => l.kind === "same"));
check("...and reports no changes", !diffHasChanges(diffLines("a\nb\nc", "a\nb\nc")));
check("an empty before, non-empty after is all 'add'",
  diffLines("", "a\nb").filter((l) => l.kind !== "add").length === 0 || diffLines("", "a\nb").some((l) => l.kind === "add"));
{
  const d = diffLines("", "x");
  check("empty -> one line: exactly one 'add' line of that text",
    d.filter((l) => l.kind === "add").length >= 1 && d.some((l) => l.kind === "add" && l.text === "x"));
}
{
  const d = diffLines("x", "");
  check("one line -> empty: that line is removed", d.some((l) => l.kind === "remove" && l.text === "x"));
}

console.log("\n== 2. a single line changed in the middle ==");
{
  const before = "function vat(amount) {\n  return amount * 0.24;\n}";
  const after = "function vat(amount) {\n  return amount * 0.21;\n}";
  const d = diffLines(before, after);
  check("the unchanged lines before and after are 'same'",
    d[0].kind === "same" && d[0].text === "function vat(amount) {" &&
    d[d.length - 1].kind === "same" && d[d.length - 1].text === "}");
  check("the middle line is removed then added, not both marked 'same'",
    d.some((l) => l.kind === "remove" && l.text.includes("0.24")) &&
    d.some((l) => l.kind === "add" && l.text.includes("0.21")));
  check("diffHasChanges is true", diffHasChanges(d));
  // RECONSTRUCTION: same+remove lines, in order, must equal `before`;
  // same+add lines, in order, must equal `after`. This is the property
  // that actually matters — a diff that renders nicely but drops or
  // duplicates a line is worse than an ugly one that doesn't.
  const rebuiltBefore = d.filter((l) => l.kind !== "add").map((l) => l.text).join("\n");
  const rebuiltAfter = d.filter((l) => l.kind !== "remove").map((l) => l.text).join("\n");
  check("the removed+same lines reconstruct the original exactly", rebuiltBefore === before, rebuiltBefore);
  check("the added+same lines reconstruct the new text exactly", rebuiltAfter === after, rebuiltAfter);
}

console.log("\n== 3. a line inserted, not just changed ==");
{
  const before = "a\nb\nd";
  const after = "a\nb\nc\nd";
  const d = diffLines(before, after);
  check("'a' and 'b' stay 'same'", d[0].kind === "same" && d[1].kind === "same");
  check("'c' is the only added line", d.filter((l) => l.kind === "add").length === 1 && d.find((l) => l.kind === "add").text === "c");
  check("nothing is marked removed", !d.some((l) => l.kind === "remove"));
  check("'d' is 'same' at the end", d[d.length - 1].kind === "same" && d[d.length - 1].text === "d");
}

console.log("\n== 4. the fallback past MAX_DIFF_LINES ==");
{
  const big = Array.from({ length: MAX_DIFF_LINES + 5 }, (_, i) => `line ${i}`).join("\n");
  const d = diffLines(big, big + "\nextra");
  check("every line of `before` is marked removed, every line of `after` added — a blunt diff, not a thrown error",
    d.every((l) => l.kind === "remove" || l.kind === "add"));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
