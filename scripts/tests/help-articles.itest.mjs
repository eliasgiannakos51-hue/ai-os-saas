// help_articles against a REAL PostgreSQL.
//
// Four claims that a file cannot be read to settle:
//   1. the migration applies twice with no error and no data change
//   2. RLS lets anyone READ a published row and lets nobody WRITE one
//      through the anon or authenticated key
//   3. UNIQUE (slug, locale) is what makes a translation a translation
//   4. the column really is called "order" and really is queryable — a
//      reserved word that works in the migration and fails in the app is
//      the exact shape of bug that ships
//
// Run: node scripts/tests/help-articles.itest.mjs
import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { startEphemeralPostgres, psqlArgs } from "../lib/ephemeral-postgres.mjs";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
// TWO FILES, NOT ONE, AND BOTH ARE APPLIED HERE.
//
// The seed is 1,848 lines of generated INSERTs — 27 English articles, 27
// Greek and 14 core ones in eight more languages, 166 rows. It lives apart
// from the table definition because a schema change and a content change
// are different reviews, and because a 2,000-line file that both creates a
// table and fills it is one nobody reads before running.
//
// Applying only the first would test an empty table, which is why the
// second is here: "the seed landed" is the check that would have caught
// the split going wrong.
const MIGRATION = "supabase/migrations/20260816_help_articles.sql";
const SEED = "supabase/migrations/20260816_help_articles_seed.sql";

const pg = startEphemeralPostgres();
if (!pg.available) {
  console.log(`help-articles: SKIPPED\n  ${pg.reason}`);
  process.exit(0);
}
const ARGS = psqlArgs(pg.conn);
const sql = async (s) =>
  (await execFileAsync(pg.psql, [...ARGS, "-v", "ON_ERROR_STOP=1", "-tAc", s], {
    encoding: "utf8",
    maxBuffer: 1 << 24,
  })).stdout.trim();
// psql echoes the SET before the result, so the value is the LAST line.
// Taking the whole output compares "SET\n134" against "134" and fails for
// a reason that has nothing to do with what is being tested.
//
// SET LOCAL rather than SET: psql runs each -c string as one implicit
// transaction, so the role reverts when it ends and cannot leak into the
// next assertion.
const asRole = async (role, statement) => {
  const out = await sql(`set local role ${role}; ${statement}`);
  const lines = out.split("\n").filter((l) => l.trim() !== "" && l.trim() !== "SET" && l.trim() !== "BEGIN");
  return lines[lines.length - 1] ?? "";
};
const applyOne = (f) =>
  execFileSync(pg.psql, [...ARGS, "-v", "ON_ERROR_STOP=1", "-q", "-f", `${ROOT}/${f}`], {
    encoding: "utf8",
    stdio: "pipe",
  });
const apply = () => {
  applyOne(MIGRATION);
  applyOne(SEED);
};

