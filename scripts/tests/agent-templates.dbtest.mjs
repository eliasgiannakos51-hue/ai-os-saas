// THE TEMPLATE LIBRARY, AGAINST A REAL POSTGRES.
//
// Everything here is a claim the database either enforces or does not,
// and every one of them protects somebody who is not in the room: the
// person whose agent got shared.
//
//   THE CHECK CONSTRAINTS ARE THE LAST LINE. lib/agents/agent-templates.ts
//   refuses an email address, a link, an @handle and a long digit run on
//   the way in. The table refuses them again — so a future route, a
//   script, or a hand-written INSERT cannot publish somebody's address by
//   forgetting to call the validator. A test that only exercised the
//   TypeScript would be testing the half that a mistake bypasses.
//
//   NOBODY MAY WRITE. Not insert, not update. A user who could insert
//   could publish anything into everybody else's library.
//
//   MATCHING IS ACCENT-BLIND, which is the difference between a Greek
//   user finding the competitor template and not.
//
// Run: node scripts/tests/agent-templates.dbtest.mjs   (needs a database;
// run through `npm run test:db`, which provisions one)
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

/** psql prints a tag for every statement it runs. The answer is what is
 *  left once those are removed — see the same helper's header in
 *  website-forms.dbtest.mjs for how this went wrong first time. */
const PSQL_TAG = /^(BEGIN|COMMIT|ROLLBACK|SET|DO|INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SELECT \d+)$/;
function answer(out) {
  const lines = out.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !PSQL_TAG.test(l));
  return lines.length === 0 ? "" : lines[lines.length - 1];
}

const dbArgs = () =>
  process.env.DATABASE_URL ? ["-d", process.env.DATABASE_URL] : ["-d", process.env.PGDATABASE];

function sql(query) {
  return answer(
    execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-tAc", query], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
  );
}

function tryAs(role, userId, query) {
  const script = `set local role ${role};
set local request.jwt.claim.sub = '${userId}';
set local request.jwt.claim.role = '${role}';
${query}`;
  try {
    return {
      ok: true,
      out: answer(
        execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-tAc", `begin; ${script}; commit;`], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        })
      ),
    };
  } catch (err) {
    return { ok: false, error: String(err.stderr || err.stdout || err.message) };
  }
}

const SHARER = "bbbbbbbb-0000-0000-0000-000000000001";
const OTHER = "bbbbbbbb-0000-0000-0000-000000000002";

// EMAILS ARE NAMESPACED PER SUITE, and that is not cosmetic: every
// *.dbtest.mjs runs against the SAME throwaway database, in sequence,
// and auth.users.email is unique. This file first used 'other@test.local'
// — which unified-search.dbtest.mjs already inserts under a different
// uuid — so `on conflict (id) do nothing` did not save it and the NEXT
// suite in the run died on a duplicate key. A collision here fails a
// file that has nothing to do with this one.
sql(`insert into auth.users (id, email) values
  ('${SHARER}', 'templates-sharer@test.local'), ('${OTHER}', 'templates-other@test.local')
  on conflict (id) do nothing`);

const GOOD_PATTERN =
  "Check what {subject} has done in the past week and report every pricing change with a source for each.";

console.log("== 1. the curated library is really there ==");
{
  const count = Number(sql(`select count(*) from public.agent_templates where shared_by is null`));
  ok(`the seed inserted the built-ins (${count})`, count >= 10, String(count));
  ok("every seeded row has the slot",
    sql(`select count(*) from public.agent_templates where position('{subject}' in task_pattern) = 0`) === "0");
  ok("every seeded row has a real depth",
    sql(`select count(*) from public.agent_templates
         where depth not in ('simple','standard','deep')`) === "0");
  ok("all three tiers are represented",
    Number(sql(`select count(distinct depth) from public.agent_templates where shared_by is null`)) === 3);
  ok("no seeded row carries contact details",
    sql(`select count(*) from public.agent_templates
         where (title || ' ' || description || ' ' || task_pattern) ~* '@|https?://|[0-9]{4,}'`) === "0");
}

