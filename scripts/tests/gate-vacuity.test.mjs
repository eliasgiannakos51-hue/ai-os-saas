// An assertion that a list is EMPTY is satisfied by a list that was never
// filled.
//
// THE SHAPE, and it is the most common way a gate in this directory has
// stopped working:
//
//     const offenders = walk("src").filter((f) => somethingBad(f));
//     check("nothing does the bad thing", offenders.length === 0);
//
// Every part of that reads as a guarantee. None of it is one if `walk("src")`
// stops returning files, or if the regex inside `somethingBad` stops
// matching because a symbol was renamed. The filter yields nothing, the
// length is zero, the check passes, and the gate reports a green line about
// a scan that looked at nothing.
//
// It has happened here more than once:
//
//   - owner-only-access.test.mjs filtered client components for
//     /from "@\/lib\/admin"/ and asserted the result empty. lib/admin.ts was
//     renamed; the filter matched nothing; 58 checks passed while that one
//     read no files.
//   - health-classify.test.mjs scanned the health route for `detail: {`.
//     The route had built detail as the third argument of done() since it
//     was written, so the scan matched zero blocks from day one.
//   - bypass-ceiling, grandfathering and sidebar-naming each built a list by
//     regex and asserted it empty, with the count only console.logged.
//
// THE RULE. A gate may assert a scanned collection is empty only if it also
// asserts, somewhere, that the scan FOUND something — a floor. The floor
// belongs on the source, not on the result: you cannot floor "offenders",
// you want zero of those. A floor anywhere along the filter chain counts,
// and the tightest one wins, since `callers.length >= 26` is a stronger
// statement than `allFiles.length >= 1`.
//
// WHAT IS NOT FLAGGED, because a blanket rule would be deleted in a week:
//
//   - filtering a LITERAL array. `LOCALES.filter(...)` cannot silently
//     empty; LOCALES is written in the file.
//   - a collection that is legitimately empty on a healthy repository —
//     those are listed in ALLOWED below, each with the reason, so the next
//     one has to be argued for rather than added silently.
//
// Run: node scripts/tests/gate-vacuity.test.mjs
import { readdirSync, readFileSync } from "node:fs";
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

const stripJs = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");

/** Collections that ARE allowed to be empty on a healthy checkout, keyed by
 *  the gate that owns them so an entry cannot start excusing another file. */
const ALLOWED = new Map([
  // `bindings` is per-GATE, and most gates read no file at all, so an empty
  // list is the right answer for them rather than a broken scan. The scan
  // that could break is the total, floored in that file at 400 resolved
  // bindings and 100 anchors — both measured, both asserted there.
  ["gate-stale-anchors.test.mjs", ["bindings"]],
  // Per-suite lists: a mutation suite with no file constants has none to be
  // unused, and one with no gate reference has none to check. Zero is the
  // right answer for those suites, not a broken scan — and the suite COUNT
  // is floored at 30 in that file, which is the scan that could break.
  ["mutation-suite-shape.test.mjs", ["unused", "uses"]],
  // Probed per migration file; a migration that touches no table yields an
  // empty list legitimately. The migration count is floored separately.
  ["health-classify.test.mjs", ["touchers"]],
  // Probed per COMPONENT: `aiStates` is the set of states a given file's
  // handlers set while awaiting a model, and almost every spinning
  // component legitimately has none — that is the ordinary case, not a
  // broken scan. The scan that CAN break is the sweep across all of
  // them, and it is floored separately in that file at
  // `withAiStates.length >= 1`, which goes red if the handler-splitting
  // regex ever stops finding any.
  ["globe-mark.test.mjs", ["aiStates"]],
  // The live half only runs with a database; without one the arrays are
  // never built and the file exits before these lines.
  ["security-posture.test.mjs", ["missing", "silentlyDenied"]],
  // Measured against a live deployment; an empty result means the site did
  // not answer, which the prodtest reports separately as a failure.
  ["routes-smoke.prodtest.mjs", ["english"]],
  ["signup-latency.test.mjs", ["strangers"]],

  // ------------------------------------------------------------------
  // FLOORED, BUT NOT THROUGH A NAMED ARRAY THE TRACER CAN FOLLOW.
  //
  // Each of these HAS a floor; it just is not on a variable this analysis
  // can link to the assertion. The floor is named so the claim can be
  // checked by reading, and so removing it shows up here as a lie rather
  // than as silence.
  // ------------------------------------------------------------------
  //   `rowsBlock.length >= 500` — literalCells is matchAll over that string.
  ["combined-ceiling.test.mjs", ["literalCells"]],
  //   `files.length >= 7` — badPatterns is filled by a recursive walk of
  //   the eval files, and the recursion hides the link.
  ["evals.test.mjs", ["badPatterns"]],
  //   `Object.keys(headingKeys).length >= 5` — an expression, not a name.
  ["sidebar-naming.test.mjs", ["deadHeadingKeys"]],
  //   `routes.length >= 116` — the offender list at line 136. The tracer
  //   picks up a DIFFERENT `offenders` further down the same file.
  ["owner-only-access.test.mjs", ["offenders"]],

  // ------------------------------------------------------------------
  // LEGITIMATELY EMPTY, AND THE SCAN CANNOT SILENTLY BREAK.
  // ------------------------------------------------------------------
  //   "no .sql file at the repository root" — readdirSync(".") cannot come
  //   back empty on a checkout, so an empty result is the answer, not a
  //   broken scan.
  ["db-inventory.test.mjs", ["sqlFiles", "dropped", "unbalanced"]],
  //   Per CSS block: a block that drives no --orb-* variable has no
  //   property to be unsafe. The block list itself is what could empty,
  //   and it is asserted separately.
  ["voice.test.mjs", ["usesVarOutsideSafe"]],
  //   Inside writtenColumns(), called once per mutation with a different
  //   update object each time. An object with no plain `key:` pairs is a
  //   real case (every column computed), so zero is a legitimate answer —
  //   and the helper THROWS when it parses nothing at all from an object
  //   that has no computed keys either, which is the floor.
  ["write-guards.test.mjs", ["names", "groups"]],
]);

