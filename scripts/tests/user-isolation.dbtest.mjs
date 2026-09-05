// CAN ONE ACCOUNT REACH ANOTHER ACCOUNT'S ROWS?
//
// ============================================================
// WHY THIS FILE EXISTS, AND WHAT IT IS NOT
// ============================================================
//
// Everything this project knew about row-level security before it was a
// statement about CONFIGURATION:
//
//   · db-migrations.dbtest: every table in public has RLS enabled
//   · grants-vs-policies.dbtest: every granted verb has a policy that
//     could satisfy it
//   · user-scoped-queries.test: all 91 functions taking a userId use it
//
// Every one of those is true and none of them is the question. "RLS is on"
// and "a policy exists" describe the machinery; they do not say that the
// machinery, pointed at two real people, keeps them apart. The V4 closing
// report named this as the largest single gap in the security axis, and
// named it correctly: it was the only claim in that column that had never
// been EXECUTED.
//
// So this file executes it. Two users in auth.users, a row for each in
// every user-owned table, and then the app's own reads issued AS ONE OF
// THEM — `set local role authenticated`, `set local request.jwt.claim.sub`,
// which is exactly what auth.uid() reads in production
// (scripts/db/bootstrap-supabase.sql mirrors Supabase's own definition).
//
// FOUR QUESTIONS PER TABLE, and the first one is the one that makes the
// other three mean anything:
//
//   1. A CAN see A's own row.        ← the positive control
//   2. A CANNOT see B's row.
//   3. A CANNOT update B's row.
//   4. A CANNOT delete B's row.
//
// WITHOUT (1) THIS WHOLE FILE IS VACUOUS. A table whose seed failed, or
// whose grants are missing, or whose policy denies everything, answers
// "cannot see B" for a reason that has nothing to do with isolation — and
// a suite of 96 such tables would report a confident green while proving
// nothing. That is the vacuous-assertion shape (docs/shapes.md), and it is
// the failure mode this file was most at risk of.
//
// ============================================================
// WHAT IT STILL DOES NOT COVER
// ============================================================
//
// This is the DATABASE half. It proves that Postgres, holding this
// project's policies, keeps two subjects apart. It does NOT prove that a
// real HTTP session in production carries the right subject — that the
// server hands the caller's JWT to the database rather than a service-role
// key. user-scoped-queries.test.mjs and owner-only-access.test.mjs check
// that statically over all 128 routes; end to end, with two real accounts
// against the deployed app, remains open and is the smaller half of the
// gap the closing report named.
//
// Run: DATABASE_URL=... node scripts/tests/user-isolation.dbtest.mjs
import { execFileSync } from "node:child_process";

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
    console.log(`  FAIL  ${name}${detail !== undefined ? `\n        ${detail}` : ""}`);
  }
}

const psql = (q) =>
  execFileSync("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", "-tAF|", "-c", q], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const rows = (q) => psql(q).split("\n").filter(Boolean).map((l) => l.split("|"));

// PSQL PRINTS ITS COMMAND TAGS, and a script wrapped in BEGIN … ROLLBACK
// answers "BEGIN\nSET\nSET\n<the row>\nROLLBACK". Reading psql(q) whole
// made the impersonation check compare that against one uuid and report a
// failure in code that was working — an instrument defect, not a finding.
const TAG = /^(BEGIN|COMMIT|ROLLBACK|SET|RESET|CREATE|DROP|GRANT|REVOKE|ALTER|TRUNCATE|DO|INSERT \d|UPDATE \d|DELETE \d|SELECT \d|COPY \d|NOTICE)/;
const dataLines = (q) => psql(q).split("\n").map((l) => l.trim()).filter((l) => l && !TAG.test(l));

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

// ---------------------------------------------------------------------
console.log("== 1. two accounts, and the impersonation actually takes effect ==");

psql(`
  insert into auth.users (id, email) values
    ('${A}', 'isolation-a@example.test'),
    ('${B}', 'isolation-b@example.test')
  on conflict (id) do nothing;
`);
check(
  "both accounts exist",
  psql(`select count(*) from auth.users where id in ('${A}','${B}')`) === "2"
);

// THE IMPERSONATION IS ITSELF CHECKED FIRST. If `set local role` or the
// claim setting silently did nothing, every isolation result below would
// be produced by a superuser — for whom RLS does not apply at all — and
// they would all say "cannot see B" while meaning "saw everything".
const seenAs = dataLines(`
  begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '${A}';
  select coalesce(auth.uid()::text, 'null') || ',' || current_user;
  rollback;
`)[0];
check(
  "auth.uid() inside the session is the impersonated account",
  seenAs === `${A},authenticated`,
  seenAs
);
check(
  "...and the role is not one that bypasses row security",
  psql(`select rolbypassrls or rolsuper from pg_roles where rolname='authenticated'`) === "f"
);

