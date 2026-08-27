// The pre-commit hook, written into .git/hooks by `npm install`.
//
// .git/hooks IS NOT VERSIONED, which is the whole difficulty: a hook file
// committed to the repository does nothing, and a fresh clone has no hooks
// at all. So the hook is INSTALLED from a script that npm runs on install,
// and the check it calls also runs inside `npm run build` — because a guard
// that only exists on one laptop is a guard that is missing exactly when
// somebody else makes the mistake.
//
// It is deliberately thin. All it does is call the checker, so the rules
// live in one versioned file and a hook installed months ago cannot enforce
// an old version of them.
//
// Run: node scripts/install-hooks.mjs
import {
  writeFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";

const HOOK = ".git/hooks/pre-commit";
const BODY = `#!/bin/sh
# Installed by scripts/install-hooks.mjs. Do not edit — edit the checker.
#
# Refuses a commit that would record a mutation marker: the shape a killed
# mutation suite leaves behind. See scripts/check-mutation-markers.mjs.
exec node scripts/check-mutation-markers.mjs --staged
`;

if (!existsSync(".git")) {
  // A worktree, a CI checkout with no .git, or an npm install inside a
  // tarball. Not an error: the build runs the same check anyway.
  console.log("install-hooks: no .git here, skipping (the build still checks)");
  process.exit(0);
}

try {
  mkdirSync(".git/hooks", { recursive: true });
  const existing = existsSync(HOOK) ? readFileSync(HOOK, "utf8") : "";
  if (existing && !existing.includes("check-mutation-markers")) {
    // SOMEBODY ELSE'S HOOK. Overwriting it silently would remove a check
    // this script knows nothing about.
    console.error(
      "install-hooks: .git/hooks/pre-commit exists and is not ours — leaving it alone.",
    );
    console.error("               Add this line to it yourself:");
    console.error(
      "               node scripts/check-mutation-markers.mjs --staged || exit 1",
    );
    process.exit(0);
  }
  writeFileSync(HOOK, BODY);
  chmodSync(HOOK, 0o755);
  console.log("install-hooks: pre-commit installed");
} catch (error) {
  console.error(
    `install-hooks: could not install (${String(error).slice(0, 120)})`,
  );
}