let pass = 0;
const failures = [];
const check = (name, cond, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? "\n        " + detail : ""}`);
  }
};
const expectError = async (name, statement, fragment) => {
  try {
    await sql(statement);
    check(name, false, "the statement SUCCEEDED — it should have been refused");
  } catch (err) {
    const msg = String(err.stderr || err.message);
    check(name, fragment ? msg.includes(fragment) : true, msg.split("\n")[0]);
  }
};

try {
  console.log("help-articles");
  await sql(`do $$ begin
    if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  end $$;`);
  await sql(`grant usage on schema public to anon, authenticated`);

  console.log("\n== 1. it applies, twice ==");
  apply();
  const first = await sql(`select count(*)::int from public.help_articles`);
  check(`the seed landed (${first} rows)`, Number(first) > 100, first);
  const firstDigest = await sql(
    `select md5(string_agg(slug || '|' || locale || '|' || title || '|' || body, E'\\n' order by slug, locale)) from public.help_articles`
  );
  apply();
  const second = await sql(`select count(*)::int from public.help_articles`);
  const secondDigest = await sql(
    `select md5(string_agg(slug || '|' || locale || '|' || title || '|' || body, E'\\n' order by slug, locale)) from public.help_articles`
  );
  check("a second run adds no rows", first === second, `${first} -> ${second}`);
  check("…and changes no content", firstDigest === secondDigest);

  console.log("\n== 2. English is the base, and no locale exceeds it ==");
  const perLocale = await sql(
    `select locale || '=' || count(*) from public.help_articles group by locale order by count(*) desc, locale`
  );
  console.log(`        ${perLocale.split("\n").join("  ")}`);
  const en = Number(await sql(`select count(*)::int from public.help_articles where locale='en'`));
  const maxOther = Number(
    await sql(`select coalesce(max(c),0)::int from (select count(*) c from public.help_articles where locale<>'en' group by locale) x`)
  );
  check(`English is the largest set (${en} >= ${maxOther})`, en >= maxOther);
  // A slug present in another language but not in English has nothing to
  // fall back to, so a reader in a third language would never see it.
  const orphans = await sql(
    `select coalesce(string_agg(distinct slug, ', '), '') from public.help_articles h
      where not exists (select 1 from public.help_articles e where e.slug=h.slug and e.locale='en')`
  );
  check("every slug exists in English", orphans === "", orphans);

  console.log("\n== 2b. it applies as a PLAIN OWNER, not only as a superuser ==");
// THE CHECK THAT COULD NOT FAIL WHERE IT WAS BEING MADE.
//
// Every assertion above runs over a psql connected as `postgres`, which in
// an ephemeral cluster is a SUPERUSER — and a superuser bypasses RLS
// whether or not `force row level security` is set. So "the seed landed"
// was true here and would have been false on any deployment whose
// migration runner is an ordinary owner.
//
// It was false: the table carried FORCE, there is no INSERT policy by
// design, and the seed in the next file was refused with "new row violates
// row-level security policy for table help_articles". Running it again as
// a `nosuperuser nobypassrls` role is what surfaced that, so that is what
// this section does.
{
  await sql(`do $$ begin
    if not exists (select 1 from pg_roles where rolname='migrator_probe') then
      create role migrator_probe nosuperuser nobypassrls;
    end if;
  end $$;`);
  await sql(`grant create, usage on schema public to migrator_probe`);
  // A CLEAN SLATE, function included. The sections above already ran both
  // files as the superuser, and `migrator_probe` cannot REVOKE on a
  // function somebody else owns — "must be owner of function
  // help_articles_touch_updated_at" is this test's own leftovers talking,
  // not the migration. Dropping the table alone is not enough: the trigger
  // function outlives it.
  await sql(`drop table if exists public.help_articles cascade`);
  await sql(`drop function if exists public.help_articles_touch_updated_at() cascade`);
  const asOwner = (file) =>
    execFileSync(pg.psql, [...ARGS, "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"], {
      input: `set role migrator_probe;\n` + readFileSync(`${ROOT}/${file}`, "utf8"),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  let ok = true;
  let detail = "";
  try {
    asOwner(MIGRATION);
    asOwner(SEED);
  } catch (err) {
    ok = false;
    detail = String(err.stderr || err.stdout || err.message).split("\n").filter(Boolean).slice(0, 3).join(" | ");
  }
  check("both files apply as a nosuperuser, nobypassrls owner", ok, detail);
  const seeded = ok ? Number(await sql(`select count(*)::int from public.help_articles`)) : 0;
  check(`and the seed landed under that role (${seeded} rows)`, seeded > 100, String(seeded));
  // Named, so re-adding FORCE fails here rather than at deploy time.
  const forced = await sql(
    `select relforcerowsecurity::text from pg_class where oid = 'public.help_articles'::regclass`
  );
  check("the table does not FORCE RLS, which would refuse its own seed", forced === "false", forced);
  // Put the superuser-applied state back for the sections below, function
  // and all — otherwise THEY inherit migrator_probe's objects and hit the
  // same ownership wall from the other side.
  await sql(`drop table if exists public.help_articles cascade`);
  await sql(`drop function if exists public.help_articles_touch_updated_at() cascade`);
  apply();
}

console.log("\n== 3. (slug, locale) is the identity of a translation ==");
  await expectError(
    "a duplicate (slug, locale) is refused",
    `insert into public.help_articles (slug, locale, title, body, category)
       values ('cancel', 'el', 'x', 'y', 'billing')`,
    "duplicate key"
  );
  // LOCALE IS DELIBERATELY OPEN, so this is a DATA check rather than a
  // constraint check — and the migration says why: a new language must be
  // an INSERT and never a schema change. A row in a locale the app does
  // not serve is unreachable rather than dangerous; what would be
  // dangerous is a schema that makes shipping the eleventh language a
  // migration.
  //
  // So the guarantee is checked where it actually lives: every locale
  // present in the seeded table is one the app serves.
  const APP_LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
  const strayLocales = await sql(
    `select coalesce(string_agg(distinct locale, ','), '') from public.help_articles
      where locale not in (${APP_LOCALES.map((l) => `'${l}'`).join(",")})`
  );
  check("every locale in the table is one the app serves", strayLocales === "", strayLocales);
  await sql(`insert into public.help_articles (slug, locale, title, body, category)
       values ('cancel', 'xx', 'x', 'y', 'billing')`);
  check(
    "...and an unserved locale is accepted by the schema, on purpose",
    (await sql(`select count(*)::int from public.help_articles where locale='xx'`)) === "1"
  );
  await sql(`delete from public.help_articles where locale='xx'`);
  // CATEGORY IS CLOSED, because /help groups by it: a typo'd category is a
  // row that renders under a heading nobody wrote.
  await expectError(
    "a category the app does not have is refused",
    `insert into public.help_articles (slug, locale, title, body, category)
       values ('cancel', 'fr', 'x', 'y', 'nonsense')`,
    "help_articles_category_check"
  );

  console.log("\n== 4. \"order\" is a reserved word that still works ==");
  // The app queries this column through PostgREST as .order("order"). A
  // column name that the migration can create and the app cannot read
  // would look completely fine until the page rendered empty.
  const ordered = await sql(
    `select string_agg(slug, ',' order by "order") from public.help_articles
      where locale='en' and category='billing'`
  );
  check(
    `ordering by "order" works and is the authored order`,
    ordered === "pricing-overview,change-plan,cancel,invoices,refund",
    ordered
  );

  console.log("\n== 5. RLS: read by anyone, write by nobody with a key ==");
  const enabled = await sql(
    `select relrowsecurity from pg_class where oid='public.help_articles'::regclass`
  );
  check("RLS is enabled", enabled === "t");
  for (const role of ["anon", "authenticated"]) {
    const n = await asRole(role, `select count(*)::int from public.help_articles where published`);
    check(`${role} can read published articles (${n})`, Number(n) > 100, n);
  }
  // An unpublished row must be invisible, or "published" is decoration.
  await sql(`insert into public.help_articles (slug, locale, title, body, category, published)
       values ('cancel', 'fr', 'draft', 'draft', 'billing', false)
     on conflict (slug, locale) do update set published = false`);
  for (const role of ["anon", "authenticated"]) {
    const n = await asRole(role, `select count(*)::int from public.help_articles where slug='cancel' and locale='fr'`);
    check(`${role} cannot see an unpublished row`, n === "0", n);
  }
  await sql(`update public.help_articles set published = true where slug='cancel' and locale='fr'`);

  for (const role of ["anon", "authenticated"]) {
    await expectError(
      `${role} cannot INSERT`,
      `set local role ${role}; insert into public.help_articles (slug, locale, title, body, category)
         values ('injected', 'en', 'x', 'y', 'billing')`
    );
    await expectError(
      `${role} cannot UPDATE`,
      `set local role ${role}; update public.help_articles set title='defaced' where slug='cancel'`
    );
    await expectError(
      `${role} cannot DELETE`,
      `set local role ${role}; delete from public.help_articles where slug='cancel'`
    );
  }
  // The control: if the reads above had failed too, the write checks would
  // pass for the wrong reason — no access at all rather than read-only.
  const stillThere = await asRole("anon", `select title from public.help_articles where slug='cancel' and locale='en'`);
  check(
    "the writes were refused, not the whole table",
    stillThere.startsWith("How do I cancel"),
    stillThere
  );

  console.log("\n== 6. updated_at moves, created_at does not ==");
  const before = await sql(
    `select created_at || '|' || updated_at from public.help_articles where slug='cancel' and locale='en'`
  );
  await sql(`update public.help_articles set title = title where slug='cancel' and locale='en'`);
  const after = await sql(
    `select created_at || '|' || updated_at from public.help_articles where slug='cancel' and locale='en'`
  );
  check("created_at is unchanged", before.split("|")[0] === after.split("|")[0]);
  check("updated_at advanced", before.split("|")[1] !== after.split("|")[1]);

  console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
  if (failures.length) for (const f of failures) console.log(`  - ${f}`);
  process.exit(failures.length === 0 ? 0 : 1);
} finally {
  pg.stop();
}
