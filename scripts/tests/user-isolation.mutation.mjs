#!/usr/bin/env node
/*
 * CAN user-isolation.dbtest.mjs SEE ONE ACCOUNT REACH ANOTHER'S ROWS?
 *
 * THIS SUITE MUTATES THE DATABASE, NOT THE SOURCE, and that is the only
 * honest way to test it. The defect it guards against is not a line of
 * TypeScript — it is a policy that says `using (true)` where it meant
 * `using (user_id = auth.uid())`, or a policy somebody dropped, or RLS
 * switched off on one table during an incident and never switched back.
 * None of those is visible in a diff of src/.
 *
 * So each mutation below is applied to a live throwaway Postgres with
 * ALTER/DROP/CREATE POLICY, the suite is run against it, and the schema is
 * put back. Nothing here touches a file.
 *
 * The tables are chosen for what a leak would cost: chat_messages holds
 * what somebody typed, user_credits holds their money, user_files holds
 * their documents, and ai_cost_log holds what they spent it on.
 *
 * Run: DATABASE_URL=... node scripts/tests/user-isolation.mutation.mjs
 */
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/user-isolation.dbtest.mjs";
const DB = process.env.DATABASE_URL ?? process.env.PGDATABASE;
if (!DB) {
  console.log("SKIPPED: no DATABASE_URL / PGDATABASE — this file needs a real Postgres.");
  process.exit(0);
}

const psql = (q) =>
  execFileSync("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", "-tA", "-c", q], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

/** Every policy on a table, as the SQL that would recreate it. */
function policyDefs(table, schema = "public") {
  const raw = psql(`
    select policyname || '' || cmd || '' || roles::text || ''
        || coalesce(qual, 'true') || '' || coalesce(with_check, '')
    from pg_policies where schemaname = '${schema}' and tablename = '${table}'
  `);
  return raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [name, cmd, roles, qual, withCheck] = line.split("");
      const to = roles.replace(/[{}]/g, "");
      const forClause = cmd === "ALL" ? "all" : cmd.toLowerCase();
      // AN INSERT POLICY HAS NO USING CLAUSE. Postgres rejects one
      // outright — "only WITH CHECK expression allowed for INSERT" — and
      // the first version of this restore emitted `using (true)` for every
      // policy it put back, which left chat_messages without its own
      // policies and every later mutation measuring a broken schema.
      const clauses =
        cmd === "INSERT"
          ? `with check (${withCheck || qual || "true"})`
          : `using (${qual || "true"})${withCheck ? ` with check (${withCheck})` : ""}`;
      return {
        name,
        drop: `drop policy if exists "${name}" on ${schema}.${table};`,
        create: `create policy "${name}" on ${schema}.${table} for ${forClause} to ${to} ${clauses};`,
      };
    });
}

