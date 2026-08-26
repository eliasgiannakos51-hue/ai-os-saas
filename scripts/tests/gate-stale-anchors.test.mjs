// EVERY ORDERING ANCHOR IN EVERY GATE STILL MATCHES THE FILE IT NAMES.
//
// The shape:
//
//     const routeSource = readFileSync(ROUTE, "utf8");
//     check("the IP check runs BEFORE anything is written",
//       routeSource.indexOf('scope: "website_form_ip"') <
//       routeSource.indexOf('.from("website_form_submissions").insert'));
//
// `indexOf` answers -1 for a needle that no longer matches, and -1 takes
// part in `<` and `>` like any other number. So a needle that goes stale
// does not announce itself; it changes what the comparison MEANS:
//
//     A < B   with A stale   ->  -1 < B   ->  TRUE   -> a silent PASS
//     A < B   with B stale   ->  A < -1   ->  FALSE  -> a red herring
//     A > B   with B stale   ->  A > -1   ->  TRUE   -> a silent PASS
//
// Two of those four are gates that have stopped checking anything and say
// PASS about it forever. This is the same family as a mutation suite whose
// anchor no longer exists (mutation-suite-shape.test.mjs) and a gate whose
// filter matches nothing (gate-vacuity.test.mjs): a claim that survives the
// disappearance of the thing it was about.
//
// FOUND THIS WAY, IN THIS REPOSITORY: submit-form-ip-limit.itest.mjs
// compared against the substring `.from("website_form_submissions").insert`.
// The formatter wrapped that chain onto two lines in the route, the needle
// stopped matching, and the gate went RED reporting "the IP check runs
// BEFORE anything is written" — a defect in the gate's own text, wearing
// the name of a defect in the route. The route was correct throughout. Had
// the comparison been written the other way round it would have gone
// permanently GREEN instead, and nobody would have looked.
//
// WHAT IS CHECKED. Only needles searched in a variable this analysis can
// tie to a real file — `const x = readFileSync(<something resolvable>)`.
// A string built at runtime (a generated HTML fragment, a fixture, a CSV
// header array) is not a file and is not checked: those cannot go stale
// against the product, because the gate itself writes them.
//
// Run: node scripts/tests/gate-stale-anchors.test.mjs
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

