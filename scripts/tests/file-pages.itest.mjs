/*
 * A 51-PAGE PDF, ASKED, AND THE PAGE THE ANSWER NAMES (package 12), run
 * through the real pipeline without a model: a real PDF written by
 * scripts/tests/lib/build-pdf.mjs, read by lib/files/extract.ts (the custom
 * PDF parser), stored as Files stores it, planned into what the model is
 * sent (lib/files/ask.ts, planContext), an answer checked against what was
 * sent (verifyCitations), cut into pressable references
 * (lib/files/page-refs.ts), and the cited page read back as
 * api/files/[id]?page=N reads it.
 *
 * Run: node scripts/tests/file-pages.itest.mjs
 */
import { buildPdf } from "./lib/build-pdf.mjs";
import { loadTs, loadTsWithDeps } from "./load-ts.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
}

const extract = await loadTsWithDeps("src/lib/files/extract.ts");
const ask = await loadTsWithDeps("src/lib/files/ask.ts");
const refs = await loadTs("src/lib/files/page-refs.ts");
const types = await loadTs("src/lib/files/file-types.ts");

console.log("file-pages (a 51-page PDF, run)");
const FILE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const texts = Array.from({ length: 51 }, (_, i) =>
  i === 36 ? "Page 37 invoice total due 4820 EUR by 30 November" : `Page ${i + 1} general terms paragraph number ${i + 1} of the agreement`
);
const pdf = buildPdf(texts);
const result = extract.extractText(pdf, "pdf");
check(`the parser reads the first ${types.MAX_PDF_PAGES} pages of 51`, result.pages.length === types.MAX_PDF_PAGES && result.pages[36].text.includes("4820"), `${result.pages.length} pages`);
const stored = extract.serialisePages(result.pages);
const file = { id: FILE_ID, filename: "contract.pdf", extracted_text: stored, page_count: 51 };

const context = ask.planContext([file]);
check("all 50 pages reach the model in one part", context.passes.length === 1 && context.allowed.length === 50);
check("...each headed with its page", context.passes[0].text.includes("--- FILE: contract.pdf | Page 37 ---"));

const answer = "The total due is 4820 EUR [contract.pdf, Σελίδα 37], payable by 30 November [contract.pdf, Page 37]. Page 51 says otherwise [contract.pdf, Page 51].";
const checked = ask.verifyCitations(answer, context.allowed);
check("a reference to page 37 is checked and kept, with its file and page", checked.verified.length === 2 && checked.verified.every((c) => c.fileId === FILE_ID && c.page === 37 && c.label === "Page 37"), JSON.stringify(checked.verified));
check("a reference to page 51, never read, is removed", checked.fabricated.length === 1 && !checked.answer.includes("Page 51]"));

const pieces = refs.splitAnswer(checked.answer, checked.verified);
const pressed = pieces.filter((p) => "citation" in p);
check("the answer is cut into text and two pressable references to page 37", pressed.length === 2 && pressed.every((p) => p.citation.page === 37) && pieces.map((p) => ("text" in p ? p.text : `<${p.citation.label}>`)).join("").startsWith("The total due is 4820 EUR <Page 37>"));
check("...listed once", refs.uniquePages(checked.verified).length === 1);
check("...opening the PDF at page 37", refs.pdfPageHref(FILE_ID, 37) === `/api/files/${FILE_ID}/view?page=37`);

const page37 = extract.deserialisePages(stored).find((p) => p.pageNumber === 37);
check("the page read back is page 37, with what the answer quoted", page37?.label === "Page 37" && page37.text.includes("4820 EUR"));
check("the unread page is said: 50 of 51", JSON.stringify(refs.unreadPages([file])) === JSON.stringify([{ filename: "contract.pdf", read: 50, total: 51 }]));
check("...and the file's line says it too", JSON.stringify(refs.pagesRead("pdf", 51)) === JSON.stringify({ read: 50, total: 51 }) && refs.pagesRead("pdf", 50) === null);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
