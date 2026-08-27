// THE GUARD THAT CATCHES A KILLED MUTATION SUITE — and the checks that keep
// the guard from being decorative.
//
// The incident, in full: `npm run test:mutation` was stopped by a
// ten-minute timeout half-way through, and the suite it was running never
// restored the file it had damaged. src/lib/website-multipage.ts was left
// with `if (true) return true;` where a completeness check belonged, so
// every truncated page would have passed as a finished website. It was
// found by reading `git status` before committing — a habit, and habits had
// already failed once.
//
// scripts/check-mutation-markers.mjs is the mechanism. This file is what
// stops the mechanism from quietly stopping: it runs in test:unit, which
// runs in the build, which runs in CI — where .git/hooks does not exist and
// the pre-commit hook therefore cannot help anybody.
//
// Run: node scripts/tests/mutation-markers.test.mjs
import { readFileSync, existsSync } from "node:fs";
import {
  MARKERS,
  SCANNED,
  EXEMPT,
  isExempt,
  stripComments,
  walk,
  findMarkers,
} from "../check-mutation-markers.mjs";

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

console.log("mutation-markers");

// ---------------------------------------------------------------------
console.log("\n== 1. the tree is clean right now ==");
// ---------------------------------------------------------------------
const files = SCANNED.flatMap((dir) => walk(dir));
// A FLOOR, because "no markers found" is trivially true of an empty file
// list and this scan is one directory name away from finding nothing.
ok(
  `the scan reaches the source (${files.length} files)`,
  files.length >= 800,
  `found ${files.length}`,
);
{
  const found = findMarkers(files);
  ok(
    `no mutation marker is in the tree (${found.length})`,
    found.length === 0,
    found
      .map((f) => `${f.file}:${f.line} [${f.id}] ${f.text}`)
      .join("\n        "),
  );
}

// ---------------------------------------------------------------------
console.log("\n== 2. it recognises the shape that actually happened ==");
// ---------------------------------------------------------------------
// The exact line the killed suite left behind, fed to the checker as a file.
{
  // "sample-input.ts" is a NAME, not a path: nothing is read from disk, the
  // text is supplied. It carries no directory prefix because
  // gate-import-paths.test.mjs reads every `src/...` string in a gate as a
  // file that must exist, and it was right to — it caught the first version
  // of this line, which invented src/fake.ts.
  const fake = (text) => findMarkers(["sample-input.ts"], () => text);
  const incident = fake(
    "  const complete = segments.filter((s) => {\n    if (true) return true;\n",
  );
  ok(
    "the stranded mutation is recognised",
    incident.length === 1 && incident[0].id === "if-true",
    JSON.stringify(incident),
  );
  ok(
    "...and it reports the line",
    incident[0]?.line === 2,
    String(incident[0]?.line),
  );

  for (const [id, sample] of [
    ["if-false", "  if (false) {"],
    ["never-match", "  const RE = /(?!)/;"],
    ["unreachable", "  // eslint-disable-next-line no-unreachable"],
  ]) {
    const hit = fake(sample);
    // The unreachable marker lives ON a comment line, so it is the one that
    // must survive stripComments — checked here rather than assumed.
    ok(
      `${id} is recognised`,
      hit.some((h) => h.id === id),
      `${sample} -> ${JSON.stringify(hit)}`,
    );
  }

  // And ordinary code is not a marker.
  for (const clean of [
    "if (ready) return true;",
    "const enabled = true;",
    "if (list.length > 0) return true;",
    "const RE = /(?:a|b)/;",
  ]) {
    ok(
      `clean code is left alone: ${clean.slice(0, 34)}`,
      fake(clean).length === 0,
    );
  }
}

// ---------------------------------------------------------------------
console.log("\n== 3. comments are not code ==");
// ---------------------------------------------------------------------
// voice.test.mjs EXPLAINS `if (false)` in prose. A scan that could not tell
// prose from code would fail the build over a sentence — and would have,
// from the first day.
{
  // "sample-input.ts" is a NAME, not a path: nothing is read from disk, the
  // text is supplied. It carries no directory prefix because
  // gate-import-paths.test.mjs reads every `src/...` string in a gate as a
  // file that must exist, and it was right to — it caught the first version
  // of this line, which invented src/fake.ts.
  const fake = (text) => findMarkers(["sample-input.ts"], () => text);
  ok(
    "a marker inside a line comment is not a marker",
    fake("// `if (false)` keeps the line").length === 0,
  );
  ok(
    "...nor inside a block comment",
    fake("/*\n * if (true) is the shape\n */").length === 0,
  );
  ok(
    "...nor after code on the same line",
    fake("const x = 1; // if (true)").length === 0,
  );
  // The one that must NOT be excused: real code with a trailing comment.
  ok(
    "...while real code with a comment after it still counts",
    fake("if (true) return; // ok").length === 1,
  );
  ok(
    "a SQL line comment is stripped too",
    stripComments("-- if (true)\nselect 1;").includes("if (true)") === false,
  );
  // AND THE STRIPPER KEEPS LINE NUMBERS, or every report points at the
  // wrong place.
  const before = "a\n/* x\n y */\nb\nif (true)";
  ok(
    "stripping does not move the lines",
    stripComments(before).split("\n").length === before.split("\n").length,
  );
}

