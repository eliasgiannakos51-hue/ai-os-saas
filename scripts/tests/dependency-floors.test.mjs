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
// image-size and source-map-js joined on 2026-10-08 (ΑΣ-8.1, measured
// that day with `npm audit --omit=dev`: three high, through pptxgenjs and
// through next's postcss). source-map-js took its fix inside the range
// postcss asks for. image-size has no fix on the 1.x line pptxgenjs 4.0.1
// declares, so package.json `overrides` lifts every copy to the 2.x fix —
// and that is only safe because pptxgenjs never loads it: the checks after
// the declared ranges read every file pptxgenjs ships and require the name
// to appear in none, and
// a deck with a picture was written on 2026-10-08, and again on
// 2026-10-09, with image-size made unloadable (docs/PROGRESS.md,
// 2026-10-09).
//
// Run: node scripts/tests/dependency-floors.test.mjs
import { existsSync, readdirSync, readFileSync } from "node:fs";

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
  "image-size": "2.0.3",
  "source-map-js": "1.2.2",
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

// THE OVERRIDE, and why it is safe. pptxgenjs declares image-size ^1.2.1,
// the 1.x line has no fixed release, and npm's own "fix" is a downgrade of
// pptxgenjs. The override is what holds the lockfile at the fix, so it
// is held too — and it is only harmless while pptxgenjs runs none of
// image-size, which is read from what pptxgenjs ships rather than assumed.
const override = String(pkg.overrides?.["image-size"] ?? "").replace(/^[\^~]/, "");
ok(`package.json overrides image-size at or above ${FLOORS["image-size"]} (${override || "none"})`, override !== "" && cmp(override, FLOORS["image-size"]) >= 0);
const PPTX_DIST = "node_modules/pptxgenjs/dist";
const shipped = existsSync(PPTX_DIST) ? readdirSync(PPTX_DIST).filter((f) => f.endsWith(".js")) : [];
ok(`pptxgenjs is installed and its code was read (${shipped.length} files)`, shipped.length > 0);
const loaders = shipped.filter((f) => readFileSync(`${PPTX_DIST}/${f}`, "utf8").includes("image-size"));
ok("...and none of it loads image-size, so the override changes nothing pptxgenjs runs", shipped.length > 0 && loaders.length === 0, loaders.join(", "));

// And the comparison itself, on the cases that matter.
ok("the comparison orders patch versions", cmp("0.35.3", "0.35.4") < 0 && cmp("0.35.5", "0.35.4") > 0);
ok("…and does not compare as strings", cmp("3.3.9", "3.3.18") < 0);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
