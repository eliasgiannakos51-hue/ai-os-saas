#!/usr/bin/env node
/*
 * IS WHAT THE CODE SAYS ABOUT ITSELF TRUE?
 *
 * This repository's comments are unusually load-bearing. They name the
 * file that does the other half, the route that reads the column, the
 * function that was the fix, the number of things a check covers. That is
 * what makes them worth reading — and it is exactly why a wrong one is
 * expensive: a reader who follows a path that does not exist stops
 * trusting the ones that do, and a reader who believes "the output is
 * scanned before it reaches a user" ships without wiring the scan.
 *
 * Every defect this session found in its own instruments was this shape:
 *
 *   · offline/page.tsx said the locale "lives behind a request this page
 *     exists precisely because it failed". It does not — the page is
 *     fetched once, over the network, at service-worker install.
 *   · i18n-coverage's header said "86 of these still ship" when 160 did.
 *   · trading/conduct.ts described three layers of defence; only one was
 *     running, because nothing calls the other two.
 *   · README said two cron jobs were unscheduled; both were in
 *     vercel.json.
 *
 * WHAT IS CHECKABLE, and this file only reports what is:
 *
 *   PATH    a comment or a markdown line naming a file. Either it is there
 *           or it is not. No judgement, no false positives that are not a
 *           real typo.
 *   SYMBOL  a comment naming a function or constant with a call or a
 *           SCREAMING_CASE shape. Either the identifier is declared
 *           somewhere in the tree or the comment is describing something
 *           that no longer exists.
 *
 * WHAT IS NOT, and is deliberately absent rather than approximated: "this
 * covers every X", "the 22 aria-labels", "faster than". A scanner that
 * guessed at those would produce a list nobody reads, and a list nobody
 * reads is how a baseline gets set to the size of the problem.
 *
 * Run: node scripts/scan-self-claims.mjs [--json]
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src", "scripts", "supabase", "messages", "public", "docs"];
const DOC_FILES = ["README.md", "SECURITY.md", "CLAUDE.md", "CONTRIBUTING.md"];

function walk(dir, exts) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === ".git") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((x) => p.endsWith(x))) out.push(p);
  }
  return out;
}

const CODE_FILES = [
  ...walk("src", [".ts", ".tsx"]),
  ...walk("scripts", [".mjs", ".js"]),
  ...walk("supabase", [".sql"]),
];
const MARKDOWN = [...DOC_FILES.filter(existsSync), ...walk("docs", [".md"])];

/** Every comment in a source file, as {line, text}. */
function commentsOf(file) {
  const src = readFileSync(file, "utf8");
  const out = [];
  const lines = src.split("\n");
  if (file.endsWith(".sql")) {
    lines.forEach((l, i) => {
      const at = l.indexOf("--");
      if (at >= 0) out.push({ line: i + 1, text: l.slice(at + 2) });
    });
    return out;
  }
  let inBlock = false;
  lines.forEach((l, i) => {
    if (inBlock) {
      out.push({ line: i + 1, text: l.replace(/^\s*\*?/, "") });
      if (l.includes("*/")) inBlock = false;
      return;
    }
    const block = l.indexOf("/*");
    const line = l.indexOf("//");
    if (block >= 0 && !l.slice(block).includes("*/")) {
      inBlock = true;
      out.push({ line: i + 1, text: l.slice(block + 2) });
      return;
    }
    if (block >= 0) {
      out.push({ line: i + 1, text: l.slice(block + 2, l.indexOf("*/")) });
      return;
    }
    // Not a URL's "//" and not inside a string that looks like one.
    if (line >= 0 && !/https?:$/.test(l.slice(0, line))) {
      out.push({ line: i + 1, text: l.slice(line + 2) });
    }
  });
  return out;
}

// A path this repository would actually contain. Anchored at a known root
// so ordinary prose ("and/or", "read/write") cannot look like one, and
// required to carry an extension so a bare directory reference is not
// treated as a file that must exist.
const PATH_RE =
  /\b((?:src|scripts|supabase|messages|public|docs|app|lib|components|types|\.github)\/[A-Za-z0-9_./[\]@-]*\.[a-z]{2,4})\b/g;

