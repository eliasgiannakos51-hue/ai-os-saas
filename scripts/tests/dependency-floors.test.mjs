// The lowest version of a dependency this repository will ship, for the
// ones that had a published advisory fixed by a minor or patch release.
//
// ΑΣ-8.1 in docs/SECURITY-AUDIT.md, 2026-10-05: `npm audit --omit=dev`
// reported sharp below 0.35.4 and nanoid below 3.3.18. Both fixes were
// within range, so `npm audit fix` took them — and the same command, or a
// lockfile regenerated on an older cache, can take them back. Nothing else
// in the build would notice: the app runs the same either way.
//
// The population is the lockfile, every copy: nanoid is reached twice
// (directly, and through next's own postcss), deduplicated to one copy
// today. A floor checked on the top-level copy alone would pass on the
// day a nested copy comes back below it.
//
// next joined on 2026-10-05 with the upgrade to 16.3.8: 16.3.0 is the
// first stable release outside every critical and high advisory range
// `npm audit` reported against 14.2.35 (and it carries the postcss fix).
// react and react-dom go with it, because Next 16 needs React 19.
//
// What is NOT here, on purpose, and where it is instead: pptxgenjs and
// image-size (high, no fix on the 4.x line we use — npm's only "fix" is a
// downgrade to 4.0.0). Open in docs/SECURITY-AUDIT.md (ΑΣ-8.1), because a
// floor for a version that does not exist would be a gate that can only
// be red.
//
// Run: node scripts/tests/dependency-floors.test.mjs
import { readFileSync } from "node:fs";

let pass = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

const FLOORS = {
  sharp: "0.35.4",
  nanoid: "3.3.18",
  next: "16.3.0",
  react: "19.0.0",
  "react-dom": "19.0.0",
};

function cmp(a, b) {
  const pa = a.split(/[.-]/).map((x) => Number.parseInt(x, 10));
  const pb = b.split(/[.-]/).map((x) => Number.parseInt(x, 10));
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
const packages = lock.packages ?? {};
ok(`the lockfile was read (${Object.keys(packages).length} entries)`, Object.keys(packages).length > 100);

for (const [name, floor] of Object.entries(FLOORS)) {
  const copies = Object.entries(packages).filter(([path]) => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`));
  ok(`${name} is installed (${copies.length} cop${copies.length === 1 ? "y" : "ies"})`, copies.length > 0);
  const below = copies.filter(([, meta]) => cmp(String(meta.version ?? "0"), floor) < 0);
  ok(
    `every copy of ${name} is at least ${floor}`,
    below.length === 0,
    below.map(([path, meta]) => `${path}@${meta.version}`).join(", ")
  );
}

// The declared range moves with the floor, so a fresh `npm install` on a
// cold cache cannot resolve below it either.
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
for (const name of ["sharp", "next", "react", "react-dom"]) {
  const declared = String(pkg.dependencies?.[name] ?? "").replace(/^[\^~]/, "");
  ok(`package.json declares ${name} at or above ${FLOORS[name]} (${declared})`, declared !== "" && cmp(declared, FLOORS[name]) >= 0);
}

// And the comparison itself, on the cases that matter.
ok("the comparison orders patch versions", cmp("0.35.3", "0.35.4") < 0 && cmp("0.35.5", "0.35.4") > 0);
ok("…and does not compare as strings", cmp("3.3.9", "3.3.18") < 0);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
