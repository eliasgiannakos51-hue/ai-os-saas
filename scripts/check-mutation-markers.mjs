// A MUTATION LEFT BEHIND LOOKS EXACTLY LIKE A DELIBERATE SIMPLIFICATION.
//
// WHAT HAPPENED. `npm run test:mutation` was killed by a ten-minute timeout
// part-way through, and the suite it was running never restored its file.
// What it left in src/lib/website-multipage.ts was:
//
//     const complete = segments.filter((s) => {
//   -    if (looksLikeCompleteHtmlDocument(s.html)) return true;
//   +    if (true) return true;
//
// Every generated page passes the completeness check, so a truncated page —
// the exact defect that guard exists for — would have shipped as a website.
// It was caught by reading `git status` before committing. That is a habit,
// not a mechanism, and it had already failed once before.
//
// WHAT IS CHECKED, and why these three and not more:
//
//   `if (true)` / `if (false)`   the shape a defanged guard takes, and what
//                                the stranded mutation actually was.
//   `/(?!)/`                     the never-match regular expression the
//                                mutation suites use to make a scan find
//                                nothing.
//   `no-unreachable`             the disable comment a mutant needs after
//                                replacing a body with `continue;`.
//
// Each one was MEASURED at zero occurrences in src/, supabase/ and the gate
// files before this was written. A rule with false positives is a rule
// people learn to pass with --no-verify.
//
// WHAT IS NOT CHECKED, deliberately: "a grant where a revoke belongs". Five
// migrations grant to anon on purpose — help_articles is a published table —
// so that rule would fire on correct code from the first day. The property
// it stands for is already held, behaviourally, by the anon-grant migration
// and its gate, which read the DATABASE rather than the text.
//
// COMMENTS ARE NOT CODE. voice.test.mjs explains `if (false)` in prose, and
// a scan that could not tell the difference would fail the build over a
// sentence.
//
// Run: node scripts/check-mutation-markers.mjs [--staged]
import { readFileSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

/** The markers, with the incident or mutation shape each one stands for. */
export const MARKERS = [
  {
    id: "if-true",
    pattern: /\bif\s*\(\s*true\s*\)/,
    why: "a guard defanged to always pass — this is what the stranded mutation was",
  },
  {
    id: "if-false",
    pattern: /\bif\s*\(\s*false\s*\)/,
    why: "a branch switched off, so whatever it protected never runs",
  },
  {
    id: "never-match",
    pattern: /\/\(\?!\)\//,
    why: "a regular expression that matches nothing, so its scan finds nothing",
  },
  {
    id: "unreachable",
    pattern: /eslint-disable-next-line\s+no-unreachable/,
    why: "the disable a mutant needs after replacing a body with `continue`",
    // THIS ONE IS ONLY EVER A COMMENT, so it has to be read before comments
    // are stripped. Written without this flag it could never match anything,
    // and scripts/tests/mutation-markers.test.mjs said so on its first run.
    inComments: true,
  },
];

/** Directories worth scanning, and the reason each is in or out. */
export const SCANNED = ["src", "supabase", "scripts"];

/**
 * Files exempt, each with a claim that is checked by the gate.
 *
 * `*.mutation.mjs` is the only real exemption: those files carry every
 * marker as DATA — the `to:` string of a mutant is literally `if (true)`.
 * Scanning them would make the guard fire on the very suites that exist to
 * put the markers in and take them out again.
 */
export const EXEMPT = [
  {
    match: /\.mutation\.mjs$/,
    why: "a mutant's `to:` string is literally `if (true)` — these files exist to put the markers in and take them out again",
  },
  {
    match: /scripts\/check-mutation-markers\.mjs$/,
    why: "this file DECLARES the patterns; it is the dictionary, not a sentence written in the language",
  },
  {
    match: /scripts\/tests\/mutation-markers\.test\.mjs$/,
    why: "it feeds every marker to the checker as a sample, which is the only way to prove the checker can go red",
  },
  {
    match: /scripts\/tests\/unguarded-guards\.mjs$/,
    why: "same reason as *.mutation.mjs — it carries `if (false)` as the `to:` of a mutant. It is NOT named *.mutation.mjs on purpose: at ~100 seconds per guard it is a deliberate diagnostic, not part of the sweep",
  },
];
export const isExempt = (file) =>
  EXEMPT.some((e) => e.match.test(file.split("\\").join("/")));

/** Source with comments blanked, so prose about a marker is not a marker. */
/**
 * Comments out, CODE INTACT — including the code that contains "//".
 *
 * THE BUG THIS REPLACES, found 2026-09-19 and measured: the old version
 * was `line.replace(/\/\/.*$/, "")`, which truncates a line at the first
 * `//` wherever it appears. Inside a string literal that is not a
 * comment, and 68 lines under src/ are exactly that. Among them:
 *
 *     app/auth/callback/route.ts:37
 *       rawNext.startsWith("/") && !rawNext.startsWith("//")
 *     components/jobs/resumed-work-notice.tsx:131
 *       href.startsWith("/") && !href.startsWith("//")
 *     api/push/subscribe/route.ts:33
 *       if (!endpoint.startsWith("https://") || ...) return null;
 *
 * The first two are the open-redirect guard — the check that stops
 * `//evil.com` being treated as a local path — and this function deleted
 * it, plus the rest of the line, before handing the "source" to any of
 * the 99 files that import it. A gate asserting that guard is present
 * goes RED, which is loud and gets fixed; a gate asserting that
 * something is ABSENT sees a shorter file and passes on less evidence
 * than it thinks it has. That second direction is silent, and it is the
 * one this repository keeps being bitten by.
 *
 * SO IT IS A SCANNER, NOT A REGEX. Single quotes, double quotes,
 * backticks and regex literals are tracked, and `//` only ends a line
 * when it is outside all of them. Block comments and their contents are
 * blanked as before, newlines preserved so every line number still
 * matches the original file — several callers report `file:line` and
 * would otherwise point at the wrong place.
 *
 * NOT A PARSER, and the limits are worth stating: a regex literal is
 * distinguished from division by what precedes it, which is the usual
 * heuristic and is wrong for the rare `)/re/` shape; and a `--` SQL
 * comment is still only recognised at the start of a line, as before.
 */
export function stripComments(source) {
  let out = "";
  let i = 0;
  const n = source.length;
  // What we are inside of: null, '"', "'", "`", "/" (regex) or "*" (block).
  let mode = null;
  // For telling a regex literal from a division: a `/` starts a regex
  // only where a value cannot already have ended.
  let prevMeaningful = "";

  while (i < n) {
    const c = source[i];
    const next = source[i + 1];

    if (mode === "*") {
      if (c === "*" && next === "/") {
        out += "  ";
        i += 2;
        mode = null;
        continue;
      }
      out += c === "\n" ? "\n" : " ";
      i += 1;
      continue;
    }

    if (mode === '"' || mode === "'" || mode === "`" || mode === "/") {
      out += c;
      if (c === "\\") {
        if (i + 1 < n) out += source[i + 1];
        i += 2;
        continue;
      }
      if (c === mode) mode = null;
      // An unterminated string cannot cross a line; bail rather than
      // swallow the rest of the file.
      else if (c === "\n" && mode !== "`") mode = null;
      i += 1;
      continue;
    }

    if (c === "/" && next === "/") {
      while (i < n && source[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      mode = "*";
      out += "  ";
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      mode = c;
      out += c;
      i += 1;
      prevMeaningful = c;
      continue;
    }
    if (c === "/" && /[=(,:[!&|?{};+\-*%^~<>]|^$|return|typeof/.test(prevMeaningful)) {
      mode = "/";
      out += c;
      i += 1;
      continue;
    }

    out += c;
    if (!/\s/.test(c)) prevMeaningful = c;
    i += 1;
  }

  // A WHOLE-LINE `--` IS A SQL COMMENT, and only at the start of a line,
  // exactly as before: `a -- b` in TypeScript is a decrement.
  return out
    .split("\n")
    .map((line) => (/^\s*(\*|--)/.test(line) ? "" : line))
    .join("\n");
}

const SOURCE_FILE = /\.(ts|tsx|mjs|js|sql)$/;

export function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, out);
    } else if (SOURCE_FILE.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every marker found in `files`, as {file, line, id, why, text}. */
export function findMarkers(files, read = (f) => readFileSync(f, "utf8")) {
  const found = [];
  for (const file of files) {
    if (isExempt(file)) continue;
    let source;
    try {
      source = read(file);
    } catch {
      continue;
    }
    const code = stripComments(source).split("\n");
    const raw = source.split("\n");
    for (const [index, line] of code.entries()) {
      for (const marker of MARKERS) {
        // A marker that only ever appears AS a comment is read from the raw
        // line; every other one from the line with comments blanked, so
        // prose about a marker is not a marker.
        const haystack = marker.inComments ? (raw[index] ?? "") : line;
        if (marker.pattern.test(haystack)) {
          found.push({
            file,
            line: index + 1,
            id: marker.id,
            why: marker.why,
            text: haystack.trim().slice(0, 90),
          });
        }
      }
    }
  }
  return found;
}

/** The files a commit is about to record, rather than the whole tree. */
export function stagedFiles() {
  const out = execFileSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACM"],
    {
      encoding: "utf8",
    },
  );
  return out.split("\n").filter((f) => f && SOURCE_FILE.test(f));
}

// --- run directly -----------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const staged = process.argv.includes("--staged");
  const files = staged ? stagedFiles() : SCANNED.flatMap((dir) => walk(dir));
  const found = findMarkers(files);
  if (found.length === 0) {
    console.log(
      `mutation-markers: clean (${files.length} files${staged ? ", staged" : ""})`,
    );
    process.exit(0);
  }
  console.error(
    `\nMUTATION MARKERS FOUND (${found.length}) — a mutation suite may have been killed mid-run.\n`,
  );
  for (const f of found) {
    console.error(`  ${f.file}:${f.line}  [${f.id}]`);
    console.error(`      ${f.text}`);
    console.error(`      ${f.why}\n`);
  }
  console.error(
    "Restore with `git checkout -- <file>` after checking `git diff`.",
  );
  console.error(
    "If one of these is genuinely intended, it needs a name in MARKERS' exemptions,",
  );
  console.error("not a --no-verify.\n");
  process.exit(1);
}