// EACH `expect` IS A LIST, AND EVERY ENTRY MUST GO RED. A single substring
// was the first shape of this field and it was too weak twice over: a
// mutant that reddened one unrelated clause counted as CAUGHT, and a
// mutant whose defect should redden three checks was satisfied by one.
const MUTANTS = [
  {
    // 1. THE ONE-WORD DEFECT. `using (true)` reads like a policy, appears
    // in pg_policies like a policy, and satisfies every check this project
    // had before this suite: RLS is on, a policy exists, the granted verb
    // is covered. It lets every signed-in account read every message —
    // and, because it is FOR ALL, write and delete them too.
    name: "chat_messages' policy says using (true) — every account reads every conversation",
    table: "chat_messages",
    apply: (defs) =>
      defs.map((d) => d.drop).join("\n") +
      `\ncreate policy "leak" on public.chat_messages for all to authenticated using (true) with check (true);`,
    restore: (defs) =>
      `drop policy if exists "leak" on public.chat_messages;\n` + defs.map((d) => d.create).join("\n"),
    expect: [
      "A cannot SEE B's row",
      "A cannot UPDATE B's row",
      "A cannot DELETE B's row",
      "an UPDATE with no WHERE never reaches B's row",
      "a DELETE with no WHERE never reaches B's row",
    ],
  },
  {
    // 2. RLS TURNED OFF ON ONE TABLE. What an incident leaves behind.
    // db-migrations.dbtest catches this too — it is here because this
    // suite must not be the one that misses it.
    name: "row level security is switched off on user_credits",
    table: "user_credits",
    apply: () => `alter table public.user_credits disable row level security;`,
    restore: () => `alter table public.user_credits enable row level security;`,
    // NO UPDATE EXPECTATION, and the reason is a fix rather than a
    // weakening: 20260926000000 revoked UPDATE on user_credits from
    // `authenticated`, because no policy covered it. The gate now records
    // the table as one nobody can write and does not probe the verb —
    // which is the stronger guarantee, and the write dimension is carried
    // by mutant 3 on a table that still holds the grant.
    expect: ["row level security ON", "A cannot SEE B's row"],
  },
  {
    // 3. THE WRITE HALF ONLY, AND IT IS INVISIBLE TO A PREDICATE. Reading
    // stays scoped, so `update … where id = <B's id>` matches nothing —
    // the SELECT policy hides the row from the WHERE before the UPDATE
    // policy is ever consulted. The first version of this suite reported
    // this mutant MISSED and the gate was right: only a write with no
    // WHERE can see this class at all.
    name: "user_files gains an unscoped UPDATE policy — B's documents are editable",
    table: "user_files",
    apply: () =>
      `create policy "leak_update" on public.user_files for update to authenticated using (true) with check (true);`,
    restore: () => `drop policy if exists "leak_update" on public.user_files;`,
    expect: ["an UPDATE with no WHERE never reaches B's row", "touches exactly the rows A may touch"],
  },
  {
    // 4. AND THE DELETE HALF. The most destructive and the quietest: no
    // row comes back to look wrong. Same blind spot as 3 — measured, with
    // `for delete using (true)` on ideas: a targeted delete removed 0
    // rows, a bare `delete from ideas` removed B's.
    //
    // THIS WAS ai_cost_log UNTIL 20260926000000 REVOKED ITS DELETE, and
    // the move is worth writing down: a mutant that stages a leak on a
    // verb nobody holds proves nothing, and this one went MISSED the
    // first run after that migration. chat_messages keeps DELETE with a
    // policy that scopes it, holds what somebody typed, and is therefore
    // the honest place to stage the same defect.
    name: "chat_messages gains an unscoped DELETE policy — B's conversations can be erased",
    table: "chat_messages",
    apply: () =>
      `create policy "leak_delete" on public.chat_messages for delete to authenticated using (true);`,
    restore: () => `drop policy if exists "leak_delete" on public.chat_messages;`,
    expect: ["a DELETE with no WHERE never reaches B's row", "removes exactly the rows A may remove"],
  },
  {
    // 5. THE POSITIVE CONTROL ITSELF. A policy that denies the owner makes
    // "A cannot see B" true for a reason that has nothing to do with
    // isolation — the vacuous shape this suite was most at risk of. If
    // this mutant does NOT go red, every result above is worthless.
    name: "ideas' policy denies everybody, so 'cannot see B' becomes vacuously true",
    table: "ideas",
    apply: (defs) =>
      defs.map((d) => d.drop).join("\n") +
      `\ncreate policy "deny" on public.ideas for all to authenticated using (false) with check (false);`,
    restore: (defs) =>
      `drop policy if exists "deny" on public.ideas;\n` + defs.map((d) => d.create).join("\n"),
    expect: ["A can see A's own row"],
  },
  {
    // 6. A SEALED TABLE STOPS BEING SEALED. production_errors carries
    // fingerprints of other people's failures and has no policy on
    // purpose; one that lets any signed-in account read it is the same
    // leak wearing the opposite shape.
    name: "production_errors gains a readable policy, so a sealed table is no longer sealed",
    table: "production_errors",
    apply: () =>
      `create policy "leak_read" on public.production_errors for select to authenticated using (true);`,
    restore: () => `drop policy if exists "leak_read" on public.production_errors;`,
    expect: ["the sealed set is exactly the 5 tables"],
  },
  {
    // 7. AND THE SAME BOUNDARY CROSSED THE OTHER WAY, which is the bug
    // this suite shipped with. The sealed set used to be read live from
    // pg_policies, so DROPPING every policy from a table moved it into the
    // sealed category — where "A sees nothing" is the expected answer, and
    // the leak became the pass. Nothing went red. The set is written down
    // now, and this mutant is what says so.
    name: "every policy is dropped from ideas — the table silently reclassifies itself as sealed",
    table: "ideas",
    apply: (defs) => defs.map((d) => d.drop).join("\n"),
    restore: (defs) => defs.map((d) => d.create).join("\n"),
    expect: ["the sealed set is exactly the 5 tables"],
  },
  {
    // 8. THE FILE, NOT THE ROW ABOUT IT. storage.objects carries ten
    // policies in a schema no check in this project reaches, and they
    // were inert IN THIS FIXTURE on two counts at once: no USAGE on the
    // schema for `authenticated`, and no row level security, which makes
    // a policy decoration. Measured before the stub was fixed: A read B's
    // private file — in the stub. Production had RLS on all along
    // (2026-09-05). So this mutant does not guard a hole that existed; it
    // is what says the ten policies are exercised rather than counted.
    name: "the user-files SELECT policy opens to everybody — B's documents are readable",
    table: "objects",
    schema: "storage",
    apply: () =>
      `drop policy if exists "select_own_user_files_objects" on storage.objects;
       create policy "select_own_user_files_objects" on storage.objects for select
         to public using (bucket_id = 'user-files');`,
    restore: (defs) =>
      `drop policy if exists "select_own_user_files_objects" on storage.objects;\n` +
      defs.filter((d) => d.name === "select_own_user_files_objects").map((d) => d.create).join("\n"),
    expect: ["A cannot SEE B's file in any bucket"],
  },
  {
    // 9. AND ROW LEVEL SECURITY SWITCHED OFF ON IT, which is the state
    // this stub was in until it was measured: ten correct policies and
    // nothing enforcing any of them.
    name: "row level security is switched off on storage.objects, making all ten policies decoration",
    table: "objects",
    schema: "storage",
    apply: () => `alter table storage.objects disable row level security;`,
    restore: () => `alter table storage.objects enable row level security;`,
    expect: ["row level security is ON for storage.objects", "A cannot SEE B's file in any bucket"],
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], {
      encoding: "utf8",
      stdio: "pipe",
      env: { ...process.env, DATABASE_URL: DB },
    });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    return { green: false, failed: [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim()) };
  }
}

