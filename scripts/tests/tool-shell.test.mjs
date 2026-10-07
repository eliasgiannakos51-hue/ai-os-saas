// EVERY TOOL IN ONE SHELL: CONVERSATION LEFT, WORK RIGHT, ONE FIELD, AT
// MOST FOUR OPTIONS (docs/MASTER.md Μέρος 14.3 and package 3 of Μέρος 16;
// docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN §5).
//
// The population is every file that renders <ToolShell>, found by walking
// src/, not listed here: a tool moved into the shell is held the moment it
// is, and one that leaves it stops being counted. Each is held to four
// options, the shell's own field and nothing else to type into, no step
// flow and no box of warnings, and a page that draws it only behind the
// switch "tool-shell" and INSTEAD of its old body.
//
// Read with comments stripped: none of this runs without a browser, and
// scripts/tests/tool-shell.prodtest.mjs is where it is watched.
//
// Run: node scripts/tests/tool-shell.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
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
  /<div className="flex min-w-0 flex-1 flex-col">/.test(shell) && /data-testid="tool-shell-work"\s+className="fixed inset-0 z-\[60\] flex flex-col bg-workspace lg:static lg:z-auto lg:w-\[60%\] lg:shrink-0"/.test(shell));
check("...and on a phone the work is the whole screen, with a button back to the conversation",
  /data-testid="tool-shell-back" className=\{`\$\{ACTION\} lg:hidden`\}/.test(shell) && /onClick=\{onCloseWork\}/.test(shell));
check("a card in the conversation opens the work again", /data-testid="tool-shell-card"/.test(shell) && /onClick=\{turn\.card\.onOpen\}/.test(shell));
check("no steps on top and no tabs in the shell itself", !/<StepFlow\b|role="tablist"/.test(shell));
check("the most options a tool may have is four", /export const MAX_SHELL_OPTIONS = 4;/.test(shell));

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
  // A checkbox, a radio or a file picker takes no text; anything else does.
  check(`${f}: nothing to type into but the shell's field`, !/<textarea\b|<input\b(?![^>]*type="(?:checkbox|radio|file)")/.test(src));
  check(`${f}: no steps on top, no box of limits`, !/<StepFlow\b|_LIMITS\.map\(/.test(src));
  check(`${f}: imports no page component, so the old page is not drawn behind it`, !/from "@\/components\/[^"]+-workspace"/.test(src));
}

