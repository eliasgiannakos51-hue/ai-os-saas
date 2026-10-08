#!/usr/bin/env node
/*
 * CAN file-pages.test.mjs SEE AN ANSWER POINT AT THE WRONG PAGE, OR A PAGE
 * OPEN FOR THE WRONG PERSON?
 *
 * A checked reference that forgets its page; brackets that were never a
 * reference made pressable; a page listed twice; a PDF read only in part
 * that says nothing; the page route answering with the whole document, or
 * another person's; the PDF link opening on page one, for another person,
 * with the switch off, unlimited, or for a file that is not a PDF.
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
];

runMutations({
  name: "file-pages",
  gate: GATE,
  targets: [ASK, REFS, ONE, VIEW, HANDLER, WS],
  mutants: MUTANTS,
});
