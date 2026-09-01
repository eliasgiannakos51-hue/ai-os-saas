#!/usr/bin/env node
/*
 * REMOVE THE GUARD. SEE WHAT GOES RED. IF NOTHING DOES, NOBODY IS WATCHING IT.
 *
 * `stripped.length === ch.length` in lib/text/unicode-patterns.ts was
 * load-bearing for FIVE scripts — Korean, Thai, Hebrew, Devanagari and
 * Arabic all survive folding only because of it — and nothing in the file
 * said so. Relaxing it would have read as a tidy-up.
 *
 * The shape is specific, and it is why it went unnoticed: a condition that
 * decides whether to ACCEPT a transformation, where the else-branch keeps
 * the original. Removing it does not throw and does not fail a type check.
 * It produces subtly wrong output.
 *
 * This runs the experiment the honest way — one guard at a time, the whole
 * unit suite each time, tree restored after every one. It is slow (about
 * 100 seconds per guard) and it is meant to be: the alternative is
 * reasoning about what a guard does, which is what produced the gap.
 *
 * A guard that nothing catches is not automatically a bug. It is one of
 * two things, and this file cannot tell them apart — only report which
 * ones need a person:
 *   - REDUNDANT: some other check already covers it, and it can go
 *   - UNGUARDED: it is load-bearing and nothing is watching it
 *
 * IT CANNOT LEAVE A MUTANT BEHIND, and that is not a claim about the
 * `finally` below. The first version had one, and was still killed
 * mid-run when it outgrew a foreground timeout — leaving a real mutant in
 * lib/unsplash.ts, where a whitespace-only Unsplash field would have been
 * read as present. `finally` does not run when the process is killed.
 *
 * So the original is written to a SIDECAR FILE before the source is
 * touched, and the first thing this does on startup is restore from any
 * sidecar it finds. A killed run heals on the next one, and `git status`
 * is not the only thing standing between a mutant and a commit.
 *
 * AND IT RUNS IN CHUNKS. Ten guards at ~100 seconds each outruns any
 * sane foreground timeout, and a backgrounded mutation sweep is how the
 * mutant got left in the first place.
 *
 * Run: node scripts/tests/unguarded-guards.mjs [--from N] [--count N]
 */
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, basename } from "node:path";

const SIDECAR_DIR = "scripts/tests/.guard-sidecar";

/** Restore anything a previous run was killed in the middle of. */
function healFromSidecar() {
  if (!existsSync(SIDECAR_DIR)) return [];
  const healed = [];
  for (const entry of readdirSync(SIDECAR_DIR)) {
    const payload = JSON.parse(readFileSync(join(SIDECAR_DIR, entry), "utf8"));
    writeFileSync(payload.file, payload.text);
    unlinkSync(join(SIDECAR_DIR, entry));
    healed.push(payload.file);
  }
  return healed;
}
function stash(file, text) {
  mkdirSync(SIDECAR_DIR, { recursive: true });
  writeFileSync(join(SIDECAR_DIR, `${basename(file)}.json`), JSON.stringify({ file, text }));
}
function unstash(file) {
  const p = join(SIDECAR_DIR, `${basename(file)}.json`);
  if (existsSync(p)) unlinkSync(p);
}

