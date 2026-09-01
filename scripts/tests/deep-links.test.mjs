// A LINK IS AN AGREEMENT BETWEEN TWO FILES, AND ONLY ONE OF THEM WAS EVER WRITTEN.
//
// V4.6 #11.2 / #11.3. Two of the three reported bugs turned out to be the
// same bug wearing different clothes:
//
//   "I star something and press it and it takes me to a list."
//   "Create Studio says it made it, I press the link, and I see a list."
//
// Both are one shape: a URL carries an id, and nothing at the other end
// reads it. The browser does not complain. The page renders. Every test
// that checks "does the link exist" and every test that checks "does the
// page load" passes. The id is simply dropped, and what the reader sees
// is the newest row instead of theirs — which on a small account is
// indistinguishable from working.
//
// FOUND FOUR TIMES, FIXED ONCE. website-builder-workspace.tsx already
// carries the note: "the workspace never read it, so following a favorite
// landed on whichever project happened to be newest instead of the one
// that was starred". That was fixed for `?project=` and for nothing else.
// Measured on the tree before this file existed:
//
//   * `?record=`   — READ by generic-list.tsx since the provenance work,
//                    and lib/favoritable.ts still returned the bare
//                    module URL for all THIRTEEN module tables.
//   * `?agent=`    — EMITTED by use-create-studio.ts. Read by nothing,
//                    anywhere in the repository.
//   * mission      — no parameter at all: hrefFor ignored its argument
//                    and Create Studio linked to the list.
//   * automation   — the same.
//
// WHY "SOMEBODY READS IT" IS NOT THE CHECK. A grep for `get("agent")`
// finding a hit in an unrelated route would pass while the agents page
// still ignored it. The property that matters is that the parameter is
// read by code the DESTINATION PAGE actually loads, so this walks the
// import graph from the page the link points at (plus its layouts, which
// Next composes rather than imports) and looks for the reader there.
//
// Run: node scripts/tests/deep-links.test.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { reachableFrom } from "../lib/route-graph.mjs";
import { stripComments } from "../check-mutation-markers.mjs";
import { loadTs } from "./load-ts.mjs";

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

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p)) files.push(p);
  }
})("src");

// ---------------------------------------------------------------------
// THE TWO HALVES OF THE AGREEMENT, each as a function fed samples below.

/**
 * Every `/dashboard/...?param=` this source emits, as {path, param}.
 *
 * Both quoting styles, because a template literal is how an id gets into
 * a URL and a plain string is how a fixed one does. Comments are stripped
 * first — every other scan in this directory learned that the hard way,
 * and this file is largely ABOUT prose that describes a link.
 */