console.log("user-isolation mutations\n");

let caught = 0;
const missed = [];
const base = runGate();
console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated schema`);
if (!base.green) {
  console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
  process.exit(1);
}

// THE RESTORE IS VERIFIED, NOT ASSUMED, and this suite learned that the
// expensive way: its first run dropped chat_messages' policies, threw on
// the way to putting them back (an INSERT policy will not take a USING
// clause), and left the throwaway database without them. Every later
// mutation then measured a schema that was already broken, and the
// baseline was red for a reason nothing in the output explained.
//
// A suite that edits a schema has to be able to say it put it back.
function policyNames(table, schema = "public") {
  return psql(
    `select coalesce(string_agg(policyname, ',' order by policyname), '') from pg_policies
     where schemaname='${schema}' and tablename='${table}'`
  );
}

for (const m of MUTANTS) {
  const schema = m.schema ?? "public";
  const defs = policyDefs(m.table, schema);
  const before = policyNames(m.table, schema);
  const rlsBefore = psql(
    `select relrowsecurity from pg_class where oid = '${schema}.${m.table}'::regclass`
  );
  const apply = m.apply(defs);
  const restore = m.restore(defs);
  psql(apply);
  let result;
  try {
    result = runGate();
  } finally {
    try {
      psql(restore);
    } catch (e) {
      console.log(`  RESTORE FAILED on ${m.table}: ${String(e.stderr || e.message).trim().slice(0, 160)}`);
    }
  }
  const after = policyNames(m.table, schema);
  const rlsAfter = psql(
    `select relrowsecurity from pg_class where oid = '${schema}.${m.table}'::regclass`
  );
  if (after !== before || rlsAfter !== rlsBefore) {
    console.log(
      `\nSCHEMA NOT RESTORED on ${m.table}\n  policies before: ${before}\n  policies after:  ${after}` +
        `\n  rls before: ${rlsBefore}, after: ${rlsAfter}\n` +
        "Rebuild the throwaway database before trusting any result above."
    );
    process.exit(1);
  }
  if (result.green) {
    missed.push({ ...m, why: "the gate stayed green — the leak was not noticed" });
    console.log(`  MISSED  ${m.name}`);
    continue;
  }
  // EVERY clause the defect should redden, not the first one that happens
  // to be red. A leak that opens read, write and delete at once must be
  // reported by all three checks, or two of them are decorative.
  const unreddened = m.expect.filter((e) => !result.failed.some((f) => f.includes(e)));
  if (unreddened.length > 0) {
    missed.push({
      ...m,
      why:
        `expected every one of ${JSON.stringify(m.expect)}\n` +
        `    still green on: "${unreddened.join('", "')}"\n` +
        `    red on: ${result.failed.join(" | ") || "(nothing)"}`,
    });
    console.log(`  WRONG   ${m.name}\n          -> did not redden: ${unreddened.join(" | ")}`);
    continue;
  }
  caught++;
  console.log(`  CAUGHT  ${m.name}\n          -> ${m.expect.length} check(s), all red`);
}

const after = runGate();
console.log(
  after.green
    ? "\nbaseline: the gate is green again on the restored schema"
    : `\nBASELINE IS RED — a policy was not restored.\n  ${after.failed.join("\n  ")}`
);

console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("A policy that lets one account reach another's rows turns this red.");
