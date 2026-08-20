// A LONG DOCUMENT IS NOT A REJECTED DOCUMENT.
//
// Three limits used to decide what "Ask my documents" could answer, and
// all three failed the same way — by quietly giving less than was asked
// for, while looking like they had worked:
//
//   · MAX_QUESTION_CHARS 2,000 — about 300 words. Paste a clause you
//     want compared against your contracts and the request is a 400.
//   · MAX_CONTEXT_CHARS 260,000 — the first ~500 pages of a selection
//     went to the model and the rest was dropped, with one amber line as
//     the only sign.
//   · max_tokens 2,000, next to a prompt that said "be concise" — a
//     question like "list every deadline in these documents" got the
//     first handful and a full stop, indistinguishable from a complete
//     answer.
//
// What this file checks is that the fix is CHUNKING rather than a bigger
// number: text past one context window starts a new pass instead of
// being discarded, every page lands whole in exactly one pass, the
// citation allowlist spans all of them, and the money follows — a
// question read in five passes is reserved for five passes, not one.
//
// Run: node scripts/tests/file-ask-depth.test.mjs
import { readFileSync } from "node:fs";

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
function checkList(name, actual) {
  check(name, actual.length === 0, actual.slice(0, 8).join("\n        "));
}

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))])
);

const { loadTs } = await import("./load-ts.mjs");
const ask = await loadTs("src/lib/files/ask.ts");
const { MAX_CONTEXT_CHARS, MAX_PASSES, planContext, askSystemPrompt, synthesisSystemPrompt, verifyCitations } = ask;
const { MAX_QUESTION_CHARS } = await loadTs("src/lib/files/file-types.ts");
const { JOB_STEPS } = await loadTs("src/lib/jobs/job-types.ts");
const { allStepLabelKeys } = await loadTs("src/lib/jobs/step-labels.ts");

const handlerSrc = readFileSync("src/lib/jobs/handlers/file-ask.ts", "utf8");
const routeSrc = readFileSync("src/app/api/files/ask/route.ts", "utf8");
const workspaceSrc = readFileSync("src/components/files/files-workspace.tsx", "utf8");
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const handlerCode = stripComments(handlerSrc);
const routeCode = stripComments(routeSrc);
const workspaceCode = stripComments(workspaceSrc);

// A file, in the shape lib/files/extract.ts serialises pages into —
// `[[PAGE n|Label]]` markers, not JSON. Built through the real
// serialiser rather than hand-rolled, because a fabricated format that
// deserialises to ONE page would make every packing check below pass
// against a corpus that was never split. (It did, the first time this
// file was run: 60 pages arrived as a single 600k-character page and the
// pass count was 1.)
const { serialisePages } = await loadTs("src/lib/files/extract.ts");
function makeFile(id, filename, pageCount, pageChars) {
  const pages = Array.from({ length: pageCount }, (_, i) => ({
    pageNumber: i + 1,
    label: `Page ${i + 1}`,
    text: `${id}-p${i + 1} `.padEnd(pageChars, "x"),
  }));
  return { id, filename, extracted_text: serialisePages(pages) };
}

console.log("== 1. the limits are bigger, and the question one is visible ==");
check(`a question may be ${MAX_QUESTION_CHARS} characters`, MAX_QUESTION_CHARS >= 20_000, `got ${MAX_QUESTION_CHARS}`);
check(`one pass carries ${MAX_CONTEXT_CHARS} characters`, MAX_CONTEXT_CHARS >= 400_000, `got ${MAX_CONTEXT_CHARS}`);
check("and there is more than one pass available", MAX_PASSES >= 2, `got ${MAX_PASSES}`);
// The textarea silently stopped accepting keystrokes at the cap and said
// nothing. A cap nobody can see is indistinguishable from a broken box.
check("the textarea reads the shared constant", /maxLength=\{MAX_QUESTION_CHARS\}/.test(workspaceCode));
checkList(
  "and carries no second copy of the number",
  [/maxLength=\{2000\}/, /maxLength=\{20000\}/, /maxLength="\d+"/].filter((re) => re.test(workspaceCode)).map(String)
);
check("the count is shown as the question grows", /data-testid="files-question-count"/.test(workspaceCode));
check("and says so plainly at the cap", /questionAtLimit/.test(workspaceCode));
checkList(
  "both sentences exist in all ten locales",
  LOCALES.flatMap((l) =>
    ["questionLength", "questionAtLimit"].filter((k) => typeof messages[l].dashboard.files[k] !== "string").map((k) => `${l}.${k}`)
  )
);
checkList(
  "and every one of them names the actual limit",
  // `{max, number}`, not `{max}` — a bare placeholder printed
  // "20000-character limit". The number is formatted per locale now, so
  // the assertion is on the argument name rather than the whole tag.
  LOCALES.filter((l) => !messages[l].dashboard.files.questionAtLimit.includes("{max"))
);

