// EVERY CLAUSE OF deep-links.test.mjs, BROKEN ON PURPOSE.
//
// The gate says "every deep link's parameter is read by its destination".
// That sentence is made of four separate mechanisms — the link scanner,
// the reader scanner, the route resolver and the import walk — and three
// of the four have already been wrong once each in this file's own
// history:
//
//   * the resolver shortened /dashboard/finance up to /dashboard, so all
//     thirteen module links were checked against the wrong page
//   * the reader scanner knew `.get()` and not `.has()`, so a real
//     reader was reported as absent
//   * the link scanner only looked under /dashboard, so /login and
//     /pricing were never checked at all
//
// Each of those was caught by reading the output, which is not a method.
// This is the method: mutate the tree, require the gate to go red, put
// the tree back.
//
// EVERY MUTATION IS A DELETION OR AN EDIT OF REAL CODE, never an
// `if (false)`. scripts/check-mutation-markers.mjs fails on that literal,
// so a mutation written that way is "caught" by the marker gate without
// any behavioural check having looked at it — which is a witness that
// proves nothing.
//
// Run: node scripts/tests/deep-links.mutation.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/deep-links.test.mjs";

function gateIsGreen() {
  try {
    execFileSync("node", [GATE], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// THE SIDECAR, and why this file has one.
//
// An earlier harness in this directory restored the tree in a `finally`.
// It ran past a timeout, was moved to the background, was killed — and
// `finally` never ran, leaving a mutant in src/lib/unsplash.ts. A restore
// that only exists inside the running process is a restore that a kill
// deletes. So the original text is written to disk BEFORE anything is
// touched, and healed on startup.
const SIDECAR = "scripts/tests/.deep-links-mutation-sidecar.json";
function healFromSidecar() {
  let saved;
  try {
    saved = JSON.parse(readFileSync(SIDECAR, "utf8"));
  } catch {
    return;
  }
  for (const [file, text] of Object.entries(saved)) writeFileSync(file, text);
  execFileSync("rm", ["-f", SIDECAR]);
  console.log(`healed ${Object.keys(saved).length} file(s) from a killed run\n`);
}
healFromSidecar();

const MUTATIONS = [
  {
    name: "a starred module record goes back to linking at the list",
    file: "src/lib/favoritable.ts",
    from: "hrefFor: (id) => `${moduleHref(m.slug)}?record=${encodeURIComponent(id)}`,",
    to: "hrefFor: () => moduleHref(m.slug),",
  },
  {
    name: "a starred plan goes back to linking at the list",
    file: "src/lib/favoritable.ts",
    from: "hrefFor: (id) => `/dashboard/mission?mission=${encodeURIComponent(id)}`,",
    to: 'hrefFor: () => "/dashboard/mission",',
  },
  {
    name: "the agents page stops reading ?agent=",
    file: "src/components/agents/agents-workspace.tsx",
    from: 'const requested = new URLSearchParams(window.location.search).get("agent");',
    to: "const requested = null;",
  },
  {
    name: "the module list stops reading ?record=",
    file: "src/components/modules/generic-list.tsx",
    from: 'const requestedRecordId = searchParams.get("record");',
    to: "const requestedRecordId = null;",
  },
  {
    name: "the plan list stops reading ?mission=",
    file: "src/components/mission/mission-list.tsx",
    from: 'const requested = new URLSearchParams(window.location.search).get("mission");',
    to: "const requested = null;",
  },
  {
    name: "the automation list stops reading ?automation=",
    file: "src/components/automation/automation-active-list.tsx",
    from: 'const requested = new URLSearchParams(window.location.search).get("automation");',
    to: "const requested = null;",
  },
  {
    name: "the ideas list stops reading ?record= (the one surface not on /dashboard/<slug>)",
    file: "src/components/ideas/ideas-list.tsx",
    from: 'const requested = new URLSearchParams(window.location.search).get("record");',
    to: "const requested = null;",
  },
  {
    name: "settings stops acknowledging a completed payment",
    file: "src/components/billing/checkout-notice.tsx",
    from: 'const value = new URLSearchParams(window.location.search).get("checkout");',
    to: "const value = null;",
  },
  {
    name: "login stops saying why an OAuth attempt failed",
    file: "src/app/login/login-form.tsx",
    from: 'if (params.has("error")) {',
    to: "if (params.has(String(Date.now()))) {",
  },
  {
    name: "a NEW deep link is added with nobody reading it",
    file: "src/components/overview/next-card.tsx",
    from: "export function NextCard({",
    to:
      'const UNREAD_LINK = "/dashboard/team?thereIsNoReaderForThis=1";\n' +
      "void UNREAD_LINK;\n" +
      "export function NextCard({",
  },
  // THE INSTRUMENT'S OWN CLAUSES. A gate whose scanners are broken
  // reports "all pass" over an empty set, and three of these four have
  // been wrong here before.
  {
    name: "the link scanner narrows back to /dashboard only",
    file: GATE,
    from: '/["\'`](\\/[a-zA-Z0-9\\-\\/\\[\\]$}{.]*?)\\?([a-zA-Z_][a-zA-Z0-9_]*)=/g',
    to: '/["\'`](\\/dashboard\\/[a-zA-Z0-9\\-\\/\\[\\]$}{.]*?)\\?([a-zA-Z_][a-zA-Z0-9_]*)=/g',
    // Narrowing the scan does not by itself make a link unread — it makes
    // the gate see FEWER links, which is the vacuity failure. The floor
    // in section 2 is what must catch it.
    expect: "the floor on how many links were found",
  },
  {
    name: "the reader scanner forgets .has() and knows only .get()",
    file: GATE,
    from: "/\\.(?:get|has)\\(\\s*[\"']([a-zA-Z_][a-zA-Z0-9_]*)[\"']\\s*\\)/g",
    to: "/\\.get\\(\\s*[\"']([a-zA-Z_][a-zA-Z0-9_]*)[\"']\\s*\\)/g",
  },
  {
    name: "the reader scanner forgets a server page's searchParams prop",
    file: GATE,
    from: "for (const m of stripped.matchAll(/searchParams\\s*:\\s*\\{([^}]*)\\}/g)) {",
    to: "for (const m of [].values()) {",
  },
  {
    name: "the resolver goes back to walking UP when no page matches",
    file: GATE,
    from: '    if (!seg.includes("${") && isDir(literal)) {\n      dir = literal;\n      continue;\n    }',
    to: '    if (!seg.includes("${") && isDir(literal)) {\n      dir = literal;\n      continue;\n    }\n    if (isFile(join(dir, "page.tsx"))) return join(dir, "page.tsx");',
  },
  {
    name: "comments stop being stripped, so prose about a link counts as a link",
    file: GATE,
    from: "  for (const m of stripComments(src).matchAll(",
    to: "  for (const m of String(src).matchAll(",
  },
];

console.log("deep-links mutations\n");
if (!gateIsGreen()) {
  console.log("baseline: the gate is RED on the unmutated tree — fix that first.");
  process.exit(1);
}
console.log("baseline: the gate is GREEN on the unmutated tree");

const originals = new Map();
let caught = 0;
const survivors = [];
// A STALE ANCHOR IS A FAILURE, NOT A NOTE — kept separate from the
// survivors because it is a different fact. A survivor means the gate
// cannot see a real regression; a missed anchor means this file never
// tried, and a suite that silently skips half its mutations reports the
// same "all caught" as one that ran them.
const missed = [];

for (const m of MUTATIONS) {
  const before = readFileSync(m.file, "utf8");
  if (!before.includes(m.from)) {
    missed.push(`${m.name} — ANCHOR NOT FOUND in ${m.file}; the mutation never applied`);
    continue;
  }
  if (before.split(m.from).length - 1 !== 1) {
    missed.push(`${m.name} — anchor appears more than once in ${m.file}, so the edit is ambiguous`);
    continue;
  }
  originals.set(m.file, before);
  writeFileSync(SIDECAR, JSON.stringify(Object.fromEntries(originals)));
  writeFileSync(m.file, before.replace(m.from, m.to));

  const red = !gateIsGreen();

  writeFileSync(m.file, before);
  originals.delete(m.file);
  execFileSync("rm", ["-f", SIDECAR]);

  if (red) {
    caught++;
    console.log(`  CAUGHT  ${m.name}${m.expect ? `\n          -> by ${m.expect}` : ""}`);
  } else {
    survivors.push(`${m.name} (${m.file}) — the gate stayed GREEN`);
    console.log(`  SURVIVED  ${m.name}`);
  }
}

console.log("");
if (!gateIsGreen()) {
  console.log("baseline: the gate is RED on the restored tree — a mutation was not put back.");
  process.exit(1);
}
console.log("baseline: the gate is green again on the restored tree\n");

console.log(`${caught} of ${MUTATIONS.length} mutations caught.`);
if (missed.length > 0) {
  console.log("\nMISSED ANCHORS (these mutations never ran):");
  for (const s of missed) console.log(`  - ${s}`);
}
if (survivors.length > 0) {
  console.log("\nSURVIVORS:");
  for (const s of survivors) console.log(`  - ${s}`);
}
if (missed.length > 0 || survivors.length > 0) process.exit(1);
console.log("Every clause of deep-links.test.mjs is load-bearing.");
