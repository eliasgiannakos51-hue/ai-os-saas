#!/usr/bin/env node
/*
 * ONE <main> PER PAGE, AND EVERY PAGE HAS ONE.
 *
 * THE DEFECT. routes-smoke.prodtest.mjs measured /dashboard/coding in a
 * real browser and found ZERO <main> elements. The dashboard layout
 * provided none; twenty-six pages rendered their own, four components
 * rendered one each, and thirteen pages had none at all — so whether a
 * screen reader's "skip to main content" had anywhere to land depended
 * on which page you were on.
 *
 * I ALSO GOT THE SIZE OF IT WRONG THE FIRST TIME. I reported "31 of 39
 * pages" from a static check that asked whether a page IMPORTS a
 * component known to render <main>. Most pages render the tag inline, so
 * the real number was 13 of 39. The measured page was still zero; the
 * estimate around it was not.
 *
 * THE FIX IS IN THE LAYOUT, which is what makes it true for all 39
 * instead of 8 — and the tag had to come OUT of the twenty-six pages and
 * five components at the same time, because a <main> inside a <main> is
 * invalid HTML and two landmarks are worse than one in the wrong place.
 *
 * Run: node scripts/tests/landmarks.test.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (typeof cond !== "boolean") {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        check() takes a BOOLEAN; got ${Array.isArray(cond) ? "an array" : typeof cond}`);
    return;
  }
  if (cond) pass++;
  else { failures.push(name); console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`); }
}
const read = (p) => readFileSync(p, "utf8");
// A <main> inside a comment or a string is not a landmark.
const stripped = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");
const mains = (src) => (stripped(src).match(/<main[\s>]/g) ?? []).length;

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(p)) out.push(p);
  }
  return out;
};

console.log("== 1. the dashboard has exactly one landmark, and it is the layout's ==");
{
  const dashFiles = walk("src/app/dashboard");
  check(`the dashboard tree was scanned (${dashFiles.length} files)`, dashFiles.length >= 40,
    "an empty scan makes every check below vacuous");

  const layout = "src/app/dashboard/layout.tsx";
  check("the layout renders a <main>", mains(read(layout)) === 1, String(mains(read(layout))));
  check("...with an id a skip link can target",
    /<main id="main-content"/.test(read(layout)),
    "a landmark with no id is a landmark no anchor can reach");
  check("...wrapping the page body, not the sidebar or the top bar",
    /<main id="main-content"[^>]*>\s*\n?\s*<PageTransition>\{children\}<\/PageTransition>/.test(read(layout)),
    "a <main> around the chrome tells a screen reader the nav is the content");

  const others = dashFiles.filter((f) => f !== layout && mains(read(f)) > 0);
  check("no other file under /dashboard renders one", others.length === 0,
    `these would nest inside the layout's: ${others.join(", ")}`);
}

console.log("== 2. nor do the components those pages render ==");
{
  // Every component a dashboard page can reach. Named rather than
  // guessed: these four each had one, and each was inside the layout.
  const WERE = [
    "src/components/dashboard/route-skeleton.tsx",
    "src/components/modules/build-module-page.tsx",
    "src/components/documents/document-editor.tsx",
    "src/components/chat/chat-workspace.tsx",
  ];
  for (const f of WERE) {
    check(`${f.split("/").pop()} no longer renders its own`, mains(read(f)) === 0, String(mains(read(f))));
  }
  // The wider sweep, so a NEW component cannot reintroduce one.
  // THE FLOOR: a walk that finds no files agrees with any rule at all.
  const allShared = walk("src/components");
  check(`the component tree was walked (${allShared.length} files)`, allShared.length >= 100,
    "an empty walk makes the check below vacuous");
  const shared = allShared.filter((f) => mains(read(f)) > 0);
  check(`...and some component does render a landmark (${shared.length})`, shared.length >= 1,
    "if this is 0 the mains() detector has stopped matching and the check below is inspecting nothing");
  // The pages OUTSIDE the dashboard have their own layouts and must keep
  // theirs — those are the only legitimate holders.
  const ALLOWED = new Set(["src/components/legal/legal-layout.tsx", "src/components/loading-state.tsx"]);
  const unexpected = shared.filter((f) => !ALLOWED.has(f));
  check("no shared component renders a <main> without being on the list",
    unexpected.length === 0, unexpected.join(", "));
  const stale = [...ALLOWED].filter((f) => mains(read(f)) === 0);
  check("...and the list has no entry that no longer holds one", stale.length === 0, stale.join(", "));
}

console.log("== 3. the public pages still have theirs ==");
{
  // The fix must not have taken the landmark AWAY from the marketing and
  // auth pages, which are outside the dashboard layout entirely.
  const publicPages = walk("src/app").filter(
    (f) => /\/page\.tsx$/.test(f) && !f.startsWith(path.join("src", "app", "dashboard"))
  );
  check(`public pages were found (${publicPages.length})`, publicPages.length >= 10);
  // Each either renders one itself or is wrapped by a layout that does.
  const withMain = publicPages.filter((f) => mains(read(f)) > 0);
  check(`some public page renders a landmark (${withMain.length})`, withMain.length >= 1,
    "if this is 0, the sweep took the landmark off the marketing site too");
}

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
