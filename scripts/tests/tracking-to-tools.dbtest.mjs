// TWO TOOLS, AGAINST A REAL POSTGRES (V4 #19 + #20).
//
//   THE OLD NOTES ARE STILL THERE. The whole risk of turning a tracker
//   into a tool is that somebody's twenty hand-typed rows quietly stop
//   existing. Section 4 is the import, run against real rows, and it is
//   checked for IDEMPOTENCE — a migration applied twice must not
//   duplicate anybody's notes.
//
//   A POLICY WITHOUT A GRANT IS A LOCKED DOOR. Section 1.
//
//   NOBODY WRITES THEIR OWN ANSWER. A user who could insert into
//   data_analysis_questions or code_sessions could write a row claiming
//   zero credits for work that cost money. Section 3.
//
// Run: node scripts/tests/tracking-to-tools.dbtest.mjs   (needs a
// database; run through `npm run test:db`, which provisions one)
import { execFileSync } from "node:child_process";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const PSQL_TAG = /^(BEGIN|COMMIT|ROLLBACK|SET|DO|INSERT \d+ \d+|UPDATE \d+|DELETE \d+|SELECT \d+)$/;
function answer(out) {
  const lines = out.split("\n").map((l) => l.trim()).filter((l) => l !== "" && !PSQL_TAG.test(l));
  return lines.length === 0 ? "" : lines[lines.length - 1];
}
const dbArgs = () => (process.env.DATABASE_URL ? ["-d", process.env.DATABASE_URL] : ["-d", process.env.PGDATABASE]);
function sql(query) {
  return answer(
    execFileSync("psql", [...dbArgs(), "-v", "ON_ERROR_STOP=1", "-tAc", query], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
  );
}
function trySql(query) {
  try {
    return { ok: true, out: sql(query) };
  } catch (err) {
    return { ok: false, error: String(err.stderr || err.stdout || err.message) };
  }
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

const OWNER = "eeeeeeee-0000-0000-0000-000000000001";
const OTHER = "eeeeeeee-0000-0000-0000-000000000002";

sql(`insert into auth.users (id, email) values
  ('${OWNER}', 'tools-owner@test.local'), ('${OTHER}', 'tools-other@test.local')
  on conflict (id) do nothing`);

console.log("== 1. A POLICY WITHOUT A GRANT IS A LOCKED DOOR ==");
{
  const insert = tryAs(
    "authenticated",
    OWNER,
    `insert into public.data_analyses (user_id, title, source_kind, file_name, headers, rows, profile)
     values ('${OWNER}', 'Sales', 'csv', 'sales.csv', '["a"]'::jsonb, '[["1"]]'::jsonb, '{}'::jsonb);`
  );
  ok("the owner can create their own dataset", insert.ok, insert.error);

  const read = tryAs("authenticated", OWNER, `select count(*) from public.data_analyses;`);
  ok("…and read it back", read.ok && read.out === "1", read.error ?? read.out);

  const other = tryAs("authenticated", OTHER, `select count(*) from public.data_analyses;`);
  ok("…and nobody else's", other.ok && other.out === "0", other.error ?? other.out);

  const sessions = tryAs("authenticated", OWNER, `select count(*) from public.code_sessions;`);
  ok("the owner can read their coding history", sessions.ok, sessions.error);
}

console.log("\n== 2. the charts a dataset may carry ==");
{
  const id = sql(`select id from public.data_analyses where user_id = '${OWNER}' limit 1`);
  const good = trySql(
    `insert into public.data_analysis_charts (analysis_id, user_id, kind, title, x_column, aggregation, origin)
     values ('${id}', '${OWNER}', 'bar', 'Revenue', 'a', 'sum', 'ai');`
  );
  ok("a valid chart is stored", good.ok, good.error);

  const badKind = trySql(
    `insert into public.data_analysis_charts (analysis_id, user_id, kind, title, x_column, aggregation)
     values ('${id}', '${OWNER}', 'sankey', 'x', 'a', 'sum');`
  );
  ok("a chart kind nothing can render is refused", !badKind.ok);

  const badAgg = trySql(
    `insert into public.data_analysis_charts (analysis_id, user_id, kind, title, x_column, aggregation)
     values ('${id}', '${OWNER}', 'bar', 'x', 'a', 'median');`
  );
  ok("an aggregation the code cannot compute is refused", !badAgg.ok);

  const badOrigin = trySql(
    `insert into public.data_analysis_charts (analysis_id, user_id, kind, title, x_column, aggregation, origin)
     values ('${id}', '${OWNER}', 'bar', 'x', 'a', 'sum', 'magic');`
  );
  ok("an origin outside suggested/ai/user is refused", !badOrigin.ok);

  // DELETING THE DATASET TAKES ITS CHARTS. A chart pointing at a file
  // that no longer exists renders from nothing.
  sql(`delete from public.data_analyses where user_id = '${OWNER}'`);
  ok(
    "deleting a dataset takes its charts with it",
    sql(`select count(*) from public.data_analysis_charts where user_id = '${OWNER}'`) === "0"
  );
}

console.log("\n== 3. NOBODY WRITES THEIR OWN ANSWER ==");
{
  sql(`insert into public.data_analyses (id, user_id, title, source_kind, file_name)
       values ('11111111-2222-3333-4444-555555555555', '${OWNER}', 'S', 'csv', 's.csv')
       on conflict (id) do nothing;`);

  const question = tryAs(
    "authenticated",
    OWNER,
    `insert into public.data_analysis_questions (analysis_id, user_id, question, answer, credits_charged)
     values ('11111111-2222-3333-4444-555555555555', '${OWNER}', 'q', 'a', 0);`
  );
  ok("a user cannot write their own answer row", !question.ok);

  const session = tryAs(
    "authenticated",
    OWNER,
    `insert into public.code_sessions (user_id, operation, title, input)
     values ('${OWNER}', 'generate', 't', 'i');`
  );
  ok("a user cannot write their own coding run", !session.ok);

  // But they own what the server wrote: renaming, filing and deleting.
  sql(`insert into public.code_sessions (user_id, operation, title, input, output, status)
       values ('${OWNER}', 'explain', 'mine', 'code', 'out', 'done');`);
  const rename = tryAs("authenticated", OWNER, `update public.code_sessions set title = 'renamed', folder = 'utils' where user_id = '${OWNER}';`);
  ok("…but they CAN rename it and file it in a folder", rename.ok, rename.error);
  const remove = tryAs("authenticated", OWNER, `delete from public.code_sessions where user_id = '${OWNER}';`);
  ok("…and delete it", remove.ok, remove.error);

  const badOperation = trySql(
    `insert into public.code_sessions (user_id, operation, title, input)
     values ('${OWNER}', 'deploy_to_production', 't', 'i');`
  );
  ok("AN OPERATION THE PRODUCT DOES NOT HAVE IS REFUSED", !badOperation.ok);

  const negativeCredits = trySql(
    `insert into public.code_sessions (user_id, operation, title, input, credits_charged)
     values ('${OWNER}', 'generate', 't', 'i', -5);`
  );
  ok("a negative charge is refused", !negativeCredits.ok);
}

console.log("\n== 4. THE OLD NOTES WERE CARRIED ACROSS, EXACTLY ONCE ==");
{
  // A note written in the old tracker, as a real user would have.
  sql(`insert into public.ai_coding_requests (id, user_id, title, description, language, status)
       values ('99999999-8888-7777-6666-555555555555', '${OTHER}', 'Margin helper', 'A function for the margin', 'typescript', 'requested')
       on conflict (id) do nothing;`);

  // The migration's own statement, replayed. Idempotent by construction:
  // imported_from is unique and the insert excludes what is already there.
  const importSql = `insert into public.code_sessions (user_id, operation, title, input, language, source, imported_from, status, created_at)
    select r.user_id, 'generate', coalesce(nullif(trim(r.title), ''), 'Untitled note'), coalesce(r.description, ''),
           nullif(trim(coalesce(r.language, '')), ''), 'note', r.id, 'draft', r.created_at
    from public.ai_coding_requests r
    where not exists (select 1 from public.code_sessions c where c.imported_from = r.id);`;
  sql(importSql);

  const imported = sql(`select count(*) from public.code_sessions where imported_from = '99999999-8888-7777-6666-555555555555'`);
  ok("the note appears in the new history", imported === "1", imported);
  ok(
    "…with its title",
    sql(`select title from public.code_sessions where imported_from = '99999999-8888-7777-6666-555555555555'`) === "Margin helper"
  );
  ok(
    "…MARKED AS A NOTE, so the history does not claim the tool produced it",
    sql(`select source from public.code_sessions where imported_from = '99999999-8888-7777-6666-555555555555'`) === "note"
  );
  ok(
    "…and with no output, because it never had one",
    sql(`select coalesce(output, 'NULL') from public.code_sessions where imported_from = '99999999-8888-7777-6666-555555555555'`) === "NULL"
  );

  // RUN IT AGAIN.
  sql(importSql);
  ok(
    "running the import twice does not duplicate anybody's notes",
    sql(`select count(*) from public.code_sessions where imported_from = '99999999-8888-7777-6666-555555555555'`) === "1"
  );

  // AND THE ORIGINAL IS UNTOUCHED. Copied, not moved.
  ok(
    "the original tracker row is still there",
    sql(`select count(*) from public.ai_coding_requests where id = '99999999-8888-7777-6666-555555555555'`) === "1"
  );
}

console.log("\n== 5. anon reaches none of it ==");
{
  for (const table of ["data_analyses", "data_analysis_charts", "data_analysis_questions", "code_sessions"]) {
    const read = tryAs("anon", OWNER, `select count(*) from public.${table};`);
    ok(`anon cannot read ${table}`, !read.ok, read.out);
  }
}

console.log("\n== 6. deleting the account takes it all ==");
{
  sql(`delete from auth.users where id = '${OTHER}';`);
  for (const table of ["data_analyses", "data_analysis_questions", "code_sessions"]) {
    ok(`${table} rows go with the user`, sql(`select count(*) from public.${table} where user_id = '${OTHER}'`) === "0");
  }
  ok(
    "…and so do the old tracker rows they were imported from",
    sql(`select count(*) from public.ai_coding_requests where user_id = '${OTHER}'`) === "0"
  );
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) { console.log(failures.map((f) => "  - " + f).join("\n")); process.exit(1); }
