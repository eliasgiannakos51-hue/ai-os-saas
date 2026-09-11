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

  // ---------------------------------------------------------------------
  // V5 #14 — ONE REPRESENTATIVE PER SHAPE, in the owner's priority order:
  // money, auth, user data.
  //
  // THE FIRST TEN ABOVE WERE NOT A SAMPLE OF ANYTHING. They were picked
  // because they looked odd — unicode folding, whitespace trimming, a
  // date parse — and seven of them turned out to be watched by nobody.
  // Extrapolating that ratio to the whole codebase gave "~1,800
  // unguarded", and the extrapolation does not hold: the population is
  // dominated by a handful of shapes REPEATED across routes. 189 auth
  // guards are 32 distinct shapes, and 132 of them are the same line.
  //
  // So these are chosen the other way round: one instance of each shape
  // that recurs, because whatever the suite does about one it does about
  // all of them. Nine experiments cover 195 guards.
  {
    category: "auth",
    file: "src/app/api/account/export/route.ts",
    what: "a route refuses an unauthenticated caller (the shape 132 routes repeat)",
    from: "if (!user) {\n      return NextResponse.json({ ok: false, error: \"Not authenticated.\" }, { status: 401 });\n    }",
    to: "",
  },
  {
    category: "auth",
    file: "src/app/api/agents/[id]/run/route.ts",
    what: "a route refuses to run without a server API key (the shape 25 routes repeat)",
    from: "if (!apiKey) {\n      return NextResponse.json(\n        { ok: false, error: \"The AI service is not configured on the server.\" },\n        { status: 500 }\n      );\n    }",
    to: "",
  },
  {
    category: "auth",
    file: "src/app/api/system-health/files/route.ts",
    what: "an owner-only route refuses a customer",
    from: "if (!isAdminEmail(user.email)) return NextResponse.json({ ok: false }, { status: 404 });",
    to: "",
  },
  {
    category: "user data",
    file: "src/app/api/published/[id]/rollback/route.ts",
    what: "rolling back refuses a site that is not yours",
    from: "if (!site) {\n      return NextResponse.json({ ok: false, error: \"Site not found.\" }, { status: 404 });\n    }",
    to: "",
  },
  {
    category: "money",
    file: "src/app/api/agents/templates/adopt/route.ts",
    what: "adopting a template refuses when the hold could not be taken (18 routes repeat it)",
    from: "if (!reservation.ok) {\n        return NextResponse.json(\n          { ok: false, insufficientCredits: reservation.reason === \"insufficient\", error: \"Could not reserve credits.\" },\n          { status: 402 }\n        );\n      }",
    to: "",
  },
  {
    category: "money",
    file: "src/app/api/agents/templates/adopt/route.ts",
    what: "adopting a template refuses an account that cannot afford it (8 routes repeat it)",
    from: "if (!affordable.ok) {\n        return NextResponse.json(\n          { ok: false, insufficientCredits: true, error: \"Not enough credits.\" },\n          { status: 402 }\n        );\n      }",
    to: "",
  },
  {
    category: "money",
    file: "src/lib/billing/credit-formula.ts",
    what: "a non-positive or unparseable real cost charges nothing (5 pricing functions repeat it)",
    from: "export function creditsForRealCostEur(\n  realCostEur: number,\n  config?: PricingConfig,\n  marginMultiplier?: number\n): number {\n  const c = config ?? resolvePricingConfig();\n  if (!Number.isFinite(realCostEur) || realCostEur <= 0) return 0;",
    to: "export function creditsForRealCostEur(\n  realCostEur: number,\n  config?: PricingConfig,\n  marginMultiplier?: number\n): number {\n  const c = config ?? resolvePricingConfig();",
  },
  {
    category: "money",
    file: "src/lib/billing/credit-formula.ts",
    what: "a pack with an unparseable price or credit count is refused rather than priced",
    from: "if (!Number.isFinite(source.price) || !Number.isFinite(source.credits)) return null;",
    to: "",
  },
  {
    category: "user data",
    file: "src/app/api/files/collections/route.ts",
    what: "creating a collection refuses a file id that is not yours (THE CONTROL: reported NOBODY by the broken instrument, WATCHED by the fixed one \u2014 its gate was there all along)",
    from: "if (ownedIds.length !== requested.length) {\n        return NextResponse.json({ ok: false, error: \"One of those files does not exist.\" }, { status: 404 });\n      }",
    to: "",
  },
];

