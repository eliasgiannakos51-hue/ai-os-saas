// THE SAME QUESTION, ASKED OF A REAL SERVER.
//
// scripts/tests/role-grants.test.mjs proves the named list refuses a role
// nobody named. It does that with holdings it writes itself, which is the
// only way to cover a cross-product — and it is also the way a gate can be
// perfectly self-consistent about a database it has never opened.
//
// THREE THINGS ONLY A LIVE SERVER CAN SAY:
//
//   1. WHETHER THE TWO MATCHERS AGREE. The allowlist is applied twice —
//      in SQL, so `npm run db:grants -- --sql` gives one query somebody
//      can paste into the production editor and read the answer off, and
//      in JavaScript, so the rules can be mutated without a database. Two
//      implementations of one rule is a liability unless something
//      compares them, so every row that comes back carries the SQL's
//      verdict and is checked against the JavaScript's. A disagreement is
//      a failure here, not a curiosity.
//
//   2. WHETHER THE LIST IS STILL DESCRIBING THIS DATABASE. A rule naming
//      an object that no longer exists stops being a decision and becomes
//      furniture. grants-and-policies.dbtest.mjs makes the same check
//      about its nine function names.
//
//   3. WHETHER IT CAN GO RED AT ALL. A grant, a membership and a role
//      attribute are three different mechanisms, and a check that catches
//      one of them is not a check that catches the other two. All three
//      are handed to a probe role below and taken away again.
//
// Run: DATABASE_URL=... node scripts/tests/role-grants.dbtest.mjs
//  or: npm run test:db -- role-grants
import { execFileSync } from "node:child_process";
import {
  FACETS,
  expandRules,
  isAllowed,
  objectKey,
  buildQuery,
  parsePsql,
  summarise,
  staleRules,
} from "../db/role-grants.mjs";

const DB = process.env.DATABASE_URL ?? process.env.PGDATABASE;
if (!DB) {
  console.log("SKIPPED: no DATABASE_URL / PGDATABASE — this file needs a real Postgres.");
  process.exit(0);
}