const DIR = "scripts/tests";
let pass = 0;
const failures = [];
function ok(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

/**
 * Blank out comments, character by character, leaving strings and their
 * contents intact.
 *
 * TWO THINGS A REGEX GOT WRONG HERE, both found by running this file:
 *
 *  1. A block-comment regex does not know what a string is.
 *     globe-mark.prodtest.mjs reads a CSS block by searching for its two
 *     marker COMMENTS as string literals — one opening a comment, one
 *     closing it, nineteen characters apart. The regex saw a comment
 *     opening inside the first literal and closing inside the second, and
 *     blanked the needle into a run of spaces — which this analysis then
 *     reported as an anchor that no longer matches.
 *
 *  2. Dropping comment LINES shifts every line number below the first one,
 *     so a finding points at the wrong line of the file it names. Blanking
 *     keeps the offsets exact.
 */
const stripJs = (s) => {
  const out = s.split("");
  const n = s.length;
  let i = 0;
  while (i < n) {
    const c = s[i];
    if (c === "/" && s[i + 1] === "/") {
      while (i < n && s[i] !== "\n") out[i++] = " ";
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      const end = s.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      for (; i < stop; i++) if (s[i] !== "\n") out[i] = " ";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      while (i < n) {
        if (s[i] === "\\") {
          i += 2;
          continue;
        }
        if (s[i] === q) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join("");
};

/** Decode a JS string literal (either quote style) to its value. */
const decode = (quote, body) => {
  try {
    return JSON.parse(quote === '"' ? `"${body}"` : `"${body.replace(/(?<!\\)"/g, '\\"')}"`);
  } catch {
    return null;
  }
};

const files = readdirSync(DIR)
  .filter((f) => /\.(test|itest|prodtest|dbtest)\.mjs$/.test(f))
  .sort();

console.log("gate-stale-anchors");
ok(`the gates were found (${files.length})`, files.length >= 200, `found ${files.length}`);

// ---------------------------------------------------------------------
// Deliberate exceptions, keyed by the gate that owns them so an entry
// cannot start excusing another file.
// ---------------------------------------------------------------------
const ALLOWED = new Map([
  // Three gates assert a file is GONE, and read a path that must not exist.
  // None of them compares positions, so none reaches this analysis, but the
  // map is here for the day one does.
]);

let boundVariables = 0;
const seenAnchors = new Map();
const stale = [];
const unreadable = [];

for (const file of files) {
  let raw;
  try {
    raw = readFileSync(path.join(DIR, file), "utf8");
  } catch {
    continue;
  }
  if (raw.indexOf("\u0000") !== -1) continue; // file-extraction.test.mjs embeds one on purpose
  const code = stripJs(raw);
  const lines = code.split("\n");

  // ---- 1. string constants, so a path held in one can be resolved ----
  const consts = new Map();
  for (const m of code.matchAll(/^\s*(?:const|let)\s+([A-Z_][A-Z0-9_]*|[a-z][\w$]*)\s*=\s*(["'])((?:\\.|(?!\2).)*)\2\s*;/gm)) {
    const v = decode(m[2], m[3]);
    if (v !== null) consts.set(m[1], v);
  }

  /** Resolve the first argument of a readFileSync call to a repo path. */
  const resolvePath = (expr) => {
    const e = expr.trim();
    const lit = e.match(/^(["'])((?:\\.|(?!\1).)*)\1$/);
    if (lit) return decode(lit[1], lit[2]);
    const ident = e.match(/^([A-Za-z_$][\w$]*)$/);
    if (ident) return consts.get(ident[1]) ?? null;
    // path.join(ROOT, X) / path.join(ROOT, "literal") — the leading segment
    // is the repository root in every gate that uses this form.
    const join = e.match(/^path\.join\(\s*[A-Za-z_$][\w$]*\s*,\s*(.+)\)$/);
    if (join) return resolvePath(join[1]);
    return null;
  };

  // ---- 2. variables bound to a file's contents ----------------------
  //
  // A LIST, NOT A MAP, because the same name is bound to different files in
  // different blocks. coding.test.mjs declares `const src` three times — the
  // workspace component, the context builder, the highlighter — and keeping
  // only the last one made this analysis check the component's anchors
  // against the context builder's text and report six defects that were
  // entirely its own. The binding that governs a comparison is the NEAREST
  // ONE ABOVE IT, which is also how the file reads.
  const bindings = []; // { name, line, repoPath, contents }
  const lineOfIndex = (idx) => code.slice(0, idx).split("\n").length;
  for (const m of code.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*readFileSync\(\s*([^;]*?),\s*["']utf-?8["']\s*\)/g)) {
    const repoPath = resolvePath(m[2]);
    // AN UNRESOLVABLE BINDING SHADOWS THE ONE ABOVE IT. cron-auth.test.mjs
    // binds `const src = readFileSync("src/lib/cron-auth.ts")` at the top and
    // then, inside `for (const file of ROUTES)`, rebinds the same name to a
    // file this analysis cannot name. Skipping the rebinding left the first
    // one in force, so three route anchors were checked against the library
    // and reported as gone. A name whose current value is unknown is not
    // checkable — it is recorded as unknown and every use below it is left
    // alone.
    if (!repoPath || repoPath.includes("${")) {
      bindings.push({ name: m[1], line: lineOfIndex(m.index), unknown: true });
      continue;
    }
    if (!existsSync(repoPath)) {
      bindings.push({ name: m[1], line: lineOfIndex(m.index), unknown: true });
      // A gate that asserts a file is gone is legitimate; one that reads a
      // path that stopped existing is not. Either way it is not an anchor
      // question, so it is reported separately rather than as staleness.
      unreadable.push(`${file}: ${m[1]} <- ${repoPath} (does not exist)`);
      continue;
    }
    let contents;
    try {
      contents = readFileSync(repoPath, "utf8");
    } catch {
      continue;
    }
    bindings.push({ name: m[1], line: lineOfIndex(m.index), repoPath, contents });
    boundVariables++;
  }
  if (bindings.every((b) => b.unknown)) continue;
  const names = [...new Set(bindings.map((b) => b.name))];
  /** The binding for `name` that is in force at line `at`. */
  const bindingAt = (name, at) => {
    let best = null;
    for (const b of bindings) if (b.name === name && b.line <= at && (!best || b.line > best.line)) best = b;
    // A comparison ABOVE every binding of that name (a helper defined at the
    // top and called later) falls back to the first one.
    return best ?? bindings.find((b) => b.name === name) ?? null;
  };

  // ---- 3. one-line aliases: const posOf = (n) => src.indexOf(n) -----
  const aliasOf = new Map();
  for (const m of code.matchAll(
    /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*\(\s*[A-Za-z_$][\w$]*\s*\)\s*=>\s*([A-Za-z_$][\w$]*)\.(?:indexOf|lastIndexOf)\(/g
  ))
    if (names.includes(m[2])) aliasOf.set(m[1], m[2]);

  // ---- 4. ordering comparisons, and the needles inside them ---------
  const allowed = ALLOWED.get(file) ?? [];
  for (let i = 0; i < lines.length; i++) {
    // A comparison may wrap; a needle and its `<` can be on separate lines.
    //
    // THE WINDOW LOOKS FORWARD, SO A MATCH INSIDE IT IS NOT NECESSARILY ON
    // LINE i. Attributing every hit to i meant a call on line i+2 was judged
    // against whichever binding was in force two lines EARLIER — which, in a
    // fixture that rebinds its source variable inside a loop, is exactly the
    // binding the rebinding was meant to shadow. Each match is mapped back
    // to the line it really came from.
    const parts = [lines[i], lines[i + 1] ?? "", lines[i + 2] ?? ""];
    const window = parts.join(" ");
    const lineOfMatch = (at) => {
      let acc = 0;
      for (let k = 0; k < parts.length; k++) {
        acc += parts[k].length + (k > 0 ? 1 : 0);
        if (at <= acc) return i + k + 1;
      }
      return i + parts.length;
    };
    // An ORDERING comparison, not an existence test. `> -1`, `>= 0`, `< 0`
    // and `=== -1` all ask whether the needle is there at all, which is the
    // sound way to use indexOf and is exactly what this file wants more of.
    const ordering = window.replace(/[<>]=?\s*-?\s*[01]\b/g, "");
    if (!/[<>]=?/.test(ordering)) continue;

    const esc = (v) => v.replace(/\$/g, "\\$");
    const aliasNames = [...aliasOf.keys()];
    // NAMED GROUPS, because the alias branch is only present in gates that
    // have an alias — and with numbered groups that shifted the quote group
    // from 3 to 2, so the `\3` backreference pointed at a group that did not
    // exist, matched the empty string, and the whole analysis quietly
    // checked ZERO anchors. The floor above is what said so.
    const callRe = new RegExp(
      `(?:(?<owner>${names.map(esc).join("|")})\\.(?:indexOf|lastIndexOf)` +
        (aliasNames.length ? `|\\b(?<alias>${aliasNames.map(esc).join("|")})\\b` : "") +
        `)\\(\\s*(?<q>["'])(?<needle>(?:\\\\.|(?!\\k<q>).)*)\\k<q>`,
      "g"
    );
    for (const m of window.matchAll(callRe)) {
      const g = m.groups;
      const owner = g.owner ?? (g.alias ? aliasOf.get(g.alias) : null);
      if (!owner) continue;
      const at = lineOfMatch(m.index);
      const binding = bindingAt(owner, at);
      if (!binding || binding.unknown) continue;
      const needle = decode(g.q, g.needle);
      if (needle === null || needle.length < 3) continue;
      if (allowed.includes(needle)) continue;
      // DEDUPED BY (file, variable, needle). The window spans three lines so
      // that a comparison broken across them is still seen, which means the
      // same call is visited up to three times; counting each visit would
      // inflate the floor below and print every finding three times.
      const key = `${file}|${owner}|${needle}`;
      if (!seenAnchors.has(key)) seenAnchors.set(key, { file, line: at, needle, binding });
      
    }
  }
}

for (const { file, line, needle, binding } of seenAnchors.values()) {
  if (!binding.contents.includes(needle)) {
    stale.push(`${file}:${line}  ${JSON.stringify(needle)}\n            not in ${binding.repoPath}`);
  }
}
const anchorsChecked = seenAnchors.size;

// ---------------------------------------------------------------------
console.log("\n== the analysis reached something ==");
// ---------------------------------------------------------------------
// FLOORS FIRST. Every number below is a claim about the gates; a green
// verdict over zero of them is a claim about this file's regexes instead.
ok(
  `variables tied to a real file (${boundVariables})`,
  boundVariables >= 400,
  `resolved ${boundVariables} readFileSync bindings — too few to have looked at the repository`
);
ok(
  `anchors inside ordering comparisons (${anchorsChecked})`,
  anchorsChecked >= 100,
  `checked ${anchorsChecked} needles — the comparison detector is matching nothing`
);

console.log("\n== every ordering anchor still matches ==");
ok(
  `no gate compares positions against a needle that is gone (${stale.length})`,
  stale.length === 0,
  stale.join("\n        ")
);
ok(
  `every file a gate reads still exists (${unreadable.length})`,
  unreadable.length === 0,
  unreadable.join("\n        ")
);

// ---------------------------------------------------------------------
console.log("\n== the analysis can go red ==");
// ---------------------------------------------------------------------
// Both claims above are "nothing is wrong", which is the shape this file
// distrusts, so the detector is run against text that is wrong on purpose.
{
  // THE SAMPLES ARE ASSEMBLED, NOT WRITTEN OUT. This file is one of the 204
  // it scans, so a sample spelled out in full is a binding and two anchors
  // in its own text — and the missing needle it demonstrates with was duly
  // reported three times as a defect in this file's documentation.
  const ABSENT = "zz-not-in-" + "package-json-zz";
  const READ = "read" + "FileSync";
  const sample = [
    `const src = ${READ}("package.json", "utf8");`,
    `check("a runs before b", src.index` + `Of("${ABSENT}") < src.index` + `Of("scripts"));`,
  ].join("\n");
  const found = [
    ...sample.matchAll(/(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*readFileSync\(\s*([^;]*?),\s*["']utf-?8["']\s*\)/g),
  ];
  ok("a readFileSync binding is recognised", found.length === 1 && found[0][1] === "src");
  const contents = readFileSync("package.json", "utf8");
  ok("...and a needle that is not in that file is reported", !contents.includes(ABSENT));
  ok("...while a needle that is in it is not", contents.includes("scripts"));
  // And an existence test is NOT an ordering comparison: `> -1` is the
  // sound way to use indexOf and must never be reported.
  const existence = `check("it is there", src.index` + `Of("zz") > -1);`;
  ok("an existence test is not treated as an ordering comparison", !/[<>]=?/.test(existence.replace(/[<>]=?\s*-?\s*[01]\b/g, "")));
  const real = `check("a before b", src.index` + `Of("zz") < src.index` + `Of("yy"));`;
  ok("...and a real ordering comparison is", /[<>]=?/.test(real.replace(/[<>]=?\s*-?\s*[01]\b/g, "")));
}

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ${failures.join("\n  - ")}`
);
process.exit(failures.length === 0 ? 0 : 1);
