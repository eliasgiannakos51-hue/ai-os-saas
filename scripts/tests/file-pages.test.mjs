/*
 * «ΑΝΕΒΑΖΩ PDF 50 ΣΕΛΙΔΩΝ, ΡΩΤΑΩ ΚΑΤΙ, ΚΑΙ Η ΑΠΑΝΤΗΣΗ ΓΡΑΦΕΙ ΣΕ ΠΟΙΑ ΣΕΛΙΔΑ
 * ΤΟ ΒΡΗΚΕ» (MASTER 16, package 12), behind the switch "file-pages".
 *
 * What this holds, against the code rather than its comments:
 *
 *   1. A CHECKED REFERENCE KEEPS ITS FILE AND PAGE, so it can be opened.
 *   2. THE ANSWER, CUT: only a checked reference is pressable; each page is
 *      listed once; a PDF read only in part says which pages it did not read.
 *   3. THE PAGE: api/files/[id]?page=N answers with that page alone, the
 *      owner's only; api/files/[id]/view opens a PDF at the page — the
 *      owner's, behind the switch, rate limited, signed briefly, a PDF only.
 *   4. THE SCREEN: the Files shell and the Files page, behind the switch.
 *   5. The words, in ten languages.
 *
 * A real 51-page PDF through extraction, the model's context, the checker
 * and the page read back: file-pages.itest.mjs. The same in a browser:
 * file-pages.prodtest.mjs.
 *
 * Run: node scripts/tests/file-pages.test.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}
const code = (p) => stripComments(readFileSync(p, "utf8"));

const refs = await loadTs("src/lib/files/page-refs.ts");

console.log("file-pages");

// ---------------------------------------------------------------------
console.log("\n== 1. a checked reference keeps its file and page ==");
// ---------------------------------------------------------------------
const ask = code("src/lib/files/ask.ts");
check("the checker keeps what each reference resolved to", /const canonical: Citation = \{ filename: entry\.filename, label: entry\.label, fileId: entry\.fileId, page: entry\.page \};/.test(ask));
check("...and the answer carries it to the screen", /citations: \(result\.citations \?\? \[\]\) as Citation\[\]/.test(code("src/lib/files/answer.ts")));

// ---------------------------------------------------------------------
console.log("\n== 2. the answer, cut ==");
// ---------------------------------------------------------------------
const C37 = { filename: "contract.pdf", label: "Page 37", fileId: "f1", page: 37 };
const C2 = { filename: "notes.docx", label: "Page 2", fileId: "f2", page: 2 };
let pieces = refs.splitAnswer("Total 4820 [contract.pdf, Page 37] and terms [notes.docx, Page 2].", [C37, C2]);
check("a checked reference is pressable, where it stands", pieces.length === 5 && pieces[1].citation === C37 && pieces[3].citation === C2 && pieces[0].text === "Total 4820 " && pieces[4].text === ".");
pieces = refs.splitAnswer("Bracketed [not, a reference] and [contract.pdf, Page 37].", [C37]);
check("...anything else in brackets stays text", pieces.length === 3 && pieces[0].text === "Bracketed [not, a reference] and " && pieces[1].citation === C37 && pieces[2].text === ".");
pieces = refs.splitAnswer("Old answer [contract.pdf, Page 37].", [{ filename: "contract.pdf", label: "Page 37" }]);
check("...and a reference with no page to open (an answer from before) stays text", pieces.length === 1 && "text" in pieces[0]);
check("each page is listed once", refs.uniquePages([C37, C2, { ...C37 }, C37]).length === 2);
check("a PDF opens at its page", refs.pdfPageHref("f 1", 37) === "/api/files/f%201/view?page=37" && refs.pdfPageHref("f1", 0) === "/api/files/f1/view?page=1");
const text = (n) => Array.from({ length: n }, (_, i) => `\n\n[[PAGE ${i + 1}|Page ${i + 1}]]\nx`).join("");
check("a PDF read only in part is said: which file, how many of how many",
  JSON.stringify(refs.unreadPages([{ filename: "a.pdf", extracted_text: text(50), page_count: 51 }, { filename: "b.pdf", extracted_text: text(12), page_count: 12 }, { filename: "c.txt", extracted_text: "plain", page_count: null }])) === JSON.stringify([{ filename: "a.pdf", read: 50, total: 51 }]));
check("...on the file's own line too, only past the limit, only for a PDF", JSON.stringify(refs.pagesRead("pdf", 120)) === JSON.stringify({ read: 50, total: 120 }) && refs.pagesRead("pdf", 50) === null && refs.pagesRead("docx", 120) === null);
check("...and read back from a stored answer defensively", refs.readUnreadPages([{ filename: "a.pdf", read: 50, total: 51 }, { filename: "b", read: 5, total: 5 }, "x", null]).length === 1);
const handler = code("src/lib/jobs/handlers/file-ask.ts");
check("the answer records the unread pages", /unreadPages: unreadPages\(files\),/.test(handler));
check("...from the stored page count, read with the files", /\.select\("id, filename, extracted_text, page_count"\)\s*\.eq\("user_id", userId\)/.test(code("src/lib/files/store.ts")));

// ---------------------------------------------------------------------
console.log("\n== 3. the page ==");
// ---------------------------------------------------------------------
const one = code("src/app/api/files/[id]/route.ts");
check("?page=N answers with that page alone",
  /if \(wantedPage !== null\) \{\s*const one = pages\.find\(\(page\) => page\.pageNumber === wantedPage\);/.test(one) &&
    one.includes("const wantedPage = pageParam === null ? null : /^\\d{1,6}$/.test(pageParam) ? Number(pageParam) : -1;") &&
    /page: \{ number: one\.pageNumber, label: one\.label, text: one\.text \}/.test(one));
check("...a page that is not there is a 404, a bad number a 400", /code: "no_such_page"[\s\S]{0,40}\{ status: 404 \}/.test(one) && /code: "bad_page" \}, \{ status: 400 \}/.test(one));
check("...the owner's only", /\.from\("user_files"\)\s*\.select\("id, filename, extracted_text, processing_status"\)\s*\.eq\("id", params\.id\)\s*\.eq\("user_id", user\.id\)/.test(one));
const view = code("src/app/api/files/[id]/view/route.ts");
check("the PDF opens at the page: a redirect to the file at #page=N", /NextResponse\.redirect\(`\$\{signed\.signedUrl\}#page=\$\{page\}`, 302\)/.test(view));
check("...behind the switch", /if \(!\(await isFeatureOn\("file-pages", user\)\)\) return NextResponse\.json\(\{ ok: false, code: "not_enabled" \}, \{ status: 403 \}\);/.test(view));
check("...the owner's file only", /\.select\("id, file_type, storage_path"\)\s*\.eq\("id", params\.id\)\s*\.eq\("user_id", user\.id\)/.test(view));
check("...a PDF only", /if \(file\.file_type !== "pdf"\) return NextResponse\.json\(\{ ok: false, code: "not_a_pdf" \}, \{ status: 400 \}\);/.test(view));
check("...rate limited in the download's own scope, since it mints a link", /checkRateLimit\(\{ scope: "file_download", identifier: user\.id, maxAttempts: 120, windowMinutes: 60 \}\)/.test(view) && /if \(!limited\.allowed\)/.test(view));
check("...signed briefly, opened rather than saved, never cached or referred",
  /createSignedUrl\(String\(file\.storage_path\), SIGNED_URL_TTL_SECONDS\);/.test(view) && /"Cache-Control", "no-store"/.test(view) && /"Referrer-Policy", "no-referrer"/.test(view));
check("...a page number is checked before anything is read", view.indexOf('code: "bad_page"') > 0 && view.indexOf('code: "bad_page"') < view.indexOf("auth.getUser()"));

// ---------------------------------------------------------------------
console.log("\n== 4. the screen ==");
// ---------------------------------------------------------------------
check('"file-pages" is declared as a switch', /\n  "file-pages": "/.test(code("src/lib/flags/flags.ts")));
const page = code("src/app/dashboard/files/page.tsx");
check("the Files page reads it for both screens", (page.match(/pages=\{await isFeatureOn\("file-pages", user\)\}/g) ?? []).length === 2);
const cited = code("src/components/files/cited-answer.tsx");
check("a reference in the answer is a button that opens its page", /data-testid="files-cite"/.test(cited) && /onClick=\{\(\) => onOpen\(piece\.citation\)\}/.test(cited));
check("the page shows its own words, read from the file", /fetch\(`\/api\/files\/\$\{encodeURIComponent\(fileId\)\}\?page=\$\{page\}`\)/.test(cited) && /data-testid="files-page-text"/.test(cited));
check("...and for a PDF, opens the file at that page in a new tab", /href=\{pdfPageHref\(fileId, page\)\}\s*target="_blank"\s*rel="noopener noreferrer"/.test(cited));
check("...and says when a page is gone or did not open", /state\.status === "missing" \? t\("missing"\) : t\("failed"\)/.test(cited));
const shell = code("src/components/files/files-shell.tsx");
check("shell: the answer is drawn with its pages pressable, with the switch", /\{pages && <CitedAnswerText answer=\{turn\.answer\}/.test(shell) && /text: pages && turn\.answer \? "" : turn\.text,/.test(shell));
check("shell: the page opens under its own answer", /\{pages && openPage\?\.turnId === turn\.id && openPage\.citation\.fileId && \(\s*<PageView/.test(shell));
check("shell: a file read only in part says so on its line", /pages && pagesRead\(file\.file_type, file\.page_count\)/.test(shell));
const ws = code("src/components/files/files-workspace.tsx");
check("page: the answer and its list open pages, with the switch", /\{pages \? \(\s*<>\s*<CitedAnswerText answer=\{answer\} onOpen=\{setOpenPage\} \/>/.test(ws) && /onClick=\{\(\) => setOpenPage\(citation\)\}/.test(ws));
check("page: each page is listed once there too", /\{\(pages \? uniquePages\(answer\.citations\) : answer\.citations\)\.map\(\(citation, i\) =>/.test(ws));
check("page: a file read only in part says so on its card", /pages && pagesRead\(file\.file_type, file\.page_count\)/.test(ws));
check("the shell draws no empty paragraph for an answer it draws itself", /\{turn\.text && \(\s*<p/.test(code("src/components/shell/tool-shell.tsx")));

// ---------------------------------------------------------------------
console.log("\n== 5. the words ==");
// ---------------------------------------------------------------------
const KEYS = ["open", "close", "loading", "empty", "missing", "failed", "openPdf", "unread"];
const LOCALES = readdirSync("messages").filter((f) => f.endsWith(".json"));
check(`the ten languages (${LOCALES.length})`, LOCALES.length === 10);
check(`the words to look for (${KEYS.length})`, KEYS.length >= 8);
for (const file of LOCALES) {
  const files = JSON.parse(readFileSync(`messages/${file}`, "utf8")).dashboard?.files ?? {};
  const m = files.pageRefs ?? {};
  const empty = KEYS.filter((k) => typeof m[k] !== "string" || !m[k].trim());
  check(`${file}: the words (${KEYS.length}), the file line, and the page count kept as it was`,
    empty.length === 0 && /\{read\}/.test(m.unread ?? "") && /\{total\}/.test(files.pagesPartRead ?? "") && /\{count/.test(files.pages ?? ""), empty.join(", "));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