let pass = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`);
  }
}

const psql = (q) =>
  execFileSync("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", "-tAF|", "-c", q], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

const rules = expandRules();
const readAll = () => parsePsql(psql(buildQuery({ mode: "all" })));

console.log("== 1. the question was asked, and it returned something ==");
const holdings = readAll();
// A FLOOR, because "no role holds anything it should not" is trivially
// true of a query that returned nothing — the exact shape
// gate-vacuity.test.mjs exists to refuse.
check(`the database listed its privilege holdings (${holdings.length})`, holdings.length >= 500, String(holdings.length));
const roleNames = [...new Set(holdings.map((h) => h.grantee))].sort();
check(`...across several roles (${roleNames.length}: ${roleNames.join(", ")})`, roleNames.length >= 5);
{
  // EVERY FACET RETURNED ROWS. A union of eight selects where one of them
  // silently matches nothing is eight-sevenths of a check, and the one
  // that stops matching is the one nobody looks at.
  const empty = FACETS.filter((f) => !holdings.some((h) => h.facet === f));
  check("every one of the eight facets returned rows", empty.length === 0, `empty: ${empty.join(", ")}`);
  for (const f of FACETS) {
    const n = holdings.filter((h) => h.facet === f).length;
    console.log(`        ${f.padEnd(11)} ${n}`);
  }
}

console.log("\n== 2. the SQL matcher and the JavaScript matcher agree ==");
{
  const disagree = holdings.filter((h) => isAllowed(h, rules) !== h.allowed);
  check(
    `all ${holdings.length} rows get the same verdict from both implementations`,
    disagree.length === 0,
    disagree
      .slice(0, 6)
      .map((h) => `${h.grantee} ${h.privilege} on ${h.facet} ${objectKey(h)}: sql=${h.allowed} js=${isAllowed(h, rules)}`)
      .join("\n        ")
  );
}

console.log("\n== 3. nobody holds anything nobody argued for ==");
{
  const s = summarise(holdings, rules);
  for (const r of s.roles) console.log(`        ${r.role.padEnd(20)} ${String(r.holdings).padStart(5)} holdings`);
  check(
    "every holding is on the named list",
    s.offList.length === 0,
    s.offList.slice(0, 12).map((h) => `${h.grantee} ${h.privilege} on ${h.facet} ${objectKey(h)}`).join("\n        ")
  );
  const stale = staleRules(holdings, rules);
  check(
    "and every named object on the list is still real",
    stale.length === 0,
    stale.map((r) => `${r.role} ${r.privilege} on ${r.facet} ${r.object}`).join("\n        ")
  );
}

console.log("\n== 4. the seven holdings that were there on 2026-09-07 ==");
// Each was found by inverting the question and each is gone now. Read off
// the live catalog rather than off the migration, because a migration that
// nobody pasted into the SQL editor is the failure mode this whole
// repository's CLAUDE.md is written about.
{
  const held = (facet, grantee, privilege) => holdings.filter((h) => h.facet === facet && h.grantee === grantee && h.privilege === privilege);
  for (const verb of ["TRUNCATE", "REFERENCES", "TRIGGER"]) {
    const rows = held("relation", "authenticated", verb);
    check(
      `authenticated holds ${verb} on no relation (was 102)`,
      rows.length === 0,
      rows.slice(0, 5).map(objectKey).join(", ")
    );
    const anonRows = held("relation", "anon", verb);
    check(`anon holds ${verb} on no relation (was 1: help_articles)`, anonRows.length === 0, anonRows.map(objectKey).join(", "));
  }
  const seqUpdate = held("sequence", "authenticated", "UPDATE");
  check("authenticated cannot setval a sequence (was 2)", seqUpdate.length === 0, seqUpdate.map(objectKey).join(", "));
  // AND THE HALF THAT MUST STILL WORK. Revoking UPDATE without keeping
  // USAGE would break every insert into the two bigserial tables, and a
  // check that only counted what was taken away would not notice.
  const seqUsage = held("sequence", "authenticated", "USAGE");
  check(`nextval still works — USAGE is kept on ${seqUsage.length} sequence(s)`, seqUsage.length >= 2, String(seqUsage.length));

  const anonRelations = holdings.filter((h) => h.facet === "relation" && h.grantee === "anon");
  check(
    "anon reads exactly two relations, both argued for",
    anonRelations.length === 2 &&
      anonRelations.every((h) => h.privilege === "SELECT") &&
      ["public.help_articles", "storage.buckets"].every((k) => anonRelations.some((h) => objectKey(h) === k)),
    anonRelations.map((h) => `${h.privilege} ${objectKey(h)}`).join(", ")
  );
  const authUsers = holdings.filter((h) => h.facet === "relation" && objectKey(h) === "auth.users" && h.grantee !== "postgres");
  check(
    "auth.users is readable by service_role and nobody else",
    authUsers.every((h) => h.grantee === "service_role"),
    authUsers.map((h) => `${h.grantee} ${h.privilege}`).join(", ")
  );
}

console.log("\n== 5. and it can go red — on a grant, a membership and an attribute ==");
// THREE MECHANISMS, THREE PROOFS. A privilege reaches a role by being
// granted to it, by being granted to a role it is a member of, or by an
// attribute that ignores privileges altogether. Catching one of the three
// is not catching the other two, and BYPASSRLS is the one that makes
// every policy in this project stop mattering without touching a single
// ACL.
const PROBE = "zz_role_grants_probe";
{
  let created = false;
  try {
    psql(`do $$ begin if not exists (select 1 from pg_roles where rolname='${PROBE}') then create role ${PROBE} nologin; end if; end $$;`);
    created = true;
  } catch (err) {
    check("a probe role could be created (needs CREATEROLE)", false, String(err.stderr ?? err.message).slice(0, 200));
  }
  if (created) {
    const before = holdings.length;
    try {
      // (a) a plain GRANT
      psql(`grant select on public.help_articles to ${PROBE}`);
      const withGrant = readAll();
      const grantRow = withGrant.find((h) => h.grantee === PROBE && h.facet === "relation");
      check("a table handed to an unknown role appears", Boolean(grantRow), String(withGrant.length));
      check("...and is marked off-list by the SQL", grantRow?.allowed === false);
      check("...and by the JavaScript", grantRow ? !isAllowed(grantRow, rules) : false);
      psql(`revoke select on public.help_articles from ${PROBE}`);

      // (b) MEMBERSHIP of an API role — no ACL entry anywhere names the
      // probe, and it can SET ROLE into everything authenticated holds.
      psql(`grant authenticated to ${PROBE}`);
      const withMember = readAll();
      const memberRow = withMember.find((h) => h.grantee === PROBE && h.facet === "membership");
      check("membership of authenticated appears, with no ACL entry anywhere", Boolean(memberRow), String(withMember.filter((h) => h.grantee === PROBE).length));
      check("...and is off-list", memberRow?.allowed === false);
      check(
        "...and no relation grant was invented for it — membership is not a grant",
        !withMember.some((h) => h.grantee === PROBE && h.facet === "relation")
      );
      psql(`revoke authenticated from ${PROBE}`);

      // (c) BYPASSRLS, which appears in no ACL at all.
      psql(`alter role ${PROBE} bypassrls`);
      const withAttr = readAll();
      const attrRow = withAttr.find((h) => h.grantee === PROBE && h.facet === "attribute");
      check("BYPASSRLS on an unknown role appears", Boolean(attrRow), JSON.stringify(attrRow));
      check("...and is off-list", attrRow?.allowed === false);
      check("...and it is BYPASSRLS that is named", attrRow?.privilege === "BYPASSRLS", attrRow?.privilege);
      psql(`alter role ${PROBE} nobypassrls`);
    } finally {
      try {
        psql(`revoke all on public.help_articles from ${PROBE}`);
        psql(`revoke authenticated from ${PROBE}`);
        psql(`alter role ${PROBE} nobypassrls`);
        psql(`drop role if exists ${PROBE}`);
      } catch (err) {
        console.log(`        probe cleanup said: ${String(err.stderr ?? err.message).trim().slice(0, 160)}`);
      }
    }
    // THE DATABASE IS PUT BACK, verified rather than assumed — the same
    // obligation user-isolation.mutation.mjs learned the hard way when a
    // failed restore made every later result noise.
    const after = readAll();
    check(`the probe left nothing behind (${before} holdings before, ${after.length} after)`, after.length === before, `${before} -> ${after.length}`);
    check("...and no role by that name remains", psql(`select count(*) from pg_roles where rolname='${PROBE}'`).trim() === "0");
  }
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
