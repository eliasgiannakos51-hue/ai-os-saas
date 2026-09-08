#!/usr/bin/env node
/*
 * IS THE WITNESS A WITNESS?
 *
 * route-refusals.test.mjs exists because V5 #14 removed these guards one
 * at a time and nothing went red. If deleting them still does not turn
 * this file red, it has changed nothing and the guards are still
 * unwatched — so the first four mutations below delete REAL refusals from
 * REAL routes, the ones the experiment proved nobody was watching.
 *
 * The last three attack the scan instead, because a check held at zero is
 * emptied just as easily by looking for the wrong thing. Two of them
 * restore false positives this scan actually had before it shipped: a
 * pattern anchored on `!user)` that called `if (!user || !user.email)`
 * unguarded, and a hold matcher without `await` that matched the import
 * line and put every route's spending before its refusal.
 *
 * EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
 * scripts/check-mutation-markers.mjs fails the build on that literal.
 *
 * Run: node scripts/tests/route-refusals.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/route-refusals.test.mjs";

const MUTANTS = [
  {
    name: "the authentication refusal 132 routes repeat is deleted",
    file: "src/app/api/account/export/route.ts",
    from: "if (!user) {\n      return NextResponse.json({ ok: false, error: \"Not authenticated.\" }, { status: 401 });\n    }",
    to: "",
    expect: "no route reads a user and then fails to refuse a missing one",
  },
  {
    name: "the refusal survives but the work moves in front of it",
    file: "src/app/api/account/export/route.ts",
    from: "if (!user) {\n      return NextResponse.json({ ok: false, error: \"Not authenticated.\" }, { status: 401 });\n    }",
    to: "await supabase.from(\"user_credits\").select(\"*\");\n    if (!user) {\n      return NextResponse.json({ ok: false, error: \"Not authenticated.\" }, { status: 401 });\n    }",
    expect: "no route starts work before refusing",
  },
  {
    name: "the refusal for a hold that could not be taken is deleted",
    file: "src/app/api/agents/templates/adopt/route.ts",
    from: "if (!reservation.ok) {\n        return NextResponse.json(\n          { ok: false, insufficientCredits: reservation.reason === \"insufficient\", error: \"Could not reserve credits.\" },\n          { status: 402 }\n        );\n      }",
    to: "",
    expect: "no route takes a hold and then fails to refuse a failed one",
  },
  {
    name: "a row read by id is used without refusing a missing one",
    file: "src/app/api/data-analysis/[id]/analyse/route.ts",
    from: "if (!analysis) return NextResponse.json({ error: \"not_found\" }, { status: 404 });",
    to: "",
    expect: "no route reads a row by id and then fails to refuse a missing one",
  },
  {
    name: "the refusal pattern narrows back to `!user)` and misses two real guards",
    file: "scripts/tests/route-refusals.test.mjs",
    from: "  refuse: [/if\\s*\\(\\s*!\\s*user\\b/],",
    to: "  refuse: [/if\\s*\\(\\s*!\\s*user\\s*\\)/],",
    expect: "is a refusal, not a miss",
  },
   {
    // 7. THE WRITE/READ DISTINCTION COLLAPSES. An UPDATE scoped by
    // user_id affects nothing when the row is not yours and needs no
    // missing-row refusal; a SELECT does. Stop telling them apart and the
    // gate accuses api/research/[id]'s compare-and-set, which tolerates a
    // lost race on purpose — a true sentence about the wrong statement.
    //
    // THIS REPLACED A MUTANT THAT COULD NOT BE CAUGHT: loosening the
    // money matcher on its own turns nothing red, because the routes
    // still carry their refusals and a looser pattern still finds them.
    // Permissiveness only shows up beside a deletion, and the deletion
    // mutant above already proves the same-variable rule is load-bearing.
    name: "a write is treated as a read that forgot to refuse a missing row",
    file: "scripts/tests/route-refusals.test.mjs",
    from: "    !/\\.(?:update|delete|insert|upsert)\\s*\\(/.test(",
    to: "    !/\\.(?:neverappears)\\s*\\(/.test(",
    expect: "no route reads a row by id and then fails to refuse a missing one",
  },
  {
    name: "the user matcher stops finding routes at all",
    file: "scripts/tests/route-refusals.test.mjs",
    from: "  obtain: [/auth\\s*\\.\\s*getUser\\s*\\(/],",
    to: "  obtain: [/auth\\s*\\.\\s*getUserProfile\\s*\\(/],",
    expect: "the api tree was read",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe", timeout: 600_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("route-refusals mutations\n");

const TARGETS = [...new Set(MUTANTS.map((m) => m.file))];
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
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
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
      missed.push({ ...m, why: `red on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
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
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("Deleting the line that stands between a stranger and a user's data turns this red.");