/**
 * Resolve a path written in a comment against the roots it could be under.
 *
 * SHORTHAND IS THE NORM HERE, and refusing to resolve it would make this
 * scan a list of style complaints rather than of wrong statements: comments
 * write "lib/timeline.ts" for src/lib/timeline.ts, "components/pwa/
 * install-invitation.tsx" for the one under src/components/, and a sibling
 * by its bare name. All three are unambiguous, so all three resolve.
 */
function resolvePath(raw, fromFile) {
  const cleaned = raw.replace(/[.,)]+$/, "");
  const dir = fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : ".";
  const candidates = [
    cleaned,
    `src/${cleaned}`,
    `src/app/${cleaned}`,
    cleaned.replace(/^app\//, "src/app/"),
    cleaned.replace(/^lib\//, "src/lib/"),
    cleaned.replace(/^components\//, "src/components/"),
    cleaned.replace(/^types\//, "src/types/"),
    // Relative to the file doing the naming, and to its parent — a suite
    // under scripts/tests/ that names sidecar-write.mjs by its own lib/
    // prefix means the one beside it, not a top-level directory. (The
    // shorthand is not spelled out here: this scanner reads its own
    // comments, and an example path would be a claim it then failed.)
    join(dir, cleaned),
    join(dir, "..", cleaned),
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
}

/**
 * A claim that the file is GONE is not a claim that it is there.
 *
 * This repository names what a module replaced — "RENAMED FROM
 * lib/admin.ts", "THIS REPLACED lib/publishing/owner-tier.ts" — and a gate
 * that asserts a path does NOT exist quotes it too. Reading those as wrong
 * would punish exactly the comments that are most careful.
 */
const ABSENCE =
  /renamed from|used to|no longer|was called|was the|was a |there was|replaced|deleted|removed|do(?:es)? not exist|!existsSync|there is no|instead of|invented|deliberately contain|the wrong gate|briefly exported/i;

/**
 * Absence, as a ROUTE claim spells it. Kept separate from ABSENCE rather
 * than folded into it: "404" and "has never existed" are things one says
 * about a URL, and widening the shared list would loosen the path scan
 * that is held at zero.
 */
const ROUTE_ABSENCE = /never existed|404|goes to|not\s+\/|NOT\s+\/|\bwas\b/;

/**
 * A path written as an EXAMPLE rather than as a reference.
 *
 * "src/lib/X.ts alongside src/lib/a/X.ts" is a rule being stated, not a
 * file being named, and "src/fake.ts" is a fixture a gate invents to prove
 * it can go red. Both are single-letter or obviously-placeholder stems.
 */
const PLACEHOLDER = /\/(?:[A-Za-z]|fake|example|foo|bar)\.[a-z]{2,4}$/;

/**
 * A ROUTE, WHICH PATH_RE CANNOT SEE.
 *
 * PATH_RE requires a file extension, deliberately, so that a bare
 * directory reference is not read as a missing file. The cost of that
 * rule was invisible until it was measured: 463 route claims in this
 * repository's prose, checked by nothing. Two of them named a page that
 * has never existed, `/dashboard/business` — one of them in
 * lib/sidebar-nav.ts, forty-eight lines above the same file naming the
 * real hub correctly.
 *
 * A route is written here as it is typed into a browser, so the matcher
 * is anchored on the three roots this app actually serves and requires a
 * second segment: `/api` or `/dashboard` alone is a word, not a claim.
 */
const ROUTE_RE = /(?:^|[\s(`"'*|>])((?:\/api|\/dashboard|\/auth)\/[a-z0-9\-[\]/_.]*[a-z0-9\]])/g;

/**
 * VALUES A DYNAMIC SEGMENT IS ALLOWED TO TAKE.
 *
 * `src/app/dashboard/[module]/page.tsx` answers for twelve slugs and
 * calls notFound() for everything else, so `/dashboard/finance` is a real
 * page and `/dashboard/business` is a 404 — and to a resolver that simply
 * lets `[module]` swallow any segment, the two are identical. That
 * resolver would have reported both of the wrong comments as fine.
 *
 * Only paths with a KNOWN registry are listed. A dynamic segment with no
 * entry here absorbs its value unchecked, which is the honest behaviour:
 * `[id]` under api/websites is a uuid nothing can enumerate, and refusing
 * it would make this scan a list of complaints about uuids.
 */
const DYNAMIC_VALUES = {
  "src/app/dashboard/[module]": () =>
    [...readFileSync("src/lib/modules.ts", "utf8").matchAll(/slug: "([a-z-]+)"/g)].map((m) => m[1]),
};

/**
 * ROUTES THIS APP DOES NOT SERVE AND CORRECTLY NAMES ANYWAY.
 *
 * Supabase's own HTTP surface is reached by URL, so the gates and the
 * mock server name `/auth/v1/user` and `/rest/v1/...` exactly as they
 * would name one of ours. They resolve to nothing under src/app for the
 * best possible reason. Listed with the owner rather than pattern-matched
 * away, so a future `/auth/...` route of OURS cannot hide behind them.
 */
const EXTERNAL_ROUTES = [
  { prefix: "/auth/v1", owner: "Supabase GoTrue — scripts/lib/mock-supabase.mjs speaks it" },
  { prefix: "/rest/v1", owner: "Supabase PostgREST" },
  { prefix: "/storage/v1", owner: "Supabase Storage" },
];

/** `/api/x`, `/api/n`, `/api/websites/.../submit-form` — a shape being
 *  stated, not a route being named. Same treatment PLACEHOLDER gives a
 *  single-letter file stem, and for the same reason. */
const ROUTE_PLACEHOLDER = /\/(?:[a-z]|\.\.\.)(?:\/|$)|\.\.\./;

/**
 * Resolve a route against the app router, the way Next.js does.
 *
 * Returns the file that would answer it, the string "namespace" when the
 * route is a prefix of a real tree (`/api/cron`, which serves nothing
 * itself and eight children), or null.
 */
export function resolveRoute(raw) {
  const clean = raw.replace(/[.,)]+$/, "").replace(/\/(?:route|page)\.tsx?$/, "").replace(/\/+$/, "");
  const segments = clean.split("/").filter(Boolean);
  let dir = "src/app";
  for (const seg of segments) {
    if (existsSync(join(dir, seg))) {
      dir = join(dir, seg);
      continue;
    }
    // A ROUTE GROUP IS TRANSPARENT to the URL, so `(marketing)/pricing`
    // answers `/pricing`. Searched before the dynamic segment: a literal
    // inside a group is a better match than a catch-all.
    const groups = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^\(.+\)$/.test(e.name))
      .map((e) => e.name);
    const viaGroup = groups.find((g) => existsSync(join(dir, g, seg)));
    if (viaGroup) {
      dir = join(dir, viaGroup, seg);
      continue;
    }
    const dynamic = readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^\[.*\]$/.test(e.name))
      .map((e) => e.name)[0];
    if (!dynamic) return null;
    const registry = DYNAMIC_VALUES[join(dir, dynamic)];
    if (registry && !registry().includes(seg)) return null;
    dir = join(dir, dynamic);
  }
  for (const leaf of ["route.ts", "route.tsx", "page.tsx", "page.ts"]) {
    if (existsSync(join(dir, leaf))) return join(dir, leaf);
  }
  return hasChildRoute(dir) ? "namespace" : null;
}

/**
 * Does anything below this directory answer a URL?
 *
 * WHAT ITS FALSE BRANCH IS WORTH, MEASURED RATHER THAN ASSUMED: zero of
 * the directories under src/app today lack a route or page somewhere
 * beneath them, so `resolveRoute` cannot currently reach the `: null` of
 * the line above. The guard is kept because an empty directory is a
 * normal thing for a refactor to leave behind and a resolver that blessed
 * it would report an invented route as a namespace — but it is exercised
 * HERE, on real directories, rather than through a caller that cannot
 * reach it. A mutation aimed at the ternary was a hole in this suite for
 * exactly that reason, and is recorded in self-claims.mutation.mjs.
 */
export function hasChildRoute(d, depth = 0) {
  if (depth > 3 || !existsSync(d)) return false;
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (!e.isDirectory()) {
      if (/^(route|page)\.tsx?$/.test(e.name)) return true;
      continue;
    }
    if (hasChildRoute(join(d, e.name), depth + 1)) return true;
  }
  return false;
}

// A symbol a comment names as code: a call, or a SCREAMING_SNAKE constant.
// Both shapes are unambiguous enough that a hit is a claim rather than a
// coincidence of English.
const CALL_RE = /\b([a-z][A-Za-z0-9]{3,})\(\)/g;
const CONST_RE = /\b([A-Z][A-Z0-9]{2,}(?:_[A-Z0-9]+)+)\b/g;

// THE CORPUS IS WIDER THAN src/. An env var is never "declared" anywhere —
// it is READ, as process.env.X — and the ones a comment names most often
// (ANTHROPIC_API_KEY, RESEND_FROM_EMAIL, NEXT_LOCALE) live in
// .env.local.example, vercel.json and the service worker rather than in a
// TypeScript file. The first version of this scan reported 184 undeclared
// symbols of which 150 were env vars, which is a scanner producing a list
// about itself.
const CORPUS = [
  ...CODE_FILES,
  ...["\u002eenv.local.example", "vercel.json", "package.json"].filter(existsSync),
  ...walk("public", [".js", ".json", ".webmanifest"]),
];
const allSource = CORPUS.map((f) => readFileSync(f, "utf8")).join("\n");
/**
 * Does this name exist anywhere in the system?
 *
 * Declared as an identifier, read out of the environment, or written as a
 * literal — a cookie name, a Postgres setting, an env key in an example
 * file. All three are "the thing the comment names is real"; only the
 * absence of all three is a comment describing something that is not there.
 */
const declared = (name) =>
  new RegExp(
    `(?:function|const|let|var|class|type|interface|enum)\\s+${name}\\b` +
      `|${name}\\s*[:=]\\s*(?:\\(|function|async|\\{|\\[)` +
      `|\\b${name}\\s*\\(` +
      `|(?:process\\.)?env\\.${name}\\b|env\\[["']${name}["']\\]` +
      `|["'\`]${name}["'\`]` +
      `|^${name}=`,
    "m"
  ).test(allSource);

// Words that LOOK like a call in prose but are not this repo's code:
// browser and platform APIs a comment legitimately names.
const PLATFORM = new Set([
  "getUser", "getSession", "createClient", "revalidatePath", "notFound", "redirect",
  "fetch", "then", "catch", "trim", "test", "exec", "join", "split", "slice",
]);

const findings = { paths: [], routes: [], symbols: [] };
let pathClaims = 0;
let routeClaims = 0;
let symbolClaims = 0;

/**
 * How far from a route an absence phrase may sit and still be about it.
 *
 * THE PATH SCAN USES A THREE-COMMENT WINDOW, and copying that here made
 * this scan miss the second half of the defect it was written for.
 * module-icons.ts says
 *
 *   "The hub at /dashboard/business — one row in place of the nineteen
 *    log modules the sidebar used to list"
 *
 * and "used to list" governs the NINETEEN MODULES, not the route. A
 * window wide enough to see it suppressed a wrong route claim on the
 * strength of a past tense about something else — the scan reported four
 * findings where there were five, and the one it dropped was real.
 *
 * Forty characters is measured, not chosen: the three legitimate absence
 * claims in this repository put their marker directly against the route
 * ("NOT /dashboard/ideas", "`/dashboard/business`, a page that has never
 * existed"), and the false one is sixty characters away.
 */
const ROUTE_ABSENCE_RADIUS = 40;

/**
 * Is the absence phrase near this route ABOUT this route?
 *
 * THE WINDOW IS THE JOINED COMMENT BLOCK, NOT THE LINE. A `//` comment is
 * one entry per line, so a marker in the sentence's first line and a
 * route in its second are forty characters apart in the paragraph and
 * infinitely far apart line by line. Reading them line by line made this
 * scan report four corrections it should have passed.
 *
 * indexOf finds the FIRST occurrence of the route in the block. A block
 * naming the same route twice, once with a marker and once without, is
 * therefore judged on the first — which is the safe direction: it can
 * only suppress, and every suppression here is a claim held at zero
 * somewhere else in the table.
 */
export function routeAbsenceSuppresses(context, claim) {
  const idx = context.indexOf(claim);
  const nearby =
    idx >= 0
      ? context.slice(
          Math.max(0, idx - ROUTE_ABSENCE_RADIUS),
          idx + claim.length + ROUTE_ABSENCE_RADIUS
        )
      : context;
  return ABSENCE.test(nearby) || ROUTE_ABSENCE.test(nearby);
}

/** One route claim, checked. Shared by the source and markdown passes so
 *  the two cannot drift into applying different rules. */
function checkRoute(claim, context, file, line, text) {
  routeClaims++;
  if (ROUTE_PLACEHOLDER.test(claim)) return;
  if (EXTERNAL_ROUTES.some((e) => claim === e.prefix || claim.startsWith(e.prefix + "/"))) return;
  if (routeAbsenceSuppresses(context, claim)) return;
  if (resolveRoute(claim)) return;
  findings.routes.push({ file, line, claim, text: text.trim().slice(0, 100) });
}

/**
 * The scan itself, behind a guard so this file can be IMPORTED.
 *
 * self-claims.test.mjs asks resolveRoute() about routes whose answers are
 * known — the positive control that stops a permissive resolver from
 * emptying the whole section — and importing a module that scans 1,500
 * files and prints a report on sight would put that report in the middle
 * of the gate's output.
 */
function runScan() {
for (const file of CODE_FILES) {
  const comments = commentsOf(file);
  // A WINDOW, NOT A LINE. "The edit used to charge a size-based heuristic
  // (lib/website-edit-cost.ts)" wraps across two lines, and reading one at
  // a time turned a correct past-tense comment into a wrong reference.
  const near = (i) => comments.slice(Math.max(0, i - 3), i + 3).map((c) => c.text).join(" ");
  comments.forEach(({ line, text }, i) => {
    for (const m of text.matchAll(PATH_RE)) {
      pathClaims++;
      if (PLACEHOLDER.test(m[1])) continue;
      if (ABSENCE.test(near(i))) continue;
      if (!resolvePath(m[1], file)) findings.paths.push({ file, line, claim: m[1], text: text.trim().slice(0, 100) });
    }
    for (const m of text.matchAll(ROUTE_RE)) checkRoute(m[1], near(i), file, line, text);
    for (const re of [CALL_RE, CONST_RE]) {
      for (const m of text.matchAll(re)) {
        const name = m[1];
        if (PLATFORM.has(name)) continue;
        symbolClaims++;
        if (ABSENCE.test(near(i))) continue;
        if (!declared(name)) findings.symbols.push({ file, line, claim: name, text: text.trim().slice(0, 100) });
      }
    }
  });
}

for (const file of MARKDOWN) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((text, i) => {
    for (const m of text.matchAll(PATH_RE)) {
      pathClaims++;
      if (PLACEHOLDER.test(m[1])) continue;
      if (ABSENCE.test(lines.slice(Math.max(0, i - 3), i + 3).join(" "))) continue;
      if (!resolvePath(m[1], file)) findings.paths.push({ file, line: i + 1, claim: m[1], text: text.trim().slice(0, 100) });
    }
    const window = lines.slice(Math.max(0, i - 3), i + 3).join(" ");
    for (const m of text.matchAll(ROUTE_RE)) checkRoute(m[1], window, file, i + 1, text);
  });
}

}

function printReport() {
const report = {
  scanned: { code: CODE_FILES.length, markdown: MARKDOWN.length },
  claims: { paths: pathClaims, routes: routeClaims, symbols: symbolClaims },
  wrong: {
    paths: findings.paths.length,
    routes: findings.routes.length,
    symbols: findings.symbols.length,
  },
  findings,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    `scanned ${report.scanned.code} source files and ${report.scanned.markdown} markdown files\n` +
      `${pathClaims} path claims, ${findings.paths.length} pointing at nothing\n` +
      `${routeClaims} route claims, ${findings.routes.length} the app router would not answer\n` +
      `${symbolClaims} symbol claims, ${findings.symbols.length} naming something that is not declared\n`
  );
  for (const kind of ["paths", "routes", "symbols"]) {
    if (findings[kind].length === 0) continue;
    console.log(`== ${kind} (${findings[kind].length}) ==`);
    for (const f of findings[kind]) console.log(`  ${f.file}:${f.line}  ${f.claim}\n      ${f.text}`);
  }
}
}

if (process.argv[1] && process.argv[1].endsWith("scan-self-claims.mjs")) {
  runScan();
  printReport();
}
