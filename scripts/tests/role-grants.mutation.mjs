#!/usr/bin/env node
/*
 * CAN THE NAMED LIST STILL REFUSE A ROLE NOBODY NAMED?
 *
 * scripts/db/role-grants.mjs is a matcher and a query, and both can rot
 * quietly. A widened rule reads exactly like a narrow one. A dropped
 * clause in ruleAllows() makes every holding allowed and every check pass.
 * A query that stops finding PUBLIC still returns two thousand rows and
 * looks healthy.
 *
 * So each mutation below re-introduces a defect this round actually found
 * or nearly shipped, and names the check that has to go red for it.
 *
 * THE LAST TWO ARE ABOUT OTHER FILES ON PURPOSE. One takes TRUNCATE out of
 * the migration — the list is only enforcement if the revoke is real. The
 * other puts `drop schema if exists public cascade` back into
 * clarification-rate.dbtest.mjs, which is what that file shipped with last
 * round, and requires db-migrations.test.mjs section 2b to name it.
 *
 * EVERY MUTATION IS A DELETION OR AN EDIT OF REAL CODE, never an
 * `if (false)`: scripts/check-mutation-markers.mjs fails the build on that
 * literal, so a mutation written that way is "caught" by the marker gate
 * without any behavioural check having looked at it.
 *
 * Run: node scripts/tests/role-grants.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/role-grants.test.mjs";
const MIG_GATE = "scripts/tests/db-migrations.test.mjs";
const SRC = "scripts/db/role-grants.mjs";
const MIG = "supabase/migrations/20260928000000_privileges_rls_cannot_scope.sql";
const BOOT = "scripts/db/bootstrap-supabase.sql";
const RATE = "scripts/tests/clarification-rate.dbtest.mjs";
const TARGETS = [SRC, MIG, BOOT, RATE];

const MUTANTS = [
  {
    // 1. THE TRAP THAT ATE THE MOST IMPORTANT ROW. pg_get_userbyid(0)
    // returns the string 'unknown (OID=0)', not NULL, so a coalesce()
    // never prints PUBLIC — and PUBLIC is where every unrevoked EXECUTE
    // grant in PostgreSQL lands. This is the first draft of the query,
    // restored.
    name: "PUBLIC is looked for with coalesce(pg_get_userbyid(...)) again",
    file: SRC,
    from: `         case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
         a.privilege_type
    from pg_class c`,
    to: `         coalesce(pg_get_userbyid(a.grantee), 'PUBLIC'),
         a.privilege_type
    from pg_class c`,
    expect: "PUBLIC is found by grantee = 0",
  },
  {
    // 2. THE LIST WIDENS BY ONE WORD. TRUNCATE back on the line that says
    // which verbs a signed-in user may hold — the exact privilege this
    // round found on 102 tables, and the one row level security does not
    // scope.
    name: "authenticated is allowed TRUNCATE again",
    file: SRC,
    from: `    facets: ["relation"],
    privileges: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    objects: ["public.*"],`,
    to: `    facets: ["relation"],
    privileges: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE"],
    objects: ["public.*"],`,
    expect: "authenticated TRUNCATE is refused",
  },
  {
    // 3. THE FACET STOPS MATTERING. Without it, a rule that permits
    // SELECT on a table also permits OWNER of it, and the eight facets
    // collapse into one.
    name: "ruleAllows stops comparing the facet",
    file: SRC,
    from: `  if (rule.facet !== "*" && rule.facet !== h.facet) return false;\n`,
    to: "",
    expect: "a different facet does not",
  },
  {
    // 4. AND THE PRIVILEGE. The same collapse one column over: a rule
    // permitting SELECT would permit DELETE.
    name: "ruleAllows stops comparing the privilege",
    file: SRC,
    from: `  if (rule.privilege !== "*" && rule.privilege !== h.privilege) return false;\n`,
    to: "",
    expect: "a different privilege does not",
  },
  {
    // 5. AN EXACT OBJECT BECOMES A PREFIX. `public.help_articles` would
    // then also permit `public.help_article_votes` — the classic
    // startsWith mistake, and the reason the named list says which table
    // rather than which beginning.
    name: "an exact object name is matched by prefix",
    file: SRC,
    from: "  if (rule.object === key) return true;",
    to: "  if (key.startsWith(rule.object)) return true;",
    expect: "not a table whose name merely begins with it",
  },
  {
    // 6. THE SCHEMA WILDCARD ESCAPES ITS SCHEMA. Dropping the
    // `h.schema !== ""` guard lets a rule written about schema-scoped
    // objects reach a facet that has no schema at all — membership,
    // attribute — where the object is a role name.
    name: "a schema wildcard is allowed to match a schemaless facet",
    file: SRC,
    from: '  return h.schema !== "" && rule.object === `${h.schema}.*`;',
    to: '  return rule.object === `${h.schema}.*` || rule.object.endsWith(".*");',
    expect: "a schema wildcard cannot reach a schemaless facet",
  },
  {
    // 7. THE ROLE THE REQUEST IS NAMED AFTER, QUIETLY ADDED. This is what
    // "somebody grants dashboard_user something and writes the rule to
    // make the gate green" looks like in a diff.
    name: "dashboard_user is added to the named list",
    file: SRC,
    from: "export const RULES = [\n  {\n    role: \"postgres\",",
    to:
      "export const RULES = [\n  {\n    role: \"dashboard_user\",\n    facets: [\"relation\"],\n    privileges: [\"SELECT\"],\n" +
      "    objects: [\"public.*\"],\n    why:\n      \"a reason long enough to satisfy the sixty-character rule in " +
      "role-grants.test.mjs section 1, which is exactly the point of this mutation.\",\n  },\n  {\n    role: \"postgres\",",
    expect: "dashboard_user is on no rule",
  },
  {
    // 8. authenticator STOPS BEING MEMBERSHIP-ONLY. A direct grant to the
    // login role is a privilege that survives every SET ROLE, which is
    // the distinction the rule exists to hold.
    name: "authenticator is allowed a direct grant, not only membership",
    file: SRC,
    from: `    role: "authenticator",
    facets: ["membership"],`,
    to: `    role: "authenticator",
    facets: ["membership", "relation"],`,
    expect: "only for membership, never for a grant",
  },
  {
    // 9. THE PASTE-INTO-PRODUCTION QUERY STOPS FILTERING. It would then
    // return two thousand rows, of which one is the finding, and whoever
    // pasted it would read "lots of output" as "lots of problems" or,
    // worse, scroll past.
    name: "--sql stops asking only for what is off the list",
    file: SRC,
    from: '  const filter = mode === "all" ? "" : "\\n where not h.allowed";',
    to: '  const filter = "";',
    expect: "--sql asks only for what is off the list",
  },
  {
    // 10. staleRules STARTS CALLING WILDCARDS STALE. `public.*` describes
    // a policy, not an inventory; reporting it as stale on an empty
    // schema would make the gate red for a reason that is not a defect,
    // and a gate that cries wolf gets switched off.
    name: "staleRules stops exempting the wildcard rules",
    file: SRC,
    from: '    (r) => r.object !== "*" && !r.object.endsWith(".*") && !holdings.some((h) => ruleAllows(r, h))',
    to: '    (r) => r.object !== "*" && !holdings.some((h) => ruleAllows(r, h))',
    expect: "a wildcard rule is never called stale",
  },
  {
    // 11. THE REVOKE ITSELF DISAPPEARS. The named list is only
    // enforcement while the migration that made the database match it is
    // real — and in this repository a migration is a file somebody
    // pastes by hand, so its content is the only record that it exists.
    name: "the migration stops revoking TRUNCATE",
    file: MIG,
    from: "revoke truncate, references, trigger on table %s from authenticated, anon",
    to: "revoke references, trigger on table %s from authenticated, anon",
    expect: "revokes TRUNCATE on every existing relation",
  },
  {
    // 12. THE FIXTURE LOSES THE ROLE THE CHECK IS ABOUT. Without
    // `authenticator` in the throwaway database, nothing named
    // authenticator can hold anything, and every assertion about it is
    // true of an empty set.
    name: "the fixture stops creating authenticator",
    file: BOOT,
    from: "    create role authenticator noinherit nologin;",
    to: "    perform 1;",
    expect: "creates authenticator",
  },
  {
    // 13. THE BUG THIS ROUND FOUND IN LAST ROUND'S WORK, PUT BACK.
    // clarification-rate.dbtest.mjs made room for five fixture rows by
    // dropping schema public — correct against a throwaway server,
    // catastrophic against the staging one run-dbtests.mjs invites
    // somebody to point it at, and already wrong on the throwaway: the
    // next suite in the alphabet died on a table that no longer existed.
    name: "a gate makes room for its fixture by dropping schema public",
    file: RATE,
    from: "  drop schema if exists ${PROBE} cascade;\n  create schema ${PROBE};",
    to: "  drop schema if exists public cascade;\n  create schema public;",
    gate: MIG_GATE,
    expect: "no gate drops or truncates what the migrations build",
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

console.log("role-grants mutations\n");

const GATES = [...new Set([GATE, ...MUTANTS.map((m) => m.gate ?? GATE)])];
const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  for (const g of GATES) {
    const base = runGate(g);
    console.log(`baseline: ${g.split("/").pop()} is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
    if (!base.green) {
      console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
      process.exit(1);
    }
  }

  for (const m of MUTANTS) {
    const gate = m.gate ?? GATE;
    if (!originals.get(m.file).includes(m.from)) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    writeFileSync(m.file, originals.get(m.file).replace(m.from, m.to));
    let result;
    try {
      result = runGate(gate);
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: `${gate} stayed green — nothing here is load-bearing` });
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

let allGreen = true;
for (const g of GATES) if (!runGate(g).green) allGreen = false;
console.log(
  allGreen
    ? "\nbaseline: every gate is green again on the restored tree"
    : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`."
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !allGreen) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("A role nobody named, a rule that widened, and a gate that deletes the database all turn this red.");
