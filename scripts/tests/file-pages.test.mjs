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
 *   6. IN THE READER'S LANGUAGE (the package check of 2026-10-08): every
 *      page label the screens show («Σελίδα 37», never the stored «Page
 *      37» on a Greek screen), and what goes wrong — a question refused or
 *      failed, an upload refused, a file that could not be read — said by
 *      what it is, never in the route's or the provider's English.
 *
 * A real 51-page PDF through extraction, the model's context, the checker
 * and the page read back: file-pages.itest.mjs. The same in a browser, and
 * the upload, the question and every refusal through the real routes:
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
const { askFailure } = await loadTs("src/lib/files/ask-failure.ts");
const words = await loadTs("src/lib/files/refusal-words.ts");
const { answerForClipboard } = await loadTs("src/lib/files/answer.ts");

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
check("...signed briefly, opened rather than saved, never cached",
  /createSignedUrl\(String\(file\.storage_path\), SIGNED_URL_TTL_SECONDS\);/.test(view) && /"Cache-Control", "no-store"/.test(view));
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
check("shell: the answer is drawn with its pages pressable, with the switch", /\{pages && <CitedAnswerText answer=\{turn\.answer\}/.test(shell) && /text: pages && turn\.answer \? "" : turn\.answer \? relabelAnswer\(turn\.text, turn\.answer\.citations, show\) : turn\.text,/.test(shell));
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

// ---------------------------------------------------------------------
console.log("\n== 6. in the reader's language ==");
// ---------------------------------------------------------------------
check("a stored label is read for what it is: a page, a slice of rows, or a name of the person's own",
  JSON.stringify(refs.labelParts("Page 12")) === JSON.stringify({ unit: "page", n: 12 }) && JSON.stringify(refs.labelParts("Rows 3")) === JSON.stringify({ unit: "rows", n: 3 }) && refs.labelParts("Πωλήσεις 2025") === null && refs.labelParts("Pages 2") === null);
const greek = (l) => { const p = refs.labelParts(l); return p ? `${p.unit === "page" ? "Σελίδα" : "Γραμμές"} ${p.n}` : l; };
check("the answer's text shows each checked reference in the reader's language",
  refs.relabelAnswer("Total [contract.pdf, Page 37] and [contract.pdf, Page 37].", [C37], greek) === "Total [contract.pdf, Σελίδα 37] and [contract.pdf, Σελίδα 37].");
check("...brackets that are not a checked reference stay as written",
  refs.relabelAnswer("See [other.pdf, Page 3] and [not, a reference].", [C37], greek) === "See [other.pdf, Page 3] and [not, a reference].");
const copied = answerForClipboard({ text: "Total [contract.pdf, Page 37].", citations: [C37] }, greek);
check("...and so does what is copied, its list too", copied === "Total [contract.pdf, Σελίδα 37].\n\n- contract.pdf — Σελίδα 37", JSON.stringify(copied));
check("every label the screens show goes through the reader's language",
  /\{show\(piece\.citation\.label\)\}/.test(cited) && /— \{show\(c\.label\)\}/.test(cited) && /\{citation\.filename\} — \{show\(state\.status === "ready" \? state\.label : citation\.label\)\}/.test(cited) &&
    (cited.match(/label: show\(/g) ?? []).length === 3 && !/\{(?:piece\.citation|c|citation)\.label\}/.test(cited));
check("...with the switch off as well, on both screens",
  /\{c\.filename\} — \{show\(c\.label\)\}/.test(shell) && /\{relabelAnswer\(answer\.text, answer\.citations, show\)\}/.test(ws) && (ws.match(/\{citation\.filename\} — \{show\(citation\.label\)\}/g) ?? []).length === 2 && !/(?<!\$)\{(?:c|citation)\.label\}/.test(shell + ws));
check("a question that got no answer says which: still running, stalled, no credits, too many, the AI did not answer",
  askFailure({ code: "still_running" }) === "askStillRunning" && askFailure({ code: "stalled", jobId: "j" }) === "askStalled" && askFailure({ code: "insufficient" }) === "askNoCredits" && askFailure({ code: "rate_limited" }) === "askRateLimited" && askFailure({ code: null }) === "askError");
check("...a job that ran and failed says the AI did not answer, whatever its row says",
  askFailure({ code: '529 {"type":"error","error":{"type":"overloaded_error"}}', jobId: "j" }) === "askFailed" && askFailure({ code: "insufficient", jobId: "j" }) === "askFailed");
check("...the route names its refusals", /\{ ok: false, reason: "insufficient", insufficientCredits: true,/.test(code("src/app/api/files/ask/route.ts")) && (code("src/app/api/files/ask/route.ts").match(/reason: "rate_limited"/g) ?? []).length === 3);
check("...and neither screen shows the route's or the provider's own words",
  !/outcome\.error \|\|/.test(shell + ws) && (shell.match(/failures\.ask\(/g) ?? []).length === 2 && (ws.match(/failures\.ask\(/g) ?? []).length === 2);
check("an upload refusal is said by what it is",
  words.uploadRefusal({ stage: "file_cap", limitReached: true }, 403) === "uploadFileCap" && words.uploadRefusal({ stage: "storage_cap", limitReached: true }, 403) === "uploadStorageCap" &&
    words.uploadRefusal({ error: "Too many uploads" }, 429) === "uploadRateLimited" && words.uploadRefusal({ stage: "type" }, 415) === "unsupportedType" &&
    words.uploadRefusal({ stage: "size" }, 413) === "tooLarge" && words.uploadRefusal({ stage: "size" }, 400) === "emptyFile" && words.uploadRefusal(null, 413) === "tooLargeForTransfer" &&
    words.uploadRefusal({ stage: "file_cap" }, 503) === "uploadError" && words.uploadRefusal({ stage: "storage_download" }, 502) === "uploadError");
check("...on the shell and on the page, never as the route wrote it",
  /refused: \(refusal\) => failures\.refused\(refusal, file\.name\)/.test(shell) && /addToast\(failures\.refused\(uploadRefusal\(data, data\.status \?\? 0\), file\.name\), "error"\)/.test(ws) &&
    (code("src/lib/files/upload-file.ts").match(/error: refused\(data, response\.status\)/g) ?? []).length === 2);
check("nothing a request answers is shown as it came, on either Files screen: every failure is Files' own sentence",
  !/getErrorMessage\(|data\??\.error \?\?|\.error \|\| t\(/.test(shell + ws), (shell + ws).match(/.*(?:getErrorMessage\(|data\??\.error \?\?|\.error \|\| t\().*/g)?.slice(0, 3).join(" | "));
// The sentences extraction stores, read out of the files that write them,
// so a reworded one cannot slip past the matcher.
const thrown = (path, cls) => [...readFileSync(path, "utf8").matchAll(new RegExp(`new ${cls}\\(\\s*"([^"]+)"`, "g"))].map((m) => m[1]);
const stored = [...thrown("src/lib/files/extract.ts", "ExtractionError"), ...thrown("src/lib/files/pdf.ts", "PdfError")];
const expect = { "no text layer": "scan", "font encoding": "encoding", "password-protected": "locked", "appears to be empty": "empty", "no readable pages": "empty" };
const found = Object.entries(expect).map(([needle, reason]) => {
  const sentence = stored.find((s) => s.includes(needle));
  return sentence && words.unreadableReason(sentence) === reason ? null : `${needle} -> ${sentence ? words.unreadableReason(sentence) : "no such sentence"}`;
}).filter(Boolean);
check(`a file that could not be read says why, for each reason extraction stores (${stored.length} sentences read)`, stored.length >= 6 && found.length === 0, found.join(", "));
check("...and an unknown or empty one falls back to the screen's own sentence", words.unreadableReason("this file could not be read") === null && words.unreadableReason(null) === null);
check("...the file's own reason, on the shell and on the page",
  /failures\.unreadable\(outcome\.file\.error, t\("uploadUnreadable", \{ name: file\.name \}\)\)/.test(shell) && /failures\.unreadable\(data\.file\.error, t\("uploadUnreadable", \{ name: file\.name \}\)\)/.test(ws) && /failures\.unreadable\(file\.error, t\("failedHint"\)\)/.test(ws) && !/file\.error \?\?/.test(shell + ws));
const NEW_KEYS = ["askNoCredits", "askRateLimited", "askFailed", "uploadFileCap", "uploadStorageCap", "uploadRateLimited"];
for (const file of LOCALES) {
  const files = JSON.parse(readFileSync(`messages/${file}`, "utf8")).dashboard?.files ?? {};
  const missing = [
    ...NEW_KEYS.filter((k) => typeof files[k] !== "string" || !files[k].trim()),
    ...["scan", "encoding", "locked", "empty"].filter((k) => typeof files.unreadable?.[k] !== "string" || !files.unreadable[k].trim()).map((k) => `unreadable.${k}`),
    ...["page", "rows"].filter((k) => !/\{n\}/.test(files.pageRefs?.[k] ?? "")).map((k) => `pageRefs.${k}`),
  ];
  check(`${file}: a page and its rows by number, and what goes wrong (${NEW_KEYS.length + 6})`, missing.length === 0, missing.join(", "));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
