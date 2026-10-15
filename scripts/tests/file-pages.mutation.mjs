#!/usr/bin/env node
/*
 * CAN file-pages.test.mjs SEE AN ANSWER POINT AT THE WRONG PAGE, OR A PAGE
 * OPEN FOR THE WRONG PERSON?
 *
 * A checked reference that forgets its page; brackets that were never a
 * reference made pressable; a page listed twice; a PDF read only in part
 * that says nothing; the page route answering with the whole document, or
 * another person's; the PDF link opening on page one, for another person,
 * with the switch off, unlimited, or for a file that is not a PDF. And
 * (since 2026-10-08) every way back to English on a Greek screen: a label
 * shown as stored, a failed question or a refused upload said in the
 * route's or the provider's words, a stored reason shown as it was stored.
 *
 * Run: node scripts/tests/file-pages.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/file-pages.test.mjs";
const RUN = "scripts/tests/file-pages.itest.mjs";
const ASK = "src/lib/files/ask.ts";
const REFS = "src/lib/files/page-refs.ts";
const ONE = "src/app/api/files/[id]/route.ts";
const VIEW = "src/app/api/files/[id]/view/route.ts";
const HANDLER = "src/lib/jobs/handlers/file-ask.ts";
const WS = "src/components/files/files-workspace.tsx";
// In the reader's language (the package check of 2026-10-08).
const CITED = "src/components/files/cited-answer.tsx";
const SHELL = "src/components/files/files-shell.tsx";
const ANSWER = "src/lib/files/answer.ts";
const ASK_FAILURE = "src/lib/files/ask-failure.ts";
const WORDS = "src/lib/files/refusal-words.ts";
const ASK_ROUTE = "src/app/api/files/ask/route.ts";

const MUTANTS = [
  {
    name: "a checked reference forgets which page it was",
    file: ASK,
    from: "      const canonical: Citation = { filename: entry.filename, label: entry.label, fileId: entry.fileId, page: entry.page };",
    to: "      const canonical: Citation = { filename: entry.filename, label: entry.label };",
    gate: RUN,
    expect: "a reference to page 37 is checked and kept, with its file and page",
  },
  {
    name: "any brackets become a pressable reference",
    file: REFS,
    from: "    if (!citation) continue;",
    to: "    if (!citation) { pieces.push({ text: text.slice(at, m.index! + m[0].length) }); at = m.index! + m[0].length; continue; }",
    expect: "...anything else in brackets stays text",
  },
  {
    name: "a page cited four times is listed four times",
    file: REFS,
    from: "    if (seen.has(key)) return false;",
    to: "    if (false) return false;",
    expect: "each page is listed once",
  },
  {
    name: "a PDF read only in part says nothing",
    file: REFS,
    from: "    return read > 0 && total > read ? [{ filename: f.filename, read, total }] : [];",
    to: "    return [];",
    expect: "a PDF read only in part is said",
  },
  {
    name: "the answer forgets the unread pages",
    file: HANDLER,
    from: "      unreadPages: unreadPages(files),\n",
    to: "",
    expect: "the answer records the unread pages",
  },
  {
    name: "?page=N answers with the whole document",
    file: ONE,
    from: "    if (wantedPage !== null) {",
    to: "    if (false) {",
    expect: "?page=N answers with that page alone",
  },
  {
    name: "the PDF opens on page one",
    file: VIEW,
    from: "    const response = NextResponse.redirect(`${signed.signedUrl}#page=${page}`, 302);",
    to: "    const response = NextResponse.redirect(`${signed.signedUrl}`, 302);",
    expect: "the PDF opens at the page: a redirect to the file at #page=N",
  },
  {
    name: "the PDF link opens another person's file",
    file: VIEW,
    from: '      .eq("id", params.id)\n      .eq("user_id", user.id)',
    to: '      .eq("id", params.id)',
    expect: "...the owner's file only",
  },
  {
    name: "the PDF link works with the switch off",
    file: VIEW,
    from: '    if (!(await isFeatureOn("file-pages", user))) return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });\n',
    to: "",
    expect: "...behind the switch",
  },
  {
    name: "the PDF link mints signed addresses without limit",
    file: VIEW,
    from: '    if (!limited.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });\n',
    to: "",
    expect: "...rate limited in the download's own scope, since it mints a link",
  },
  {
    name: "the PDF link opens a file that is not a PDF",
    file: VIEW,
    from: '    if (file.file_type !== "pdf") return NextResponse.json({ ok: false, code: "not_a_pdf" }, { status: 400 });\n',
    to: "",
    expect: "...a PDF only",
  },
  {
    name: "the signed address is cached",
    file: VIEW,
    from: '    response.headers.set("Cache-Control", "no-store");\n',
    to: "",
    expect: "...signed briefly, opened rather than saved, never cached",
  },
  {
    name: "the Files page lists a page once per mention",
    file: WS,
    from: "{(pages ? uniquePages(answer.citations) : answer.citations).map((citation, i) =>",
    to: "{answer.citations.map((citation, i) =>",
    expect: "page: each page is listed once there too",
  },
  {
    name: "a reference in the answer shows the label as stored, «Page 37» on a Greek screen",
    file: CITED,
    from: "            {show(piece.citation.label)}",
    to: "            {piece.citation.label}",
    expect: "every label the screens show goes through the reader's language",
  },
  {
    name: "no stored label is recognised as a page",
    file: REFS,
    from: "  const m = /^(Page|Rows) (\\d{1,6})$/.exec(label.trim());",
    to: "  const m = /^(Pages|Rows) (\\d{1,6})$/.exec(label.trim());",
    expect: "a stored label is read for what it is",
  },
  {
    name: "any brackets in the answer are relabelled, a reference or not",
    file: REFS,
    from: "    known.has(`${file.trim()}|${label.trim()}`) ? ",
    to: "    true ? ",
    expect: "...brackets that are not a checked reference stay as written",
  },
  {
    name: "the copied answer keeps the stored label",
    file: ANSWER,
    from: "  const text = relabelAnswer(answer.text, answer.citations, show);",
    to: "  const text = answer.text;",
    expect: "...and so does what is copied, its list too",
  },
  {
    name: "with the switch off, the shell lists the label as stored",
    file: SHELL,
    from: "{c.filename} — {show(c.label)}",
    to: "{c.filename} — {c.label}",
    expect: "...with the switch off as well, on both screens",
  },
  {
    name: "a job that failed is said in its row's words — the provider's",
    file: ASK_FAILURE,
    from: '  if (outcome.jobId) return "askFailed";\n',
    to: "",
    expect: "...a job that ran and failed says the AI did not answer, whatever its row says",
  },
  {
    name: "the shell says the route's English again",
    file: SHELL,
    from: "              : failures.ask(outcome),\n        });",
    to: "              : outcome.error || failures.ask(outcome),\n        });",
    expect: "...and neither screen shows the route's or the provider's own words",
  },
  {
    name: "the ask route stops saying it is out of credits",
    file: ASK_ROUTE,
    from: '{ ok: false, reason: "insufficient", insufficientCredits: true,',
    to: "{ ok: false, insufficientCredits: true,",
    expect: "...the route names its refusals",
  },
  {
    name: "a Free account at its limit is told only that the upload failed",
    file: WORDS,
    from: '  if (body?.stage === "file_cap" && body.limitReached === true) return "uploadFileCap";\n',
    to: "",
    expect: "an upload refusal is said by what it is",
  },
  {
    name: "a scanned PDF is not recognised",
    file: WORDS,
    from: '  if (/no text layer/i.test(error)) return "scan";\n',
    to: "",
    expect: "a file that could not be read says why",
  },
  {
    name: "the page shows a stored reason as it was stored",
    file: WS,
    from: '{failures.unreadable(file.error, t("failedHint"))}',
    to: '{file.error ?? t("failedHint")}',
    expect: "...the file's own reason, on the shell and on the page",
  },
  {
    name: "the page toasts the delete route's English",
    file: WS,
    from: '        addToast(t("deleteError"), "error");\n        return;',
    to: '        addToast(data.error ?? t("deleteError"), "error");\n        return;',
    expect: "nothing a request answers is shown as it came",
  },
];

runMutations({
  name: "file-pages",
  gate: GATE,
  targets: [ASK, REFS, ONE, VIEW, HANDLER, WS, CITED, SHELL, ANSWER, ASK_FAILURE, WORDS, ASK_ROUTE],
  mutants: MUTANTS,
});
