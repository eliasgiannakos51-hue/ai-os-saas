#!/usr/bin/env node
/*
 * CAN document-writer.test.mjs SEE A DOCUMENT CHANGED WHERE IT WAS NOT
 * ASKED, A LIST THAT IS NOT A LIST, OR A FILE THAT IS NOT WORD'S?
 *
 * The other blocks rewritten too, a heading turned into a paragraph, the
 * model's text written as markup, a numbered list that never restarts, a
 * Greek document marked English, a document read without its owner, the
 * plan never asked, the hold after the model, and the page drawing the
 * writer for anybody.
 *
 * Run: node scripts/tests/document-writer.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/document-writer.test.mjs";
const WRITER = "src/lib/documents/writer.ts";
const DOCX = "src/lib/documents/docx.ts";
const PROMPT = "src/lib/documents/writer-prompt.ts";
const ACCESS = "src/lib/documents/writer-access.ts";
const GENERATE = "src/app/api/documents/generate/route.ts";
const EDIT = "src/app/api/documents/[id]/edit/route.ts";
const PAGE = "src/app/dashboard/documents/page.tsx";

const MUTANTS = [
  {
    name: "a box change rewrites every block",
    file: WRITER,
    from: "  return stored.map((block, i) => (i === index ? rewritten : block));",
    to: "  return stored.map(() => rewritten);",
    expect: "every other block is exactly as it was",
  },
  {
    name: "a rewritten heading becomes a paragraph",
    file: WRITER,
    from: '  if (before.kind === "heading") return { kind: "heading", level: before.level, runs: textRuns(text) };',
    to: "",
    expect: "a heading rewritten stays a heading of its level",
  },
  {
    name: "the model's text is written into the HTML unescaped",
    file: WRITER,
    from: "      let out = escapeHtml(r.text);",
    to: "      let out = r.text;",
    expect: "text the model wrote is text",
  },
  {
    name: "**bold** stays asterisks",
    file: WRITER,
    from: "    if (m[2] !== undefined) runs.push({ text: m[2], bold: true });",
    to: "    if (m[2] !== undefined) runs.push({ text: m[0] });",
    expect: "**bold** and *italic* become runs",
  },
  {
    name: "a numbered list never starts again",
    file: DOCX,
    from: "      if (isOrdered && !lastWasOrdered) ordered.push(3 + ordered.length);",
    to: "      if (isOrdered && ordered.length === 0) ordered.push(3);",
    expect: "a second numbered list starts again at 1",
  },
  {
    name: "the Word file marks every language English",
    file: DOCX,
    from: '  const lang = LANG[locale] ?? "en-US";',
    to: '  const lang = "en-US";',
    expect: "every run is Greek",
  },
  {
    name: "an Arabic document is laid out left to right",
    file: DOCX,
    from: '  const bidi = rtl ? "<w:bidi/>" : "";',
    to: '  const bidi = "";',
    expect: "an Arabic document is laid out right to left",
  },
  {
    name: "the description is pasted unfenced",
    file: PROMPT,
    from: "${UNTRUSTED_OPEN}${context}\n${scrub(description)}",
    to: "${context}\n${scrub(description)}",
    expect: "the description is fenced as data",
  },
  {
    name: "the model is free to invent amounts",
    file: PROMPT,
    from: "Do not invent names, amounts, dates, addresses or quotations",
    to: "Fill in names, amounts, dates, addresses or quotations",
    expect: "not invented",
  },
  {
    name: "the plan is never asked",
    file: ACCESS,
    from: '  if (!isAdmin && !planMeetsMinimum(plan?.slug ?? "free", DOCUMENT_WRITER_MIN_PLAN)) return { ok: false, code: "not_included" };',
    to: "",
    expect: "the plan Starter and up",
  },
  {
    name: "a document is read without its owner",
    file: EDIT,
    from: '    .eq("id", params.id)\n    .eq("user_id", user.id)\n    .maybeSingle();\n  if (readError) {',
    to: '    .eq("id", params.id)\n    .maybeSingle();\n  if (readError) {',
    expect: "edit: read by id AND owner",
  },
  {
    name: "a box change keeps nothing",
    file: EDIT,
    from: "        next = keepOnlyBlock(stored, box, out.value);",
    to: "        next = [out.value];",
    expect: "a box keeps every other block",
  },
  {
    name: "nothing is held before the model",
    file: GENERATE,
    from: 'await reserveCredits(user.id, estimate.reserveCredits, "document_generate"',
    to: 'await skipTheHold(user.id, estimate.reserveCredits, "document_generate"',
    expect: "the hold before the model",
  },
  {
    name: "the records are left out of the hold",
    file: GENERATE,
    from: "docEstimateInputChars(description.length + businessContext.length)",
    to: "docEstimateInputChars(description.length)",
    expect: "sized on the description AND the records",
  },
  {
    name: "the page draws the writer for any plan",
    file: PAGE,
    from: "(isAdminEmail(user.email) || planMeetsMinimum(await resolveEffectivePlanSlug(user), DOCUMENT_WRITER_MIN_PLAN))",
    to: "true",
    expect: "the page draws the writer only with the switch AND the plan",
  },
];

runMutations({ name: "document-writer", gate: GATE, targets: [WRITER, DOCX, PROMPT, ACCESS, GENERATE, EDIT, PAGE], mutants: MUTANTS });
