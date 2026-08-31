// WHERE THE BROWSER IS, ANSWERED ONCE.
//
// Five prodtests launched with `executablePath: process.env.CHROMIUM_PATH ||
// undefined` and thirty-two with `... || "/opt/pw-browsers/chromium"`. The
// five could not start a browser at all in the environment the other
// thirty-two run in: Playwright falls back to its own versioned download
// directory, which is not what is installed here, and the failure is
// `Executable doesn't exist at .../chromium_headless_shell-1234/...` —
// which reads like a Playwright installation problem rather than a
// difference between two lines of our own code.
//
// A test that cannot launch is not a passing test and not a failing test.
// It is no test.
//
// This resolves the same question for all of them, and it is deliberately
// BETTER than either of the two lines it replaces:
//
//   - CHROMIUM_PATH wins, so an operator can point at any build.
//   - the container's browser is used WHEN IT IS ACTUALLY THERE — checked,
//     not assumed. The thirty-two hard-coded copies name a path that does
//     not exist on a developer's laptop, and there they fail the same way
//     in the opposite direction.
//   - otherwise undefined, which lets Playwright use its own managed
//     download. That is the correct answer on a laptop.
import { existsSync } from "node:fs";

/** The container's Playwright browser, when this is a container. */
const BUNDLED = "/opt/pw-browsers/chromium";

/**
 * The chromium to launch, or undefined to let Playwright decide.
 *
 * Returns undefined rather than a non-existent path on purpose: passing a
 * path that is not there produces a worse error than passing nothing.
 */
export function chromiumPath() {
  const fromEnv = process.env.CHROMIUM_PATH;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv;
  if (existsSync(BUNDLED)) return BUNDLED;
  return undefined;
}
