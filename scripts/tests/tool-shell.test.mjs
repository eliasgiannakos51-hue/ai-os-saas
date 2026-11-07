// EVERY TOOL IN ONE SHELL: CONVERSATION LEFT, WORK RIGHT, ONE FIELD, AT
// MOST FOUR OPTIONS (docs/MASTER.md Μέρος 14.3 and package 3 of Μέρος 16;
// docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN §5).
//
// The population is every file that renders <ToolShell>, found by walking
// src/, not listed here: a tool moved into the shell is held the moment it
// is, and one that leaves it stops being counted. Each is held to four
// options, the shell's own field and nothing else to type into, no step
// flow and no box of warnings, and a page that draws it for everybody,
// with no old body behind it (the switch "tool-shell" was removed
// 2026-10-23).
//
// Read with comments stripped: none of this runs without a browser, and
// scripts/tests/tool-shell.prodtest.mjs is where it is watched.
//
// Run: node scripts/tests/tool-shell.test.mjs
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "../check-mutation-markers.mjs";

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
const read = (f) => stripComments(readFileSync(f, "utf8"));
// A file this gate requires that is not there is every check on it red,
// not a crash that hides the checks after it.
const readIfThere = (f) => (existsSync(f) ? read(f) : "");
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

console.log("== 1. the shell ==");
const shell = read("src/components/shell/tool-shell.tsx");
check("the shell's one field is Chat's own, with the tool's placeholder",
  (shell.match(/<ChatComposer\b/g) ?? []).length === 1 && /placeholder=\{placeholder\}/.test(shell) && !/<textarea|<input\b/.test(shell));
check("...and the options are drawn under that field, inside it",
  /<ChatComposer[\s\S]*?>\s*\{options\.length > 0 && \(\s*<div data-testid="tool-shell-options"/.test(shell));
check("the conversation is on the left and grows; the work is beside it, 60% on a computer",
  /<div className="flex min-w-0 flex-1 flex-col">/.test(shell) && /data-testid="tool-shell-work"\s+className="fixed inset-0 z-\[60\] flex flex-col bg-workspace [^"]*lg:static lg:z-auto lg:w-\[60%\] lg:shrink-0"/.test(shell));
{
  const pane = /data-testid="tool-shell-work"\s+className="([^"]*)"/.exec(shell)?.[1] ?? "";
  const bar = readFileSync("src/components/dashboard/mobile-tab-bar.tsx", "utf8");
  const layout = readFileSync("src/app/dashboard/layout.tsx", "utf8");
  check("on a phone the work ends above the tab bar, which is drawn over it, and only where the bar is",
    /\bpb-\[calc\(4rem\+env\(safe-area-inset-bottom\)\)\] md:pb-0\b/.test(pane) && /className="fixed inset-x-0 bottom-0 z-40 [^"]*md:hidden"/.test(bar) && /min-h-\[56px\]/.test(bar) && /<div className="relative z-10 flex min-h-screen">/.test(layout) && /<main id="main-content" className="flex-1 pb-16 md:pb-0">/.test(layout), pane);
}
check("...and on a phone the work is the whole screen, with a button back to the conversation",
  /data-testid="tool-shell-back" className=\{`\$\{ACTION\} lg:hidden`\}/.test(shell) && /onClick=\{onCloseWork\}/.test(shell));
check("a card in the conversation opens the work again", /data-testid="tool-shell-card"/.test(shell) && /onClick=\{turn\.card\.onOpen\}/.test(shell));
check("no steps on top and no tabs in the shell itself", !/<StepFlow\b|role="tablist"/.test(shell));
check("the most options a tool may have is four", /export const MAX_SHELL_OPTIONS = 4;/.test(shell));
check("and the most examples on the empty landing is three", /export const MAX_SHELL_EXAMPLES = 3;/.test(shell));
check("with no turns and no work open, the empty landing is the small globe, one heading and its examples — never a second field",
  /const showEmpty = Boolean\(empty\) && turns\.length === 0 && !work;/.test(shell) &&
    /<Earth variant="small" px=\{96\} \/>/.test(shell) && /\{empty!\.heading\}/.test(shell) && /onClick=\{\(\) => onSend\(ex\.label\)\}/.test(shell));
// ONE SENTENCE UNDER THE HEADING, OPTIONAL — added 2026-10-31 so a list
// surface moving into this shell keeps the `.why` that
// lib/list-empty-states.ts requires of it (Agents' was the one sentence
// saying what a scheduled agent is for). Optional, and drawn only when
// given, so every landing already shipped is byte-identical.
check("...and one optional sentence under it, for a surface whose empty screen owes the reader a why",
  /empty\?: \{ heading: string; why\?: string; examples\?: ShellExample\[\] \};/.test(shell) &&
    /\{empty!\.why && <p className="max-w-sm text-sm leading-relaxed text-muted">\{empty!\.why\}<\/p>\}/.test(shell));
check("the [◧] history column slides over the whole shell, same shape as Chat's and Coding's own, with New beside it",
  /data-testid="tool-shell-history"/.test(shell) && /data-testid="tool-shell-history-toggle"/.test(shell) &&
    /data-testid="tool-shell-new"/.test(shell) && /onClick=\{history\.onToggle\}/.test(shell) && /onClick=\{history\.onNew\}/.test(shell));

