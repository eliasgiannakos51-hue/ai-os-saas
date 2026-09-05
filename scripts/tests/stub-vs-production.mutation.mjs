#!/usr/bin/env node
/*
 * CAN stub-vs-production.test.mjs SEE THE MODEL DRIFT FROM PRODUCTION?
 *
 * The register it guards is the answer to a question that has already
 * been wrong twice — once with the stub stricter than production (89
 * grants invisible), once with it looser (ten storage policies inert). A
 * register that cannot go red is a comment about a database, which is the
 * exact thing it exists to replace.
 *
 * Three of the mutations below edit the STUB, taking back a line whose
 * absence caused a real incident. Two edit a MIGRATION, introducing the
 * dependency the register says nothing has. Two break the READERS, so
 * that a scan finding nothing is distinguished from a scan that stopped
 * looking.
 *
 * Run: node scripts/tests/stub-vs-production.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/stub-vs-production.test.mjs";
const STUB = "scripts/db/bootstrap-supabase.sql";
const MIGRATION = "supabase/migrations/20260926000000_revoke_authenticated_grants_without_policy.sql";

const MUTANTS = [
  {
    // 1. THE LINE THAT MADE THE STORAGE POLICIES REAL. Without it the ten
    // policies on storage.objects are decoration and account A reads
    // account B's private file — measured, before it was added.
    name: "row level security on storage.objects is taken back out of the stub",
    file: STUB,
    from: "alter table storage.objects enable row level security;",
    to: "",
    expect: "the stub still models every one of them",
  },
  {
    // 2. THE DEFAULT PRIVILEGES. Their absence is what hid 89 (table,
    // verb) pairs from grant_without_policy for as long as it existed.
    name: "the public schema's default privileges are taken back out",
    file: STUB,
    from: "alter default privileges in schema public\n  grant all on tables to anon, authenticated, service_role;",
    to: "",
    expect: "the stub still models every one of them",
  },
  {
    // 3. AND THE STORAGE SCHEMA GRANT, whose absence gave "permission
    // denied for schema storage" rather than an isolation result.
    name: "authenticated loses USAGE on the storage schema",
    file: STUB,
    from: "grant usage on schema storage to anon, authenticated, service_role;",
    to: "",
    expect: "the stub still models every one of them",
  },
  {
    // 4. A DEPENDENCY ON A FUNCTION THE STUB DOES NOT HAVE. auth.jwt()
    // exists in production and not here, so a policy using it would pass
    // every local gate by never being exercised — the register says
    // nothing depends on it, and this is what keeps that true.
    name: "a migration starts calling auth.jwt(), which the stub does not provide",
    file: MIGRATION,
    from: "do $$",
    to: "select auth.jwt() ->> 'role';\ndo $$",
    expect: "nothing in the migrations calls auth.jwt() or auth.email()",
  },
  {
    // 5. A GRANT TO A ROLE PRODUCTION HAS AND THIS STUB DOES NOT.
    // `authenticator` is the role PostgREST logs in as; granting to it
    // works there and fails against a fresh database here.
    name: "a migration grants to `authenticator`, a role the stub never creates",
    file: MIGRATION,
    from: "do $$",
    to: "grant select on public.ideas to authenticator;\ndo $$",
    expect: "every one is a role the stub creates",
  },
  {
    // 6. THE EXTENSION ENTRY STOPS DESCRIBING THE STUB. Its `holds`
    // predicate is what keeps the entry from becoming an unchecked note
    // about a database, which is the failure this whole file replaces.
    name: "the stub stops installing unaccent, so the extension entry describes nothing",
    file: STUB,
    from: "create extension if not exists unaccent;",
    to: "",
    expect: "every one of them still describes this stub",
  },
  {
    // 7. THE READER STOPS READING. Nothing about the repository changes;
    // the scan simply finds nothing and prints the clean line it prints
    // when the repository really is clean. Only section 4's fixture
    // separates the two.
    name: "the auth.jwt detector stops matching, so a real call would be missed",
    file: GATE,
    from: 'const AUTH_FNS_THE_STUB_LACKS = () => /auth\\.(jwt|email)\\s*\\(/g;',
    to: 'const AUTH_FNS_THE_STUB_LACKS = () => /auth\\.(nothing)\\s*\\(/g;',
    expect: "an auth.jwt() call would be found",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("stub-vs-production mutations\n");

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
console.log("A stub that drifts from production, and a reader that stopped looking, are each red.");