console.log("\n== 2. text past one window starts a pass, it is not dropped ==");
// One small file: one pass, exactly as before. The overwhelming majority
// of questions are this, and they must not pay for the machinery.
const small = planContext([makeFile("a", "small.pdf", 3, 1000)]);
check("a small selection is one pass", small.passes.length === 1, `got ${small.passes.length}`);
check("and is not marked truncated", small.truncated === false);
check("its pages are all in the allowlist", small.allowed.length === 3);

// Just over one window. The old code dropped everything after 260k and
// set truncated; the whole point is that this is now two passes.
const big = planContext([makeFile("b", "big.pdf", 60, Math.ceil(MAX_CONTEXT_CHARS / 40))]);
check("a selection larger than one window becomes several passes", big.passes.length > 1, `got ${big.passes.length}`);
check("and is NOT reported as truncated", big.truncated === false);
check(`every page is still readable (${big.allowed.length}/60)`, big.allowed.length === 60);
checkList(
  "no pass exceeds the window",
  big.passes.filter((p) => p.charCount > MAX_CONTEXT_CHARS).map((p) => `${p.charCount} > ${MAX_CONTEXT_CHARS}`)
);
// A page split across two calls is a page neither call can quote
// correctly, which is how a fabricated citation gets a real page number.
const pageIds = big.passes.flatMap((p) => p.allowed.map((a) => `${a.filename}|${a.label}`));
check("each page lands in exactly one pass", new Set(pageIds).size === pageIds.length);
check("the allowlist spans every pass", big.allowed.length === pageIds.length);
// The text is what actually goes to the model, so it is checked rather
// than the counters: nothing may be lost between the pages and the call.
const firstPageMarker = "b-p1 ";
const lastPageMarker = "b-p60 ";
const allText = big.passes.map((p) => p.text).join("");
check("the first page is in some pass", allText.includes(firstPageMarker));
check("and so is the last one", allText.includes(lastPageMarker), "this is the page the old code dropped");
// Each pass is fenced ONCE, not per file — a document that closes its own
// fence must not be able to speak as us for everything after it.
checkList(
  "every pass is fenced as untrusted",
  big.passes.filter((p) => !/UNTRUSTED|untrusted/i.test(p.text)).map((_, i) => `pass ${i + 1}`)
);

// Only a corpus past MAX_PASSES windows is still cut, and it still says so.
const enormous = planContext([makeFile("c", "huge.pdf", 400, Math.ceil(MAX_CONTEXT_CHARS / 40))]);
check(`the pass count is capped at ${MAX_PASSES}`, enormous.passes.length === MAX_PASSES, `got ${enormous.passes.length}`);
check("and only then is truncation reported", enormous.truncated === true);

// Files with nothing readable are still reported by name rather than
// silently missing from an answer.
const mixed = planContext([
  makeFile("d", "ok.pdf", 2, 500),
  { id: "e", filename: "empty.pdf", extracted_text: null },
  { id: "f", filename: "blank.pdf", extracted_text: "" },
]);
check("unreadable files are named, not dropped in silence", mixed.skipped.join(",") === "empty.pdf,blank.pdf");
check("and the readable one still answers", mixed.passes.length === 1 && mixed.allowed.length === 2);
check("nothing readable at all means no pass", planContext([{ id: "g", filename: "x.pdf", extracted_text: null }]).passes.length === 0);
// A single page bigger than a whole pass has nowhere else to go. It gets
// its own pass rather than being silently discarded.
const monster = planContext([makeFile("h", "one-huge-page.txt", 1, MAX_CONTEXT_CHARS * 2)]);
check("a page larger than a whole pass is still read", monster.passes.length === 1 && monster.allowed.length === 1);