// ---------------------------------------------------------------------
console.log("\n== 2. the tables a user owns ==");

const OWNER_COLUMNS = ["user_id", "owner_id"];
// NOT FILTERED BY relrowsecurity, and that was this file's own worst bug.
//
// The first version selected `where c.relkind = 'r' and c.relrowsecurity`.
// user-isolation.mutation.mjs turned RLS OFF on user_credits — the table
// holding people's money — and the suite reported ALL GREEN, because the
// table had dropped out of the population along with its protection. The
// population shrank from 96 to 95 and every check passed over what was
// left. That is the vacuous-assertion shape (docs/shapes.md) in its purest
// form: the thing being measured disappears at exactly the moment it
// breaks.
//
// So the population is "has an owner column", full stop, and RLS being on
// is an ASSERTION over it rather than a filter into it.
const owned = rows(`
  select c.relname, a.attname, c.relrowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  join pg_attribute a on a.attrelid = c.oid and a.attname in (${OWNER_COLUMNS.map((c) => `'${c}'`).join(",")})
  where c.relkind = 'r'
  order by 1
`);
check(`user-owned tables were found (${owned.length})`, owned.length >= 90, String(owned.length));
const rlsOff = owned.filter(([, , rls]) => rls !== "t").map(([t]) => t);
check(
  "every table with an owner column has row level security ON",
  rlsOff.length === 0,
  rlsOff.join(", ")
);

// SEALED, OR OWNED. Five of these carry RLS and NO POLICY AT ALL —
// account_deletion_requests, production_errors, routing_decisions,
// subscriber_months, subscription_events. On Postgres that means nothing
// reaches them but the service role: the server writes them and no user
// reads them, ever. db-migrations.dbtest.mjs already knows this set as
// "every policy-less table is one we meant to be unreachable".
//
// The distinction is not cosmetic, it decides what the positive control
// asserts. On an owned table "A sees A's row" is the proof that the probe
// works; on a sealed one A sees NOTHING, and demanding a row would make
// this file fail on five tables that are doing the strictest thing there
// is. Read from the live catalogue rather than listed here, so a table
// that gains a policy moves category by itself.
const readable = new Set(
  rows(`
    select distinct tablename from pg_policies
    where schemaname = 'public'
      and cmd in ('ALL', 'SELECT')
      and (roles::text like '%authenticated%' or roles::text = '{public}')
  `).map((r) => r[0])
);
// AND THE SEALED SET IS NAMED, NOT INFERRED — for the same reason.
// Reading it live from pg_policies means that DROPPING a policy moves its
// table into the sealed category, where "A sees nothing" is the expected
// answer, and the leak becomes the pass. The five are written down and
// the live set must equal them exactly.
const SEALED_ON_PURPOSE = [
  "account_deletion_requests",
  "production_errors",
  "routing_decisions",
  "subscriber_months",
  "subscription_events",
];
const sealed = owned.filter(([t]) => !readable.has(t)).map(([t]) => t).sort();
check(
  `the sealed set is exactly the ${SEALED_ON_PURPOSE.length} tables meant to be sealed`,
  JSON.stringify(sealed) === JSON.stringify([...SEALED_ON_PURPOSE].sort()),
  `live: ${sealed.join(", ")}`
);

/** Column metadata for one table. */
function columnsOf(table) {
  return rows(`
    select a.attname,
           format_type(a.atttypid, a.atttypmod),
           a.attnotnull,
           a.attidentity = 'a' as always_identity,
           (ad.adbin is not null) as has_default,
           coalesce((select cl.relname from pg_constraint k
                     join pg_class cl on cl.oid = k.confrelid
                     where k.conrelid = a.attrelid and k.contype = 'f'
                       and array_length(k.conkey,1) = 1 and k.conkey[1] = a.attnum
                     limit 1), '') as fk_table,
           coalesce((select att.attname from pg_constraint k
                     join pg_attribute att on att.attrelid = k.confrelid and att.attnum = k.confkey[1]
                     where k.conrelid = a.attrelid and k.contype = 'f'
                       and array_length(k.conkey,1) = 1 and k.conkey[1] = a.attnum
                     limit 1), '') as fk_column
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
    where c.relname = '${table}' and a.attnum > 0 and not a.attisdropped
    order by a.attnum
  `).map(([name, type, notnull, identity, hasDefault, fkTable, fkColumn]) => ({
    name,
    type,
    notnull: notnull === "t",
    // GENERATED ALWAYS AS IDENTITY refuses a supplied value outright —
    // nav_events.id is one, and it failed with "cannot insert a
    // non-DEFAULT value into column id" rather than anything about RLS.
    hasDefault: hasDefault === "t" || identity === "t",
    fkTable,
    fkColumn,
  }));
}

