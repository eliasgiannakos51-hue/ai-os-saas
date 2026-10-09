#!/usr/bin/env node
/*
 * CAN tool-shell.test.mjs SEE A TOOL LEAVE THE SHELL'S RULES?
 *
 * A fifth option, a second box to type into, a step flow or a box of
 * limits coming back, the work no longer beside the conversation or no
 * way back from it on a phone, the shell drawn without its switch or on
 * top of the old page, and Posts losing its price, its stop or its route.
 *
 * Run: node scripts/tests/tool-shell.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/tool-shell.test.mjs";
const SHELL = "src/components/shell/tool-shell.tsx";
const POSTS = "src/components/posts/posts-shell.tsx";
const PAGE = "src/app/dashboard/posts/page.tsx";
const SLIDES = "src/components/presentations/presentations-shell.tsx";
const SLIDES_PAGE = "src/app/dashboard/presentations/page.tsx";
const RESEARCH = "src/components/research/research-shell.tsx";
const ANALYZE = "src/components/data-analysis/analysis-shell.tsx";
const FILES = "src/components/files/files-shell.tsx";
const UPLOAD = "src/lib/files/upload-file.ts";
const SITE = "src/components/website-builder/website-shell.tsx";
const SITE_REQUESTS = "src/lib/website-builder/site-requests.ts";
const SITE_GENERATE = "src/app/api/websites/generate/route.ts";
const JOBS = "src/lib/jobs/start-and-watch.ts";
const TARGETS = [GATE, SHELL, POSTS, PAGE, SLIDES, SLIDES_PAGE, RESEARCH, ANALYZE, FILES, UPLOAD, SITE, SITE_REQUESTS, SITE_GENERATE, JOBS];

const MUTANTS = [
  {
    name: "a fifth option under the field",
    file: POSTS,
    from: '      options={[\n',
    to: '      options={[\n        <button key="a" type="button" />,\n        <button key="b" type="button" />,\n        <button key="c" type="button" />,\n',
    expect: "at most four",
  },
  {
    name: "a second box to type into",
    file: POSTS,
    from: '                  <input type="checkbox" checked={platforms.includes(p)} onChange={() => togglePlatform(p)} />',
    to: '                  <input type="checkbox" checked={platforms.includes(p)} onChange={() => togglePlatform(p)} /><input type="text" />',
    expect: "nothing to type into but the shell's field",
  },
  {
    name: "the box of limits comes back",
    file: POSTS,
    from: '          <p className="mt-1.5 text-[11px] text-muted">{t("limits.no_publish")}</p>',
    to: '          <p className="mt-1.5 text-[11px] text-muted">{t("limits.no_publish")}</p>\n          {POST_LIMITS.map((l) => <p key={l}>{l}</p>)}',
    expect: "no box of limits",
  },
  {
    name: "the work is drawn under the conversation instead of beside it",
    file: SHELL,
    from: "lg:static lg:z-auto lg:w-[60%] lg:shrink-0",
    to: "lg:static lg:z-auto lg:w-full lg:shrink-0",
    expect: "the work is beside it",
  },
  {
    name: "no way back from the work on a phone",
    file: SHELL,
    from: 'data-testid="tool-shell-back" className={`${ACTION} lg:hidden`}',
    to: 'data-testid="tool-shell-back" className={`${ACTION} hidden`}',
    expect: "a button back to the conversation",
  },
  {
    name: "the options leave the field",
    file: SHELL,
    from: '              {options.length > 0 && (\n                <div data-testid="tool-shell-options"',
    to: '              {options.length > 99 && (\n                <div data-testid="tool-shell-options"',
    expect: "the options are drawn under that field",
  },
  {
    name: "the shell is drawn without its switch",
    file: PAGE,
    from: '  if (await isFeatureOn("tool-shell", user)) {',
    to: "  if (true) {",
    expect: "only behind the switch",
  },
  {
    name: "Posts stops showing the price before sending",
    file: POSTS,
    from: "          {!running && length > 0 && <CostEstimateHint credits={estimate.credits} />}\n",
    to: "",
    expect: "the price shows before sending",
  },
  {
    name: "Stop no longer stops",
    file: POSTS,
    from: "      onStop={() => abortRef.current?.abort()}",
    to: "      onStop={() => {}}",
    expect: "Stop aborts the request",
  },
  {
    name: "the shell imports the old page",
    file: POSTS,
    from: 'import { ToolShell, OPTION, type ShellTurn } from "@/components/shell/tool-shell";',
    to: 'import { ToolShell, OPTION, type ShellTurn } from "@/components/shell/tool-shell";\nimport { PostsWorkspace } from "@/components/posts/posts-workspace";',
    expect: "imports no page component",
  },
  {
    name: "Slides: a fifth option",
    file: SLIDES,
    from: '      options={[\n',
    to: '      options={[\n        <button key="x" type="button" />,\n',
    expect: "at most four",
  },
  {
    name: "Slides: what is said to an open deck writes a new one instead of changing it",
    file: SLIDES,
    from: "      onSend={(text) => void (editing ? change(text) : write(text))}",
    to: "      onSend={(text) => void write(text)}",
    expect: "what is said next changes it",
  },
  {
    name: "Slides: the photographs stay behind after a refusal",
    file: SLIDES,
    from: '        say("tool", refusal(String(body?.error ?? ""), MAX_DECK_DESCRIPTION_CHARS));\n        await discardUploads();',
    to: '        say("tool", refusal(String(body?.error ?? ""), MAX_DECK_DESCRIPTION_CHARS));',
    expect: "the photographs are removed again",
  },
  {
    name: "Slides: the shell is drawn without its switch",
    file: SLIDES_PAGE,
    from: '  if (await isFeatureOn("tool-shell", user)) {',
    to: "  if (true) {",
    expect: "only behind the switch",
  },
  {
    name: "Slides: the price of a change is not shown",
    file: SLIDES,
    from: "<CostEstimateHint credits={editing ? editEstimate.credits : estimate.credits} />",
    to: "<CostEstimateHint credits={estimate.credits} />",
    expect: "the price shows before sending, for a new deck and for a change",
  },
  {
    name: "Research: a subject said is run at once, with no plan to approve",
    file: RESEARCH,
    from: "      onSend={(text) => void plan(text)}",
    to: "      onSend={(text) => void run(text)}",
    expect: "is PLANNED, not run",
  },
  {
    name: "Research: the plan loses its price",
    file: RESEARCH,
    from: '            <p className="text-xs font-medium text-foreground">{t("estimate", { credits })}</p>\n',
    to: "",
    expect: "its questions and its price",
  },
  {
    name: "Research: a stalled run is never nudged",
    file: RESEARCH,
    from: "            if (previous === current) void fetch(`/api/research/${report.id}/continue`, { method: \"POST\", keepalive: true }).catch(() => undefined);\n",
    to: "",
    expect: "a stalled run is nudged",
  },
  {
    name: "Analyze: a question with no file goes nowhere and says nothing",
    file: ANALYZE,
    from: '      note("tool", tShell("analyze.needFile"));\n',
    to: "",
    expect: "it says to upload one",
  },
  {
    name: "Analyze: the answers lose the rows they stand on",
    file: ANALYZE,
    from: '<div data-testid="analysis-evidence" className="mt-2">',
    to: '<div className="mt-2">',
    expect: "each answer with the rows it stands on",
  },
  {
    name: "Files: an object with no row is left in the bucket",
    file: UPLOAD,
    from: "      await createBrowserSupabase().storage.from(FILE_BUCKET).remove([path]);\n",
    to: "",
    expect: "is removed from the bucket",
  },
  {
    name: "Files: a question with nothing ticked is sent anyway",
    file: FILES,
    from: "    if (selected.length === 0) {",
    to: "    if (false) {",
    expect: "nothing is asked with nothing ticked",
  },
  {
    name: "Files: the answer loses where it came from",
    file: FILES,
    from: '<ul data-testid="files-citations" className="mt-1 space-y-0.5">',
    to: '<ul className="mt-1 space-y-0.5">',
    expect: "the page it came from",
  },
  {
    name: "Site: the preview runs the generated page's scripts",
    file: SITE,
    from: 'srcDoc={chosen === null ? html : outlineBoxes(html, chosen)}\n                  sandbox=""',
    to: 'srcDoc={chosen === null ? html : outlineBoxes(html, chosen)}\n                  sandbox="allow-scripts"',
    expect: "is sandboxed",
  },
  {
    name: "Site: a change to a finished site builds a new one instead",
    file: SITE,
    from: '    if (current && current.status === "completed") {',
    to: "    if (false) {",
    expect: "what is said changes it",
  },
  {
    name: "Site: the invented-number check accuses numbers typed in an earlier visit",
    file: SITE,
    from: 'asked[current.id] ? findInventedNumbers(html, asked[current.id].join("\\n")) : []',
    to: 'findInventedNumbers(html, (asked[current.id] ?? []).join("\\n"))',
    expect: "accuses no number the person typed",
  },
  // ---- a refusal said in the reader's language (2026-10-08)
  {
    name: "Site: a failed build says the worker's English sentence",
    file: SITE,
    from: 'say({ role: "tool", text: failedText(record) });',
    to: 'say({ role: "tool", text: record.error_message ?? t("generateFailed") });',
    expect: "no route's English is said to the reader",
  },
  {
    name: "Site: a stop is no longer said by its note",
    file: SITE,
    from: "    if (stopped) return describeNote(stopped);\n",
    to: "",
    expect: "a stop by its note",
  },
  {
    name: "Site: out of credits on a new site is read as the limits",
    file: SITE,
    from: 'outcome.code === "insufficientCredits"\n              ? refusalText(402, null)',
    to: 'outcome.code === "never"\n              ? refusalText(402, null)',
    expect: "read from the code, not from the sentence",
  },
  {
    name: "Site: the requests drop the code the route sent",
    file: SITE_REQUESTS,
    from: 'code: typeof data.code === "string" ? data.code : null,',
    to: "code: null,",
    expect: "read from the code, not from the sentence",
  },
  {
    name: "Site: the route says not enough credits without its code",
    file: SITE_GENERATE,
    from: '          code: "insufficientCredits",\n          message: insufficientCreditsMessage(check.remaining, estimatedCost),',
    to: "          message: insufficientCreditsMessage(check.remaining, estimatedCost),",
    expect: "carries its code",
  },
  {
    name: "Research: a refused plan says the route's English",
    file: RESEARCH,
    from: 'say({ role: "tool", text: response.status === 502 && data ? t("planError") : refusalText(response.status, data) });',
    to: 'say({ role: "tool", text: data.error ?? t("planError") });',
    expect: "no route's English is said to the reader",
  },
  {
    name: "Files: a failed question says the provider's own message",
    file: FILES,
    from: ': isStoppedMessage(outcome.error)\n                    ? tSteps("stopped")\n                    : t("askError"),',
    to: ": outcome.error || t(\"askError\"),",
    expect: "no route's English is said to the reader",
  },
  {
    name: "Files: the question's refusal loses its status",
    file: JOBS,
    from: ", status: response.status, body: started };",
    to: " };",
    expect: "a failed job in the screen's words",
  },
  {
    name: "Files: a file over the plan's limit is said as the route wrote it",
    file: FILES,
    from: "            text: !outcome.status\n              ? outcome.error",
    to: "            text: outcome.error,\n            unread: !outcome.status\n              ? outcome.error",
    expect: "no route's English is said to the reader",
  },
  {
    name: "Files: the plan's limit is said as a missing feature",
    file: FILES,
    from: "outcome.body?.limitReached ? { ...outcome.body, code: \"planLimit\" } : outcome.body ?? null",
    to: "outcome.body ?? null",
    expect: "is the plan's limit",
  },
  {
    name: "Analyze: out of credits is said as 'not answered'",
    file: ANALYZE,
    from: 'note("tool", refusal(response.status, body?.error, t("ask.failed")));',
    to: 'note("tool", t("ask.failed"));',
    expect: "said as such",
  },
  {
    name: "Slides: Stop does not reach a change",
    file: SLIDES,
    from: "        signal: controller.signal,\n        body: JSON.stringify({ instruction:",
    to: "        body: JSON.stringify({ instruction:",
    expect: "Stop reaches a change",
  },
  // ---- 2026-10-09: what the verify pass found under the same heading
  {
    name: "Research: a plan the host answered in text throws into 'offline'",
    file: RESEARCH,
    from: "const data = await response.json().catch(() => null);\n      if (!data?.ok) {",
    to: "const data = await response.json();\n      if (!data?.ok) {",
    expect: "is not the connection",
  },
  {
    name: "Files: a file over 4MB says storage's own English when storage is unreachable",
    file: UPLOAD,
    from: "error: unanswered ? (words.offline ?? words.error) : words.error",
    to: "error: words.error",
    expect: "never storage's English",
  },
  {
    name: "Files: the shell gives the upload no words for the connection",
    file: FILES,
    from: "          offline: describe(new ApiError(0, null)).text,\n",
    to: "",
    expect: "never storage's English",
  },
  {
    name: "Files: an upload with no connection says the browser's English",
    file: FILES,
    from: '        say({ role: "tool", text: describe(err).text });',
    to: '        say({ role: "tool", text: getErrorMessage(err, t("uploadError")) });',
    expect: "no route's English is said to the reader",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 60_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
    };
  }
}

console.log("tool-shell mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git status`.",
);
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the gate is load-bearing.");