console.log("\n== 3. prepareContext is gone, so nothing can read pass 1 as the answer ==");
// The old function returned one buffer and a flag, and both callers read
// it as "the text to send". That assumption is the bug; the type no
// longer permits it.
// Asserted against the SOURCE, not by reading `ask.prepareContext` —
// test-export-drift.test.mjs scans every suite for symbols its subject
// does not export, and cannot tell "reads a symbol that is gone" from
// "checks that a symbol is gone". It is right to flag the shape; this is
// the same assertion written so the scan stays useful.
const askSrc = readFileSync("src/lib/files/ask.ts", "utf8");
check("lib/files/ask no longer exports it", !/export function prepareContext/.test(askSrc));
checkList(
  "and nothing still calls it",
  [
    ["handler", /prepareContext\(/.test(handlerCode)],
    ["route", /prepareContext\(/.test(routeCode)],
  ]
    .filter(([, bad]) => bad)
    .map(([where]) => where)
);
check("the handler plans passes", /planContext\(files\)/.test(handlerCode));
check("and branches on how many there are", /context\.passes\.length === 1/.test(handlerCode));
check("one pass is still exactly one call", /max_tokens: MAX_OUTPUT_TOKENS[\s\S]{0,300}?context\.passes\[0\]\.text/.test(handlerCode));
check("several passes are read in a loop", /for \(const \[index, pass\] of context\.passes\.entries\(\)\)/.test(handlerCode));
check("and combined afterwards", /synthesisSystemPrompt\(/.test(handlerCode));
// The synthesis sees model output derived from the user's files, which is
// exactly as untrusted as the files were.
check("the partial answers are fenced too", /wrapUntrusted\(partials\.join/.test(handlerCode));
// Citations are verified against the union, or every citation from pass 2
// onwards would be stripped as fabricated.
check("citations are checked against every pass", /verifyCitations\([\s\S]{0,120}context\.allowed\)/.test(handlerCode));

console.log("\n== 4. the synthesis cannot invent what it never read ==");
const synth = synthesisSystemPrompt({ language: "el", parts: 3, truncated: false });
check("it is told it has NOT seen the documents", /You have not seen the documents/.test(synth));
check("and told not to fill gaps", /do not fill gaps/i.test(synth));
check("citations must be carried through verbatim", /Keep every citation exactly as written/.test(synth));
check("the untrusted fence is declared to it", /untrusted-source markers/.test(synth));
check("it answers in the user's language", /\(el\)/.test(synth));
// Plumbing is not an answer. "I read this in five parts" is our problem.
check("and says nothing about parts to the user", /Say nothing about parts/.test(synth));
// A verifier that trusted the synthesis would be no verifier at all.
const checked = verifyCitations("A [real.pdf, Page 2] and a [ghost.pdf, Page 9].", [
  { fileId: "1", filename: "real.pdf", page: 2, label: "Page 2" },
]);
check("a citation from a page we sent survives", checked.verified.length === 1);
check("one we never sent is stripped", checked.fabricated.length === 1 && !checked.answer.includes("ghost.pdf"));

console.log("\n== 5. depth: the answer is allowed to finish ==");
check("the output ceiling is well past 2,000", /const MAX_OUTPUT_TOKENS = (\d+)/.test(handlerCode) && Number(RegExp.$1) >= 8000);
check("a partial answer gets its own, smaller ceiling", /const MAX_PART_TOKENS = (\d+)/.test(handlerCode) && Number(RegExp.$1) >= 4000);
const prompt = askSystemPrompt({ language: "en", filenames: ["a.pdf"], truncated: false });
// "Be concise" plus a 2,000-token cap is how a list of twelve obligations
// became a list of four with no indication that anything was missing.
check("the prompt no longer asks for concision", !/be concise/i.test(prompt));
check("it asks for the length the question needs", /the length it actually needs/.test(prompt));
check("and forbids stopping early", /do not stop at a few examples/.test(prompt));
check("the same instruction governs the synthesis", synth.includes(ask.DEPTH_INSTRUCTION));
// A part knows it is a part, or it answers "the documents do not say"
// about a document set it was only shown a fifth of.
const partPrompt = askSystemPrompt({ language: "en", filenames: ["a.pdf"], truncated: false, part: { index: 2, total: 5 } });
check("a part is told it is part 2 of 5", /part 2 of 5/.test(partPrompt));
check("and told another part may hold the answer", /another part may/.test(partPrompt));
check("while a single-pass question is told nothing about parts", !/part \d+ of \d+/i.test(prompt));

console.log("\n== 6. the money follows the passes ==");
// A hold sized for one call and settled against six is not a discount.
check("the reservation counts every pass", /context\.totalChars \+ question\.length \* context\.passes\.length/.test(routeCode));
check("and the pass count is recorded on the hold", /passes: context\.passes\.length/.test(routeCode));
check("the route no longer sizes from one buffer", !/context\.charCount/.test(routeCode));
// Every call records onto the SAME accumulator, so one question is one
// charge however many calls it took.
check("every call records its usage", (handlerCode.match(/ctx\.costs\.record\("generation"/g) ?? []).length === 3);
check("and billing-coverage declares all three", /"src\/lib\/jobs\/handlers\/file-ask\.ts": \{\s*calls: 3/.test(readFileSync("scripts/tests/billing-coverage.test.mjs", "utf8")));
// Two calls that can be skipped, and both are skipped for a reason.
check("no synthesis when only one part answered", /partials\.length === 1/.test(handlerCode));
check("and none when no part did", /partials\.length === 0/.test(handlerCode));

console.log("\n== 7. the user is told which of the two happened ==");
// Read whole and read in parts are different guarantees: a fact that only
// makes sense across two parts can be missed by both.
check("the handler reports the pass count", /parts: context\.passes\.length/.test(handlerCode));
// Through answerFromResult(), which is the one place an answer is built —
// whether it arrived on this page or is being picked back up from a job
// that finished while the user was elsewhere. It was an inline object
// literal here and a second, hand-copied one on the resumed path; the
// resumed answer is precisely the one nobody looks at, so `parts` living
// in the shared builder is what stops a returning user being told their
// answer was read whole when it was stitched from five passes.
check("the client carries it through", /parts: Number\(result\.parts \?\? 1\)/.test(workspaceCode));
check(
  "...in the shared builder, so the resumed path cannot drift from the inline one",
  /function answerFromResult\([\s\S]{0,700}parts: Number\(result\.parts/.test(workspaceCode)
);
check("and shows it only when there was more than one", /answer\.parts > 1 && !answer\.truncated/.test(workspaceCode));
checkList(
  "the sentence exists in all ten locales",
  LOCALES.filter((l) => typeof messages[l].dashboard.files.readInParts !== "string")
);
checkList(
  "and every one of them says how many parts",
  LOCALES.filter((l) => !messages[l].dashboard.files.readInParts.includes("{parts}"))
);
// The truncation warning changed MEANING — it used to fire at 260k
// characters, which was common, and now fires only past five full passes.
// A sentence left saying "only part of the selection fitted" would be
// describing a situation that no longer exists.
checkList(
  "no locale still describes the old truncation",
  LOCALES.filter((l) => /Only part of the selection fitted/i.test(messages[l].dashboard.files.truncatedWarning))
);
check("en says what to do about it", /fewer files/i.test(messages.en.dashboard.files.truncatedWarning));

console.log("\n== 8. combining is a step the user can see ==");
check("file_ask declares a combining step", JOB_STEPS.file_ask.includes("combining"));
check("in the right order", JOB_STEPS.file_ask.join(",") === "reading,answering,combining,checking");
check("the handler reports it", /ctx\.progress\(3, steps\[2\]\)/.test(handlerCode));
check("and only on the path that combines", /partials\.length === 1[\s\S]{0,400}?ctx\.progress\(3, steps\[2\]\)/.test(handlerCode));
// Progress is written after each part, or a five-part question sits on
// one label for two minutes and reads as stuck.
check("each part moves the job forward", /await ctx\.progress\(2, steps\[1\]\);[\s\S]{0,40}\}\n/.test(handlerCode));
check("the last step is still checking", /ctx\.progress\(4, steps\[3\]\)/.test(handlerCode));
// The label is a KEY, never the raw token — "combining" is worker
// vocabulary and it is also English.
const keys = allStepLabelKeys();
check("the catalogue derives the new key", keys.includes("aiSteps.file_ask.combining"));
checkList(
  "every locale translates it",
  LOCALES.filter((l) => typeof messages[l].aiSteps.file_ask.combining !== "string")
);
// Not "does it contain the word" — in English the token IS the word. The
// failure being prevented is the label BEING the bare token, which is
// what a hurried tenth locale looks like.
checkList(
  "and none of them is the bare token",
  LOCALES.filter((l) => {
    const label = messages[l].aiSteps.file_ask.combining;
    return label.trim().toLowerCase() === "combining" || label.length < 8;
  })
);

console.log("\n== 9. a translated citation is RESOLVED, not stripped as fabricated ==");
// THE PRODUCTION REPORT this section pins: a Greek question gets a Greek
// answer, the model writes "Σελίδα 3" where the header said "Page 3",
// and the old exact-match verifier stripped every citation — a correct
// answer rendered with no sources at all. Tolerant matching resolves the
// citation to the (file, page) pair we actually sent and rewrites it in
// canonical form; what cannot be resolved is still stripped.
const ALLOWED = [
  { fileId: "1", filename: "lesson.pdf", page: 3, label: "Page 3" },
  { fileId: "1", filename: "lesson.pdf", page: 7, label: "Page 7" },
  { fileId: "2", filename: "budget.xlsx", page: 2, label: "Costs 2024" },
];
{
  const r = verifyCitations(
    "Μαθαίνεις πράγματα [lesson.pdf, Σελίδα 3] και [lesson.pdf, σελ. 7].",
    ALLOWED
  );
  check("Greek labels verify (the reported case)", r.verified.length === 2 && r.fabricated.length === 0);
  check("and are rewritten canonically in the text", r.answer.includes("[lesson.pdf, Page 3]") && r.answer.includes("[lesson.pdf, Page 7]"));
  check("the citation list carries the canonical label", r.verified.every((c) => /^Page \d$/.test(c.label)));
}
{
  const r = verifyCitations("Siehe [lesson.pdf, Seite 3] und [lesson.pdf, S. 7].", ALLOWED);
  check("German labels verify", r.verified.length === 2 && r.fabricated.length === 0);
}
{
  const r = verifyCitations("See [lesson, Page 3].", ALLOWED);
  check("a filename cited without its extension resolves", r.verified.length === 1 && r.verified[0].filename === "lesson.pdf");
}
{
  const r = verifyCitations("See [lesson.pdf, Σελίδα 99].", ALLOWED);
  check("a page we never sent is STILL stripped", r.verified.length === 0 && r.fabricated.length === 1 && !r.answer.includes("99"));
}
{
  const r = verifyCitations("See [ghost.pdf, Page 3].", ALLOWED);
  check("a file we never sent is STILL stripped", r.verified.length === 0 && r.fabricated.length === 1);
}
{
  const r = verifyCitations("Sheet [budget.xlsx, Costs 2024] and translated [budget.xlsx, Σελίδα 2].", ALLOWED);
  check("an exact sheet label verifies", r.verified.some((c) => c.label === "Costs 2024"));
  check("a numeric label resolves to the sheet at that position", r.verified.length === 2);
}
{
  // Two DIFFERENT files sharing a stem: "report" alone is ambiguous and
  // must resolve to neither — a guessed file is a fabricated citation.
  const ambiguous = [
    { fileId: "a", filename: "report.pdf", page: 1, label: "Page 1" },
    { fileId: "b", filename: "report.docx", page: 1, label: "Page 1" },
  ];
  const r = verifyCitations("See [report, Page 1].", ambiguous);
  check("an ambiguous stem resolves to neither file", r.verified.length === 0 && r.fabricated.length === 1);
  const exact = verifyCitations("See [report.pdf, Page 1].", ambiguous);
  check("while the full filename still resolves", exact.verified.length === 1);
}

console.log("\n== 10. the prompt forbids translated citations and uncited answers ==");
const citePrompt = askSystemPrompt({ language: "el", filenames: ["lesson.pdf"], truncated: false });
check("citations must be copied character-for-character", /character-for-character/.test(citePrompt));
check("and never translated", /never a translated label/.test(citePrompt));
check("summaries are NOT exempt from citing", /including summaries and overviews/.test(citePrompt));
check("an uncited answer is declared unacceptable", /An answer without citations is not acceptable/.test(citePrompt));
const synthPrompt = synthesisSystemPrompt({ language: "el", parts: 2, truncated: false });
check("the synthesis forbids translating them too", /never translated/.test(synthPrompt));

console.log("\n== 11. a from-the-documents answer with zero citations says so ==");
check("the handler reports the uncited case", /uncited: !notFound && checked\.verified\.length === 0/.test(handlerCode));
check(
  "the workspace renders the warning",
  /answer\.fromDocuments && answer\.citations\.length === 0[\s\S]{0,400}?files-answer-uncited/.test(workspaceCode) ||
    /files-answer-uncited/.test(workspaceCode) && /answer\.fromDocuments && answer\.citations\.length === 0/.test(workspaceCode)
);
checkList(
  "every locale has the uncited warning",
  LOCALES.filter((l) => typeof messages[l].dashboard.files.uncitedAnswer !== "string")
);

console.log("\n== 12. picking MORE THAN ONE file is stated, counted and bounded ==");
// "I don't know if I can tick several" — the control worked, the UI never
// said so. Every one of these is a sentence the user should not have had
// to discover by experiment.
check("the step says one OR MORE", /one or more files/i.test(messages.en.dashboard.files.step2Hint));
checkList(
  "in every locale (not the English sentence copied)",
  LOCALES.filter((l) => {
    const hint = messages[l].dashboard.files.step2Hint;
    return typeof hint !== "string" || hint.length < 10 || (l !== "en" && hint === messages.en.dashboard.files.step2Hint);
  })
);
check("the count is N of M, not a bare number", /\{count\}[\s\S]*\{total\}/.test(messages.en.dashboard.files.selectedOfTotal));
check("the workspace renders it that way", /selectedOfTotal", \{ count: selected\.length, total: askableFiles\.length \}/.test(workspaceCode));
check("only READY files count towards the total", /files\.filter\(\(f\) => f\.processing_status === "ready"\)/.test(workspaceCode));
check("there is a Select all", /data-testid="files-select-all"/.test(workspaceCode));
check("and it never selects past the limit", /askableFiles\.slice\(0, MAX_FILES_PER_QUESTION\)/.test(workspaceCode));
check("there is still a Clear", /clearSelection/.test(workspaceCode));
// The limit used to appear only once it was exceeded.
check("the limit is shown BEFORE it is exceeded", /data-testid="files-max-hint"/.test(workspaceCode));
checkList(
  "every locale states the limit",
  LOCALES.filter((l) => typeof messages[l].dashboard.files.maxPerQuestion !== "string")
);
// The real ceilings, from the source rather than from memory.
const { MAX_FILES_PER_QUESTION } = await loadTs("src/lib/files/file-types.ts");
check(`the per-question file limit is a real number (${MAX_FILES_PER_QUESTION})`, MAX_FILES_PER_QUESTION === 20);
check(`one pass carries ${MAX_CONTEXT_CHARS} characters`, MAX_CONTEXT_CHARS === 400_000);
check(`and a question may take ${MAX_PASSES} passes`, MAX_PASSES === 5);

console.log("\n== 13. with several files, a citation names WHICH file ==");
// Asking about three contracts and being told "Page 4" is not an answer.
const MULTI = [
  { fileId: "a", filename: "contract.pdf", page: 4, label: "Page 4" },
  { fileId: "b", filename: "invoice.pdf", page: 4, label: "Page 4" },
];
{
  const r = verifyCitations("Terms [contract.pdf, Page 4] and the amount [invoice.pdf, Page 4].", MULTI);
  check("both files' citations survive", r.verified.length === 2);
  check("and each names its own file", r.verified[0].filename === "contract.pdf" && r.verified[1].filename === "invoice.pdf");
  check("the page alone, with no file, is not a citation", verifyCitations("See [Page 4].", MULTI).verified.length === 0);
}
check("the prompt requires the filename in the citation", /\[filename, Page 3\]/.test(askSystemPrompt({ language: "en", filenames: ["a.pdf", "b.pdf"], truncated: false })));
check("and the header the model copies carries the filename", /--- FILE: \$\{file\.filename\} \| \$\{page\.label\} ---/.test(readFileSync("src/lib/files/ask.ts", "utf8")));
check("the answer's source list shows file and page", /citation\.filename\} — \{citation\.label/.test(workspaceCode));

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