// ---------------------------------------------------------------------
console.log("\n== 4. the one exemption, and its reason ==");
// ---------------------------------------------------------------------
{
  ok(
    "mutation suites are exempt",
    isExempt("scripts/tests/voice.mutation.mjs"),
  );
  ok(
    "the checker itself is exempt",
    isExempt("scripts/check-mutation-markers.mjs"),
  );
  ok(
    "...and so is this file",
    isExempt("scripts/tests/mutation-markers.test.mjs"),
  );
  ok(
    "...and nothing else is",
    !isExempt("scripts/tests/voice.test.mjs") &&
      !isExempt("src/lib/website-multipage.ts") &&
      !isExempt("scripts/check-i18n.js"),
  );
  // EVERY EXEMPTION EARNS ITSELF. One that no longer names a file carrying a
  // marker is a hole somebody could widen without noticing.
  {
    const all = [...walk("scripts"), ...walk("src")];
    const idle = EXEMPT.filter(
      (e) =>
        !all.some(
          (f) =>
            e.match.test(f) &&
            MARKERS.some((m) => m.pattern.test(readFileSync(f, "utf8"))),
        ),
    );
    ok(
      `every exemption still covers a file that carries a marker (${idle.length} do not)`,
      idle.length === 0,
      idle.map((e) => e.why).join("\n        "),
    );
  }
  // THE EXEMPTION EARNS ITSELF: those files really do carry the markers, as
  // the `to:` strings of their mutants. If they ever stop, the exemption is
  // protecting nothing and should go.
  const suites = walk("scripts/tests").filter((f) =>
    /\.mutation\.mjs$/.test(f),
  );
  const carrying = suites.filter((f) =>
    MARKERS.some((m) => m.pattern.test(readFileSync(f, "utf8"))),
  );
  ok(
    `the exempt files really do carry markers (${carrying.length} of ${suites.length})`,
    carrying.length >= 10,
    "if none of them did, the exemption would be excusing nothing",
  );
}

// ---------------------------------------------------------------------
console.log("\n== 5. it is installed where it can act ==");
// ---------------------------------------------------------------------
{
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  // THE HOOK IS NOT ENOUGH ON ITS OWN. .git/hooks is not versioned, so a
  // fresh clone and every CI checkout have none. The build is where it
  // holds for everybody.
  ok(
    "the build runs the check",
    /check-mutation-markers/.test(pkg.scripts.build ?? ""),
  );
  // BEFORE ANYTHING EXPENSIVE, which is the property that matters, and not
  // "first" — function-limits.test.mjs owns first place and its reason is
  // better: apply-function-limits REWRITES the route files, so nothing may
  // read them before it has run. Two gates both claiming first place is how
  // one of them ends up quietly relaxed; this one names what it needs.
  //
  // What it needs is that no mutated tree is ever compiled, and that a
  // developer waiting on a build hears about a stranded mutation in seconds
  // rather than after the unit suite.
  {
    const steps = (pkg.scripts.build ?? "").split("&&").map((s) => s.trim());
    const at = steps.findIndex((s) => s.includes("check-mutation-markers"));
    const expensive = steps.findIndex((s) =>
      /test:unit|next build|check-i18n/.test(s),
    );
    ok(
      "...before the build spends time on anything expensive",
      at >= 0 && expensive >= 0 && at < expensive,
      `marker check at ${at}, first expensive step at ${expensive}: ${pkg.scripts.build}`,
    );
  }
  ok(
    "npm install installs the hook",
    /install-hooks/.test(pkg.scripts.prepare ?? ""),
  );
  ok(
    "and it can be installed by hand",
    /install-hooks/.test(pkg.scripts["hooks:install"] ?? ""),
  );
  ok("the installer exists", existsSync("scripts/install-hooks.mjs"));
  const installer = readFileSync("scripts/install-hooks.mjs", "utf8");
  // A hook that inlines the rules would enforce whatever they were on the
  // day it was written, and nobody re-runs an installer.
  //
  // READ THE HOOK BODY, NOT THE FILE. Written as a search of the whole
  // installer, this passed over a hook that had been changed to a hand-rolled
  // grep — because the file ALSO prints "node scripts/check-mutation-markers
  // .mjs --staged" as advice to somebody whose own hook is in the way. The
  // string was there; the call was not.
  const body = /const BODY = `([\s\S]*?)`;/.exec(installer)?.[1] ?? "";
  ok(
    "the hook body was found",
    body.length > 0,
    "no BODY template in the installer",
  );
  ok(
    "the hook calls the checker rather than copying it",
    /node scripts\/check-mutation-markers\.mjs --staged/.test(body),
    body.slice(0, 200),
  );
  ok(
    "...and does not re-implement any rule of its own",
    !/grep|if \(true\)|awk|sed/.test(body),
    body.slice(0, 200),
  );
  ok(
    "...and refuses to clobber somebody else's hook",
    /is not ours/.test(installer),
  );
}

console.log(
  failures.length === 0
    ? `\nALL ${pass} CHECKS PASSED`
    : `\nFAILURES: ${pass} passed, ${failures.length} failed\n  - ${failures.join("\n  - ")}`,
);
process.exit(failures.length === 0 ? 0 : 1);