console.log("\n== 2. every tool in it ==");
const files = walk("src").filter((f) => f !== join("src", "components", "shell", "tool-shell.tsx"));
const users = files.filter((f) => /<ToolShell\b/.test(read(f)));
check(`the tools in the shell were found (${users.length})`, users.length >= 1, "a rule over no tools passes for nothing");
for (const f of users) {
  const src = read(f);
  // THE WHOLE ARRAY, by matching brackets: the first "]}" after it can be
  // an index inside an option (`{names[source]}`), which once cut the
  // count short and let a fifth option through.
  const at = src.indexOf("options={[");
  let block = "";
  if (at >= 0) {
    let depth = 0;
    for (let i = at + "options={".length; i < src.length; i++) {
      if (src[i] === "[") depth++;
      else if (src[i] === "]" && --depth === 0) {
        block = src.slice(at, i + 1);
        break;
      }
    }
  }
  // COUNTED BY KEY: every option is an element in the array, and React
  // needs each to carry a key, so the keys are the options.
  const options = (block.match(/\bkey="[^"]+"/g) ?? []).length;
  check(`${f}: ${options} options, at most four`, options <= 4 && (at < 0 || options >= 1), block.slice(0, 120));
  // EXAMPLES ON THE EMPTY LANDING, the same bracket-matched reasoning as
  // options above (a key inside an example's own text could end "]" early
  // too), at most three (MAX_SHELL_EXAMPLES).
  const examplesAt = src.indexOf("examples: [");
  let exBlock = "";
  if (examplesAt >= 0) {
    let depth = 0;
    for (let i = examplesAt + "examples: ".length; i < src.length; i++) {
      if (src[i] === "[") depth++;
      else if (src[i] === "]" && --depth === 0) {
        exBlock = src.slice(examplesAt, i + 1);
        break;
      }
    }
  }
  const examples = (exBlock.match(/\bkey:\s*"[^"]+"/g) ?? []).length;
  check(`${f}: ${examples} examples on the empty landing, at most three`, examples <= 3, exBlock.slice(0, 120));
  // A checkbox, a radio or a file picker takes no text; anything else does.
  check(`${f}: nothing to type into but the shell's field`, !/<textarea\b|<input\b(?![^>]*type="(?:checkbox|radio|file)")/.test(src));
  check(`${f}: no steps on top, no box of limits`, !/<StepFlow\b|_LIMITS\.map\(/.test(src));
  check(`${f}: imports no page component, so the old page is not drawn behind it`, !/from "@\/components\/[^"]+-workspace"/.test(src));
}

console.log("\n== 3. the page that draws it: for everybody, no switch ==");
// The switch "tool-shell" was removed 2026-10-23 (the owner: everything for
// all users, without switches): every page that draws a shell draws it
// whatever the reader's account, inside the full-height wrapper. A tool
// born in the shell may still wall itself by plan or end in notFound(); what
// no page may do is read "tool-shell" or draw the shell only on a condition
// that sends the rest to an old body.
const flags = read("src/lib/flags/flags.ts");
check('the switch "tool-shell" is gone from the declared switches', !/"tool-shell":\s*"/.test(flags));
const pages = walk("src/app").filter((f) => /page\.tsx$/.test(f));
check("...and no page or component reads it", ![...pages, ...walk("src/components")].some((f) => /isFeatureOn\("tool-shell"/.test(read(f))));
for (const f of users) {
  const component = (read(f).match(/export function (\w+)\(/) ?? [])[1];
  const callers = pages.filter((p) => component && new RegExp(`<${component}\\b`).test(read(p)));
  // FLOWSHELL RETIRED AS A MOUNT, NOT AS A FILE, 2026-10-28: Projects
  // ΝΕΑ ΟΘΟΝΗ Κομμάτι 1 replaced it on /dashboard/projects (the owner's
  // own answer to the direct question, docs/PROGRESS.md) with
  // projects-shell.tsx. It still builds on <ToolShell>, which is why
  // this derived scan still finds it, with no page drawing it — a
  // likely home for Κομμάτι 6's own bottom field, not dead code to
  // delete yet.
  check(`${component}: drawn by a page (${callers.length})`, component === "FlowShell" || callers.length >= 1);
  for (const p of callers) {
    const src = read(p);
    const drawn = src.indexOf(`<${component}`);
    const wrapper = src.lastIndexOf('return (\n    <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">', drawn);
    const wrapperIndented = src.lastIndexOf('<div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">', drawn);
    // THE ONE PAGE THAT KEEPS AN OLD BODY: Projects (FlowShell) falls back to
    // its plain list in the single case the projects could not be read.
    const keepsFallback = component === "FlowShell";
    check(`${p}: draws it inside the full-height wrapper${keepsFallback ? "" : ", with no old body behind it"}`,
      drawn >= 0 && (wrapper >= 0 || wrapperIndented >= 0) && (keepsFallback || !/-workspace"/.test(src.replace(/import type [^;]*;/g, ""))));
  }
}

console.log("\n== 4. Posts, in the shell ==");
const posts = read("src/components/posts/posts-shell.tsx");
check("it writes through the same route as the old page", /fetch\("\/api\/posts\/generate"/.test(posts) && /JSON\.stringify\(\{\s*description: text,\s*platforms: chosen,\s*locale,/.test(posts));
check("the price shows before sending, from the length typed", /onLengthChange=\{setLength\}/.test(posts) && /<CostEstimateHint credits=\{estimate\.credits\} \/>/.test(posts) && /postsEstimateInputChars\(length, platforms\)/.test(posts));
check("Stop aborts the request", /onStop=\{\(\) => abortRef\.current\?\.abort\(\)\}/.test(posts) && /signal: controller\.signal/.test(posts));
check("the posts open beside the conversation, one per platform with its copy", /data-testid="posts-result"/.test(posts) && /<CopyButton text=\{clipboard\}/.test(posts) && /setOpen\("posts"\)/.test(posts));
check("what was written before is one press away, and deletes through RLS", /data-testid="posts-recent"/.test(posts) && /from\("generated_posts"\)\.delete\(\)\.eq\("id", id\)/.test(posts));
check("what it does not do is one line, not a box", /<p className="mt-1\.5 text-\[11px\] text-muted">\{t\("limits\.no_publish"\)\}<\/p>/.test(posts));

console.log("\n== 5. Slides, in the shell ==");
const slides = read("src/components/presentations/presentations-shell.tsx");
check("the first thing said writes the deck, through the same route as the old page",
  /fetch\("\/api\/presentations\/generate"/.test(slides) && /slideCount,\s*imageSource,\s*ownImagePaths,\s*locale,?\s*(\.\.\.\(chartsFromFile[^\n]*\n\s*)?\}\)/.test(slides));
check("...and while a saved deck is open, what is said next changes it",
  /const editing = Boolean\(open\?\.id\);/.test(slides) && /onSend=\{\(text\) => void \(editing \? change\(text\) : write\(text\)\)\}/.test(slides) &&
    /fetch\(`\/api\/presentations\/\$\{open\.id\}\/edit`/.test(slides));
check("the price shows before sending, for a new deck and for a change",
  /<CostEstimateHint credits=\{editing \? editEstimate\.credits : estimate\.credits\} \/>/.test(slides) && /deckEditEstimateInputChars\(open\.deck, length\)/.test(slides));
check("the photographs are removed again when no deck comes back for them",
  (slides.match(/await discardUploads\(\);/g) ?? []).length === 2 && /storage\.from\(CREATE_ATTACHMENT_BUCKET\)\.remove\(paths\)/.test(slides));
check("PowerPoint and PDF are on top of the slides",
  /fetch\(`\/api\/presentations\/\$\{id\}\/pptx`\)/.test(slides) && /saveFileResponse\(/.test(slides) && /href=\{`\/api\/presentations\/\$\{open\.id\}\/pdf`\}/.test(slides));
check("the slides are drawn by the same component as on the page",
  /<DeckSlides deck=\{open\.deck\} imageUrlFor=\{imageUrlFor\} \/>/.test(slides) && /<DeckSlides deck=\{selected\.deck\} imageUrlFor=\{imageUrlFor\}/.test(read("src/components/presentations/presentations-workspace.tsx")));

console.log("\n== 6. Research, in the shell ==");
const research = read("src/components/research/research-shell.tsx");
check("a subject said in the field is PLANNED, not run", /onSend=\{\(text\) => void plan\(text\)\}/.test(research) && /fetch\("\/api\/research", \{/.test(research));
check("...and the plan comes back with its questions and its price, before anything expensive",
  /data-testid="research-plan"/.test(research) && /report\.questions\.map\(/.test(research) && /\{t\("estimate", \{ credits \}\)\}/.test(research));
check("...and only the press under it runs it", /onClick=\{\(\) => run\(report\.id\)\} data-testid="research-start"/.test(research) && /fetch\(`\/api\/research\/\$\{id\}\/run`, \{ method: "POST", keepalive: true \}\)/.test(research));
check("what is running comes from the rows, and a stalled run is nudged",
  /const activeKey = reports\.filter\(isRunning\)/.test(research) && /\/api\/research\/\$\{report\.id\}\/continue/.test(research));
check("Stop is offered while it runs", /data-testid="research-stop"/.test(research) && /\/api\/research\/\$\{report\.id\}\/cancel/.test(research));
check("the report opens beside the conversation, marked as made by AI, with numbered sources and its PDF",
  /<AiGeneratedNotice variant="block" \/>/.test(research) && /data-testid="research-sources"/.test(research) && /\[\{i \+ 1\}\]/.test(research) && /href=\{`\/api\/research\/\$\{open\.id\}\/pdf`\}/.test(research));

console.log("\n== 7/8. Analyze, merged with Files (2026-10-22), in the shell ==");
// ANALYZE AND FILES MERGED INTO ONE COMPONENT (the owner's message after
// #332, item 4): components/analyze/analyze-shell.tsx is the two old
// shells spliced at the top level — a `mode` ("analysis" | "files" | null)
// decides which half's turns and work pane render, and the ONE field's
// `onSend` dispatches to whichever half's own ask() already existed.
// Every route and every literal below is unchanged from the two old
// shells; only the locals that disambiguate the two halves changed names
// (t -> tFiles for Files' own strings, ask -> askAnalysis/askFiles).
const analyze = read("src/components/analyze/analyze-shell.tsx");
check("the dispatcher routes to the spreadsheet's own ask, through the same route as the page",
  /if \(mode === "analysis"\) return void askAnalysis\(text\);/.test(analyze) && /fetch\(`\/api\/data-analysis\/\$\{current\.id\}\/ask`/.test(analyze));
check("...and with no file open, it says to upload one instead of failing silently",
  /if \(!current\) \{\s*note\("user", question\);\s*note\("tool", tShell\("analyze\.needFile"\)\);\s*return;\s*\}/.test(analyze));
check("the conversation is the questions asked of this file, each answer with the rows it stands on",
  /\[\.\.\.current\.questions\]\.reverse\(\)/.test(analyze) && /data-testid="analysis-evidence"/.test(analyze) && /t\("ask\.matched"/.test(analyze));
check("upload and find patterns are options, through the page's routes",
  /fetch\("\/api\/data-analysis\/upload", \{ method: "POST", body: form \}\)/.test(analyze) && /fetch\(`\/api\/data-analysis\/\$\{current\.id\}\/analyse`/.test(analyze));
check("the file beside the conversation says when it was only partly read", /t\("summary\.truncated"\)/.test(analyze) && /t\("summary\.ragged"/.test(analyze));
check("...and computes nothing: the column line is the page's own", /import \{ describeColumn[^}]*\} from "@\/lib\/data-analysis\/view"/.test(analyze) && !/function describeColumn/.test(analyze));

const uploadLib = read("src/lib/files/upload-file.ts");
check("selection is still the subject: nothing is asked with nothing ticked",
  /if \(selected\.length === 0\) \{\s*say\(\{ role: "tool", text: tFiles\("selectFirst"\) \}\);/.test(analyze) && /tFiles\("askSelected", \{ count: selectedFiles\.length/.test(analyze));
check("the field asks the ticked files, as a background job through the page's route",
  /startAndWatchJob\(\s*"\/api\/files\/ask",\s*\{ question: text, fileIds: selected, language: locale \}/.test(analyze));
check("every answer says the page it came from, or that it is not in the documents",
  /data-testid="files-citations"/.test(analyze) && /\{c\.filename\} — \{show\(c\.label\)\}/.test(analyze) && /tFiles\("notInDocuments"\)/.test(analyze) && /tFiles\("uncitedAnswer"\)/.test(analyze));
check("...built by the same function as on the page, and copied with its sources",
  /answerFromResult\(/.test(analyze) && /answerForClipboard\(turn\.answer!, show\)/.test(analyze) && /from "@\/lib\/files\/answer"/.test(analyze));
check("an answer that finished elsewhere is put back, and one running is watched", /\/api\/jobs\?kind=file_ask/.test(analyze) && /watchJob\(String\(job\.id\)/.test(analyze) && /<JobSeen jobId=\{turn\.answer\.jobId\} \/>/.test(analyze));
check("an upload whose registration does not land is removed from the bucket",
  /if \(data\?\.ok && data\.file\) return \{ ok: true, file: data\.file \};\s*try \{\s*await createBrowserSupabase\(\)\.storage\.from\(FILE_BUCKET\)\.remove\(\[path\]\);/.test(uploadLib));
check("a file that stored but could not be read is not called a success", /outcome\.file\.processing_status === "failed"/.test(analyze));
// COLLECTIONS, the old page's (the owner's decision of 2026-10-09: with
// the switch on, nothing the old page offered is lost — true again
// through the merge). The old, non-shell page is still
// components/files/files-workspace.tsx; both call the same route with
// the same body, and the merged shell's name for a new one is said in
// its one field. The shell-path collections are now read by the merged
// page, /dashboard/data-analysis, not by the Files page any more — it
// only redirects there (early-redirects.test.mjs holds that).
const analyzePage = read("src/app/dashboard/data-analysis/page.tsx");
const filesPage = read("src/app/dashboard/files/page.tsx");
const filesWorkspace = read("src/components/files/files-workspace.tsx");
check("Files: the collections the merged page reads are handed to the shell, and the old address redirects to it unconditionally",
  /<AnalyzeShell[\s\S]{0,400}initialCollections=\{initialCollections\}/.test(analyzePage) && /redirect\(query \? `\/dashboard\/data-analysis\?\$\{query\}` : "\/dashboard\/data-analysis"\)/.test(filesPage));
check("Files: each collection is pressed to select its files again",
  /collections\.map\(\(collection\) => \(\s*<button[\s\S]{0,120}onClick=\{\(\) => setSelected\(readyIds\(collection\)\)\}[\s\S]{0,200}data-testid="files-collection"/.test(analyze) &&
    /const readyIds = \(collection: WorkspaceCollection\) => collection\.fileIds\.filter\(\(id\) => askable\.some\(\(f\) => f\.id === id\)\);/.test(analyze));
check("Files: what is selected is saved as a collection through the page's route, with the page's body",
  /fetch\("\/api\/files\/collections", \{\s*method: "POST",[\s\S]{0,120}body: JSON\.stringify\(\{ name, fileIds: selected \}\),/.test(analyze) &&
    /fetch\("\/api\/files\/collections", \{\s*method: "POST",[\s\S]{0,120}body: JSON\.stringify\(\{ name, fileIds: selected \}\),/.test(filesWorkspace));
check("Files: ...its name said in the shell's one field, which says so, and the next thing sent is the name",
  /onClick=\{startNaming\}[\s\S]{0,160}data-testid="files-collection-save"/.test(analyze) && /setNaming\(true\);\s*say\(\{ role: "tool", text: tFiles\("collectionName", \{ count: selected\.length \}\), naming: true \}\);/.test(analyze) &&
    /naming \? tFiles\("collectionPlaceholder"\)/.test(analyze) && /if \(naming\) return void saveCollection\(text\);/.test(analyze));
check("Files: ...and the new collection is there at once, said in the screen's words",
  /setCollections\(\(current\) => \[made, \.\.\.current\]\);\s*setNaming\(false\);\s*say\(\{ role: "tool", text: tFiles\("collectionCreated", \{ name: made\.name \}\) \}\);/.test(analyze) &&
    /if \(!data\?\.ok \|\| !data\.collection\) \{\s*say\(\{ role: "tool", text: tFiles\("collectionError"\) \}\);/.test(analyze));

console.log("\n== 9. Site, in the shell ==");
const site = read("src/components/website-builder/website-shell.tsx");
// THE REQUESTS ARE SHARED with the Site opened beside Chat (package 7):
// lib/website-builder/site-requests.ts makes them, the shell calls it.
const siteRequests = read("src/lib/website-builder/site-requests.ts");
check("the shared requests: generate, then the worker, then the status is watched",
  /fetchWithAuthRetry\("\/api\/websites\/generate"/.test(siteRequests) && /fetch\("\/api\/websites\/generate\/process"/.test(siteRequests) && /fetch\(`\/api\/websites\/status\?id=\$\{encodeURIComponent\(id\)\}`\)/.test(siteRequests));
check("a description said in the field builds the site through them, then the status is watched",
  // `, projectId: initialProjectId` joined the call 2026-10-22 (starting
  // work from a project auto-joins it, owner's message point 6) — the
  // four original arguments are still exactly these, in this order.
  /await startSiteGeneration\(\{ name, description, skipClarification, referenceImagePaths, projectId: initialProjectId \}\)/.test(site) && /watchSite\(id, \{/.test(site) && !/fetch\("\/api\/websites\/generate/.test(site));
check("...asking its questions first, answered in the field or skipped",
  /if \(data\.needsClarification\) return \{ kind: "questions"/.test(siteRequests) && /if \(outcome\.kind === "questions"\)/.test(site) && /appendClarificationAnswers\(pending\.description, pending\.questions/.test(site) && /data-testid="site-skip-questions"/.test(site));
check("...with the design chosen under the field folded into the brief", /applyDesignBrief\(text\.slice\(0, MAX_DESCRIPTION_LENGTH\), \{ \.\.\.design, imageCount: paths\.length \}\)/.test(site) && /<DesignControls value=\{design\} onChange=\{setDesign\}/.test(site));
check("while it builds, Stop is offered", /data-testid="website-stop"/.test(site) && /requestSiteStop\(current\.id\)/.test(site) && /\/api\/websites\/\$\{encodeURIComponent\(websiteId\)\}\/cancel/.test(siteRequests));
check("while a finished site is the current one, what is said changes it", /if \(current && current\.status === "completed"\) \{\s*void change\(text\);/.test(site) && /requestSiteChange\(\{ websiteId: current\.id, changeRequest: request, section: part, pageSlug: slug, referenceImagePaths \}\)/.test(site) && /fetchWithAuthRetry\("\/api\/websites\/edit"/.test(siteRequests));
check("the price shows before sending, from the server's own estimator", /estimateForAction\(\s*"websiteGenerate"/.test(site) && /t\("estimatedCost", \{ count: estimatedCost \}\)/.test(site));
check("the site beside the conversation is sandboxed, marked as made by AI, and says what it still lacks",
  /srcDoc=\{chosen === null \? html : outlineBoxes\(html, chosen\)\}\s*sandbox=""/.test(site) && /<AiGeneratedNotice variant="block" \/>/.test(site) && /findUnfilledPlaceholders\(html\)/.test(site) && /t\("unfilledTitle"/.test(site));
check("...and accuses no number the person typed: only for a site whose every request is in this conversation",
  /asked\[current\.id\] \? findInventedNumbers\(html, asked\[current\.id\]\.join\("\\n"\)\) : \[\]/.test(site));
check("Publish is on top of it", /<PublishControl websiteId=\{current\.id\}/.test(site));
// REFERENCE PHOTOS, the old page's (2026-10-09): given to the field — its
// «+», a paste, a drop — and sent with the next message, a new site's or a
// change's, as the old page's form and its change box send them
// (components/website-builder/website-builder-workspace.tsx).
const sitePhotos = readIfThere("src/lib/website-builder/site-photos.ts");
const siteHistory = readIfThere("src/components/website-builder/site-history.tsx");
const oldSite = read("src/components/website-builder/website-builder-workspace.tsx");
check("Site: photos are given to the field, as Chat's are, except while its questions wait",
  /attach=\{pending \? undefined : \{ accept: ACCEPTED_REFERENCE_IMAGE_TYPES\.join\(","\), label: tShell\("site\.photosAttach"\), onFiles: addPhotos \}\}/.test(site) &&
    /const \{ accepted, refused \} = admitPhotos\(photos\.length, files\);/.test(site));
check("Site: ...taken by the old page's rules: the type, 5MB, how many",
  /\(ACCEPTED_REFERENCE_IMAGE_TYPES as readonly string\[\]\)\.includes\(file\.type\)/.test(sitePhotos) && /if \(file\.size > MAX_REFERENCE_IMAGE_BYTES\) \{/.test(sitePhotos) && /const room = MAX_REFERENCE_IMAGES - heldCount;/.test(sitePhotos));
check("Site: ...shown above the field, each with its remove, and counted",
  /tray=\{\s*photos\.length > 0 \? \(\s*<div data-testid="site-photos"/.test(site) && /onClick=\{\(\) => removePhoto\(p\.preview\)\}/.test(site) && /tShell\("site\.photos", \{ count: photos\.length, max: MAX_REFERENCE_IMAGES \}\)/.test(site));
check("Site: every photo goes up to the account's own folder of the reference bucket, and none is counted if one fails",
  /const path = buildReferenceImagePath\(user\.id, file\.name\);\s*const \{ error \} = await supabase\.storage\.from\(REFERENCE_IMAGE_BUCKET\)\.upload\(path, file, \{ contentType: file\.type \}\);/.test(sitePhotos) &&
    /if \(results\.some\(\(r\) => r\.error\)\) return \{ ok: false, reason: "failed" \};/.test(sitePhotos) && /canUpload\(data\.usage as StorageUsage, files\.map\(\(f\) => f\.size\)\)/.test(sitePhotos));
check("Site: ...before anything is asked, and the paths go with the next message: a new site, its answers or its skip, a change",
  /const paths = await sendPhotos\(\);\s*if \(paths === null\) \{/.test(site) && /await generate\(websiteNameFrom\(text\)\.slice\(0, MAX_NAME_LENGTH\), description, false, paths\);/.test(site) &&
    /void generate\(pending\.name, enriched, true, pending\.paths\);/.test(site) && /onClick=\{\(\) => void generate\(pending\.name, pending\.description, true, pending\.paths\)\}/.test(site) &&
    /const referenceImagePaths = await sendPhotos\(\);\s*if \(referenceImagePaths === null\) return;/.test(site));
check("Site: the shared requests hand them to the routes, as the old page does",
  // The body went multi-line 2026-10-22 when `projectId` joined it
  // (starting work from a project auto-joins it) — read as one string
  // with whitespace folded, so a re-wrap does not itself break this.
  /body: JSON\.stringify\(\{\s*name: input\.name,\s*description: input\.description,\s*referenceImagePaths,\s*skipClarification: input\.skipClarification,/.test(siteRequests) &&
    /body: JSON\.stringify\(\{ websiteId: record\.id, description: input\.description, referenceImagePaths \}\)/.test(siteRequests) && /referenceImagePaths: input\.referenceImagePaths \?\? \[\],/.test(siteRequests) &&
    /referenceImagePaths,\s*skipClarification,/.test(oldSite));
check("Site: the price counts the photos, as on the page", /\{ model: WEBSITE_BUILDER_MODEL, inputChars: length, imageCount: photos\.length, planSlug \}/.test(site) && /<DesignControls value=\{design\} onChange=\{setDesign\} imageCount=\{photos\.length\} \/>/.test(site));
check("Site: a photo refused or not sent is said in the screen's words, never storage's",
  /refused === "type" \? tShell\("site\.photoType"\) : refused === "size" \? t\("imageTooLarge"\) : t\("imageTooMany", \{ max: MAX_REFERENCE_IMAGES \}\)/.test(site) &&
    /: tShell\("site\.photosFailed"\),/.test(site) && !/error\.message|getErrorMessage/.test(sitePhotos));
// VERSIONS, the old page's History tab and /dashboard/published's Roll
// back (components/publishing/published-sites-list.tsx), in
// components/website-builder/site-history.tsx.
check("Site: its versions are one press away, above the preview and over the list",
  /onClick=\{\(\) => setHistory\(showingHistory \? null : current\.id\)\}[\s\S]{0,200}data-testid="site-history-open"/.test(site) &&
    /body: showingHistory \? \(\s*<div className="flex flex-col gap-3">\s*\{historyToggle\}\s*<SiteHistory\s/.test(site) &&
    /<div data-testid="site-preview" className=\{editor \? "[^"]*" : "flex h-full flex-col gap-3"\}>[\s\S]{0,200}?\{!editor && <AiGeneratedNotice variant="block" \/>\}\s*\{!editor && historyToggle\}/.test(site) &&
    // ...and in the editor layout (the switch "editor-shell", ED2) the same
    // press is «More»'s «History», over the list it opens.
    /id: "versions", label: t\("tabHistory"\),[^}]*onSelect: \(\) => setHistory\(showingHistory \? null : current\.id\)/.test(site));
check("Site: ...every version, read as the old History tab reads it",
  /\.from\("website_versions"\)\s*\.select\("\*"\)\s*\.eq\("website_id", websiteId\)\s*\.order\("version_number", \{ ascending: false \}\)/.test(siteHistory) &&
    /\.from\("website_versions"\)\s*\.select\("\*"\)\s*\.eq\("website_id", websiteId\)\s*\.order\("version_number", \{ ascending: false \}\)/.test(oldSite) && /onClick=\{\(\) => onView\(version\)\}/.test(siteHistory));
check("Site: a version pressed is shown read-only and sandboxed, with the way back to the latest",
  /srcDoc=\{shownHtml\}\s*sandbox=""/.test(site) && /onClick=\{\(\) => setViewing\(null\)\} data-testid="site-latest"/.test(site) && /t\("viewingOldVersion", \{ number: shown\.version_number \}\)/.test(site) &&
    /const shown = viewing && current && viewing\.website_id === current\.id \? viewing : null;/.test(site));
check("Site: once published, what the public saw, with Roll back on every one but the newest, through /dashboard/published's route",
  /\.from\("site_versions"\)\s*\.select\("id, published_site_id, version_number, published_at, change_description"\)\s*\.eq\("published_site_id", site\.id\)/.test(siteHistory) &&
    /fetch\(`\/api\/published\/\$\{encodeURIComponent\(live\.siteId\)\}\/rollback`, \{\s*method: "POST",[\s\S]{0,80}body: JSON\.stringify\(\{ versionId: version\.id \}\),/.test(siteHistory) &&
    /\{index > 0 && \(\s*<button type="button" onClick=\{\(\) => void rollback\(version\)\}/.test(siteHistory) && /window\.confirm\(tPub\("confirmRollback", \{ number: version\.version_number \}\)\)/.test(siteHistory) &&
    /fetch\(`\/api\/published\/\$\{site\.id\}\/rollback`, \{\s*method: "POST",[\s\S]{0,80}body: JSON\.stringify\(\{ versionId: version\.id \}\),/.test(read("src/components/publishing/published-sites-list.tsx")));
check("Site: as many published versions are listed as a publish keeps",
  Number(/const LIVE_VERSIONS_SHOWN = (\d+);/.exec(siteHistory)?.[1]) === Number(/export const MAX_SITE_VERSIONS = (\d+);/.exec(read("src/lib/publishing/publish-limits.ts"))?.[1]) &&
    /\.limit\(LIVE_VERSIONS_SHOWN\)/.test(siteHistory));
// The two rows a server writes in English are said in the screen's words:
// the rollback's own (the route's literal, read here so a new wording
// breaks this rather than leaking) and an undo's mark.
{
  const rollbackRoute = readFileSync("src/app/api/published/[id]/rollback/route.ts", "utf8");
  check("Site: the rows a server writes in English — a rollback, an undo — are said in the screen's words, a refused rollback too",
    /change_description: `Rolled back to version \$\{version\.version_number\}`/.test(rollbackRoute) && /description\?\.match\(\/\^Rolled back to version \(\\d\+\)\$\/\)/.test(siteHistory) &&
      /back \? tPub\("rollbackSuccess", \{ number: Number\(back\[1\]\) \}\)/.test(siteHistory) && /description\.startsWith\(UNDO_MARK\) \? tShell\("site\.undid"/.test(siteHistory) &&
      /if \(!data\?\.ok\) \{\s*addToast\(tPub\("rollbackError"\), "error"\);/.test(siteHistory) && !/(?:data|body)\??\.error\b/.test(siteHistory));
}

console.log("\n== 10. a refusal is said in the reader's language ==");
// Checked 2026-10-08 in the built app by scripts/tests/tool-shell-edges.prodtest.mjs:
// out of credits, the model down, a Free account's limit. The routes answer
// with English prose for logs; a shell that puts it in the conversation or a
// toast shows English on a Greek screen. Ranges over every tool in the shell.
const PROSE = [
  [/(?:text:|addToast\(|note\("tool",)\s*(?:data|body|outcome|report)\??\.error\b/, "a route's `error` said as it is"],
  [/\b(?:data|body|outcome|report)\??\.error \?\? t\(/, "a route's `error`, with a translation only when it is missing"],
  [/\boutcome\.error \|\|/, "a job's or a route's `error`, before the translation"],
  [/\b(?:record|current|w)\.error_message \?\?(?! "")/, "the site worker's `error_message`"],
  [/getErrorMessage\(/, "getErrorMessage, which prefers any English message to the translation"],
];
for (const f of users) {
  const src = read(f);
  const said = PROSE.filter(([re]) => re.test(src)).map(([, what]) => what);
  check(`${f}: no route's English is said to the reader`, said.length === 0, said.join("; "));
}
// The Site's requests make every refusal an ApiError (lib/website-builder/
// site-requests.ts, package 10's check, scripts/tests/site-pages.test.mjs):
// out of credits a 402 by its code, a limit a 429, and the shell says it.
check("Site: out of credits and the limits are read from the code, not from the sentence",
  /if \(outcome\.kind === "refused"\) \{\s*say\(\{ role: "tool", text: describe\(outcome\.error\)\.text \}\);/.test(site) && /:\s*describe\(outcome\.error\)\.text,/.test(site) &&
    /if \(data\.rateLimited\) return \{ kind: "refused", error: refusedBeforeWork\(data\)/.test(siteRequests) && /const short = data\?\.code === "insufficientCredits";/.test(siteRequests) &&
    /const error = res\.ok && data\?\.ok && data\.rateLimited \? refusedBeforeWork\(data\)/.test(siteRequests));
for (const route of ["src/app/api/websites/generate/route.ts", "src/app/api/websites/edit/route.ts"]) {
  const src = read(route);
  const said = (src.match(/insufficientCreditsMessage\(/g) ?? []).length;
  const coded = (src.match(/code: "insufficientCredits"/g) ?? []).length;
  check(`${route}: every "not enough credits" carries its code (${coded} of ${said})`, said >= 1 && coded >= said);
}
check("Site: a build the worker could not finish is said in the screen's words, a stop by its note",
  /say\(\{ role: "tool", text: failedText\(record\) \}\)/.test(site) && /if \(stopped\) return describeNote\(stopped\);/.test(site));
// What components/research/failure-words.ts names (package 11's check,
// scripts/tests/research-slides.test.mjs) is said in its words; the rest
// from the status.
check("Research: a plan or a run refused is said from the status",
  /const named = \(data: Record<string, unknown> \| null, status: number\) => researchRefusal\(data, status\) !== "other" \|\| \(status === 502 && data !== null\);/.test(research) &&
  (research.match(/named\(data, response\.status\) \? failures\.refused\(data, response\.status, "(?:plan|run)"\) : refusalText\(response\.status, data\)/g) ?? []).length === 2);
// Checked 2026-10-09 by tool-shell-edges.prodtest.mjs: a 504 text page from
// the host made `response.json()` throw, and the catch said "your device
// could not reach us" — and "you were not charged" — about a request that
// had reached the server.
check("Research: a plan answered with something that is not JSON is not the connection",
  /const data = await response\.json\(\)\.catch\(\(\) => null\);\s*if \(!data\?\.ok\)/.test(research));
// Checked the same day: over 4MB the bytes go to storage alone, and
// storage that could not be reached answered «Failed to fetch» into the
// conversation. Storage's own words are never what the reader is told.
check("Files: a file over the route's limit, with storage unreachable, is the connection — never storage's English",
  !/error: fallback/.test(uploadLib) && /unanswered \? \(words\.offline \?\? words\.error\) : words\.error/.test(uploadLib) &&
    /unanswered = typeof \(error as \{ status\?: unknown \}\)\.status !== "number"/.test(uploadLib) &&
    /offline: describe\(new ApiError\(0, null\)\)\.text/.test(analyze));
check("Files: a question refused is said from the status, a failed job in the screen's words",
  /describe\(new ApiError\(outcome\.status,/.test(analyze) && /text: isStoppedMessage\(outcome\.error\)\s*\?\s*tSteps\("stopped"\)\s*:\s*askFailure\(outcome\) === "askError" && outcome\.status\s*\?\s*describe\(new ApiError\(outcome\.status,/.test(analyze) &&
    /status: response\.status, body: started/.test(read("src/lib/jobs/start-and-watch.ts")));
check("Files: a file the plan has no room for is the plan's limit",
  /!outcome\.status \|\| uploadRefusal\(outcome\.body \?\? null, outcome\.status\) !== "uploadError"/.test(analyze) &&
  /outcome\.body\?\.limitReached \? \{ \.\.\.outcome\.body, code: "planLimit" \}/.test(analyze) && (uploadLib.match(/body: data,\s*status: response\.status/g) ?? []).length === 2);
check("Analyze: out of credits and the model down are said as such", /status === 402 \? describe\(new ApiError\(402, null\)\)\.text : code === "ai_unavailable" \? t\("analyse\.unavailable"\)/.test(analyze) &&
  (analyze.match(/refusal\(response\.status, body\?\.error,/g) ?? []).length === 2);
check("Slides: Stop reaches a change as well as a new deck",
  (slides.match(/signal: controller\.signal/g) ?? []).length === 2 && (slides.match(/abortRef\.current = controller;/g) ?? []).length === 2);

const LOCALES = ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"];
for (const l of LOCALES) {
  const root = JSON.parse(readFileSync(`messages/${l}.json`, "utf8"));
  const all = root.dashboard ?? {};
  const m = all.toolShell ?? {};
  const files = all.files ?? {};
  check(`${l}: the shell's words`, ["open", "isOpen", "back", "close"].every((k) => typeof m[k] === "string" && m[k]) &&
    ["done", "platforms", "copyAll", "copyOne"].every((k) => typeof m.posts?.[k] === "string" && m.posts[k]) && /\{count, plural/.test(m.posts?.done ?? "") &&
    ["done", "changed", "new"].every((k) => typeof m.slides?.[k] === "string" && m.slides[k]) && /\{title\}[\s\S]*\{count, plural/.test(m.slides?.done ?? "") &&
    typeof m.recent === "string" && m.recent && typeof m.analyze?.needFile === "string" && m.analyze.needFile &&
    ["done", "changed", "building", "questions", "skip", "new", "design", "photosAttach", "photoType", "photosFailed", "versions", "versionsHint", "liveVersions"].every((k) => typeof m.site?.[k] === "string" && m.site[k]) &&
    /\{count\}[\s\S]*\{max\}/.test(m.site?.photos ?? "") && /\{change\}/.test(m.site?.undid ?? "") &&
    /\{count/.test(files.collectionName ?? "") && typeof files.collectionsHint === "string" && files.collectionsHint && typeof files.collectionCreated === "string" && /\{name\}/.test(files.collectionCreated));
  // THE [◧] HISTORY COLUMN, shared across every tool that has moved to it
  // (package 3 of Μέρος 16, Batch 1): one set of words, not one per tool.
  check(`${l}: the history column's words`,
    typeof m.showHistory === "string" && m.showHistory && typeof m.hideHistory === "string" && m.hideHistory &&
      ["search", "empty", "delete"].every((k) => typeof m.history?.[k] === "string" && m.history[k]) &&
      typeof m.history?.deleteConfirm === "string" && /\{title\}/.test(m.history.deleteConfirm));
  // THE EMPTY LANDING, one per tool (its own namespace, as Coding's own
  // "coding.empty" is) — one heading, up to three examples that send.
  check(`${l}: Research's empty landing`,
    typeof all.deepResearch?.empty?.heading === "string" && all.deepResearch.empty.heading &&
      ["marketCompetitors", "compareTools", "trend"].every((k) => typeof all.deepResearch.empty?.examples?.[k] === "string" && all.deepResearch.empty.examples[k]) &&
      typeof all.deepResearch?.new === "string" && all.deepResearch.new);
  check(`${l}: Site's empty landing`,
    typeof all.websiteBuilder?.empty?.heading === "string" && all.websiteBuilder.empty.heading &&
      ["bakery", "portfolio", "restaurant"].every((k) => typeof all.websiteBuilder.empty?.examples?.[k] === "string" && all.websiteBuilder.empty.examples[k]));
  check(`${l}: Document's empty landing`,
    typeof all.documents?.writer?.empty?.heading === "string" && all.documents.writer.empty.heading &&
      ["offer", "cv", "letter"].every((k) => typeof all.documents.writer.empty?.examples?.[k] === "string" && all.documents.writer.empty.examples[k]));
  check(`${l}: Slides' empty landing`,
    typeof root.presentations?.empty?.heading === "string" && root.presentations.empty.heading &&
      ["pitch", "quarterly", "training"].every((k) => typeof root.presentations.empty?.examples?.[k] === "string" && root.presentations.empty.examples[k]));
  check(`${l}: Analyze's empty landing`,
    typeof root.dataAnalysis?.empty?.heading === "string" && root.dataAnalysis.empty.heading &&
      ["trend", "outliers", "compare"].every((k) => typeof root.dataAnalysis.empty?.examples?.[k] === "string" && root.dataAnalysis.empty.examples[k]) &&
      typeof root.dataAnalysis?.new === "string" && root.dataAnalysis.new);
  check(`${l}: Image's empty landing`,
    typeof all.images?.empty?.heading === "string" && all.images.empty.heading &&
      ["logo", "poster", "avatar"].every((k) => typeof all.images.empty?.examples?.[k] === "string" && all.images.empty.examples[k]) &&
      typeof all.images?.new === "string" && all.images.new);
  // Automation's three examples are its own pre-existing example.{calendar,
  // finance,file} (already translated, 10 locales) — only the heading and
  // "new" are genuinely new keys.
  check(`${l}: Automation's empty landing`,
    typeof all.automations?.empty?.heading === "string" && all.automations.empty.heading &&
      ["calendar", "finance", "file"].every((k) => typeof all.automations.example?.[k] === "string" && all.automations.example[k]) &&
      typeof all.automations?.new === "string" && all.automations.new);
}

console.log('\n== 11. the approved editor layout, behind the switch "editor-shell" ==');
// THE OWNER'S 26 APPROVED SCREENS (docs/design/approved/README.md,
// 2026-11-04) are editor-first: the work at full width under a 56px bar
// with one white primary, an optional 288px panel, the field floating
// bottom-centre at most 680px wide. components/shell/editor-shell.tsx
// draws that for every tool at once, for whoever the switch is open to;
// everything sections 1-10 hold above is the shell everyone else still
// has, which is why this section never relaxes one of them. Read with
// comments stripped; scripts/tests/editor-shell.prodtest.mjs measures the
// same facts in a real browser at 1440x900 and 390x844.
const editorSrc = readIfThere("src/components/shell/editor-shell.tsx");
const editorCtx = readIfThere("src/components/shell/editor-shell-context.tsx");
const dashLayout = read("src/app/dashboard/layout.tsx");
const composerSrc = read("src/components/chat/chat-composer.tsx");
const css = readFileSync("src/app/globals.css", "utf8");
const cssRule = (name) => (new RegExp(`\\.${name}\\s*\\{[^}]*\\}`).exec(css) ?? [""])[0];
check("the switch is declared, and read ONCE, in the dashboard's layout, beside the sample read",
  /"editor-shell":\s*"/.test(flags) && /= await Promise\.all\(\[findSampleImport\(supabase, user\.id\), isFeatureOn\("editor-shell", user\)\]\);/.test(dashLayout) &&
    /<EditorShellProvider on=\{editorShell\}>/.test(dashLayout));
check("...and no page or component reads it on its own: the tools follow the shell",
  ![...walk("src/app"), ...walk("src/components")].some((f) => f !== join("src", "app", "dashboard", "layout.tsx") && /isFeatureOn\("editor-shell"/.test(read(f))));
{
  const handOver = shell.search(/if \(editor\) \{\s*return <EditorShell ref=\{ref\} \{\.\.\.props\}/);
  check("ToolShell hands over to the editor layout only when the switch says so, before it draws anything of its own",
    /const editor = useEditorShell\(\);/.test(shell) && handOver > 0 && handOver < shell.indexOf("const showEmpty") && handOver < shell.indexOf('data-testid="tool-shell"'));
}
check("the editor layout's one field is Chat's own composer, drawn once, so it stays mounted when work opens",
  (editorSrc.match(/<ChatComposer\b/g) ?? []).length === 1 && (editorSrc.match(/\{field\}/g) ?? []).length === 1 && !/<textarea|<input\b/.test(editorSrc));
check("...one row over open work, the start screen's stacked shape otherwise — the same textarea and the same send",
  /const oneRow = Boolean\(work\) && !optionsInField;/.test(editorSrc) && /shape=\{oneRow \? "inline" : "landing"\}/.test(editorSrc) && (composerSrc.match(/<textarea\b/g) ?? []).length === 1 &&
    (composerSrc.match(/type="submit"/g) ?? []).length === 1 && /shape = "chat"/.test(composerSrc));
check("the bar is 56px with a divider under it (.tbar)",
  /data-testid="editor-bar" className="editor-bar"/.test(editorSrc) && /\bh-14\b/.test(cssRule("editor-bar")) && /border-b border-divider/.test(cssRule("editor-bar")));
check("...«Tool / title», then the tool's controls and ONE status tag, a spacer, its buttons and the primary",
  /\{name\}\s*<\/button>\s*<span aria-hidden="true"[^>]*>\s*\/\s*<\/span>\s*<h1 data-testid="editor-title"/.test(editorSrc) &&
    /\{work\.controls\}\s*\{work\.status && \(\s*<span data-testid="editor-status" className="editor-tag">/.test(editorSrc) &&
    /<div className="flex-1" \/>\s*<div data-testid="editor-actions"[^>]*>\s*\{work\.actions\}\s*\{primary && <PrimaryButton primary=\{primary\} where="bar" \/>\}/.test(editorSrc));
check("EXACTLY ONE white button in the shell: the primary, written once and placed by width",
  (editorSrc.match(/\bbg-button\b/g) ?? []).length === 1 && /function PrimaryButton\([\s\S]{0,900}?\bbg-button\b[^`"]*\btext-button-ink\b/.test(editorSrc) &&
    (editorSrc.match(/<PrimaryButton primary=\{primary\} where="(?:bar|phone)" \/>/g) ?? []).length === 2);
check("the work takes the full width on the work surface, with 140px under it for the field",
  /data-testid="editor-stage" className="min-w-0 flex-1 bg-workspace\b/.test(editorSrc) && /lg:pb-\[140px\]/.test(editorSrc) && !/w-\[60%\]/.test(editorSrc));
check("the panel is 288px, only when the tool passes one, and then the options are its",
  /export const EDITOR_PANEL_WIDTH = 288;/.test(editorSrc) && /\blg:w-72\b/.test(cssRule("editor-panel")) && /const panel = work\?\.panel \?\? null;/.test(editorSrc) &&
    /\{panel && \(\s*<aside data-testid="editor-panel"/.test(editorSrc) && /const optionsInField = options\.length > 0 && !\(work && panel\);/.test(editorSrc));
check("over work the field floats bottom-centre, at most 680px, never over the panel",
  /lg:absolute lg:inset-x-0 lg:bottom-0/.test(editorSrc) && /\$\{panel \? "lg:end-72" : ""\}/.test(editorSrc) &&
    /data-testid="editor-field" className="pointer-events-auto w-full max-w-\[680px\]"/.test(editorSrc) && /export const EDITOR_FIELD_MAX = 680;/.test(editorSrc));
check("above it, ONE line: the last thing the tool said, and «Chat», which opens the whole conversation",
  /const lastSaid = \[\.\.\.turns\]\.reverse\(\)\.find\(\(turn\) => turn\.role === "tool" && turn\.text\)\?\.text \?\? null;/.test(editorSrc) &&
    /data-testid="editor-note-text" className="min-w-0 flex-1 truncate">\s*\{lastSaid\}/.test(editorSrc) && /onClick=\{\(\) => setChatOpen\(true\)\}/.test(editorSrc));
check("...a dialog with the thread and what is running, that Esc closes, giving focus back",
  /role="dialog"\s*aria-modal="true"[\s\S]{0,900}data-testid="editor-chat-thread"[^>]*>\s*\{thread\}/.test(editorSrc) &&
    /\{working && <li aria-live="polite">\{working\}<\/li>\}/.test(editorSrc) && /if \(e\.key === "Escape"\) closeChat\(\);/.test(editorSrc) && /chatLink\.current\?\.focus\(\)/.test(editorSrc));
check("the selected piece is a chip in the field: a ChosenBox says it there and draws nothing of its own",
  /const inField = useFieldSelection\(label, onClear\);\s*if \(inField\) return null;/.test(shell) && /const pick = selection \?\? chosen;/.test(editorSrc) &&
    /leading=\{pick \? <SelectionChip/.test(editorSrc) && /data-testid="editor-selection-clear"/.test(editorSrc));
check("the price is said in the field: a CostEstimateHint or a FieldCost says it there, a prop wins",
  /const inField = useFieldCost\(credits > 0 \? t\("approx", \{ count: credits \}\) : null\);\s*if \(credits <= 0 \|\| inField\) return null;/.test(read("src/components/credits/cost-estimate.tsx")) &&
    /const price = cost \?\? registeredCost;/.test(editorSrc) && /export function FieldCost\(/.test(editorCtx));
check("...and only the FIELD hears them: a price inside the work stays in the work",
  /<FieldSlotsProvider value=\{slots\}>\s*<ChatComposer\b/.test(editorSrc) && (editorSrc.match(/<FieldSlotsProvider\b/g) ?? []).length === 1);
check("on a phone: back and the title on top, «Chat | Result» under it, the primary full-width above the field",
  /data-testid="tool-shell-back" className=\{`\$\{ACTION\} lg:hidden`\}/.test(editorSrc) && /data-testid="editor-switch"/.test(editorSrc) &&
    /\{work && primary && phoneView === "result" && \(\s*<div className="pointer-events-auto w-full max-w-\[680px\] lg:hidden">/.test(editorSrc) &&
    /\$\{phoneView === "chat" \? "max-lg:hidden" : ""\}/.test(editorSrc));
check("...the open work above the tab bar, as the old shell measured it",
  /"fixed inset-0 z-\[60\] flex min-w-0 flex-col bg-background pb-\[calc\(4rem\+env\(safe-area-inset-bottom\)\)\] md:pb-0 lg:static lg:z-auto lg:flex-1"/.test(editorSrc));
check("the start screen: the globe, one heading, the examples as full-width rows in a ~560px column, not pills",
  /data-testid="tool-shell-empty" className="mx-auto flex min-h-full w-full max-w-\[560px\]/.test(editorSrc) &&
    /data-testid="tool-shell-example"\s*className="min-h-\[48px\] w-full rounded-card bg-panel/.test(editorSrc) && !/data-testid="tool-shell-example"\s*className="[^"]*rounded-full/.test(editorSrc));
check("the history column and New are still there, on both moments",
  /data-testid="tool-shell-history"/.test(editorSrc) && /data-testid="tool-shell-history-toggle"/.test(editorSrc) && /onClick=\{history\.onNew\}/.test(editorSrc));
check("the top bar's «Make anything» is outlined: the screen's white button is the work's",
  /className="btn-quiet min-w-\[44px\]/.test(read("src/components/dashboard/top-nav.tsx")) && !/\bbg-button\b/.test(read("src/components/dashboard/top-nav.tsx")) &&
    /border border-border/.test(cssRule("btn-quiet")) && !/bg-button/.test(cssRule("btn-quiet")));
{
  const image = read("src/components/images/image-shell.tsx");
  check("Image opts into the panel, the primary and the field's price (14-Image.png)",
    /panel: editor \? \(/.test(image) && /<PanelPrice\b/.test(image) && /primary: chosenVariant/.test(image) && /<FieldCost text=\{tEstimate\("approx"/.test(image) &&
      /\{!editor && \(\s*<div className="shrink-0 space-y-4 lg:w-56" data-testid="image-settings-panel">/.test(image));
}
for (const l of LOCALES) {
  const m = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).dashboard ?? {};
  const e = m.toolShell?.editor ?? {};
  check(`${l}: the editor layout's words`,
    ["chat", "result", "view", "conversation", "closeChat", "settings", "credits", "isOpen"].every((k) => typeof e[k] === "string" && e[k]) && /\{name\}/.test(e.selected ?? "") &&
      ["variants", "change", "full", "have"].every((k) => typeof m.images?.panel?.[k] === "string" && m.images.panel[k]) && /\{count, plural/.test(m.images?.panel?.credits ?? ""));
}

console.log('\n== 12. Site and Document to their approved screens, under the same switch (ED2, 2026-11-05) ==');
// docs/design/approved/08-Site.png and 11-Document.png. Everything here is
// the editor layout's branch only: sections 1-10 still hold the old one,
// line for line, and those checks were not relaxed to make room. The part
// of the page pressed IN the page, and why only one script runs there, is
// scripts/tests/site-pick-frame.test.mjs; the browser is
// scripts/tests/editor-shell.prodtest.mjs.
{
  const publish = read("src/components/publishing/publish-control.tsx");
  const more = readIfThere("src/components/shell/more-menu.tsx");
  const frameSrc = read("src/components/website-builder/browser-frame.tsx");
  const notice = read("src/components/ai/ai-generated-notice.tsx");
  const docs = read("src/components/documents/documents-shell.tsx");
  check("Site: Publish is the bar's ONE white button, from the publish control's own state",
    /primary: sitePrimary,/.test(site) && /onClick: publishing\.isLive \? publishing\.publishChanges : publishing\.openPublish,/.test(site) &&
      /label: publishing\.isLive \? tPub\("publishChanges"\) : publishing\.everPublished \? tPub\("republish"\) : tPub\("publish"\),/.test(site));
  check("...told by ONE publish control with no buttons of its own, outside the bar that is drawn twice by width",
    (site.match(/<PublishControl key=\{current\.id\} headless\b/g) ?? []).length === 1 &&
      (() => { const at = site.indexOf("actions: editor ? ("); const block = at < 0 ? "" : site.slice(at, site.indexOf(") : (", at)); return block.includes("<MoreMenu") && !block.includes("<PublishControl"); })() &&
      /\{!headless && \(\s*<div className="flex flex-wrap items-center gap-1\.5">/.test(publish) && /onApi\?\.\(\{/.test(publish));
  check("...and what it says is about THIS site, never the one open a moment ago",
    /const publishing = publishState && current && publishState\.siteId === current\.id && current\.status === "completed" \? publishState\.api : null;/.test(site));
  check("«Publish changes» after a reload publishes to the site's own address instead of returning on an empty field",
    /const target = !open && site \? validateSubdomain\(site\.subdomain\) : check;\s*if \(!target\.ok\) return;/.test(publish) && /JSON\.stringify\(\{ subdomain: target\.subdomain \}\)/.test(publish));
  {
    const ids = [...site.matchAll(/\{ id: "([a-z]+)", label:/g)].map((m) => m[1]);
    check(`Site: nothing the old bar had is dropped — «More» holds undo, the download, the versions, the translation, Motion, the live site and taking it offline (${ids.join(", ")})`,
      ["undo", "download", "versions", "translate", "motion", "live", "unpublish"].every((id) => ids.includes(id)) &&
        /actions: editor \? \(\s*<>\s*\{liveUrl && <CopyButton[^>]*\/>\}\s*<MoreMenu label=\{tShell\("editor\.more"\)\}/.test(site));
  }
  check("«More» is a menu button: its items are menuitems, arrows move, Esc gives focus back, a press outside closes it",
    /aria-haspopup="menu"/.test(more) && /role="menu"/.test(more) && (more.match(/role="menuitem"/g) ?? []).length >= 2 &&
      /event\.key === "ArrowDown"/.test(more) && /event\.key === "Escape"/.test(more) && /close\(true\)/.test(more) && /document\.addEventListener\("pointerdown", onDown\)/.test(more) &&
      /flex min-h-\[44px\]/.test(more));
  check("Site: above the page, no banner, no History button and no numbered pills in the editor layout",
    /\{!editor && <AiGeneratedNotice variant="block" \/>\}/.test(site) && /\{!editor && historyToggle\}/.test(site) && /\{!editor && !shown && complete && boxes\.length > 1 && \(/.test(site));
  check("...and the AI label is not lost: one muted line under the page, the long sentence, never hidden from a screen reader",
    /\{editor && <AiGeneratedNotice variant="line" \/>\}\s*<\/div>/.test(site) && /if \(variant === "line"\) \{[\s\S]{0,400}\{t\("long"\)\}/.test(notice) && !/aria-hidden="true"[^>]*>\s*\{t\("long"\)\}/.test(notice));
  check("Site: the frame's bar is a shield and the address in the editor layout, no dots — the live address once it is live, the name before",
    (site.match(/chrome=\{editor \? "address" : "dots"\} liveAddress=\{editor \? liveUrl : null\}/g) ?? []).length === 2 &&
      /\{chrome === "address" \? \(\s*<div className="browser-frame-address">\s*<Shield\b[\s\S]{0,300}\{liveAddress \? shownAddress\(liveAddress\) : address\}/.test(frameSrc) &&
      !/browser-frame-address[\s\S]{0,400}bg-danger/.test(frameSrc));
  check("Site: the tag is the version and whether it is live, when both are known",
    /tShell\("site\.version", \{ n: latestVersion, live: publishing\.isLive \? "yes" : "no" \}\)/.test(site) && /status: siteTag \?\? \(/.test(site));
  check("Site: a part pressed in the page is chosen there, and the work stays open on a phone",
    /onPick=\{\(i\) => \{\s*if \(i >= boxes\.length\) return;\s*setBox\(chosen === i \? null : \{ siteId: current\.id, slug: pageSlug, index: i \}\);\s*\}\}/.test(site));
  check("Site: the price of a change is said in the field, from the estimator the edit route holds against, on the same input",
    /estimateForAction\(\s*"websiteEdit",\s*\{ model: WEBSITE_BUILDER_MODEL, inputChars: pageHtml\.length \+ length, imageCount: photos\.length, planSlug \}/.test(site) &&
      /\{editor && !busy && !pending && current\?\.status === "completed" \? <FieldCost text=\{tEstimate\("approx", \{ count: changeCost\(html\) \}\)\} \/> : null\}/.test(site) &&
      /inputChars: sourceHtml\.length \+ changeRequest\.length,\s*imageCount: referenceImagePaths\.length,/.test(read("src/app/api/websites/edit/route.ts")));
  check("the one-row field says it short once a piece is chosen («Change this…», CONTEXT §7), in Site and Document",
    /\? editor\s*\? chosen === null\s*\? tShell\("editor\.changeWork"\)\s*: tShell\("editor\.changeThis"\)/.test(site) && /editor \? tShell\("editor\.changeThis"\)/.test(docs));
  check("Site: once a site is made, the new-site options leave the field, so it is the approved one row",
    /options=\{editor && current\?\.status === "completed" && !pending \? \[\] : \[/.test(site));
  check("the field is not focused on arrival over open work, and an empty field is as tall as its placeholder",
    /autoFocus=\{shape !== "inline"\}/.test(composerSrc) && /useLayoutEffect\(\(\) => \{\s*if \(!editor\) return;[\s\S]{0,200}if \(!el\.value\) resize\(el\);/.test(composerSrc) &&
      /requestAnimationFrame\(fit\)/.test(composerSrc));
  check("Document: the tag is the document's word count, counted as its language divides words",
    /status: wordCount === null \? undefined : t\("words", \{ count: wordCount \}\),/.test(docs) && /new Intl\.Segmenter\(locale, \{ granularity: "word" \}\)/.test(docs) && /piece\.isWordLike/.test(docs));
  check("Document: the page is centred on the stage, white, at most 740px (.paper)",
    /<div data-testid="doc-page" className=\{editor \? "doc-paper" : undefined\}>/.test(docs) && /\bmx-auto\b/.test(cssRule("doc-paper")) && /max-w-\[740px\]/.test(cssRule("doc-paper")) && /\bbg-paper\b/.test(cssRule("doc-paper")));
  check("Document: once a document is open its fixed kind leaves the field, so it is the approved one row",
    /options=\{editor && editing \? \[\] : \[/.test(docs));
  check("on a phone the chosen piece is the field's first row, above «+», the text and send (M14-Image.png)",
    /"max-lg:-order-2 max-lg:basis-full"/.test(composerSrc) && /shape === "inline" \? "order-first max-lg:-order-1" : ""/.test(composerSrc));
  check("Document: pressing a paragraph keeps the work open on a phone, and focuses the field only from the keyboard",
    /if \(!editor && !workIsBeside\(\)\) setPane\(null\);/.test(docs) && /if \(!editor \|\| event\.detail === 0\) composerRef\.current\?\.focus\(\);/.test(docs));
  check("Document: the chosen paragraph gets the same «<name> · selected» label as Site's, and a solid ink ring, never the old blue dashed one",
    /data-testid="doc-box-selected-label"/.test(docs) && /tShell\("editor\.selectedTag", \{ name: t\("block", \{ n: index \+ 1 \}\) \}\)/.test(docs) &&
      /ring-2 ring-button-ink/.test(docs) && !/border-blue|border-dashed|outline-blue/.test(docs));
  for (const l of LOCALES) {
    const m = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).dashboard ?? {};
    const e = m.toolShell ?? {};
    check(`${l}: ED2's words`,
      typeof e.editor?.more === "string" && e.editor.more && /\{name\}/.test(e.editor?.selectedTag ?? "") &&
        /\{n\}/.test(e.site?.version ?? "") && /\{live, select, yes \{/.test(e.site?.version ?? "") && /\{live, select, yes \{/.test(e.site?.publishState ?? "") &&
        /^\{count, plural, /.test(m.documents?.writer?.words ?? "") && ["changeThis", "changeWork"].every((k) => typeof e.editor?.[k] === "string" && e.editor[k] && !/[{}]/.test(e.editor[k])));
  }
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
