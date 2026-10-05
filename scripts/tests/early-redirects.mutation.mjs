#!/usr/bin/env node
/*
 * CAN early-redirects.test.mjs SEE A REDIRECT THAT REACHES THE ROUTER?
 *
 * The ways issue #61 comes back: middleware stops deciding Home, a failed
 * onboarding read starts bouncing established accounts, the Team gate
 * lets an invited member through, a page goes back to its own literal
 * redirect, and a middleware redirect drops the rotated session cookies.
 *
 * Run: node scripts/tests/early-redirects.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/early-redirects.test.mjs";
const LIB = "src/lib/nav/early-redirects.ts";
const MW = "src/middleware.ts";
const OVERVIEW = "src/app/dashboard/overview/page.tsx";
const TARGETS = [GATE, LIB, MW, OVERVIEW];

const MUTANTS = [
  {
    name: "middleware stops deciding Home",
    file: MW,
    from: 'if (request.nextUrl.pathname === "/dashboard/overview") {',
    to: 'if (request.nextUrl.pathname === "/dashboard/never") {',
    expect: "reads onboarding for Home",
  },
  {
    name: "a failed onboarding read sends the account to onboarding",
    file: LIB,
    from: "  if (read.error) return null;\n",
    to: "",
    expect: "a FAILED read never sends anyone to onboarding",
  },
  {
    name: "an invited member counts as the plan's owner",
    file: LIB,
    from: "  const ownsSubscription = access.isAdmin || Boolean(meta.stripe_subscription_id);",
    to: "  const ownsSubscription = true;",
    expect: "an invited member",
  },
  {
    name: "Home goes back to its own literal redirect",
    file: OVERVIEW,
    // RE-ANCHORED 2026-10-04: Home became the design's one block and
    // the guard one line.
    from: "  if (onboardingTarget) redirect(onboardingTarget);",
    to: '  if (onboardingTarget) redirect("/onboarding");',
    expect: "Home's own fallback uses the same function",
  },
  {
    name: "the Home redirect drops the rotated cookies",
    file: MW,
    from: "        url.search = \"\";\n        return withRefreshedCookies(NextResponse.redirect(url));\n      }\n    }\n  }",
    to: "        url.search = \"\";\n        return NextResponse.redirect(url);\n      }\n    }\n  }",
    expect: "keeps the refreshed cookies on every redirect",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 60_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
    };
  }
}

console.log("early-redirects mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git status`.",
);
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the gate is load-bearing.");
