// FORM SUBMISSIONS, AGAINST A REAL POSTGRES.
//
// Everything in this file is a claim about the DATABASE, and every one of
// them was false before the 20260825 migration:
//
//   DELETING A SITE LEFT ITS SUBMISSIONS BEHIND. website_id was a bare
//   uuid with no foreign key, while every other website-scoped table in
//   this schema cascades. So a deleted website left rows carrying a
//   stranger's name, email address and message — personal data about
//   someone who never had an account here — attached to nothing,
//   invisible to the product, deleted by no path at all. "Delete the
//   site, delete the submissions" was a sentence, not a behaviour.
//
//   THE OWNER COULD NOT DELETE ONE. Select-own and nothing else.
//
//   NOTHING RECORDED WHETHER THE EMAIL WENT OUT.
//
// A mock cannot prove any of this. A foreign key either exists in the
// catalogue or does not; an RLS policy either stops the second user or
// does not. Both are checked here as the roles that actually run.
//
// Run: node scripts/tests/website-forms.dbtest.mjs   (needs a database;
// run through `npm run test:db`, which provisions one)
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

/**
 * The ANSWER, with psql's command tags removed.
 *
 * MY OWN INSTRUMENT, AND IT WAS WRONG FIRST TIME. psql prints a tag for
 * every statement it runs, so `insert ... returning id` comes back as
 * "<the id>\nINSERT 0 1" and a role-scoped `begin; ...; commit;` comes
 * back wrapped in SET/BEGIN/COMMIT. Taking the last line gave "COMMIT";
 * taking the whole output gave a uuid with "INSERT 0 1" glued to it,
 * which is how this file first failed — the tag went into the next
 * query as part of a uuid literal.
 *
 * So the tags are removed by name and what remains is the result. A tag
 * pattern that ever matched a real value would be a bug in this
 * function; none of the values asserted below is a bare SQL verb.
 */
const PSQL_TAG = /^(BEGIN|COMMIT|ROLLBACK|SET|DO|INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SELECT \d+|ALTER TABLE|CREATE INDEX|NOTICE:.*)$/;
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

/** Runs as a role, and returns the error rather than throwing when the
 *  point of the assertion is that it was refused. */