/**
 * THE UNIT SUITE, AND WHETHER IT ACTUALLY RAN.
 *
 * THREE OUTCOMES, NOT TWO, and the third is why this file's first
 * results were void. `execFileSync` defaults to a ONE MEGABYTE stdout
 * buffer. `npm run test:unit` prints 1,195,212 bytes. So every call threw
 * ENOBUFS with the output truncated at 1,037,423 bytes — and the old
 * version caught that, found no FAIL lines in the fragment, and returned
 * `{green: false, failed: []}`.
 *
 * The caller reads an empty failure list as NOBODY IS WATCHING THIS
 * GUARD. So a suite that never finished — that never reached the gate
 * which would have caught the removal — was reported as proof that no
 * gate cares. Measured 2026-09-08: the output was already ~1.19 MB when
 * this file was written on 2026-09-07, so no "NOBODY" verdict it has ever
 * printed was evidence of anything. The two WATCHED verdicts survive: a
 * FAIL line in the first megabyte is still a FAIL line.
 *
 * That is the same shape as /api/health naming six functions missing that
 * were not, and it is worse here, because the direction of the error is
 * the reassuring one: it invents absence of a guard rather than presence.
 *
 * So the buffer is raised to something the suite cannot outgrow quietly,
 * AND a run that ends without a verdict is INCONCLUSIVE — never counted
 * as green, never counted as red, and loud.
 */
const MAX_BUFFER = 256 * 1024 * 1024;

/** The line `npm run test:unit` prints last if it reached the end. Its
 *  absence means the run stopped early, whatever the exit code says. */
function completed(out) {
  return /^--- scripts\/tests\/[a-z0-9-]+\.test\.mjs$/m.test(out) && /\bpassed\b/.test(out);
}

/**
 * EVERY SUITE, NOT UP TO THE FIRST FAILURE.
 *
 * `npm run test:unit` is `for f in …; do node "$f" || exit 1; done`. That
 * is right for a build and wrong for this experiment, and it was the
 * third way this file reported absence it had not observed: remove
 * `if (!user) return 401` from a route and baselines.test.mjs reddens
 * first — because one English error string went missing — the loop stops,
 * and route-refusals.test.mjs, the suite written to catch exactly that
 * deletion, never runs. The verdict came back "nobody is watching".
 *
 * So the suites are run here, all of them, and every failure is
 * collected. Slower on a mutated tree by design: the whole point is to
 * find out who ELSE would have noticed.
 */
function runAllSuites() {
  const files = readdirSync("scripts/tests")
    .filter((f) => f.endsWith(".test.mjs"))
    .sort()
    .map((f) => join("scripts/tests", f));
  const failed = [];
  let ran = 0;
  for (const file of files) {
    try {
      execFileSync(process.execPath, [file], {
        encoding: "utf8",
        stdio: "pipe",
        timeout: 900_000,
        maxBuffer: MAX_BUFFER,
        env: { ...process.env, UNGUARDED_GUARDS_RUNNING: "1" },
      });
      ran++;
    } catch (e) {
      if (e.code === "ENOBUFS" || e.code === "ETIMEDOUT" || e.signal) {
        return { inconclusive: `${file} did not finish: ${e.code ?? e.signal}` };
      }
      ran++;
      const out = String(e.stdout ?? "") + String(e.stderr ?? "");
      for (const m of out.matchAll(/^ {2}FAIL {2}(.+)$/gm)) failed.push(m[1].trim());
    }
  }
  if (ran === 0) return { inconclusive: "no suite ran at all" };
  return failed.length === 0 ? { green: true, failed: [] } : { green: false, failed: [...new Set(failed)] };
}

