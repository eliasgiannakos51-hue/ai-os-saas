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
  const at = src.indexOf("options={[");
  const block = at < 0 ? "" : src.slice(at, src.indexOf("]}", at));
  // COUNTED BY KEY: every option is an element in the array, and React
  // needs each to carry a key, so the keys are the options.
  const options = (block.match(/\bkey="[^"]+"/g) ?? []).length;
  check(`${f}: ${options} options, at most four`, options <= 4 && (at < 0 || options >= 1), block.slice(0, 120));
  check(`${f}: nothing to type into but the shell's field`, !/<textarea\b|<input\b(?![^>]*type="checkbox")/.test(src));
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

const LOCALES = ["el", "en", "de", "fr", "es", "it", "pt", "ja", "zh", "ar"];
for (const l of LOCALES) {
  const m = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).dashboard?.toolShell ?? {};
  check(`${l}: the shell's words`, ["open", "isOpen", "back", "close"].every((k) => typeof m[k] === "string" && m[k]) &&
    ["done", "platforms", "copyAll", "copyOne"].every((k) => typeof m.posts?.[k] === "string" && m.posts[k]) && /\{count, plural/.test(m.posts?.done ?? ""));
}

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\n${failures.length} FAILED, ${pass} passed`);
process.exit(failures.length === 0 ? 0 : 1);
