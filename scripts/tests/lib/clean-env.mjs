// AN EXPLICIT ENVIRONMENT FOR A SPAWNED CHILD.
//
// Not a runnable check — the gate this was written for is
// scripts/tests/env-independence.test.mjs, and the failure that caused
// it is worth stating in full because it cost a red deploy.
//
// scripts/tests/check-site-spelling.test.mjs asserted that a runner
// invoked with no arguments prints
//
//     MISSING  ANTHROPIC_API_KEY  (in the environment, or --key <key>)
//
// and it spawned that runner with `execFileSync(node, [RUNNER])` — no
// `env`, so the child inherited whatever the machine had. On a developer
// machine with no key the line is printed and the check is green. On
// Vercel, where ANTHROPIC_API_KEY IS SET because the application needs
// it, the runner correctly does NOT report it missing, the line is
// absent, and the check goes red. Green here, red there, on identical
// code.
//
// Note which way round that is: the test passed locally because the key
// was ABSENT and failed in CI because it was PRESENT. The test was
// asserting what a program says when something is missing, in an
// environment that happened not to have it — and any machine that did
// have it turned the gate red.
//
// THE RULE THIS MAKES POSSIBLE: a gate that spawns a process gives that
// process an environment it chose. `pass` names the variables forwarded
// from the caller's environment — PATH and friends are always forwarded,
// because a child with no PATH cannot run at all — and `set` names the
// ones this test is deciding. Anything else is simply absent, on every
// machine, which is what makes the result the same on every machine.
const ALWAYS = ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SHELL", "LANG", "LC_ALL", "SystemRoot", "COMSPEC", "NODE_PATH", "NODE_OPTIONS"];

export function cleanEnv({ pass = [], set = {} } = {}) {
  const out = {};
  for (const key of [...ALWAYS, ...pass]) {
    if (process.env[key] !== undefined) out[key] = process.env[key];
  }
  for (const [key, value] of Object.entries(set)) {
    if (value === undefined || value === null) delete out[key];
    else out[key] = String(value);
  }
  return out;
}