function runUnitSuiteViaNpm() {
  try {
    const out = execFileSync("npm", ["run", "test:unit"], {
      encoding: "utf8",
      stdio: "pipe",
      timeout: 3_600_000,
      maxBuffer: MAX_BUFFER,
      // SAYS THE SIDECAR IS EXPECTED. Without it check-mutation-tree.mjs
      // reports "unguarded-guards.mjs was killed holding a guard
      // removed" — during the seconds unguarded-guards.mjs is legitimately
      // holding a guard removed — and mutation-tree.test.mjs turns that
      // into a red suite that has nothing to do with the guard.
      env: { ...process.env, UNGUARDED_GUARDS_RUNNING: "1" },
    });
    if (!completed(out)) return { inconclusive: "the suite exited 0 without reporting any suite" };
    return { green: true, failed: [] };
  } catch (e) {
    // A CRASH IS NOT A FAILING TEST. ENOBUFS, ETIMEDOUT, or a kill signal
    // mean the experiment did not happen; reading them as "nothing went
    // red" is how this file spent a round reporting absence it had not
    // observed.
    if (e.code === "ENOBUFS" || e.code === "ETIMEDOUT" || e.signal) {
      return { inconclusive: `the suite did not finish: ${e.code ?? e.signal}` };
    }
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...new Set([...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()))];
    if (failed.length === 0 && !completed(out)) {
      return { inconclusive: "the suite exited non-zero with no FAIL line and no suite report" };
    }
    return { green: false, failed };
  }
}

/** The experiment uses runAllSuites; runUnitSuiteViaNpm is kept because
 *  the npm script is what the BUILD runs, and a disagreement between the
 *  two would be worth seeing. */
const runUnitSuite = runAllSuites;

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
const inconclusive = [];
try {
  const base = runUnitSuite();
  if (base.inconclusive) {
    console.log(`BASELINE INCONCLUSIVE — ${base.inconclusive}`);
    console.log("Nothing below would mean anything, and an empty failure list is NOT an absence of guards.");
    process.exit(1);
  }
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
    if (result.inconclusive) {
      inconclusive.push({ ...g, why: result.inconclusive });
      console.log(`  UNKNOWN ${g.what}\n          ${result.inconclusive}`);
      continue;
    }
    // AND baselines.test.mjs IS THE SAME CLASS, found the same way on the
    // very first guard tested here. Deleting `if (!user) return
    // NextResponse.json({ error: "Not authenticated." } …)` removes one
    // server-side English string, SERVER_PROSE_BASELINE drops 655 -> 654,
    // and the build goes red on "no baseline has more room than it is
    // allowed". True, useful, and completely silent about
    // authentication: it fires identically for deleting a typo message.
    // Counting it as a witness would mean every guard whose rejection
    // carries English prose reads as watched — which is most of the 189
    // auth guards and most of the 66 ownership ones.
    const SHAPE_ONLY = /mutation marker|no baseline has more room/i;
    const behavioural = result.failed.filter((f) => !SHAPE_ONLY.test(f));
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
if (inconclusive.length > 0) {
  // NOT "unwatched". The experiment did not run, and saying nothing
  // watches a guard because the suite crashed is the defect this file
  // shipped with.
  console.log("\nINCONCLUSIVE — the suite did not finish, so these were not tested:");
  for (const g of inconclusive) console.log(`  - ${g.file}\n    ${g.what}\n    ${g.why}`);
}
if (unwatched.length > 0) {
  console.log("\nNOT WATCHED — each is either redundant or load-bearing-and-unguarded:");
  for (const g of unwatched) console.log(`  - ${g.file}\n    ${g.what}\n    ${g.why}`);
}
