#!/usr/bin/env node
/*
 * CAN route-shadowing.test.mjs SEE A FEATURE GO DARK?
 *
 * The bug it was written for was invisible by construction: a static
 * directory named after a module slug wins over the [module] catch-all,
 * and Next.js says nothing at build time or run time. /dashboard/finance
 * was the owner-only Financial Dashboard for two releases while "Finances"
 * sat in the main nav for every user and led them to a 404.
 *
 * So the first mutation is the bug, restored: put a static page back at a
 * module's slug. The rest are the ways the gate could stop seeing it —
 * the scan reading nothing, the exemption list swallowing a real case, the
 * nav parse finding no items — plus the second bug in the same family, an
 * owner-only page reachable from a nav that has no idea about roles.
 *
 * Run: node scripts/tests/route-shadowing.mutation.mjs
 */
import { readFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/route-shadowing.test.mjs";
const NAV = "src/lib/sidebar-nav.ts";
const VISIBILITY = "src/lib/sidebar-visibility.ts";
const PALETTE = "src/components/dashboard/command-palette.tsx";
const TARGETS = [GATE, NAV, VISIBILITY, PALETTE];

// The shadowing mutant needs a DIRECTORY, not a text edit, so it is
// handled separately from the string replacements below.
const SHADOW_DIR = "src/app/dashboard/finance";
const SHADOW_PAGE = `${SHADOW_DIR}/page.tsx`;

const MUTANTS = [
  {
    name: "an owner-only page in the nav loses its ownerOnly flag",
    file: NAV,
    from: "        hintKey: \"businessHealth\",\n        ownerOnly: true,",
    to: '        hintKey: "businessHealth",',
    expect: "every owner-only page in the nav is marked",
  },
  {
    name: "the filter stops removing anything",
    file: VISIBILITY,
    from: "    .map((group) => ({ ...group, items: group.items.filter((i) => !i.ownerOnly) }))",
    to: "    .map((group) => ({ ...group, items: group.items.slice() }))",
    expect: "a non-owner sees no owner-only item",
  },
  {
    name: "an emptied group is rendered as a bare heading",
    file: VISIBILITY,
    from: "    .filter((group) => group.items.length > 0);",
    to: "    .filter(() => true);",
    expect: "a group left empty is dropped",
  },
  {
    name: "the filter mutates the shared config",
    file: VISIBILITY,
    from: "    .map((group) => ({ ...group, items: group.items.filter((i) => !i.ownerOnly) }))",
    to: "    .map((group) => { group.items = group.items.filter((i) => !i.ownerOnly); return group; })",
    expect: "the config itself is never mutated",
  },
  {
    name: "the command palette stops filtering",
    file: PALETTE,
    from: "  visibleGroups(ALL_SIDEBAR_GROUPS, isOwner).flatMap((group) => group.items);",
    to: "  ALL_SIDEBAR_GROUPS.flatMap((group) => group.items);",
    expect: "the command palette filters by the same rule",
  },
  {
    name: "the nav parse finds no items",
    file: GATE,
    from: "const navChunks = NAV_SRC.split(/href:\\s*/).slice(1);",
    to: "const navChunks = [];",
    expect: "the nav was parsed",
  },
  {
    name: "the app directory scan reads nothing",
    file: GATE,
    from: '  (d) => statSync(`${DASHBOARD}/${d}`).isDirectory() && !d.startsWith("["),',
    to: "  () => false,",
    expect: "the scan read the app directory",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return {
      green: false,
      failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()),
    };
  }
}

console.log("route-shadowing mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
  if (existsSync(SHADOW_DIR)) rmSync(SHADOW_DIR, { recursive: true, force: true });
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(
    `baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`,
  );
  if (!base.green) {
    console.log(
      `\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`,
    );
    process.exit(1);
  }

  // ---- THE BUG ITSELF, put back as a real directory ------------------
  {
    const name = "a static page is added at a module's slug again";
    const expect = "no [module] slug has a static directory";
    mkdirSync(SHADOW_DIR, { recursive: true });
    writeFileSync(
      SHADOW_PAGE,
      "export default function Shadow() {\n  return null;\n}\n",
    );
    let result;
    try {
      result = runGate();
    } finally {
      rmSync(SHADOW_DIR, { recursive: true, force: true });
    }
    const onTarget = result.failed.filter((f) => f.includes(expect));
    if (result.green || onTarget.length === 0) {
      missed.push({
        name,
        why: result.green
          ? "the gate stayed green — the shadowing check is not load-bearing"
          : `red on "${result.failed.join('", "')}" — nothing matching "${expect}"`,
      });
      console.log(`  ${result.green ? "MISSED" : "WRONG "}  ${name}`);
    } else {
      caught++;
      console.log(`  CAUGHT  ${name}\n          -> ${onTarget[0]}`);
    }
  }

  // ---- the exemption list, which only bites when there IS a case ----
  //
  // Widening DELIBERATE on a healthy tree changes nothing: no module slug
  // has a static directory, so exempting all twelve exempts nothing. The
  // first version of this mutant did exactly that and was reported as a
  // hole, correctly. Paired with a real shadow, the reverse check — "an
  // exempt static route must really be a build module's own page" — is
  // what stops the exemption list becoming a place to hide a bug.
  {
    const name = "the exemption list is widened to cover a real shadow";
    const expect = "every exempt static route really is a build module's own page";
    const from = "const DELIBERATE = new Set(BUILD_MODULES.map((m) => m.slug));";
    const to = "const DELIBERATE = new Set(MODULES.map((m) => m.slug));";
    if (!originals.get(GATE).includes(from)) {
      missed.push({ name, why: `the mutation target no longer exists in ${GATE}` });
      console.log(`  STALE   ${name}`);
    } else {
      mkdirSync(SHADOW_DIR, { recursive: true });
      writeFileSync(
        SHADOW_PAGE,
        "export default function Shadow() {\n  return null;\n}\n",
      );
      writeFileSync(GATE, originals.get(GATE).replace(from, to));
      let result;
      try {
        result = runGate();
      } finally {
        restoreAll();
      }
      const onTarget = result.failed.filter((f) => f.includes(expect));
      if (result.green || onTarget.length === 0) {
        missed.push({
          name,
          why: result.green
            ? "the gate stayed green — the exemption list is not checked"
            : `red on "${result.failed.join('", "')}" — nothing matching "${expect}"`,
        });
        console.log(`  ${result.green ? "MISSED" : "WRONG "}  ${name}`);
      } else {
        caught++;
        console.log(`  CAUGHT  ${name}\n          -> ${onTarget[0]}`);
      }
    }
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
      missed.push({
        ...m,
        why: `the gate went red, but on "${result.failed.slice(0, 4).join('", "')}" — nothing matching "${m.expect}"`,
      });
      console.log(
        `  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 4).join(" | ")}`,
      );
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const total = MUTANTS.length + 2;
const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git status`.",
);

console.log(`\n${caught} of ${total} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Every clause of the gate is load-bearing.");
