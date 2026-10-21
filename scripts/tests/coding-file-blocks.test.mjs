// THE SHAPE A CODING REPLY TAKES, PROVED — lib/coding/file-blocks.ts.
// There is no tool-calling in this app's AI layer, so the model is
// prompted to wrap each file in <<<IONEXA_FILE:path>>> ... <<<IONEXA_END>>>
// and this is what pulls that apart from the prose around it.
//
// Run: node scripts/tests/coding-file-blocks.test.mjs
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

const { parseReply, formatFileBlock, isValidFilePath, reduceFiles } = await loadTs("src/lib/coding/file-blocks.ts");

console.log("coding-file-blocks");

console.log("\n== 1. prose only, no files at all ==");
{
  const r = parseReply("TypeScript is a typed superset of JavaScript.");
  check("the whole text is prose", r.prose === "TypeScript is a typed superset of JavaScript.");
  check("and no files", r.files.length === 0);
}

console.log("\n== 2. one file, no surrounding prose ==");
{
  const block = formatFileBlock({ path: "src/vat.ts", content: "export function vat(a) {\n  return a * 0.24;\n}" });
  const r = parseReply(block);
  check("prose is empty", r.prose === "", r.prose);
  check("exactly one file", r.files.length === 1);
  check("the path round-trips", r.files[0]?.path === "src/vat.ts");
  check("the content round-trips byte for byte, no stray marker newline",
    r.files[0]?.content === "export function vat(a) {\n  return a * 0.24;\n}", r.files[0]?.content);
}

console.log("\n== 3. prose BEFORE and AFTER a file ==");
{
  const text = `Here is the function you asked for:\n\n${formatFileBlock({ path: "vat.ts", content: "export const x = 1;" })}\n\nIt rounds to two decimals.`;
  const r = parseReply(text);
  check("the lead-in prose survives", r.prose.includes("Here is the function you asked for:"), r.prose);
  check("the trailing prose survives", r.prose.includes("It rounds to two decimals."), r.prose);
  check("the file block itself is NOT in the prose, open marker or close",
    !r.prose.includes("IONEXA_FILE") && !r.prose.includes("IONEXA_END"), r.prose);
  check("one file, the right content", r.files.length === 1 && r.files[0].content === "export const x = 1;");
}

console.log("\n== 4. several files in one reply ==");
{
  const text =
    formatFileBlock({ path: "app.ts", content: "import { vat } from './vat';" }) +
    "\n" +
    formatFileBlock({ path: "vat.ts", content: "export function vat() {}" });
  const r = parseReply(text);
  check("both files are there, in order", r.files.map((f) => f.path).join(",") === "app.ts,vat.ts");
  check("neither content bled into the other", r.files[0].content === "import { vat } from './vat';" && r.files[1].content === "export function vat() {}");
}

console.log("\n== 5. a duplicate path keeps only the first — the model repeating itself is not two files ==");
{
  const text = formatFileBlock({ path: "a.ts", content: "one" }) + formatFileBlock({ path: "a.ts", content: "two" });
  const r = parseReply(text);
  check("exactly one file named a.ts", r.files.length === 1 && r.files[0].path === "a.ts");
  check("the first occurrence wins", r.files[0].content === "one");
}

console.log("\n== 6. an unclosed block becomes prose, not a half-parsed file ==");
{
  const text = "Some thoughts, then:\n<<<IONEXA_FILE:cut-off.ts>>>\nexport const x = 1;";
  const r = parseReply(text);
  check("no file is produced from the unterminated block", r.files.length === 0);
  check("its text is still readable, inside the prose", r.prose.includes("export const x = 1;"), r.prose);
}

console.log("\n== 7. an invalid path is dropped, its content falls back to being unreadable rather than crashing ==");
{
  const bad = ["", "/abs/olute.ts", "../escape.ts", "a/../b.ts", "x".repeat(400) + ".ts"];
  for (const p of bad) check(`"${p.slice(0, 20)}..." is rejected by isValidFilePath`, !isValidFilePath(p));
  const r = parseReply(formatFileBlock({ path: "../escape.ts", content: "x" }));
  check("parseReply drops a file whose path fails validation", r.files.length === 0);
}

console.log("\n== 8. a normal relative path with folders is accepted ==");
{
  for (const p of ["app.ts", "src/lib/vat.ts", "a/b/c/d.py"]) check(`"${p}" is a valid path`, isValidFilePath(p));
}

console.log("\n== 9. reduceFiles folds patches into what exists now ==");
{
  const turns = [
    { files: [{ path: "a.ts", content: "v1" }, { path: "b.ts", content: "b1" }] },
    { files: null }, // a prose-only turn — no patch at all
    { files: [{ path: "a.ts", content: "v2" }] }, // only a.ts touched again
  ];
  const now = reduceFiles(turns);
  check("a.ts holds the LATEST write, not the first", now.find((f) => f.path === "a.ts")?.content === "v2");
  check("b.ts, never touched again, keeps its only write", now.find((f) => f.path === "b.ts")?.content === "b1");
  check("the order is first-introduced, not last-touched — a.ts stays before b.ts", now.map((f) => f.path).join(",") === "a.ts,b.ts");
  check("exactly two files, no ghost entry from the null-files turn", now.length === 2);
}
{
  check("no turns at all is an empty file set, not a crash", reduceFiles([]).length === 0);
  check("a single turn with no files is an empty file set", reduceFiles([{ files: null }]).length === 0);
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