console.log("\n== 2. the CHECK constraints refuse what the validator refuses ==");
{
  const insert = (cols) => {
    try {
      sql(`insert into public.agent_templates
             (slug, title, description, task_pattern, schedule_cron, depth, output_format)
           values (${cols})`);
      return true;
    } catch {
      return false;
    }
  };
  ok("a pattern with no slot is refused",
    !insert(`'t-noslot','Fine title','Fine description','Check what the company did this week and report it fully.','0 9 * * 1','standard','report'`));
  ok("an email address is refused",
    !insert(`'t-email','Fine title','Write to nikos@example.com','${GOOD_PATTERN}','0 9 * * 1','standard','report'`));
  ok("a link is refused",
    !insert(`'t-link','Fine title','See https://example.com','${GOOD_PATTERN}','0 9 * * 1','standard','report'`));
  ok("a long digit run is refused",
    !insert(`'t-digits','Fine title','Ring 2101234567','${GOOD_PATTERN}','0 9 * * 1','standard','report'`));
  ok("an unknown depth is refused",
    !insert(`'t-depth','Fine title','Fine','${GOOD_PATTERN}','0 9 * * 1','exhaustive','report'`));
  ok("an unknown output format is refused",
    !insert(`'t-format','Fine title','Fine','${GOOD_PATTERN}','0 9 * * 1','standard','poem'`));
  ok("a too-short pattern is refused",
    !insert(`'t-short','Fine title','Fine','Watch {subject}.','0 9 * * 1','standard','report'`));
  // AND A GOOD ONE IS ACCEPTED, so the section cannot pass by refusing
  // everything.
  ok("a clean template IS accepted",
    insert(`'t-good','Fine title','A perfectly ordinary description','${GOOD_PATTERN}','0 9 * * 1','standard','report'`));
  ok("...and the slug is unique",
    !insert(`'t-good','Another title','Another description','${GOOD_PATTERN}','0 9 * * 1','standard','report'`));
}

console.log("\n== 3. matching, and it is accent-blind ==");
{
  ok("an English request finds the competitor template",
    sql(`select count(*) from public.match_agent_templates('competitor watch')
         where slug = 'competitor-watch'`) === "1");
  // THE WHOLE REASON search_fold is reused: a Greek user typing without
  // accents must reach a template whose keywords have them.
  ok("a Greek request without accents finds it too",
    sql(`select count(*) from public.match_agent_templates('ανταγωνιστης')`) !== "0",
    sql(`select count(*) from public.match_agent_templates('ανταγωνιστης')`));
  ok("...and with accents", sql(`select count(*) from public.match_agent_templates('ανταγωνιστής')`) !== "0");
  ok("a price question finds the price template",
    sql(`select slug from public.match_agent_templates('price', 1)`) === "price-check");
  ok("a Greek price question finds it as well",
    sql(`select count(*) from public.match_agent_templates('τιμη')`) !== "0");
  ok("nonsense matches nothing",
    sql(`select count(*) from public.match_agent_templates('zzzqqqxxx')`) === "0");
  ok("an empty query matches nothing",
    sql(`select count(*) from public.match_agent_templates('')`) === "0");
  ok("the limit is honoured",
    Number(sql(`select count(*) from public.match_agent_templates('watch', 2)`)) <= 2);
  ok("a silly limit is clamped, not obeyed",
    Number(sql(`select count(*) from public.match_agent_templates('watch', 100000)`)) <= 20);

  // Ranking: the title outweighs a passing mention in the description.
  const top = sql(`select slug from public.match_agent_templates('market landscape', 1)`);
  ok("the best match comes first", top === "market-landscape", top);
}