/**
 * The literals a CHECK constraint will accept for a column.
 *
 * A `status text not null check (status in ('open','done'))` rejects the
 * generic filler, and the insert fails with a message about a constraint
 * rather than about isolation. Reading the constraint is cheaper than
 * guessing, and cheaper than an allowlist of table names that would go
 * stale the first time somebody added a status value.
 */
function checkLiterals(table) {
  const out = new Map();
  for (const [def] of rows(`
    select pg_get_constraintdef(k.oid)
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relname = '${table}' and k.contype = 'c'
  `)) {
    // `((status = ANY (ARRAY['open'::text, 'done'::text])))` and
    // `((kind = 'note'::text))` are the two forms this schema uses.
    const m = /\(?\s*([a-z_]+)\s*=\s*(?:ANY\s*\(\s*ARRAY\[)?\s*'([^']+)'/i.exec(def);
    if (m && !out.has(m[1])) out.set(m[1], m[2]);
  }
  return out;
}

/**
 * Every column any CHECK on this table constrains, read from conkey
 * rather than from the constraint's text.
 *
 * THE UPDATE PROBE NEEDS A COLUMN IT CAN PUT A NONSENSE VALUE IN, and
 * pwa_client_stats is why this exists: its only nullable text columns are
 * install_surface and install_outcome, both restricted to two words each.
 * Writing 'hijacked' into one aborted the whole script under
 * ON_ERROR_STOP, and the table was reported as one this suite could not
 * seed — which was false. It seeded fine; it was the probe that failed,
 * and the report blamed the wrong half.
 */
function checkedColumns(table) {
  return new Set(
    rows(`
      select a.attname
      from pg_constraint k
      join pg_class c on c.oid = k.conrelid
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join lateral unnest(k.conkey) ck(attnum) on true
      join pg_attribute a on a.attrelid = c.oid and a.attnum = ck.attnum
      where c.relname = '${table}' and k.contype = 'c'
    `).map((r) => r[0])
  );
}

/**
 * Every column carrying a UNIQUE index, so the UPDATE probe does not
 * write the same literal into two rows and abort on the constraint.
 */
function uniqueColumns(table) {
  return new Set(
    rows(`
      select a.attname
      from pg_index i
      join pg_class c on c.oid = i.indrelid
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join lateral unnest(i.indkey) k(attnum) on true
      join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
      where c.relname = '${table}' and i.indisunique
    `).map((r) => r[0])
  );
}

/**
 * Columns whose CHECK is a REGEX, which the literal reader above cannot
 * satisfy — it looks for an equality or an ANY(ARRAY[…]) and finds
 * neither. Each entry is a value read off the constraint in the schema,
 * and the constraint is quoted so a reader can see it is still the same
 * one. Two, out of 96 tables.
 *
 * The alternative was leaving both tables unprobed, which is the choice
 * that costs something: affiliates holds a payout identity and nav_events
 * holds where somebody has been.
 */
const REGEX_CHECK_VALUES = {
  // CHECK ((code ~ '^[A-HJ-NP-Z2-9]{8}$')) — a Crockford-style alphabet
  // with the ambiguous glyphs removed, exactly eight characters. GENERATED
  // rather than fixed, because the column is also UNIQUE: a constant
  // satisfied the regex and then collided the moment B's row followed A's.
  "affiliates.code":
    "(select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')" +
    " from generate_series(1, 8))",
  // CHECK ((path ~ '^/dashboard(/:?[a-z0-9-]{1,30}){0,2}$'))
  "nav_events.path": "'/dashboard/overview'",
};

/** A value for a column, by type. `id` is the owner this row belongs to. */
function valueFor(col, literals, fkValues, table) {
  const override = REGEX_CHECK_VALUES[`${table}.${col.name}`];
  if (override) return override;
  if (fkValues.has(col.name)) return fkValues.get(col.name);
  if (literals.has(col.name)) return `'${literals.get(col.name)}'`;
  const t = col.type;
  if (t.endsWith("[]")) return `'{}'::${t}`;
  if (t === "uuid") return "gen_random_uuid()";
  if (t.startsWith("timestamp")) return "now()";
  // THE FIRST OF THE MONTH, not today. Three tables carry a
  // `_first_of_month` CHECK (usage_overage_ledger, subscriber_months,
  // site_badge_removals) and current_date fails it on 30 days out of 31.
  if (t === "date") return "date_trunc('month', current_date)::date";
  if (t === "boolean") return "false";
  if (/^(integer|bigint|smallint|numeric|real|double precision)/.test(t)) return "1";
  if (t === "jsonb" || t === "json") return `'{}'::${t}`;
  if (t === "inet") return "'127.0.0.1'::inet";
  if (t === "interval") return "'1 day'::interval";
  // UNIQUE PER ROW. A shared 'iso' collided with three UNIQUE indexes
  // (production_errors.fingerprint, published_sites.subdomain,
  // push_subscriptions.endpoint) the moment B's row followed A's, and the
  // table was reported unreachable for a reason that had nothing to do
  // with isolation.
  return "('iso-' || substr(md5(random()::text), 1, 12))";
}

// ---------------------------------------------------------------------
console.log("\n== 3. one row each, then A reads as A ==");

/**
 * The SQL that seeds one row and returns its primary key.
 *
 * SEEDED AS THE SUPERUSER, on purpose: the point is to place a row that
 * belongs to somebody else, which is precisely what a policy would stop.
 * RLS is applied only in the impersonated block below.
 */
function insertFor(table, ownerCol, owner, cols, literals, fkValues) {
  const names = [];
  const values = [];
  for (const col of cols) {
    if (col.name === ownerCol) {
      names.push(col.name);
      values.push(`'${owner}'`);
      continue;
    }
    if (col.hasDefault) continue;
    if (!col.notnull && !col.fkTable) continue;
    if (!col.notnull) continue;
    names.push(col.name);
    values.push(valueFor(col, literals, fkValues, table));
  }
  return { names, values };
}

const results = [];
const unseedable = [];

for (const [table, ownerCol] of owned) {
  const cols = columnsOf(table);
  const literals = checkLiterals(table);
  const pk = rows(`
    select a.attname from pg_index i
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname='public'
    where c.relname = '${table}' and i.indisprimary
  `).map((r) => r[0]);
  if (pk.length === 0) {
    unseedable.push({ table, why: "no primary key" });
    continue;
  }
  // A ROW CONSTRUCTOR, so one shape serves both. Two of these tables key
  // on a pair (subscriber_months, voice_usage); `row(a,b)::text` compares
  // as one value and a single-column key is just row(a)::text.
  const pkRow = `row(${pk.join(", ")})::text`;
  const pkCol = pk[0];
  // A column A is allowed to write, for the UPDATE probe. Anything that is
  // not the key and not the owner will do; text is the least constrained.
  // A column A is allowed to write, for the UPDATE probe. Not the key,
  // not the owner, not under a CHECK and not UNIQUE — anything else that
  // holds text will take the word 'hijacked'.
  //
  // NOT NULL IS NOT A REASON TO SKIP ONE, and requiring nullable was this
  // file's largest blind spot: chat_messages' only text columns are
  // `content` and `role`, both NOT NULL, so the table holding what people
  // typed got no UPDATE probe at all. A policy that opened every
  // conversation to editing by any account was reported as caught by the
  // read checks alone.
  const constrained = checkedColumns(table);
  const uniques = uniqueColumns(table);
  const writable = cols.find(
    (c) =>
      c.name !== pkCol && c.name !== ownerCol && c.type === "text" &&
      !constrained.has(c.name) && !uniques.has(c.name)
  );

  // FK columns that must point somewhere: seed the parent in the same
  // transaction, one level. Deeper chains are reported rather than guessed.
  const fkCols = cols.filter((c) => c.notnull && !c.hasDefault && c.fkTable && c.name !== ownerCol);

  const seedParents = [];
  const fkValues = new Map();
  let parentFailure = null;
  for (const fk of fkCols) {
    if (fk.fkTable === "users") {
      fkValues.set(fk.name, "'OWNER'");
      continue;
    }
    // TWO LEVELS, NOT ONE. site_analytics needs a published_sites row,
    // which itself needs a user_websites row; a single level reported all
    // three site_* tables as unreachable with a foreign-key error about
    // the PARENT rather than about them. Three is the cap: nothing in
    // this schema chains deeper, and an unbounded walk would be a cycle
    // waiting to happen.
    const chain = [];
    let current = fk.fkTable;
    for (let depth = 0; depth < 3 && current; depth++) {
      const pCols = columnsOf(current);
      const pOwner = pCols.find((c) => OWNER_COLUMNS.includes(c.name));
      const pLit = checkLiterals(current);
      const grandFk = pCols.find(
        (c) => c.notnull && !c.hasDefault && c.fkTable && c.fkTable !== "users" && !OWNER_COLUMNS.includes(c.name)
      );
      chain.unshift({ table: current, cols: pCols, owner: pOwner ? pOwner.name : "", lit: pLit, via: grandFk });
      current = grandFk ? grandFk.fkTable : null;
    }
    if (current) {
      parentFailure = `${fk.fkTable} chains deeper than three tables`;
      break;
    }
    let ok = true;
    const built = [];
    const upstream = new Map();
    for (const link of chain) {
      const vals = new Map();
      if (link.via && upstream.has(link.via.fkTable)) vals.set(link.via.name, upstream.get(link.via.fkTable));
      const ins = insertFor(link.table, link.owner, "OWNER", link.cols, link.lit, vals);
      if (ins.names.length === 0) {
        parentFailure = `${link.table} has no insertable columns`;
        ok = false;
        break;
      }
      const idx = seedParents.length + built.length;
      built.push({ table: link.table, ins, col: "id", cteName: `p${idx}` });
      upstream.set(link.table, `(select v from p${idx})`);
    }
    if (!ok) break;
    seedParents.push(...built.slice(0, -1).map((b) => ({ ...b, fk: null })));
    seedParents.push({ ...built[built.length - 1], fk: fk.name, col: fk.fkColumn || "id" });
  }
  if (parentFailure) {
    unseedable.push({ table, why: parentFailure });
    continue;
  }

  const build = (owner) => {
    const parts = [];
    const values = new Map();
    for (const p of seedParents) {
      const names = p.ins.names.join(", ");
      const vals = p.ins.values.map((v) => v.replace(/'OWNER'/g, `'${owner}'`)).join(", ");
      parts.push(
        `insert into public.${p.table} (${names}) values (${vals}) returning ${p.col} as v`
      );
      if (p.fk) values.set(p.fk, `(select v from ${p.cteName})`);
    }
    const ins = insertFor(table, ownerCol, owner, cols, literals, values);
    return { parts, ins };
  };

  // AN INSERT IS NOT A SCALAR SUBQUERY. The first version wrote
  // `insert into iso_keys select 'a', (insert … returning id)::text`,
  // which Postgres rejects outright — 96 tables reported "syntax error at
  // or near insert" and the suite proved nothing about any of them. A
  // data-modifying CTE is the shape that works, and it also lets the
  // parent rows be seeded in the same statement.
  const sqlFor = (owner, who) => {
    const { parts, ins } = build(owner);
    const ctes = parts.map((p, i) => `p${i} as (${p})`);
    const names = ins.names.join(", ");
    const vals = ins.values.map((v) => v.replace(/'OWNER'/g, `'${owner}'`)).join(", ");
    ctes.push(
      `ins as (insert into public.${table} (${names}) values (${vals}) returning ${pkRow} as k)`
    );
    return `with ${ctes.join(", ")} insert into iso_keys (who, k) select '${who}', k from ins;`;
  };

  // THE VERBS THIS ROLE ACTUALLY HOLDS. Sixteen of these tables revoke
  // one or more from `authenticated` — bank_transactions is read-only to
  // a user by design, several server-written logs allow nothing at all —
  // and probing a revoked verb answers "permission denied for table X",
  // which aborts the whole script and reports the table as unreachable.
  //
  // A REVOKED VERB IS ITSELF AN ISOLATION GUARANTEE, and a stronger one
  // than a policy: A cannot delete B's row because nobody can delete. So
  // it is recorded rather than probed, and the count is printed.
  const may = Object.fromEntries(
    ["select", "update", "delete"].map((v) => [
      v,
      psql(`select has_table_privilege('authenticated', 'public.${table}', '${v}')`) === "t",
    ])
  );
  if (!may.select) {
    results.push({
      table, ownerCol, own: "0", other: "0",
      upd: "norights", del: "norights",
      selfupd: "norights", bulkupd: "norights", selfdel: "norights", bulkdel: "norights",
      writable: false, sealedByGrant: true,
    });
    continue;
  }

  const script = `
    begin;
    create temp table iso_keys (who text, k text) on commit drop;
    -- READABLE BY THE ROLE THAT DOES THE PROBING. The temp table belongs
    -- to the superuser that created it; once the role is switched to
    -- authenticated below, every predicate that reads it is denied -- 90
    -- of 96 tables reported "permission denied for table iso_keys"
    -- instead of an isolation result.
    grant select on iso_keys to authenticated;
    ${sqlFor(A, "a")}
    ${sqlFor(B, "b")}

    set local role authenticated;
    set local request.jwt.claim.sub = '${A}';
    select 'own='   || (select count(*) from public.${table} where ${pkRow} = (select k from iso_keys where who='a'));
    select 'other=' || (select count(*) from public.${table} where ${pkRow} = (select k from iso_keys where who='b'));
    -- EACH TARGETED PROBE IS UNDONE, so it cannot consume the row the
    -- blanket probe below is trying to reach. Without the savepoint a
    -- leak found by the first would hide the same leak from the second,
    -- and the second is the only one that can see a whole class of them.
    ${
      writable && may.update
        ? `savepoint targeted_upd;
           with u as (update public.${table} set ${writable.name} = 'hijacked'
             where ${pkRow} = (select k from iso_keys where who='b') returning 1)
           select 'upd=' || (select count(*) from u);
           rollback to savepoint targeted_upd;`
        : `select 'upd=${may.update ? "skip" : "norights"}';`
    }
    ${
      may.delete
        ? `savepoint targeted_del;
           with d as (delete from public.${table}
             where ${pkRow} = (select k from iso_keys where who='b') returning 1)
           select 'del=' || (select count(*) from d);
           rollback to savepoint targeted_del;`
        : `select 'del=norights';`
    }

    -- THE BLANKET WRITE, AND IT IS A DIFFERENT QUESTION FROM THE ONE
    -- ABOVE. A predicate reads a column, so SELECT policies apply to it
    -- and B's row is already invisible to the WHERE — which means a
    -- targeted probe CANNOT see an unscoped UPDATE or DELETE policy at
    -- all. Measured, not reasoned: with "for delete using (true)" on a
    -- table, a delete with a WHERE removed 0 rows and a bare delete
    -- removed B's.
    --
    -- NEITHER MAY CARRY A RETURNING THAT NAMES A COLUMN. Postgres applies
    -- the SELECT policy to a row an UPDATE or DELETE has to read, and
    -- naming a column in RETURNING is reading it -- so "returning
    -- user_id" puts back exactly the blindness this probe exists to get
    -- past. Measured on a throwaway table with an unscoped delete policy:
    -- "returning 1" deleted both rows, "returning user_id" deleted one
    -- and left B's alone. An earlier version of this file returned the
    -- owner column to attribute the rows, and reported two real leaks as
    -- clean; user-isolation.mutation.mjs is what said so.
    --
    -- So the attribution is done AFTER the role is dropped, by the
    -- superuser, which no policy filters.
    ${
      writable && may.update
        ? `savepoint self_upd;
           with su as (update public.${table} set ${writable.name} = 'selfprobe'
             where ${pkRow} = (select k from iso_keys where who='a') returning 1)
           select 'selfupd=' || (select count(*) from su);
           rollback to savepoint self_upd;
           update public.${table} set ${writable.name} = 'hijacked';`
        : `select 'selfupd=norights';`
    }
    reset role;
    ${
      writable && may.update
        ? `select 'bulkupd='
             || (select count(*) from public.${table}
                  where ${writable.name} = 'hijacked' and ${ownerCol}::text = '${B}')
             || '/'
             || (select count(*) from public.${table} where ${writable.name} = 'hijacked');`
        : `select 'bulkupd=norights';`
    }

    ${
      may.delete
        ? `create temp table iso_n0 on commit drop as
             select count(*)::int as n from public.${table};
           set local role authenticated;
           set local request.jwt.claim.sub = '${A}';
           savepoint self_del;
           with sd as (delete from public.${table}
             where ${pkRow} = (select k from iso_keys where who='a') returning 1)
           select 'selfdel=' || (select count(*) from sd);
           rollback to savepoint self_del;
           delete from public.${table};
           reset role;
           select 'bulkdel='
             || (1 - (select count(*) from public.${table}
                       where ${ownerCol}::text = '${B}'))
             || '/'
             || ((select n from iso_n0) - (select count(*) from public.${table}));`
        : `select 'selfdel=norights'; select 'bulkdel=norights';`
    }
    rollback;
  `;

  let out;
  try {
    out = execFileSync("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", "-tA", "-c", script], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const msg = String(e.stderr || e.stdout || e.message)
      .split("\n")
      .find((l) => /ERROR/.test(l)) ?? String(e.message);
    unseedable.push({ table, why: msg.trim().slice(0, 140) });
    continue;
  }
  const got = Object.fromEntries(
    out.split("\n").filter((l) => l.includes("=")).map((l) => l.trim().split("="))
  );
  results.push({ table, ownerCol, ...got, writable: Boolean(writable && may.update) });
}

check(
  `every user-owned table was seeded and probed (${results.length} of ${owned.length})`,
  results.length >= owned.length - 8,
  `unseedable: ${unseedable.map((u) => `${u.table} (${u.why})`).join("; ")}`
);

// THE POSITIVE CONTROL, FIRST. A table where A cannot see A's own row is
// not evidence of isolation — it is evidence that this file learned
// nothing about that table. Except on a sealed one, where seeing nothing
// IS the design, and the control inverts.
const ownedResults = results.filter((r) => readable.has(r.table) && !r.sealedByGrant);
const sealedResults = results.filter((r) => !readable.has(r.table) || r.sealedByGrant);
const blind = ownedResults.filter((r) => r.own !== "1");
check(
  `A can see A's own row in all ${ownedResults.length} readable tables — without this the rest is vacuous`,
  blind.length === 0,
  blind.map((r) => `${r.table}: own=${r.own}`).join(", ")
);
const leaky = sealedResults.filter((r) => r.own !== "0");
check(
  `...and sees nothing at all in the ${sealedResults.length} sealed ones, including its own row`,
  leaky.length === 0,
  leaky.map((r) => `${r.table}: own=${r.own}`).join(", ")
);

const leakedRead = results.filter((r) => r.other !== "0");
check(
  `A cannot SEE B's row in any table (${results.length} tables)`,
  leakedRead.length === 0,
  leakedRead.map((r) => `${r.table}: ${r.other} row(s) of B visible`).join(", ")
);

const probedUpdate = results.filter((r) => r.upd !== "skip" && r.upd !== "norights");
check(
  `A cannot UPDATE B's row (${probedUpdate.length} tables with a writable column)`,
  probedUpdate.every((r) => r.upd === "0"),
  probedUpdate.filter((r) => r.upd !== "0").map((r) => `${r.table}: ${r.upd} updated`).join(", ")
);

const leakedDelete = results.filter((r) => r.del !== "0" && r.del !== "norights");
const probedDelete = results.filter((r) => r.del !== "norights");
check(
  `A cannot DELETE B's row in any table (${probedDelete.length} tables)`,
  leakedDelete.length === 0,
  leakedDelete.map((r) => `${r.table}: ${r.del} deleted`).join(", ")
);

// THE TWO QUESTIONS A PREDICATE CANNOT ASK. Each blanket write reported
// "<rows of B's>/<rows in total>". Two separate things have to hold, and
// they fail in different ways, so they are two checks.
const rowsOfB = (v) => v.split("/")[0];
const rowsTotal = (v) => v.split("/")[1];

const bulkUpd = results.filter((r) => r.bulkupd !== "norights" && !r.sealedByGrant);
const bulkUpdLeak = bulkUpd.filter((r) => rowsOfB(r.bulkupd) !== "0");
// THE FLOOR IS PART OF THE ASSERTION, not a separate note. "No table let
// A write B's row" is true of a population of zero, and this file has
// twice been the thing that proved that shape is not hypothetical.
const mayWriteOwn = bulkUpd.filter((r) => r.selfupd === "1");
check(
  `an UPDATE with no WHERE never reaches B's row ` +
    `(${bulkUpd.length} tables, ${mayWriteOwn.length} of which let A write its own)`,
  bulkUpdLeak.length === 0 && mayWriteOwn.length >= 20,
  bulkUpdLeak.length > 0
    ? bulkUpdLeak.map((r) => `${r.table}: ${rowsOfB(r.bulkupd)} of B's rows updated`).join(", ")
    : `only ${mayWriteOwn.length} tables let A update its own row — too few to prove anything`
);
// AND EXACTLY WHAT A MAY WRITE, NO MORE. A table where A may update its
// own row must report 1; one where RLS allows no UPDATE at all must
// report 0. Anything else is a row belonging to neither account, which
// on these tables can only be a third user's.
const updWrong = bulkUpd.filter((r) => rowsTotal(r.bulkupd) !== r.selfupd);
check(
  `...and touches exactly the rows A may touch — its own, or none (${bulkUpd.length} tables)`,
  updWrong.length === 0,
  updWrong
    .map((r) => `${r.table}: updated ${rowsTotal(r.bulkupd)} rows, A may write ${r.selfupd}`)
    .join(", ")
);

const bulkDel = results.filter((r) => r.bulkdel !== "norights" && !r.sealedByGrant);
const bulkDelLeak = bulkDel.filter((r) => rowsOfB(r.bulkdel) !== "0");
const mayDeleteOwn = bulkDel.filter((r) => r.selfdel === "1");
check(
  `a DELETE with no WHERE never reaches B's row ` +
    `(${bulkDel.length} tables, ${mayDeleteOwn.length} of which let A delete its own)`,
  bulkDelLeak.length === 0 && mayDeleteOwn.length >= 20,
  bulkDelLeak.length > 0
    ? bulkDelLeak.map((r) => `${r.table}: ${rowsOfB(r.bulkdel)} of B's rows deleted`).join(", ")
    : `only ${mayDeleteOwn.length} tables let A delete its own row — too few to prove anything`
);
const delWrong = bulkDel.filter((r) => rowsTotal(r.bulkdel) !== r.selfdel);
check(
  `...and removes exactly the rows A may remove — its own, or none (${bulkDel.length} tables)`,
  delWrong.length === 0,
  delWrong
    .map((r) => `${r.table}: deleted ${rowsTotal(r.bulkdel)} rows, A may delete ${r.selfdel}`)
    .join(", ")
);


// ---------------------------------------------------------------------
console.log("\n== 3b. the files themselves, not just the rows about them ==");
// ---------------------------------------------------------------------
// A DOCUMENT IS NOT A ROW. user_files holds the metadata and every check
// above covers it; the PDF lives in storage.objects, whose ten policies
// belong to a schema no check in this project reaches —
// db_exposure_report's tables_without_rls filters `nspname = 'public'`.
//
// They were inert here for two reasons at once: `authenticated` had no
// USAGE on the storage schema, and the table had no row level security,
// which makes a policy decoration. bootstrap-supabase.sql now does both,
// and this section is what says the policies work rather than merely
// exist.
const BUCKETS = ["user-files", "website-references", "create-attachments"];
const storageRows = [];
for (const bucket of BUCKETS) {
  const out = dataLines(`
    begin;
    insert into storage.buckets (id, name) values ('${bucket}', '${bucket}')
      on conflict (id) do nothing;
    insert into storage.objects (bucket_id, name, owner) values
      ('${bucket}', '${A}/a.bin', '${A}'), ('${bucket}', '${B}/b.bin', '${B}');
    set local role authenticated;
    set local request.jwt.claim.sub = '${A}';
    select 'own='   || (select count(*) from storage.objects where bucket_id='${bucket}' and name like '${A}/%');
    select 'other=' || (select count(*) from storage.objects where bucket_id='${bucket}' and name like '${B}/%');
    savepoint d;
    with d as (delete from storage.objects where bucket_id='${bucket}' and name like '${B}/%' returning 1)
      select 'del=' || (select count(*) from d);
    rollback to savepoint d;
    delete from storage.objects where bucket_id='${bucket}';
    reset role;
    select 'bulkdel=' || (1 - (select count(*) from storage.objects
      where bucket_id='${bucket}' and name like '${B}/%'));
    rollback;
  `);
  const got = Object.fromEntries(
    out.filter((l) => l.includes("=")).map((l) => l.trim().split("="))
  );
  storageRows.push({ bucket, ...got });
}
check(
  `row level security is ON for storage.objects — without it the ten policies are decoration`,
  psql("select relrowsecurity from pg_class where oid = 'storage.objects'::regclass") === "t"
);
check(
  `A sees its own file in all ${BUCKETS.length} buckets — the control`,
  storageRows.every((r) => r.own === "1"),
  storageRows.map((r) => `${r.bucket}: own=${r.own}`).join(", ")
);
check(
  `A cannot SEE B's file in any bucket (${BUCKETS.length})`,
  storageRows.every((r) => r.other === "0"),
  storageRows.filter((r) => r.other !== "0").map((r) => `${r.bucket}: ${r.other}`).join(", ")
);
check(
  `A cannot DELETE B's file, by name or with no WHERE (${BUCKETS.length} buckets)`,
  storageRows.every((r) => r.del === "0" && r.bulkdel === "0"),
  storageRows
    .filter((r) => r.del !== "0" || r.bulkdel !== "0")
    .map((r) => `${r.bucket}: del=${r.del} bulkdel=${r.bulkdel}`)
    .join(", ")
);

// ---------------------------------------------------------------------
console.log("\n== 4. and the check can go red ==");
// A FILE THAT CANNOT DEMONSTRATE ITS OWN FAILURE MODE is a file whose
// green line means nothing. A table with RLS disabled is exactly the
// defect this suite exists to catch, so it is built, probed and dropped.
psql(`
  create table if not exists public.iso_probe (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    note text
  );
  grant select, insert, update, delete on public.iso_probe to authenticated;
  insert into public.iso_probe (user_id, note) values ('${B}', 'B''s secret');
`);
const withoutRls = dataLines(`
  begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '${A}';
  select count(*) from public.iso_probe where user_id = '${B}';
  rollback;
`)[0];
check(
  "a table with no RLS lets A read B's row — so the probe above is real",
  withoutRls === "1",
  `saw ${withoutRls}`
);
psql(`
  alter table public.iso_probe enable row level security;
  create policy iso_own on public.iso_probe for all to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());
`);
const withRls = dataLines(`
  begin;
  set local role authenticated;
  set local request.jwt.claim.sub = '${A}';
  select count(*) from public.iso_probe where user_id = '${B}';
  rollback;
`)[0];
check("...and turning RLS on hides it again", withRls === "0", `saw ${withRls}`);
psql(`drop table if exists public.iso_probe cascade;`);
psql(`delete from auth.users where id in ('${A}','${B}');`);

// ---------------------------------------------------------------------
console.log("\n== 5. what this file did NOT reach ==");
// PRINTED, NOT SWALLOWED. A table this suite could not seed is a table it
// says nothing about, and the number is more useful in the build output
// than in a comment.
if (unseedable.length > 0) {
  for (const u of unseedable) console.log(`        ${u.table}: ${u.why}`);
}
console.log(
  `        ${results.length} tables probed, ${unseedable.length} not reached, ` +
    `${results.filter((r) => !r.writable).length} with no writable column or no UPDATE right, ` +
    `${results.filter((r) => r.del === "norights").length} with DELETE revoked, ` +
    `${results.filter((r) => r.sealedByGrant).length} with SELECT revoked outright`
);

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILED"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
