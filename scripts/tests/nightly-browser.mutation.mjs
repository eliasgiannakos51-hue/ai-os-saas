#!/usr/bin/env node
/*
 * CAN THE GATES SEE A PRODTEST LOSE ITS BROWSER?
 *
 * On 2026-10-14 the nightly `prodtests` job had been red since
 * 2026-10-10 (issue #280) and the reason was not in any test's subject.
 * `npm run test:prod` is a shell loop with `|| exit 1`;
 * chat-dictation.prodtest.mjs is the 11th of 74 files alphabetically and
 * named `/opt/pw-browsers/chromium` — this container's browser — as a
 * literal executablePath. A GitHub runner has no such file, so it threw
 * at launch and the other 63 prodtests never started. A third,
 * public-route-speed, probed the same path with existsSync and SKIPPED
 * its whole browser section instead, reporting green on every CI machine
 * for as long as it had existed.
 *
 * Two gates already spoke about this and neither could go red:
 * portable-paths accepted the word `executablePath` as proof of an
 * environment override — which a hard-coding file is obliged to write —
 * and prodtest-hygiene banned one other shape only.
 *
 * Each mutant below puts one of those back.
 *
 * Run: node scripts/tests/nightly-browser.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const PATHS = "scripts/tests/portable-paths.test.mjs";
const HYGIENE = "scripts/tests/prodtest-hygiene.test.mjs";
const DICTATION = "scripts/tests/chat-dictation.prodtest.mjs";
const VOICE = "scripts/tests/voice-command.prodtest.mjs";
const SPEED = "scripts/tests/public-route-speed.prodtest.mjs";
const DEPLOY = "scripts/prod/verify-deployment.mjs";
const RESOLVER = "scripts/tests/lib/chromium.mjs";

// BUILT IN TWO HALVES ON PURPOSE. portable-paths section 3 scans every
// file in the tree, this one included, and written whole the line below
// would make this suite an offender under the very check it exercises —
// the baseline would be red and no result here would mean anything.
const BUNDLED = "/opt/pw-browsers" + "/chromium";
const HARD_CODED = `executablePath: ${JSON.stringify(BUNDLED)},`;
const INLINE_ENV = `executablePath: process.env.CHROMIUM_PATH || ${JSON.stringify(BUNDLED)},`;
const PROBED = `const CHROMIUM = ${JSON.stringify(BUNDLED)};\nif (!existsSync(CHROMIUM)) console.log("  SKIP  no chromium");`;

const LITERAL = "no file hands Playwright the container's path as a literal";
const PROBE = "no prodtest decides on a browser by probing one fixed path";

const MUTANTS = [
  {
    name: "the prodtest that killed the nightly names the container's browser again",
    file: DICTATION,
    from: "executablePath: chromiumPath(),",
    to: HARD_CODED,
    expect: LITERAL,
  },
  {
    name: "...and the one at the far end of the alphabet, which nothing ever reached",
    file: VOICE,
    from: "executablePath: chromiumPath(),",
    to: HARD_CODED,
    expect: LITERAL,
  },
  {
    // Outside scripts/tests the shared resolver is not imported — the
    // scan that holds every path named in a comment resolves `lib/x.mjs`
    // as "beside me or one up" (scripts/scan-self-claims.mjs,
    // resolvePath), so a cross-tree import of it reads as a claim that
    // does not resolve. These files read the variable directly, which is
    // what the other sixty-four already do. The population of the rule is
    // still the whole tree, which is the point of this mutant.
    name: "a script outside scripts/tests does it, where the population is the whole tree",
    file: DEPLOY,
    from: INLINE_ENV,
    to: HARD_CODED,
    expect: LITERAL,
  },
  {
    name: "the silent one: a prodtest skips its browser section on a fixed path again",
    file: SPEED,
    from: "const CHROMIUM = chromiumPath();",
    to: PROBED,
    expect: PROBE,
  },
  {
    // The detector, not a file: this is the exact alternation that shipped
    // and could not say no.
    name: "the rule goes back to accepting the word `executablePath` as proof",
    file: PATHS,
    from: 'const letsEnvWin = (s) => /\\bchromiumPath\\s*\\(/.test(s) || /process\\.env\\.CHROMIUM_PATH/.test(s);',
    to: 'const letsEnvWin = (s) => /CHROMIUM_PATH|executablePath/.test(s);',
    expect: "the rule says no to a hard-coded browser path",
  },
  {
    name: "the probe rule reads comments again, so a paragraph can turn it red or keep it green",
    file: HYGIENE,
    from: "  .map(([f, s]) => [f, stripComments(s)])\n",
    to: "",
    expect: PROBE,
  },
  {
    // NOT A REORDER: THE REORDER WAS INVISIBLE ON THE MACHINE THAT MATTERS.
    // This first swapped the two branches so BUNDLED was consulted before
    // the variable. That is only a defect where BUNDLED exists — on a
    // GitHub runner the path is absent, the swapped branch falls through,
    // the function returns the variable exactly as before, and the clause
    // stayed green: the sweep reported `nightly-browser (1 mutation not
    // caught)` while the same suite printed 7/7 in this container.
    //
    // It is the shape CLAUDE.md records for merge commit aec56a2, with the
    // direction reversed: there a gate passed locally because a variable
    // was MISSING and failed in CI because it was SET; here a mutation was
    // caught locally because a FILE was present and missed in CI because it
    // was absent. A mutant whose verdict depends on the filesystem under it
    // is not a test of the code.
    //
    // Cutting the variable out of the answer altogether has one outcome
    // everywhere: with BUNDLED present it returns BUNDLED, without it
    // undefined, and neither is the value the gate set.
    name: "the resolver stops letting the environment win",
    file: RESOLVER,
    from: "  const fromEnv = process.env.CHROMIUM_PATH;",
    to: "  const fromEnv = undefined;",
    expect: "CHROMIUM_PATH overrides the built-in path",
  },
];

runMutations({
  name: "nightly-browser",
  gate: PATHS,
  targets: [PATHS, HYGIENE, DICTATION, VOICE, SPEED, DEPLOY, RESOLVER],
  mutants: MUTANTS.map((m) => (m.expect === PROBE || m.expect.includes("CHROMIUM_PATH overrides") ? { ...m, gate: HYGIENE } : m)),
});