console.log("\n== 4. row-level security ==");
{
  const mine = sql(`insert into public.agent_templates
      (slug, shared_by, title, description, task_pattern, schedule_cron, depth, output_format)
    values ('t-mine', '${SHARER}', 'Mine', 'A shared one', '${GOOD_PATTERN}', '0 9 * * 1', 'standard', 'report')
    returning slug`);
  ok("a shared template exists", mine === "t-mine");

  // EVERY SIGNED-IN USER READS EVERYTHING. That is what a library is.
  const read = tryAs("authenticated", OTHER, `select count(*) from public.agent_templates where slug='t-mine'`);
  ok("another user can see it", read.ok && read.out === "1", read.ok ? read.out : read.error);
  const readBuiltIn = tryAs("authenticated", OTHER,
    `select count(*) from public.agent_templates where shared_by is null`);
  ok("...and the built-ins", readBuiltIn.ok && Number(readBuiltIn.out) >= 10,
    readBuiltIn.ok ? readBuiltIn.out : readBuiltIn.error);

  // NOBODY WRITES. A user who could insert could publish anything into
  // everybody else's library.
  const planted = tryAs("authenticated", OTHER,
    `insert into public.agent_templates (slug, title, description, task_pattern, schedule_cron)
     values ('t-planted','Planted','Planted','${GOOD_PATTERN}','0 9 * * 1')`);
  ok("a signed-in user cannot insert", !planted.ok,
    planted.ok ? "the insert was ALLOWED" : "refused, as it must be");
  tryAs("authenticated", OTHER, `update public.agent_templates set title='Hijacked' where slug='t-mine'`);
  ok("a signed-in user cannot update",
    sql(`select title from public.agent_templates where slug='t-mine'`) === "Mine");

  // DELETE: mine yes, somebody else's no, a built-in never.
  tryAs("authenticated", OTHER, `delete from public.agent_templates where slug='t-mine'`);
  ok("another user cannot withdraw it",
    sql(`select count(*) from public.agent_templates where slug='t-mine'`) === "1");
  tryAs("authenticated", SHARER, `delete from public.agent_templates where slug='daily-news-watch'`);
  ok("a sharer cannot delete a built-in",
    sql(`select count(*) from public.agent_templates where slug='daily-news-watch'`) === "1",
    "shared_by is null, and auth.uid() = null is never true");
  const withdraw = tryAs("authenticated", SHARER,
    `delete from public.agent_templates where slug='t-mine' returning 1`);
  ok("the sharer CAN withdraw their own", withdraw.ok && withdraw.out === "1",
    withdraw.ok ? withdraw.out : withdraw.error);
  ok("...and it is gone", sql(`select count(*) from public.agent_templates where slug='t-mine'`) === "0");

  const anon = tryAs("anon", OTHER, `select count(*) from public.agent_templates`);
  ok("anon reaches nothing", !anon.ok, anon.ok ? `it returned ${anon.out}` : "refused, as it must be");
}

console.log("\n== 5. deleting the account withdraws what it shared ==");
{
  const throwaway = sql(`insert into auth.users (email) values ('templates-gone@test.local') returning id`);
  sql(`insert into public.agent_templates
      (slug, shared_by, title, description, task_pattern, schedule_cron)
    values ('t-gone', '${throwaway}', 'Theirs', 'A shared one', '${GOOD_PATTERN}', '0 9 * * 1')`);
  const builtInsBefore = sql(`select count(*) from public.agent_templates where shared_by is null`);
  sql(`delete from auth.users where id='${throwaway}'`);
  ok("their template goes with them",
    sql(`select count(*) from public.agent_templates where slug='t-gone'`) === "0");
  ok("...and the built-ins are untouched",
    sql(`select count(*) from public.agent_templates where shared_by is null`) === builtInsBefore);
}

console.log("\n== 6. the use counter ==");
{
  const before = sql(`select use_count from public.agent_templates where slug='price-check'`);
  sql(`select public.record_template_use('price-check')`);
  ok("record_template_use increments it",
    Number(sql(`select use_count from public.agent_templates where slug='price-check'`)) === Number(before) + 1);
  // It must not be callable by a user: it is SECURITY DEFINER on a table
  // nobody may update.
  const byUser = tryAs("authenticated", SHARER, `select public.record_template_use('price-check')`);
  ok("a signed-in user cannot call it", !byUser.ok,
    byUser.ok ? "it was ALLOWED" : "refused, as it must be");
  // An unknown slug is a no-op, not an error — an adoption must not fail
  // because a counter could not move.
  let threw = false;
  try { sql(`select public.record_template_use('no-such-template')`); } catch { threw = true; }
  ok("an unknown slug is a quiet no-op", !threw);
}

console.log("\n== 7. re-running the migration is safe ==");
{
  sql(`update public.agent_templates set use_count = 42 where slug='price-check'`);
  const before = sql(`select count(*) from public.agent_templates`);
  execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-q", "-f",
    "supabase/migrations/20260826000000_agent_templates.sql"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  ok("no rows are duplicated", sql(`select count(*) from public.agent_templates`) === before);
  // `on conflict do nothing`, so a counter the product has moved is not
  // reset by a redeploy.
  ok("a use count is not reset",
    sql(`select use_count from public.agent_templates where slug='price-check'`) === "42");
  ok("matching still works afterwards",
    sql(`select count(*) from public.match_agent_templates('competitor watch')`) !== "0");
}

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