const files = readdirSync(DIR)
  .filter((f) => /\.(test|itest|prodtest|dbtest)\.mjs$/.test(f))
  .sort();

console.log("gate-vacuity");
ok(`the gates were found (${files.length})`, files.length >= 200, `found ${files.length}`);

const findings = [];
let scannedCollections = 0;

for (const file of files) {
  let raw;
  try {
    raw = readFileSync(path.join(DIR, file), "utf8");
  } catch {
    continue;
  }
  // THE ESCAPE, NOT THE BYTE. This line used to carry a literal NUL, which
  // made THIS FILE binary — so the guard excluded the instrument from its
  // own analysis, silently, and no output said so. The gate that guards
  // the other 203 was the one gate nothing looked at. The real binary
  // fixture this skips is file-extraction.test.mjs, which embeds a NUL on
  // purpose to prove the extractor rejects it.
  if (raw.indexOf("\u0000") !== -1) continue;
  const code = stripJs(raw);
  const lines = code.split("\n");

  const assigns = new Map();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(?:const|let)\s+([a-zA-Z_$][\w$]*)\s*=\s*(.*)$/);
    if (!m) continue;
    // THE ACCUMULATOR PATTERN gets its source from the loop below it, not
    // from its own right-hand side:
    //
    //     const offenders = [];
    //     for (const file of walk("src")) { ... offenders.push(...) }
    //
    // Read literally, `offenders`'s rhs is `[]` — a literal, which nothing
    // can empty. What can empty is `walk("src")`, and that is where a floor
    // belongs. So an empty-array declaration followed within a few lines by
    // a for-of takes the loop's source as its parent.
    let rhs = [m[2], ...lines.slice(i + 1, i + 8)].join(" ");
    if (/^\s*\[\s*\]\s*;?\s*$/.test(m[2])) {
      const loop = lines
        .slice(i + 1, i + 6)
        .join(" ")
        .match(/for\s*\(\s*(?:const|let)\s+\w+\s+of\s+([A-Za-z_$][\w$]*)\s*\)/);
      if (loop) rhs = loop[1] + ".__loopSource";
      else {
        const inlineLoop = lines
          .slice(i + 1, i + 6)
          .join(" ")
          .match(/for\s*\(\s*(?:const|let)\s+\w+\s+of\s+(\w+\()/);
        if (inlineLoop) rhs = inlineLoop[1] + ")";
      }
    }
    assigns.set(m[1], { line: i + 1, rhs });
  }

  /** X = Y.filter(...) — every link back to the root, X included. */
  function chainOf(name, seen = new Set()) {
    if (seen.has(name)) return [...seen];
    seen.add(name);
    const a = assigns.get(name);
    if (!a) return [...seen];
    const m =
      a.rhs.match(/^\s*([a-zA-Z_$][\w$]*)\s*\.\s*(?:filter|flatMap|map|slice|concat)\(/) ||
      a.rhs.match(/^\s*\[\s*\.\.\.\s*([a-zA-Z_$][\w$]*)\s*\]/) ||
      a.rhs.match(/^([A-Za-z_$][\w$]*)\.__loopSource$/);
    if (m) return chainOf(m[1], seen);
    return [...seen];
  }

  // Only a REAL scan can silently empty: the filesystem, or a regex over
  // source. A literal array cannot.
  const isScan = (name) => {
    const a = assigns.get(name);
    if (!a) return false;
    return /(readdirSync|matchAll|\bwalk\(|everyFile\(|globSync|readFileSync\([^)]*\)\s*\.split)/.test(a.rhs);
  };

  // A floor is a comparison against a POSITIVE number — not any mention of
  // .length, which would match the emptiness assertion itself.
  const floored = (v) =>
    new RegExp("\\b" + v + "\\.length\\s*(>=|>)\\s*\\d").test(code) ||
    new RegExp("\\b" + v + "\\.length\\s*===\\s*[1-9]").test(code) ||
    new RegExp("\\b" + v + "\\.size\\s*(>=|>)\\s*\\d").test(code) ||
    new RegExp("\\b" + v + "\\.length\\s*!==?\\s*0").test(code) ||
    new RegExp("\\b\\d+\\s*<=?\\s*" + v + "\\.length\\b").test(code);

  // THE GATE'S OWN FAILURE LIST. Nearly every file here declares
  // `const failures = []` and ends with `failures.length === 0`. That is the
  // summary, not a scan — it is pushed to by the assertion helper itself,
  // and an empty one means the gate passed. Excluded structurally rather
  // than by name-per-file, since the idiom is universal.
  const selfReporting = new Set();
  for (const m of code.matchAll(/(?:function|const)\s+(?:check\w*|ok|eq)\b[\s\S]{0,400}?(\w+)\.push\(/g)) {
    selfReporting.add(m[1]);
  }

  const allowed = ALLOWED.get(file) ?? [];

  for (const [v, a] of assigns) {
    const shapes = [];
    if (new RegExp("\\b" + v + "\\.length\\s*===\\s*0").test(code)) shapes.push("length === 0");
    if (new RegExp(",\\s*" + v + ",\\s*\\[\\]").test(code)) shapes.push("compared to []");
    if (new RegExp("\\b" + v + "\\.every\\(").test(code)) shapes.push(".every()");
    if (shapes.length === 0) continue;

    const chain = chainOf(v);
    const root = chain[chain.length - 1];
    if (!isScan(root)) continue;
    scannedCollections++;
    if (chain.some(floored)) continue;
    if (allowed.includes(v) || selfReporting.has(v)) continue;
    findings.push(`${file}: ${v}${root === v ? "" : ` (from ${root})`} — ${shapes.join(", ")}`);
  }
}

console.log(`  ....  ${scannedCollections} emptiness assertions over scanned collections`);
// A floor on this file, for exactly the reason it exists: "none of them is
// unfloored" is trivially true of a scan that found nothing to look at.
ok(
  `the analysis found assertions to check (${scannedCollections})`,
  scannedCollections >= 80,
  `found ${scannedCollections}`
);
ok(
  `every scanned collection asserted empty has a floor (${findings.length} without)`,
  findings.length === 0,
  findings.join("\n        ")
);

// ---------------------------------------------------------------------
console.log("\n== no assertion is a tautology ==");
// ---------------------------------------------------------------------
// THE FOURTH SHAPE, and the weakest-looking of the four:
//
//     applyFile(migration);
//     applyFile(migration);          // must be idempotent
//     check("migration applies twice cleanly", true, true);
//
// The truth being asserted is that the line was REACHED. It does carry a
// little signal — the file aborts if the apply throws — but the label
// claims something the check never looks at, and the moment anything above
// stops throwing (a try/catch added, an error swallowed, the call made
// conditional) the line keeps printing PASS about nothing. Five of these
// were in this directory; each now catches the error and asserts on it.
//
// A LITERAL on both sides is the signature. `check(name, x, x)` where x is
// a variable is a different thing and is not flagged: comparing a value
// with itself is usually a loop parameter, and would be caught by the
// self-comparison shape rather than this one.
{
  // THE TEST IS "CAN THIS CHECK EVER GO RED?", not "are there literals in
  // it". Written the other way round it flagged four sound lines: a check
  // whose literal makes it FAIL is a report, not a tautology.
  //
  // AND THE ARGUMENTS ARE SPLIT, NOT MATCHED. A regex with `[^,]+` for the
  // name argument stops at the first comma ANYWHERE, including one inside
  // the name itself:
  //
  //     eq(`${percent} = round(100 * ${num} / ${den}, 1)`, s[percent], ...)
  //
  // — where `1)` read as a two-argument call whose condition was the
  // literal 1. That is a fact about the label's punctuation, reported as a
  // defect in the assertion. So the call is parsed: parens, brackets,
  // braces, all three quote styles and `${}` inside templates.
  const LITERAL = /^(?:true|false|1|0)$/;
  const callArgs = (text, openParen) => {
    const args = [];
    let depth = 0;
    let quote = null;
    let start = openParen + 1;
    const tmpl = []; // `${` nesting depth per open template literal
    for (let i = openParen; i < text.length; i++) {
      const c = text[i];
      if (quote) {
        if (c === "\\") {
          i++;
          continue;
        }
        if (quote === "`" && c === "$" && text[i + 1] === "{") {
          tmpl.push(depth);
          depth++;
          quote = null;
          i++;
          continue;
        }
        if (c === quote) quote = null;
        continue;
      }
      if (c === "'" || c === '"' || c === "`") {
        quote = c;
        continue;
      }
      if (c === "(" || c === "[" || c === "{") {
        depth++;
        continue;
      }
      if (c === ")" || c === "]" || c === "}") {
        depth--;
        if (c === "}" && tmpl.length > 0 && tmpl[tmpl.length - 1] === depth) {
          tmpl.pop();
          quote = "`";
          continue;
        }
        if (depth === 0) {
          args.push(text.slice(start, i).trim());
          return args;
        }
        continue;
      }
      if (c === "," && depth === 1) {
        args.push(text.slice(start, i).trim());
        start = i + 1;
      }
    }
    return null; // unterminated — not a call this analysis can judge
  };
  let parsedCalls = 0;
  /** Every check in `text` whose literal arguments make it unable to fail. */
  const cannotFail = (text) => {
    const out = [];
    for (const m of text.matchAll(/\b(?:check|checkTrue|ok|eq)\s*\(/g)) {
      const open = m.index + m[0].length - 1;
      const args = callArgs(text, open);
      if (!args || args.length < 2) continue;
      parsedCalls++;
      const [, actual, expected] = args;
      if (!LITERAL.test(actual)) continue;
      // Three or more arguments: the third is the EXPECTED value, and the
      // pair is a tautology only when they agree. Two arguments: only a
      // truthy literal cannot fail. `check(name, false)` is a deliberate
      // FAIL raised inside a branch that should not have been reached — it
      // always goes red when it runs, so it is sound.
      const cannot =
        args.length >= 3 && LITERAL.test(expected)
          ? actual === expected
          : args.length === 2 && (actual === "true" || actual === "1");
      if (cannot) out.push(`${m[0]}${args[0].slice(0, 60)}, ${actual}${args.length >= 3 ? `, ${expected}` : ""})`);
    }
    return out;
  };
  const tautologies = [];
  for (const file of files) {
    let raw;
    try {
      raw = readFileSync(path.join(DIR, file), "utf8");
    } catch {
      continue;
    }
    if (raw.indexOf("\u0000") !== -1) continue;
    const code = stripJs(raw);
    for (const hit of cannotFail(code)) tautologies.push(`${file}: ${hit}`);
  }
  // THE FLOOR THIS FILE EXISTS TO DEMAND, applied to its own new section.
  // "0 tautologies" is the same sentence as "the scan found nothing", and
  // the second reading is the one that survives a rename: if the helper
  // names ever change, or the splitter starts returning null everywhere,
  // this section goes green over zero calls and says so to nobody.
  ok(
    `the tautology analysis parsed check calls (${parsedCalls})`,
    parsedCalls >= 8000,
    `parsed ${parsedCalls} — a green verdict over this few is a fact about the parser, not the gates`
  );
  ok(
    `no check is written so that it cannot go red (${tautologies.length})`,
    tautologies.length === 0,
    tautologies.join("\n        ")
  );

  // And the detector works, proven on text rather than asserted.
  //
  // THE SAMPLES ARE ASSEMBLED, NOT WRITTEN OUT. This file is one of the 203
  // it scans (it stopped excluding itself when the literal NUL on the read
  // guard became an escape), so a sample spelled out in full would be a
  // finding about the detector's own documentation. Interpolating the
  // literal keeps the runtime string byte-identical while leaving no such
  // sequence in the source.
  const T = "true";
  const hits = (text) => cannotFail(text).length;
  ok("a check that cannot fail is detected", hits(`check("migration applies twice cleanly", ${T}, ${T});`) === 1);
  ok(
    "...and a real condition with an expected value is not",
    hits(`check("migration applies twice cleanly", reapplyError === null, ${T});`) === 0
  );
  // The distinction the first version got wrong: a literal that makes the
  // check FAIL is a deliberate report from a branch that should not have
  // been reached, and it must stay green here.
  ok(
    "...and a deliberate FAIL raised in a branch is not a tautology",
    hits(`check(\`${"${union.name}"}: constraint exists\`, false, ${T});`) === 0
  );
  ok("...and the two-argument always-true form is caught", hits(`check("the context is gone", ${T});`) === 1);
  ok("...while the two-argument always-false form is not", hits(`check(\`${"${name}"} is on the page\`, false);`) === 0);
  // And the argument splitter earns itself: a comma inside the LABEL is not
  // an argument boundary. This exact line was reported as a defect before
  // the analysis parsed calls instead of matching them.
  ok(
    "...and a comma inside the label is not an argument boundary",
    hits('eq(`${p} = round(100 * ${n} / ${d}, 1)`, s[p], pct(n, d));') === 0
  );
}

// ---------------------------------------------------------------------
console.log("\n== no gate hides itself from analysis ==");
// ---------------------------------------------------------------------
// A NUL byte makes a file BINARY to every text tool: grep says "binary file
// matches" instead of the line, git shows no diff, and — the reason this
// check exists — the read guard above skips it. That guard was written with
// a literal NUL rather than the escape `\u0000`, so gate-vacuity.test.mjs
// contained one, and the instrument that guards the other 203 was the one
// gate nothing looked at. It happened a second time the same day, by
// copy-paste, in gate-stale-anchors.test.mjs.
//
// One file needs a real NUL: file-extraction.test.mjs feeds one to the
// extractor to prove binary input is rejected. Every other gate writing one
// is writing it by accident.
{
  const BINARY_BY_DESIGN = "file-extraction.test.mjs";
  const carriers = [];
  for (const f of readdirSync(DIR).filter((n) => n.endsWith(".mjs")).sort()) {
    let raw;
    try {
      raw = readFileSync(path.join(DIR, f), "utf8");
    } catch {
      continue;
    }
    if (raw.indexOf("\u0000") !== -1) carriers.push(f);
  }
  ok(
    `no gate carries a NUL byte by accident (${carriers.length} carry one)`,
    carriers.every((f) => f === BINARY_BY_DESIGN),
    `${carriers.filter((f) => f !== BINARY_BY_DESIGN).join(", ")} — write \\u0000, not the byte`
  );
  // AND THE EXEMPTION EARNS ITSELF. A name in an allowlist that no longer
  // describes anything is a rule protecting nothing, and it would hide the
  // day this check stops being able to see a NUL at all.
  // `carriers.length >= 1` is spelled out beside the `includes`, and not
  // because `includes` needs help: an empty list satisfies `every()` above,
  // so without a floor BOTH checks would pass over a scan that found
  // nothing. It is the same claim, written where the analysis in this very
  // file can see it.
  ok(
    `${BINARY_BY_DESIGN} still carries the one that is on purpose`,
    carriers.length >= 1 && carriers.includes(BINARY_BY_DESIGN),
    "the allowlisted file no longer has a NUL — either the fixture changed or this check stopped detecting them"
  );
}

// ---------------------------------------------------------------------
console.log("\n== the analysis can go red ==");
// ---------------------------------------------------------------------
// Both checks above are "nothing is wrong", which is the shape this file
// distrusts. So the detector is run against text that is wrong on purpose.
{
  const sample = [
    'const found = walk("src").filter((f) => f.endsWith(".ts"));',
    'const offenders = found.filter((f) => bad(f));',
    'check("none", offenders.length === 0);',
  ].join("\n");
  const assigns = new Map();
  for (const m of sample.matchAll(/^\s*const\s+(\w+)\s*=\s*(.*)$/gm)) assigns.set(m[1], m[2]);
  const rootIsScan = /\bwalk\(/.test(assigns.get("found") ?? "");
  const hasFloor = /\bfound\.length\s*(>=|>)\s*\d/.test(sample);
  ok("an unfloored walk().filter().length === 0 is detected", rootIsScan && !hasFloor);

  const withFloor = sample.replace(
    'check("none"',
    'check("found files", found.length >= 3);\ncheck("none"'
  );
  ok("...and adding a floor clears it", /\bfound\.length\s*>=\s*3/.test(withFloor));
}

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ${failures.join("\n  - ")}`
);
process.exit(failures.length === 0 ? 0 : 1);
