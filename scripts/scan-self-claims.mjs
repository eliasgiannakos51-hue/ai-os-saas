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
 * A path written as an EXAMPLE rather than as a reference.
 *
 * "src/lib/X.ts alongside src/lib/a/X.ts" is a rule being stated, not a
 * file being named, and "src/fake.ts" is a fixture a gate invents to prove
 * it can go red. Both are single-letter or obviously-placeholder stems.
 */
const PLACEHOLDER = /\/(?:[A-Za-z]|fake|example|foo|bar)\.[a-z]{2,4}$/;

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

const findings = { paths: [], symbols: [] };
let pathClaims = 0;
let symbolClaims = 0;

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
  });
}

const report = {
  scanned: { code: CODE_FILES.length, markdown: MARKDOWN.length },
  claims: { paths: pathClaims, symbols: symbolClaims },
  wrong: { paths: findings.paths.length, symbols: findings.symbols.length },
  findings,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(
    `scanned ${report.scanned.code} source files and ${report.scanned.markdown} markdown files\n` +
      `${pathClaims} path claims, ${findings.paths.length} pointing at nothing\n` +
      `${symbolClaims} symbol claims, ${findings.symbols.length} naming something that is not declared\n`
  );
  for (const kind of ["paths", "symbols"]) {
    if (findings[kind].length === 0) continue;
    console.log(`== ${kind} (${findings[kind].length}) ==`);
    for (const f of findings[kind]) console.log(`  ${f.file}:${f.line}  ${f.claim}\n      ${f.text}`);
  }
}