function tryAs(role, userId, query) {
  // `request.jwt.claim.sub`, NOT `request.jwt.claims`. That is what
  // auth.uid() reads in scripts/db/bootstrap-supabase.sql (and what the
  // other dbtests in this directory set). The JSON-object form is the
  // real Supabase shape and is silently ignored here: auth.uid() comes
  // back NULL, every policy's USING clause is false, and the "owner sees
  // their own row" assertions fail while "the other user sees nothing"
  // passes — a half-red result that reads like an RLS bug and is a bug
  // in the harness. It cost the first run of this file.
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

const OWNER = "aaaaaaaa-0000-0000-0000-000000000001";
const OTHER = "aaaaaaaa-0000-0000-0000-000000000002";

sql(`insert into auth.users (id, email) values
  ('${OWNER}', 'forms-owner@test.local'), ('${OTHER}', 'forms-other@test.local')
  on conflict (id) do nothing`);

const SITE = sql(`insert into public.user_websites (user_id, name, html_content)
  values ('${OWNER}', 'Kafeneio', '<html></html>') returning id`);
const OTHER_SITE = sql(`insert into public.user_websites (user_id, name, html_content)
  values ('${OTHER}', 'Someone else', '<html></html>') returning id`);

console.log("== 1. the columns exist and mean what the code thinks ==");
{
  for (const column of [
    "form_type", "consent", "consent_text", "email_status", "email_detail", "read_at",
  ]) {
    ok(`website_form_submissions.${column} exists`,
      sql(`select count(*) from information_schema.columns
           where table_schema='public' and table_name='website_form_submissions'
             and column_name='${column}'`) === "1");
  }

  const id = sql(`insert into public.website_form_submissions (website_id, user_id, fields)
    values ('${SITE}', '${OWNER}', '{"name":"Μαρία","email":"m@example.com"}'::jsonb)
    returning id`);
  ok("a row inserted without them defaults to contact/no-consent/pending",
    sql(`select form_type || '|' || consent || '|' || email_status
         from public.website_form_submissions where id='${id}'`) === "contact|false|pending",
    sql(`select form_type || '|' || consent || '|' || email_status from public.website_form_submissions where id='${id}'`));
  ok("...and read_at starts null",
    sql(`select read_at is null from public.website_form_submissions where id='${id}'`) === "t");
}

console.log("\n== 2. the CHECK constraints refuse what the code cannot render ==");
{
  // A form_type the dashboard has no label for would render as a raw
  // slug at best; the constraint is what makes parseFormType's fallback
  // a belt to the database's braces rather than the only guard.
  let refused = false;
  try {
    sql(`insert into public.website_form_submissions (website_id, user_id, fields, form_type)
         values ('${SITE}', '${OWNER}', '{"a":"b"}'::jsonb, 'booking')`);
  } catch { refused = true; }
  ok("an unknown form_type is refused", refused);

  for (const type of ["contact", "newsletter", "quote", "other"]) {
    let accepted = true;
    try {
      sql(`insert into public.website_form_submissions (website_id, user_id, fields, form_type)
           values ('${SITE}', '${OWNER}', '{"a":"b"}'::jsonb, '${type}')`);
    } catch { accepted = false; }
    ok(`form_type '${type}' is accepted`, accepted);
  }

  let badStatus = false;
  try {
    sql(`insert into public.website_form_submissions (website_id, user_id, fields, email_status)
         values ('${SITE}', '${OWNER}', '{"a":"b"}'::jsonb, 'delivered')`);
  } catch { badStatus = true; }
  ok("an unknown email_status is refused", badStatus);

  for (const status of ["pending", "sent", "no_key", "unverified_domain", "opted_out", "daily_cap", "failed"]) {
    let accepted = true;
    try {
      sql(`insert into public.website_form_submissions (website_id, user_id, fields, email_status)
           values ('${SITE}', '${OWNER}', '{"a":"b"}'::jsonb, '${status}')`);
    } catch { accepted = false; }
    ok(`email_status '${status}' is accepted`, accepted);
  }
}

console.log("\n== 3. a submission cannot point at a website that does not exist ==");
{
  let refused = false;
  try {
    sql(`insert into public.website_form_submissions (website_id, user_id, fields)
         values ('99999999-9999-9999-9999-999999999999', '${OWNER}', '{"a":"b"}'::jsonb)`);
  } catch { refused = true; }
  ok("an unknown website_id is refused by the foreign key", refused,
    "without the FK this insert succeeds and the row is unreachable forever");

  ok("the constraint really is ON DELETE CASCADE",
    sql(`select confdeltype from pg_constraint
         where conname='website_form_submissions_website_id_fkey'`) === "c",
    sql(`select confdeltype from pg_constraint where conname='website_form_submissions_website_id_fkey'`));
}

console.log("\n== 4. DELETING THE SITE DELETES THE SUBMISSIONS ==");
{
  const doomed = sql(`insert into public.user_websites (user_id, name, html_content)
    values ('${OWNER}', 'About to go', '<html></html>') returning id`);
  sql(`insert into public.website_form_submissions (website_id, user_id, fields)
       select '${doomed}', '${OWNER}', jsonb_build_object('name', 'Visitor ' || g)
       from generate_series(1, 5) g`);
  ok("five submissions exist for it",
    sql(`select count(*) from public.website_form_submissions where website_id='${doomed}'`) === "5");

  const before = Number(sql(`select count(*) from public.website_form_submissions`));
  sql(`delete from public.user_websites where id='${doomed}'`);
  ok("deleting the site removes exactly its submissions",
    sql(`select count(*) from public.website_form_submissions where website_id='${doomed}'`) === "0");
  ok("...and nothing else",
    Number(sql(`select count(*) from public.website_form_submissions`)) === before - 5);

  // The other cascade, which already existed and must not have been
  // broken by adding this one.
  const throwaway = sql(`insert into auth.users (email) values ('cascade@test.local') returning id`);
  const site = sql(`insert into public.user_websites (user_id, name, html_content)
    values ('${throwaway}', 'Theirs', '<html></html>') returning id`);
  sql(`insert into public.website_form_submissions (website_id, user_id, fields)
       values ('${site}', '${throwaway}', '{"a":"b"}'::jsonb)`);
  sql(`delete from auth.users where id='${throwaway}'`);
  ok("deleting the ACCOUNT also removes its submissions",
    sql(`select count(*) from public.website_form_submissions where user_id='${throwaway}'`) === "0");
}

console.log("\n== 5. RLS: an owner sees, edits and deletes only their own ==");
{
  const mine = sql(`insert into public.website_form_submissions (website_id, user_id, fields)
    values ('${SITE}', '${OWNER}', '{"name":"Mine"}'::jsonb) returning id`);
  const theirs = sql(`insert into public.website_form_submissions (website_id, user_id, fields)
    values ('${OTHER_SITE}', '${OTHER}', '{"name":"Theirs"}'::jsonb) returning id`);

  const seen = tryAs("authenticated", OWNER,
    `select count(*) from public.website_form_submissions where id in ('${mine}', '${theirs}')`);
  ok("the owner sees their own row and not the other", seen.ok && seen.out === "1",
    seen.ok ? seen.out : seen.error);

  // UPDATE: allowed on mine, a no-op on theirs. RLS makes the second a
  // zero-row update rather than an error, which is why the assertion is
  // on the row's VALUE afterwards and not on whether the statement ran.
  const markMine = tryAs("authenticated", OWNER,
    `update public.website_form_submissions set read_at = now() where id='${mine}' returning 1`);
  ok("the owner can mark their own read", markMine.ok && markMine.out === "1",
    markMine.ok ? markMine.out : markMine.error);
  tryAs("authenticated", OWNER,
    `update public.website_form_submissions set read_at = now() where id='${theirs}'`);
  ok("...and cannot mark somebody else's read",
    sql(`select read_at is null from public.website_form_submissions where id='${theirs}'`) === "t");

  // WITH CHECK: reassigning a row to another account must be refused,
  // not merely filtered. Without it, "the data belongs to the owner"
  // includes the power to make it belong to somebody else.
  const steal = tryAs("authenticated", OWNER,
    `update public.website_form_submissions set user_id='${OTHER}' where id='${mine}'`);
  ok("an owner cannot hand a submission to another account", !steal.ok,
    steal.ok ? "the update was allowed" : "refused, as it must be");
  ok("...and the row still belongs to them",
    sql(`select user_id from public.website_form_submissions where id='${mine}'`) === OWNER);

  // INSERT: no policy at all. A signed-in user planting a "lead" in
  // their own dashboard is a fabricated record in an export somebody
  // may later present as evidence of enquiries.
  const plant = tryAs("authenticated", OWNER,
    `insert into public.website_form_submissions (website_id, user_id, fields)
     values ('${SITE}', '${OWNER}', '{"name":"Invented"}'::jsonb)`);
  ok("a signed-in user cannot insert a submission", !plant.ok,
    plant.ok ? "the insert was allowed" : "refused, as it must be");

  // DELETE: mine yes, theirs no.
  tryAs("authenticated", OWNER, `delete from public.website_form_submissions where id='${theirs}'`);
  ok("the owner cannot delete somebody else's",
    sql(`select count(*) from public.website_form_submissions where id='${theirs}'`) === "1");
  const dropMine = tryAs("authenticated", OWNER,
    `delete from public.website_form_submissions where id='${mine}' returning 1`);
  ok("the owner CAN delete their own", dropMine.ok && dropMine.out === "1",
    dropMine.ok ? dropMine.out : dropMine.error);
  ok("...and it is gone",
    sql(`select count(*) from public.website_form_submissions where id='${mine}'`) === "0");
}

console.log("\n== 6. anon reaches nothing ==");
{
  // The submit endpoint writes through the service role precisely
  // because the visitor is anonymous. anon itself must not be able to
  // read a single lead out of this table.
  const read = tryAs("anon", OTHER, `select count(*) from public.website_form_submissions`);
  ok("anon cannot select from the table", !read.ok,
    read.ok ? `it returned ${read.out}` : "refused, as it must be");
}

console.log("\n== 7. re-running the migration is safe, and it clears orphans ==");
{
  // The orphan cleanup can only be exercised by CREATING an orphan, and
  // the foreign key now makes that impossible through ordinary SQL — so
  // the constraint is dropped, an orphan planted, and the migration
  // re-run. That is the real path a database in the pre-migration state
  // takes, rather than a simulation of it.
  sql(`alter table public.website_form_submissions
       drop constraint website_form_submissions_website_id_fkey`);
  const orphan = sql(`insert into public.website_form_submissions (website_id, user_id, fields)
    values ('88888888-8888-8888-8888-888888888888', '${OWNER}', '{"name":"Orphan"}'::jsonb)
    returning id`);
  const keep = sql(`insert into public.website_form_submissions (website_id, user_id, fields)
    values ('${SITE}', '${OWNER}', '{"name":"Keep"}'::jsonb) returning id`);
  ok("an orphan exists to be cleaned up",
    sql(`select count(*) from public.website_form_submissions where id='${orphan}'`) === "1");

  execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-q", "-f",
    "supabase/migrations/20260825000000_website_forms.sql"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  ok("re-running the migration removes the orphan",
    sql(`select count(*) from public.website_form_submissions where id='${orphan}'`) === "0");
  ok("...and keeps every row that still has a website",
    sql(`select count(*) from public.website_form_submissions where id='${keep}'`) === "1");
  ok("...and puts the foreign key back",
    sql(`select count(*) from pg_constraint
         where conname='website_form_submissions_website_id_fkey'`) === "1");

  const before = sql(`select count(*) from public.website_form_submissions`);
  execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-q", "-f",
    "supabase/migrations/20260825000000_website_forms.sql"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  ok("running it a third time changes nothing",
    sql(`select count(*) from public.website_form_submissions`) === before);
}

console.log("\n== 8. the indexes the dashboard reads through exist ==");
{
  for (const index of [
    "website_form_submissions_user_created_idx",
    "website_form_submissions_website_created_idx",
    "website_form_submissions_unread_idx",
  ]) {
    ok(`${index} exists`,
      sql(`select count(*) from pg_indexes
           where schemaname='public' and indexname='${index}'`) === "1");
  }
}

console.log(`\n${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