const GUARDS = [
  {
    file: "src/lib/text/unicode-patterns.ts",
    what: "the fold is adopted only when it preserved the character count",
    from: "    if (stripped.length === ch.length) folded = stripped;",
    to: "    folded = stripped;",
  },
  {
    file: "src/lib/text/unicode-patterns.ts",
    what: "the folded character is emitted only when it is still one character",
    from: "    out += folded.length === ch.length ? folded : ch;",
    to: "    out += folded;",
  },
  {
    // BOTH FOLDING GUARDS AT ONCE. Removing either alone changes nothing
    // — with the first in place the second is a no-op, and vice versa —
    // so a one-at-a-time sweep reports both as unwatched and neither as
    // load-bearing. They guard JOINTLY, which is a thing this experiment
    // could not see until it was asked to.
    file: "src/lib/text/unicode-patterns.ts",
    what: "BOTH folding guards, together — the pair that protects five scripts",
    from: "    if (stripped.length === ch.length) folded = stripped;\n    out += folded.length === ch.length ? folded : ch;",
    to: "    folded = stripped;\n    out += folded;",
  },
  {
    // DELETED, not defanged. `if (false)` is itself a marker the build
    // gate fails on, so it proves nothing about who is watching.
    file: "src/app/api/files/collections/route.ts",
    what: "creating a collection refuses a file id that is not yours",
    from: `      if (ownedIds.length !== requested.length) {
        return NextResponse.json({ ok: false, error: "One of those files does not exist." }, { status: 404 });
      }`,
    to: "",
  },
  {
    file: "src/app/api/files/collections/[id]/route.ts",
    what: "updating a collection refuses a file id that is not yours",
    from: `        if (owned.length !== requested.length) {
          return NextResponse.json({ ok: false, error: "One of those files does not exist." }, { status: 404 });
        }`,
    to: "",
  },
  {
    file: "src/lib/integrations/crypto.ts",
    what: "the constant-time compare rejects a length mismatch first",
    from: "  if (bufA.length !== bufB.length) return false;",
    to: "",
  },
  {
    file: "src/lib/ai/module-relevance.ts",
    what: "a question every module matches narrows nothing",
    from: '  if (matched.length === summaries.length) return all("every module matched");',
    to: "",
  },
  {
    file: "src/lib/trading/load.ts",
    what: "a whitespace-only string is read as absent",
    from: "  return typeof value === \"string\" && value.trim() ? value : null;",
    to: "  return typeof value === \"string\" ? value : null;",
  },
  {
    file: "src/lib/unsplash.ts",
    what: "a whitespace-only field is read as absent",
    from: '  return typeof value === "string" && value.trim() !== "" ? value : null;',
    to: '  return typeof value === "string" ? value : null;',
  },
  {
    file: "src/app/api/search/route.ts",
    what: "an unparseable date is dropped rather than passed on",
    from: "  const since = sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? sinceRaw : null;",
    to: "  const since = sinceRaw ?? null;",
  },
  {
    file: "src/lib/production-errors.ts",
    what: "a non-positive or unparseable number falls back",
    from: "  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;",
    to: "  return parsed;",
  },
];

function runUnitSuite() {
  try {
    execFileSync("npm", ["run", "test:unit"], { encoding: "utf8", stdio: "pipe", timeout: 600000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...new Set([...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()))],
    };
  }
}

const healed = healFromSidecar();
if (healed.length > 0) console.log(`healed from a killed run: ${healed.join(", ")}\n`);

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
};
const FROM = arg("--from", 0);
const COUNT = arg("--count", GUARDS.length);
const slice = GUARDS.slice(FROM, FROM + COUNT);

const originals = new Map([...new Set(GUARDS.map((g) => g.file))].map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) {
    writeFileSync(file, text);
    unstash(file);
  }
};

console.log(`unguarded-guards: guards ${FROM}..${FROM + slice.length - 1} of ${GUARDS.length}\n`);
const watched = [];
const unwatched = [];
try {
  const base = runUnitSuite();
  console.log(`baseline: the unit suite is ${base.green ? "GREEN" : "RED"}`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — nothing below would mean anything.\n  ${base.failed.slice(0, 5).join("\n  ")}`);
    process.exit(1);
  }

  for (const g of slice) {
    const original = originals.get(g.file);
    const n = original.split(g.from).length - 1;
    if (n !== 1) {
      console.log(`  SKIP    ${g.what}\n          anchor appears ${n} times in ${g.file}`);
      unwatched.push({ ...g, why: `anchor appears ${n} times — could not be tested` });
      continue;
    }
    // SIDECAR FIRST, source second. If this process dies between the two
    // lines the sidecar is redundant; if it dies after, the sidecar is
    // the only thing that knows what the file said.
    stash(g.file, original);
    writeFileSync(g.file, original.replace(g.from, g.to));
    let result;
    try {
      result = runUnitSuite();
    } finally {
      restoreAll();
    }
    // THE MARKER GATE IS NOT A WITNESS. check-mutation-markers.mjs fails
    // on the literal `if (false)`, so an `if (false)` mutation reports
    // itself as "caught" without any test having looked at the
    // behaviour. The first run of this file counted that as a guard being
    // watched, which was exactly backwards.
    const behavioural = result.failed.filter((f) => !/mutation marker/i.test(f));
    if (result.green || behavioural.length === 0) {
      unwatched.push({
        ...g,
        why: result.green
          ? "the whole unit suite stayed green with the guard gone"
          : "only the mutation-marker gate noticed, which watches the SHAPE of the edit, not the behaviour",
      });
      console.log(`  NOBODY  ${g.what}\n          ${g.file}`);
    } else {
      watched.push({ ...g, by: behavioural.slice(0, 3) });
      console.log(`  WATCHED ${g.what}\n          caught by: ${behavioural.slice(0, 2).join(" | ")}`);
    }
  }
} finally {
  restoreAll();
}

console.log(`\n${watched.length} of ${slice.length} guards in this chunk are watched by a test.`);
if (unwatched.length > 0) {
  console.log("\nNOT WATCHED — each is either redundant or load-bearing-and-unguarded:");
  for (const g of unwatched) console.log(`  - ${g.file}\n    ${g.what}\n    ${g.why}`);
}