function linksInSource(src) {
  const out = [];
  // ANY internal path, not just /dashboard. The first version of this
  // scan only looked under /dashboard and would have missed
  // `/pricing?checkout=cancelled` and `/login?shared=1` — the same
  // agreement, on the pages a person meets before they have an account.
  for (const m of stripComments(src).matchAll(
    /["'`](\/[a-zA-Z0-9\-\/\[\]$}{.]*?)\?([a-zA-Z_][a-zA-Z0-9_]*)=/g
  )) {
    // A static asset is not a route. `/sw.js?build=` is a cache-buster on
    // a file the framework serves from public/, and there is no handler
    // anywhere that could read it.
    if (/\.(?:js|css|json|png|svg|webmanifest|txt|xml)$/.test(m[1])) continue;
    out.push({ path: m[1], param: m[2] });
  }
  return out;
}

/**
 * Every query parameter this source READS.
 *
 * Three forms, all of them in use in this repository and none of them
 * optional:
 *   1. `searchParams.get("x")`            — useSearchParams, client
 *   2. `new URLSearchParams(window.location.search).get("x")` — client,
 *      chosen deliberately in two places to avoid a Suspense boundary
 *   3. `searchParams: { x?: string }` / `searchParams.x` — a server page,
 *      where the framework parses the query and hands it over as a prop
 * A scan that knew only the first would have reported `?project=` as
 * unread, which is how this file's first draft got it wrong.
 */
function paramsReadIn(src) {
  const stripped = stripComments(src);
  const found = new Set();
  // `.get` AND `.has`. Leaving `.has` out is what made this file's first
  // run report `?share_error=` as unread: create-studio.tsx asks
  // `params.has("share_error")` — it only cares that the flag is there —
  // and a scan that knows one accessor and not the other reports a
  // perfectly good reader as absent. Two false alarms in a list of two
  // real findings is how a gate stops being read.
  for (const m of stripped.matchAll(/\.(?:get|has)\(\s*["']([a-zA-Z_][a-zA-Z0-9_]*)["']\s*\)/g)) {
    found.add(m[1]);
  }
  // The server-page shape: the TYPE of the searchParams prop is the
  // declaration of which parameters the page understands.
  for (const m of stripped.matchAll(/searchParams\s*:\s*\{([^}]*)\}/g)) {
    for (const k of m[1].matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\??\s*:/g)) found.add(k[1]);
  }
  for (const m of stripped.matchAll(/searchParams\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g)) {
    found.add(m[1]);
  }
  return found;
}

// ---------------------------------------------------------------------
console.log("== 0. the two scanners, fed samples they must get right ==");
check(
  "a template-literal deep link is found",
  JSON.stringify(linksInSource("href={`/dashboard/agents?agent=${id}`}")) ===
    JSON.stringify([{ path: "/dashboard/agents", param: "agent" }])
);
check(
  "...and a plain-string one",
  JSON.stringify(linksInSource('href="/dashboard/timeline?range=week"')) ===
    JSON.stringify([{ path: "/dashboard/timeline", param: "range" }])
);
check(
  "a link inside a comment is not a link",
  linksInSource('// href={`/dashboard/agents?agent=${id}`}\nconst x = 1;').length === 0
);
check(
  "...nor one in a block comment",
  linksInSource('/* /dashboard/agents?agent=1 */\nconst x = 1;').length === 0
);
check("a useSearchParams read is found", paramsReadIn('searchParams.get("record")').has("record"));
check(
  '...a `.has()` presence check, which is a read too',
  paramsReadIn('if (params.has("share_error")) { ... }').has("share_error")
);
check(
  "...a window.location one",
  paramsReadIn('new URLSearchParams(window.location.search).get("project")').has("project")
);
check(
  "...a server page's searchParams TYPE",
  paramsReadIn("searchParams: { module?: string; range?: string; view?: string };").has("range")
);
check(
  "...and a server page's property access",
  paramsReadIn('const view = searchParams.view === "fav" ? "fav" : "all";').has("view")
);
check(
  "a read inside a comment is not a read",
  !paramsReadIn('// searchParams.get("agent")\nconst x = 1;').has("agent")
);

// ---------------------------------------------------------------------
console.log("\n== 1. lib/favoritable.ts — every starrable surface, called for real ==");
// CALLED, NOT READ. hrefFor is a function per table; a scan of the source
// would report the shape of the code rather than the URL a user is sent
// to. loadTs runs the real module, so what is checked below is the actual
// string a star produces.
const { FAVORITABLE } = await loadTs("src/lib/favoritable.ts");
const SENTINEL = "11111111-2222-4333-8444-555555555555";
check(
  `every starrable surface was loaded (${FAVORITABLE.length})`,
  FAVORITABLE.length >= 15,
  `${FAVORITABLE.length} — a per-entry check over a short list proves little`
);
const favLinks = FAVORITABLE.map((f) => ({ slug: f.slug, table: f.table, href: f.hrefFor(SENTINEL) }));
const idless = favLinks.filter((l) => !l.href.includes(SENTINEL));
check(
  `every starred record's link carries its own id (${favLinks.length - idless.length}/${favLinks.length})`,
  idless.length === 0,
  idless.map((l) => `${l.slug} (${l.table}) -> ${l.href} — the id is dropped, so this opens the newest row, not the starred one`).join("\n        ")
);

// ---------------------------------------------------------------------
console.log("\n== 2. every deep link in the app, and the page that must read it ==");
// The emitters. Deduped by path+param: the same link written twice is one
// agreement, not two.
const emitted = new Map();
for (const file of files) {
  for (const { path, param } of linksInSource(readFileSync(file, "utf8"))) {
    const key = `${path}?${param}`;
    if (!emitted.has(key)) emitted.set(key, { path, param, from: [] });
    emitted.get(key).from.push(file);
  }
}
// ...plus the ones favoritable.ts BUILDS rather than writes, which no
// source scan can see.
for (const l of favLinks) {
  const u = l.href.split("?");
  if (u.length < 2) continue;
  const param = u[1].split("=")[0];
  const key = `${u[0]}?${param}`;
  if (!emitted.has(key)) emitted.set(key, { path: u[0], param, from: [] });
  emitted.get(key).from.push("src/lib/favoritable.ts (hrefFor)");
}
// A FLOOR AT THE MEASURED NUMBER, not at a small safe one.
//
// This was `>= 6`, and its own mutation suite is what showed that to be
// worthless: narrowing the link scanner back to /dashboard-only drops the
// count from 50 to 38 and the gate stayed GREEN, because a scanner that
// has stopped seeing a whole class of links still sees plenty. "Some
// links were found" is not the property — "the ones that exist were
// found" is, and the only honest floor for that is the count as measured.
//
// A RATCHET, so it may only go UP. Raise it in the same commit that adds
// the link. A drop means the scanner stopped seeing something, which is
// the one failure a per-link check cannot report: it never asks about a
// link it did not find.
const DEEP_LINK_FLOOR = 50;
check(
  `the app was scanned for deep links (${emitted.size} distinct, over ${files.length} files)`,
  emitted.size >= DEEP_LINK_FLOOR && files.length >= 300,
  `${emitted.size} links over ${files.length} files — below the floor of ${DEEP_LINK_FLOOR}, ` +
    "so the scanner is seeing less of the app than it did, and a per-link check cannot report a link it never found"
);

/**
 * The src/app file a URL resolves to, the way the framework resolves it:
 * a `page.tsx` for a screen, a `route.ts` for an endpoint.
 *
 * IT SHORTENED THE PATH AT FIRST, so /dashboard/finance — which has no
 * folder of its own — walked up and matched src/app/dashboard/page.tsx.
 * That is not a route: Next serves /dashboard/finance from the [module]
 * dynamic segment, and /dashboard is a different screen entirely. Every
 * one of the thirteen module links was then checked against the wrong
 * page, and all thirteen were reported unread while `?record=` was being
 * read perfectly well by the page they actually open.
 *
 * So it descends instead, one segment at a time, taking the literal
 * folder if there is one and otherwise a dynamic `[x]` folder at that
 * level — and returns null when neither exists, which is what a 404 is.
 * A segment written as `${id}` in a template literal is itself dynamic
 * and matches the same way.
 *
 * ENDPOINTS COUNT. A `/api/...?q=` in a fetch is the same agreement as a
 * `/dashboard/...?record=` in an href: one file writes the parameter and
 * another must read it. Resolving to route.ts as well as page.tsx means
 * the endpoints are held to it too, rather than being filtered out as
 * "not a link" — which is what the first draft did, and which would have
 * left seven of them unchecked.
 */
function pageFor(urlPath) {
  const segs = urlPath.replace(/^\//, "").split("/").filter(Boolean);
  let dir = "src/app";
  for (const seg of segs) {
    const literal = join(dir, seg);
    if (!seg.includes("${") && isDir(literal)) {
      dir = literal;
      continue;
    }
    const dynamic = readdirSync(dir).find((n) => /^\[.+\]$/.test(n) && isDir(join(dir, n)));
    if (!dynamic) return null;
    dir = join(dir, dynamic);
  }
  for (const leaf of ["page.tsx", "route.ts", "route.tsx"]) {
    const f = join(dir, leaf);
    if (isFile(f)) return f;
  }
  return null;
}

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function layoutChain(page) {
  const parts = page.split("/");
  const out = [];
  for (let i = 2; i < parts.length; i++) {
    const l = `${parts.slice(0, i).join("/")}/layout.tsx`;
    try {
      readFileSync(l, "utf8");
      out.push(l);
    } catch {
      /* no layout here */
    }
  }
  return out;
}

const unread = [];
let checked = 0;
for (const { path, param, from } of emitted.values()) {
  const page = pageFor(path);
  if (!page) {
    unread.push(`${path}?${param}= — no page resolves for this URL (linked from ${from[0]})`);
    continue;
  }
  const scope = [...reachableFrom([page, ...layoutChain(page)])];
  const reader = scope.find((f) => {
    try {
      return paramsReadIn(readFileSync(f, "utf8")).has(param);
    } catch {
      return false;
    }
  });
  checked++;
  if (reader) {
    console.log(`  ${path}?${param}=  ->  ${reader}`);
  } else {
    unread.push(
      `${path}?${param}= is emitted by ${from[0]} and read by NOTHING reachable from ${page} ` +
        `(${scope.length} modules walked)`
    );
  }
}
check(
  `every deep link's parameter is read by its destination (${checked} checked)`,
  unread.length === 0,
  unread.join("\n        ")
);

// ---------------------------------------------------------------------
console.log("\n== 3. the four that were broken, named individually ==");
// A COUNT CAN BE SATISFIED BY THE WRONG FOUR. These are the exact links
// the two bug reports were about, asserted by name so that removing one
// is a decision rather than a drift in a total.
function readsParamAt(urlPath, param) {
  const page = pageFor(urlPath);
  if (!page) return false;
  return [...reachableFrom([page, ...layoutChain(page)])].some((f) => {
    try {
      return paramsReadIn(readFileSync(f, "utf8")).has(param);
    } catch {
      return false;
    }
  });
}
check("a starred module record opens THAT record (?record=)", readsParamAt("/dashboard/finance", "record"));
check("a starred plan opens THAT plan (?mission=)", readsParamAt("/dashboard/mission", "mission"));
check("a built agent opens THAT agent (?agent=)", readsParamAt("/dashboard/agents", "agent"));
check("a new automation is marked in the list (?automation=)", readsParamAt("/dashboard/automation", "automation"));
check("a starred project still opens THAT project (?project=)", readsParamAt("/dashboard/website-builder", "project"));
check("a starred conversation still opens THAT one (?c=)", readsParamAt("/dashboard/chat", "c"));

// ---------------------------------------------------------------------
console.log("\n== 3b. the links Create Studio must EMIT ==");
// A READER WITH NOTHING TO READ IS NOT A WORKING LINK, and everything
// above only checks the receiving half. Delete the href from Create
// Studio's automation branch and every check in this file still passes:
// there is simply one fewer link in the census, and a census cannot
// miss what was never emitted.
//
// create-destination.mutation.mjs found this as a survivor — "the
// automation result loses its href", the gate stayed green — so the
// emitter is asserted here by name. Each of these four branches has an
// id in hand at the point it builds the result, and each of them threw
// it away before V4.6.
const studio = stripComments(readFileSync("src/lib/create-studio/use-create-studio.ts", "utf8"));
const EMITTED = [
  // NOT `?record=` HERE, and the first draft of this list looked for it
  // in the wrong file. A module entry's href is built by the JOB HANDLER
  // (jobs/handlers/create.ts, asserted separately below) and the studio
  // passes it through — so the property to hold HERE is that it passes
  // it through rather than replacing it with a URL of its own.
  ["a created module entry (the handler's href, passed through)", /href: data\.href \?\? null/],
  ["a planned mission", /\/dashboard\/mission\?mission=\$\{/],
  ["a scheduled automation", /\/dashboard\/automation\?automation=\$\{/],
  ["a built agent", /\/dashboard\/agents\?agent=\$\{/],
  ["a generated website", /\/dashboard\/website-builder\?project=\$\{/],
];
for (const [what, re] of EMITTED) {
  check(`Create Studio sends you to ${what}, by id`, re.test(studio), `${re} not found`);
}
// AND THE MODULE ENTRY'S ID COMES FROM THE INSERTED ROW, not from
// anywhere else — the job handler had it in hand and returned
// moduleHref(slug) without it.
const createHandler = stripComments(readFileSync("src/lib/jobs/handlers/create.ts", "utf8"));
check(
  "the create job returns the row's own id in the href",
  /\?record=\$\{encodeURIComponent\(insertedId\)\}/.test(createHandler),
  "jobs/handlers/create.ts is back to returning a bare module URL"
);

// AND THE CHECK CAN GO RED. A parameter nobody has ever written must not
// resolve — otherwise every line above passes for the wrong reason.
check(
  "a parameter no page reads is reported as unread",
  !readsParamAt("/dashboard/agents", "thisParameterDoesNotExist")
);
// AND THE RESOLVER ITSELF, both directions. A resolver that answered
// "src/app/dashboard/page.tsx" for everything would make every check
// above green against the wrong file — which is exactly what its first
// version did.
check(
  "a module URL resolves through the [module] segment, not up to /dashboard",
  pageFor("/dashboard/finance") === "src/app/dashboard/[module]/page.tsx",
  String(pageFor("/dashboard/finance"))
);
check(
  "a static route still wins over the dynamic one",
  pageFor("/dashboard/agents") === "src/app/dashboard/agents/page.tsx",
  String(pageFor("/dashboard/agents"))
);
check(
  "and a URL no page serves resolves to nothing",
  pageFor("/there-is-no-such-section/at-all") === null,
  String(pageFor("/there-is-no-such-section/at-all"))
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