console.log("\n== 3. the switch, and the page that draws it ==");
const flags = read("src/lib/flags/flags.ts");
check('the switch "tool-shell" is declared', /"tool-shell":\s*"/.test(flags));
const pages = walk("src/app").filter((f) => /page\.tsx$/.test(f));
for (const f of users) {
  const component = (read(f).match(/export function (\w+)\(/) ?? [])[1];
  const callers = pages.filter((p) => component && new RegExp(`<${component}\\b`).test(read(p)));
  check(`${component}: drawn by a page (${callers.length})`, callers.length >= 1);
  for (const p of callers) {
    const src = read(p);
    const gate = src.indexOf('if (await isFeatureOn("tool-shell", user)) {');
    const drawn = src.indexOf(`<${component}`);
    const lastReturn = src.lastIndexOf("return (");
    check(`${p}: only behind the switch, and INSTEAD of the old body`,
      gate >= 0 && drawn > gate && drawn < lastReturn && /return \(\s*<div className="h-\[calc\(100dvh-8rem\)\] md:h-\[calc\(100vh-4rem\)\]">/.test(src.slice(gate, lastReturn)));
  }
}

console.log("\n== 4. Posts, in the shell ==");
const posts = read("src/components/posts/posts-shell.tsx");
check("it writes through the same route as the old page", /fetch\("\/api\/posts\/generate"/.test(posts) && /JSON\.stringify\(\{ description: text, platforms: chosen, locale \}\)/.test(posts));
check("the price shows before sending, from the length typed", /onLengthChange=\{setLength\}/.test(posts) && /<CostEstimateHint credits=\{estimate\.credits\} \/>/.test(posts) && /postsEstimateInputChars\(length, platforms\)/.test(posts));
check("Stop aborts the request", /onStop=\{\(\) => abortRef\.current\?\.abort\(\)\}/.test(posts) && /signal: controller\.signal/.test(posts));
check("the posts open beside the conversation, one per platform with its copy", /data-testid="posts-result"/.test(posts) && /<CopyButton text=\{clipboard\}/.test(posts) && /setOpen\("posts"\)/.test(posts));
check("what was written before is one press away, and deletes through RLS", /data-testid="posts-recent"/.test(posts) && /from\("generated_posts"\)\.delete\(\)\.eq\("id", id\)/.test(posts));
check("what it does not do is one line, not a box", /<p className="mt-1\.5 text-\[11px\] text-muted">\{t\("limits\.no_publish"\)\}<\/p>/.test(posts));

console.log("\n== 5. Slides, in the shell ==");
const slides = read("src/components/presentations/presentations-shell.tsx");
check("the first thing said writes the deck, through the same route as the old page",
  /fetch\("\/api\/presentations\/generate"/.test(slides) && /slideCount, imageSource, ownImagePaths, locale \}\)/.test(slides));
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

console.log("\n== 7. Analyze, in the shell ==");
const analyze = read("src/components/data-analysis/analysis-shell.tsx");
check("the field asks the open file, through the same route as the page", /onSend=\{\(text\) => void ask\(text\)\}/.test(analyze) && /fetch\(`\/api\/data-analysis\/\$\{current\.id\}\/ask`/.test(analyze));
check("...and with no file, it says to upload one instead of failing silently", /note\("tool", tShell\("analyze\.needFile"\)\)/.test(analyze));
check("the conversation is the questions asked of this file, each answer with the rows it stands on",
  /\[\.\.\.current\.questions\]\.reverse\(\)/.test(analyze) && /data-testid="analysis-evidence"/.test(analyze) && /t\("ask\.matched"/.test(analyze));
check("upload and find patterns are options, through the page's routes",
  /fetch\("\/api\/data-analysis\/upload", \{ method: "POST", body: form \}\)/.test(analyze) && /fetch\(`\/api\/data-analysis\/\$\{current\.id\}\/analyse`/.test(analyze));
check("the file beside the conversation says when it was only partly read", /t\("summary\.truncated"\)/.test(analyze) && /t\("summary\.ragged"/.test(analyze));
check("...and computes nothing: the column line is the page's own", /import \{ describeColumn[^}]*\} from "@\/lib\/data-analysis\/view"/.test(analyze) && !/function describeColumn/.test(analyze));

console.log("\n== 8. Files, in the shell ==");
const filesShell = read("src/components/files/files-shell.tsx");
const uploadLib = read("src/lib/files/upload-file.ts");
check("selection is still the subject: nothing is asked with nothing ticked",
  /if \(selected\.length === 0\) \{\s*say\(\{ role: "tool", text: t\("selectFirst"\) \}\);/.test(filesShell) && /t\("askSelected", \{ count: selectedFiles\.length/.test(filesShell));
check("the field asks the ticked files, as a background job through the page's route",
  /startAndWatchJob\(\s*"\/api\/files\/ask",\s*\{ question: text, fileIds: selected, language: locale \}/.test(filesShell));
check("every answer says the page it came from, or that it is not in the documents",
  /data-testid="files-citations"/.test(filesShell) && /\{c\.filename\} — \{c\.label\}/.test(filesShell) && /t\("notInDocuments"\)/.test(filesShell) && /t\("uncitedAnswer"\)/.test(filesShell));
check("...built by the same function as on the page, and copied with its sources",
  /answerFromResult\(/.test(filesShell) && /answerForClipboard\(turn\.answer!\)/.test(filesShell) && /from "@\/lib\/files\/answer"/.test(filesShell));
check("an answer that finished elsewhere is put back, and one running is watched", /\/api\/jobs\?kind=file_ask/.test(filesShell) && /watchJob\(String\(job\.id\)/.test(filesShell) && /<JobSeen jobId=\{turn\.answer\.jobId\} \/>/.test(filesShell));
check("an upload whose registration does not land is removed from the bucket",
  /if \(data\?\.ok && data\.file\) return \{ ok: true, file: data\.file \};\s*try \{\s*await createBrowserSupabase\(\)\.storage\.from\(FILE_BUCKET\)\.remove\(\[path\]\);/.test(uploadLib));
check("a file that stored but could not be read is not called a success", /outcome\.file\.processing_status === "failed"/.test(filesShell));

console.log("\n== 9. Site, in the shell ==");
const site = read("src/components/website-builder/website-shell.tsx");
// THE REQUESTS ARE SHARED with the Site opened beside Chat (package 7):
// lib/website-builder/site-requests.ts makes them, the shell calls it.
const siteRequests = read("src/lib/website-builder/site-requests.ts");
check("the shared requests: generate, then the worker, then the status is watched",
  /fetchWithAuthRetry\("\/api\/websites\/generate"/.test(siteRequests) && /fetch\("\/api\/websites\/generate\/process"/.test(siteRequests) && /fetch\(`\/api\/websites\/status\?id=\$\{encodeURIComponent\(id\)\}`\)/.test(siteRequests));
check("a description said in the field builds the site through them, then the status is watched",
  /await startSiteGeneration\(\{ name, description, skipClarification \}\)/.test(site) && /watchSite\(id, \{/.test(site) && !/fetch\("\/api\/websites\/generate/.test(site));
check("...asking its questions first, answered in the field or skipped",
  /if \(data\.needsClarification\) return \{ kind: "questions"/.test(siteRequests) && /if \(outcome\.kind === "questions"\)/.test(site) && /appendClarificationAnswers\(pending\.description, pending\.questions/.test(site) && /data-testid="site-skip-questions"/.test(site));
check("...with the design chosen under the field folded into the brief", /applyDesignBrief\(text\.slice\(0, MAX_DESCRIPTION_LENGTH\), \{ \.\.\.design, imageCount: 0 \}\)/.test(site) && /<DesignControls value=\{design\} onChange=\{setDesign\}/.test(site));
check("while it builds, Stop is offered", /data-testid="website-stop"/.test(site) && /requestSiteStop\(current\.id\)/.test(site) && /\/api\/websites\/\$\{encodeURIComponent\(websiteId\)\}\/cancel/.test(siteRequests));
check("while a finished site is the current one, what is said changes it", /if \(current && current\.status === "completed"\) \{\s*void change\(text\);/.test(site) && /requestSiteChange\(\{ websiteId: current\.id, changeRequest: request, section: part, \.\.\.\(pages \? \{ pageSlug: slug \} : \{\}\) \}\)/.test(site) && /fetchWithAuthRetry\("\/api\/websites\/edit"/.test(siteRequests));
check("the price shows before sending, from the server's own estimator", /estimateForAction\(\s*"websiteGenerate"/.test(site) && /t\("estimatedCost", \{ count: estimatedCost \}\)/.test(site));
check("the site beside the conversation is sandboxed, marked as made by AI, and says what it still lacks",
  /srcDoc=\{chosen === null \? html : outlineBoxes\(html, chosen\)\}\s*sandbox=""/.test(site) && /<AiGeneratedNotice variant="block" \/>/.test(site) && /findUnfilledPlaceholders\(html\)/.test(site) && /t\("unfilledTitle"/.test(site));
check("...and accuses no number the person typed: only for a site whose every request is in this conversation",
  /asked\[current\.id\] \? findInventedNumbers\(html, asked\[current\.id\]\.join\("\\n"\)\) : \[\]/.test(site));
check("Publish is on top of it", /<PublishControl websiteId=\{current\.id\}/.test(site));

const LOCALES = ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"];
for (const l of LOCALES) {
  const m = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).dashboard?.toolShell ?? {};
  check(`${l}: the shell's words`, ["open", "isOpen", "back", "close"].every((k) => typeof m[k] === "string" && m[k]) &&
    ["done", "platforms", "copyAll", "copyOne"].every((k) => typeof m.posts?.[k] === "string" && m.posts[k]) && /\{count, plural/.test(m.posts?.done ?? "") &&
    ["done", "changed", "new"].every((k) => typeof m.slides?.[k] === "string" && m.slides[k]) && /\{title\}[\s\S]*\{count, plural/.test(m.slides?.done ?? "") &&
    typeof m.recent === "string" && m.recent && typeof m.analyze?.needFile === "string" && m.analyze.needFile &&
    ["done", "changed", "building", "questions", "skip", "new", "design"].every((k) => typeof m.site?.[k] === "string" && m.site[k]));
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
