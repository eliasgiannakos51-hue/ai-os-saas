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
import { promisify } from "node:util";
import { startEphemeralPostgres, psqlArgs } from "../lib/ephemeral-postgres.mjs";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const MIGRATION = "supabase/migrations/20260816_help_articles.sql";

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
const apply = () =>
  execFileSync(pg.psql, [...ARGS, "-v", "ON_ERROR_STOP=1", "-q", "-f", `${ROOT}/${MIGRATION}`], {
    encoding: "utf8",
    stdio: "pipe",
  });

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

  console.log("\n== 3. (slug, locale) is the identity of a translation ==");
  await expectError(
    "a duplicate (slug, locale) is refused",
    `insert into public.help_articles (slug, locale, title, body, category)
       values ('cancel', 'el', 'x', 'y', 'billing')`,
    "duplicate key"
  );
  await expectError(
    "a locale the app does not have is refused",
    `insert into public.help_articles (slug, locale, title, body, category)
       values ('cancel', 'xx', 'x', 'y', 'billing')`,
    "help_articles_locale_check"
  );
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
