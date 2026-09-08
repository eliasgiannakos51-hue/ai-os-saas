#!/usr/bin/env node
/*
 * CAN THE PRE-DEPLOY TOOL STILL SEE WHAT IT IS SUPPOSED TO EXPECT?
 *
 * scripts/db/pending-migrations.mjs answers "what have I not run?" by
 * deriving the objects each migration creates and asking the database
 * about them. Everything downstream — the table, the --sql pack, the
 * exit code — is honest only if that derivation is complete, and the
 * derivation is the half that can lose two hundred objects without a
 * single line of output changing.
 *
 * IT DID. Measured 2026-09-08: 218 CREATE POLICY statements in
 * supabase/migrations, FOURTEEN expected, because the rule that voids an
 * object a migration creates and then drops had no notion of ORDER and
 * every idempotent `drop policy if exists … ; create policy …` cancelled
 * itself. The count floor in front of it was 400 and green the whole
 * time.
 *
 * So each mutation below reintroduces one way the derivation goes quiet,
 * and names the check that has to notice.
 *
 * EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
 * scripts/check-mutation-markers.mjs fails the build on that literal, so
 * a mutation written that way is "caught" by the marker gate without any
 * behavioural check having looked at it.
 *
 * Run: node scripts/tests/pending-migrations.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/pending-migrations.test.mjs";
const SRC = "scripts/db/pending-migrations.mjs";
const TARGETS = [SRC];

const MUTANTS = [
  {
    // 1. THE DEFECT ITSELF. Drop the position comparison and every
    // idempotent policy in the repository cancels itself again — the
    // exact state this tool shipped in.
    name: "the in-file drop rule forgets that order matters",
    file: SRC,
    from: "later.objects = later.objects.filter((o) => !later.drops.some((d) => same(d, o) && d.at > o.at));",
    to: "later.objects = later.objects.filter((o) => !later.drops.some((d) => same(d, o)));",
    expect: "the expected set carries them",
  },
  {
    // 2. THE POSITIONS STOP BEING REAL, on the create side. With every
    // create at 0, any drop anywhere in the file looks like it came
    // afterwards — the same cancellation, reached from the other end.
    name: "a created policy no longer records where it was written",
    file: SRC,
    from: '    add("policy", name, `${(m[3] ?? "public").toLowerCase()}.${ident(m[4])}`, m.index);',
    to: '    add("policy", name, `${(m[3] ?? "public").toLowerCase()}.${ident(m[4])}`, 0);',
    expect: "drop-then-create: the object exists afterwards",
  },
  {
    // 3. AND ON THE DROP SIDE, which fails the opposite way: nothing can
    // ever be voided, so a probe table created and dropped inside one
    // migration is expected to exist for ever after.
    name: "a dropped policy no longer records where it was written",
    file: SRC,
    from: 'out.push({ kind: "table", name: ident(m[1]), extra: "", at: m.index });',
    to: 'out.push({ kind: "table", name: ident(m[1]), extra: "", at: 0 });',
    expect: "create-then-drop: the probe does not",
  },
  {
    // 4. THE SCHEMA IS DROPPED FROM A POLICY'S KEY. Every storage policy
    // is then looked for in `public`, where it will never be — a probe
    // that names ten things missing that are not, which CLAUDE.md calls
    // worse than no probe at all.
    name: "a policy's schema is assumed to be public",
    file: SRC,
    from: '    add("policy", name, `${(m[3] ?? "public").toLowerCase()}.${ident(m[4])}`, m.index);',
    to: '    add("policy", name, `public.${ident(m[4])}`, m.index);',
    expect: "and none of them is filed under public",
  },
];

function runGate(file) {
  try {
    execFileSync(process.execPath, [file], { encoding: "utf8", stdio: "pipe", timeout: 600_000 });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("pending-migrations mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate(GATE);
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
      result = runGate(GATE);
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

const after = runGate(GATE);
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
console.log("A derivation that quietly loses two hundred policies turns this red.");
