// WHICH ROLES HOLD THIS? — instead of "does anon hold it?"
//
// THE BLIND SPOT, NAMED. Every privilege check this repository had asks
// about a role by name. grants-and-policies.dbtest.mjs asks
// has_function_privilege('anon', ...) and ('authenticated', ...).
// grants-vs-policies.dbtest.mjs filters information_schema on
// `grantee = 'authenticated'`. db_exposure_report() counts
// anon_readable_relations and default_acl_for_anon. All of them answer a
// yes/no question about two roles that were decided in advance.
//
// A Supabase project has more than two. `authenticator` is the login role
// PostgREST connects as and SET ROLEs out of; `dashboard_user` is what the
// dashboard runs as; `supabase_storage_admin` and `supabase_auth_admin`
// own the storage and auth schemas. A grant to any of them — or to a role
// created next month, or to PUBLIC — is not "denied" by those checks. It
// is INVISIBLE to them: the query never asks, so the answer never appears,
// and the report says all clear.
//
// SO THE QUESTION IS INVERTED HERE. The database is asked to list every
// grantee it holds, and the answer is compared against a NAMED LIST with a
// reason beside each entry. A grantee that is not on the list turns this
// red. That is the only shape that survives a role nobody thought of,
// because it does not require anybody to have thought of it.
//
// PUBLIC IS THE ONE THAT CATCHES PEOPLE, and it caught the first draft of
// this file. `pg_get_userbyid(0)` does not return NULL for the PUBLIC
// pseudo-role — it returns the STRING `unknown (OID=0)`. A query written
// as `coalesce(pg_get_userbyid(a.grantee), 'PUBLIC')` therefore never
// prints PUBLIC at all: the single most important grantee in a privilege
// audit arrives disguised as a role with a strange name. The
// aclexplode() below tests `grantee = 0` instead.
//
// WHAT IT LOOKS AT. Seven facets, because a privilege hides in all seven
// and every one of them has cost somebody a production incident
// somewhere:
//
//   relation    tables, views, materialised views, foreign tables
//   sequence    USAGE on an identity sequence survives a table REVOKE —
//               20260906000000_revoke_anon_grants.sql found that out
//   function    EXECUTE defaults to PUBLIC when nobody revokes it, so
//               "no GRANT line in the migration" means nothing
//   schema      USAGE and CREATE, over every schema, not only the three
//   default     ALTER DEFAULT PRIVILEGES — a grant to every table that
//               does not exist yet, which no sweep of existing tables sees
//   membership  who can SET ROLE into anon/authenticated/service_role.
//               A member of service_role has bypassrls, and holds it
//               without one ACL entry anywhere naming them
//   attribute   SUPERUSER and BYPASSRLS, which make every policy in this
//               project irrelevant and appear in no ACL at all
//
// TWO MATCHERS ON PURPOSE. The allowlist is applied in SQL (so `--sql`
// gives a person one query to paste into the Supabase editor and a verdict
// they can read, without this repository, node, or any access I have) AND
// in JavaScript (so scripts/tests/role-grants.test.mjs can mutate the
// rules and watch a gate go red without a database). The two are generated
// from the same RULES array and scripts/tests/role-grants.dbtest.mjs
// compares them row by row against a live server: a disagreement means one
// of them drifted, and is itself a failure.
//
// Run: npm run db:grants                 # needs DATABASE_URL
//      npm run db:grants -- --sql        # prints the query to paste
//      npm run db:grants -- --all        # every holding, not only the bad
import { execFileSync } from "node:child_process";

/**
 * The schemas whose objects are judged.
 *
 * NOT "every schema", and the reason is that a verdict has to be
 * actionable. A hosted Supabase project also carries `extensions`,
 * `graphql`, `graphql_public`, `realtime`, `vault` and `pgsodium`, owned
 * and granted by Supabase itself; reddening on those would be reddening on
 * somebody else's product, and a gate that cries about things its owner
 * cannot change gets switched off.
 *
 * The `schema` facet is deliberately NOT scoped this way — it lists USAGE
 * and CREATE on EVERY schema, so a new one appearing with a grant on it is
 * still visible even though its tables are not judged.
 */
export const SCOPE_SCHEMAS = ["public", "auth", "storage"];

/**
 * The roles whose membership is worth listing: anyone who can SET ROLE
 * into one of these holds everything it holds. `postgres` and
 * `supabase_admin` are here as TARGETS (who can become them) as well as
 * being allowed grantees.
 */
export const MEMBERSHIP_TARGETS = ["anon", "authenticated", "service_role", "postgres", "supabase_admin"];

export const FACETS = ["relation", "sequence", "function", "schema", "default", "membership", "attribute", "owner"];

/**
 * THE NAMED LIST.
 *
 * Every entry says WHO, on WHICH facet, with WHICH privilege, over WHICH
 * object — and why. `"*"` is a wildcard; `"public.*"` is every object in
 * one schema; anything else is an exact key.
 *
 * A ROLE NOT NAMED HERE TURNS THIS RED. That includes roles that do not
 * exist yet, which is the whole point: `dashboard_user`,
 * `supabase_storage_admin` and `authenticator` are not absent from this
 * list by oversight, they are absent because none of them should hold a
 * privilege on this project's own tables, and if one does, somebody
 * should have to write the line that says why.
 */
export const RULES = [
  {
    role: "postgres",
    facets: ["*"],
    privileges: ["*"],
    objects: ["*"],
    why:
      "the role every migration in supabase/migrations runs as, and therefore the OWNER of " +
      "every object it creates. An owner appears in its own object's ACL by construction; " +
      "refusing that would be refusing the schema itself.",
  },
  {
    role: "supabase_admin",
    facets: ["*"],
    privileges: ["*"],
    objects: ["*"],
    why:
      "Supabase's own superuser for the project. It is above every check here by definition — " +
      "listing it is an acknowledgement, not a permission this project grants.",
  },
  {
    role: "service_role",
    facets: ["*"],
    privileges: ["*"],
    objects: ["*"],
    why:
      "the key that never reaches a browser. src/lib/supabase/admin.ts is the only place it is " +
      "used, every request through it has already established who is asking, and it holds " +
      "BYPASSRLS on purpose — that is what makes the server routes able to read across users.",
  },
  {
    role: "pg_database_owner",
    facets: ["schema"],
    privileges: ["USAGE", "CREATE"],
    objects: ["public"],
    why:
      "PostgreSQL 15 and later ship schema public owned by this built-in role rather than by " +
      "PUBLIC. Nobody granted it; it is what `initdb` leaves behind.",
  },
  {
    role: "PUBLIC",
    facets: ["schema"],
    privileges: ["USAGE"],
    objects: ["public"],
    why:
      "the one PUBLIC grant that stays. Without USAGE on the schema PostgREST cannot resolve a " +
      "table name at all, so revoking it does not narrow access, it turns every request into " +
      '"permission denied for schema public" — including the ones that should work.',
  },
  {
    role: "PUBLIC",
    facets: ["function"],
    privileges: ["EXECUTE"],
    objects: ["auth.uid()", "auth.role()", "storage.foldername(text)"],
    why:
      "three functions this project does not own. auth.uid() and auth.role() read one GUC each; " +
      "storage.foldername() splits a string on '/'. They carry no data and Supabase's own RLS " +
      "policies call them as the querying role. Named one by one rather than as auth.* so a " +
      "fourth function appearing in those schemas with a PUBLIC grant is still a failure.",
  },
  {
    role: "authenticated",
    facets: ["relation"],
    privileges: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    objects: ["public.*"],
    why:
      "a signed-in user, scoped by row level security. These four verbs are the ones RLS " +
      "actually covers, and grants-vs-policies.dbtest.mjs holds the other half of the promise: " +
      "no verb is granted here that no policy can satisfy.",
  },
  {
    role: "authenticated",
    facets: ["relation"],
    privileges: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    objects: ["storage.objects"],
    why:
      "the file rows behind the three buckets. Ten policies on storage.objects scope them by " +
      "the first path segment; user-isolation.dbtest.mjs proves A cannot read B's file.",
  },
  {
    role: "authenticated",
    facets: ["relation"],
    privileges: ["SELECT"],
    objects: ["storage.buckets"],
    why: "the client asks which buckets exist before it uploads. Bucket rows carry no user data.",
  },
  {
    role: "authenticated",
    facets: ["sequence"],
    privileges: ["USAGE", "SELECT"],
    objects: ["public.*"],
    why:
      "USAGE is what nextval() needs, and the two bigserial keys (nav_events, " +
      "transition_suggestions) are inserted by signed-in users. UPDATE is NOT here: it is what " +
      "setval() needs, and nothing in this product calls setval as a user.",
  },
  {
    role: "authenticated",
    facets: ["function"],
    privileges: ["EXECUTE"],
    objects: ["public.*", "auth.*"],
    why:
      "which functions is grants-and-policies.dbtest.mjs's question, and it holds a list of " +
      "nine argued-for names. This file's question is only whether the GRANTEE is a role that " +
      "should hold EXECUTE at all — the two do not overlap and neither replaces the other.",
  },
  {
    role: "authenticated",
    facets: ["schema"],
    privileges: ["USAGE"],
    objects: ["public", "auth", "storage"],
    why: "without it PostgREST cannot resolve a name, and every RLS policy calling auth.uid() errors.",
  },
  {
    role: "authenticated",
    facets: ["default"],
    privileges: ["SELECT", "INSERT", "UPDATE", "DELETE", "USAGE", "EXECUTE"],
    objects: ["public.*"],
    why:
      "the default privileges a new table inherits. 20260926000000 deliberately left these in " +
      "place so a new table with an uncovered verb turns grant_without_policy red instead of " +
      "arriving silently locked. TRUNCATE, TRIGGER and REFERENCES are not on this line, and " +
      "20260928000000 is what took them off.",
  },
  {
    role: "anon",
    facets: ["relation"],
    privileges: ["SELECT"],
    objects: ["public.help_articles", "storage.buckets"],
    why:
      "the two things a signed-out visitor may read. help_articles carries " +
      "`for select to anon using (published)` and is the single member of the keep list in " +
      "20260906000000_revoke_anon_grants.sql; storage.buckets is names and public flags.",
  },
  {
    role: "anon",
    facets: ["function"],
    privileges: ["EXECUTE"],
    objects: ["auth.uid()", "auth.role()"],
    why:
      "a policy is evaluated as the querying role, so the signed-out role has to be able to " +
      "call the function the policy calls — even to be told it matches nothing.",
  },
  {
    role: "anon",
    facets: ["schema"],
    privileges: ["USAGE"],
    objects: ["public", "auth", "storage"],
    why: "the same name-resolution requirement as authenticated, and no more than that.",
  },
  {
    role: "authenticator",
    facets: ["membership"],
    privileges: ["MEMBER"],
    objects: ["anon", "authenticated", "service_role"],
    why:
      "this is how PostgREST works: it connects as authenticator, which is NOINHERIT and holds " +
      "nothing of its own, then SET ROLEs to anon or authenticated according to the JWT. " +
      "MEMBERSHIP is allowed and a direct GRANT to authenticator is not — the difference is " +
      "that a member holds a privilege only while impersonating, and every check in this " +
      "project is written about the role being impersonated.",
  },
  {
    role: "postgres",
    facets: ["membership"],
    privileges: ["MEMBER"],
    objects: ["*"],
    why: "the owner role is granted the three API roles by Supabase so migrations can test as them.",
  },
];

/** Every rule flattened to one (role, facet, privilege, object) tuple. */
export function expandRules(rules = RULES) {
  const out = [];
  for (const r of rules) {
    for (const facet of r.facets) {
      for (const privilege of r.privileges) {
        for (const object of r.objects) out.push({ role: r.role, facet, privilege, object, why: r.why });
      }
    }
  }
  return out;
}

/** The key a rule's `object` is compared against. */
export function objectKey(h) {
  return h.schema ? `${h.schema}.${h.object}` : h.object;
}

/** Does one rule permit one holding? The SQL below says the same thing. */
export function ruleAllows(rule, h) {
  if (rule.role !== h.grantee) return false;
  if (rule.facet !== "*" && rule.facet !== h.facet) return false;
  if (rule.privilege !== "*" && rule.privilege !== h.privilege) return false;
  if (rule.object === "*") return true;
  const key = objectKey(h);
  if (rule.object === key) return true;
  return h.schema !== "" && rule.object === `${h.schema}.*`;
}

export function isAllowed(h, rules = expandRules()) {
  return rules.some((r) => ruleAllows(r, h));
}

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;

/**
 * ONE read-only query. Nothing here writes, creates or locks anything —
 * it is a set of catalog reads, which is what makes it safe to hand to
 * somebody and say "paste this into your production SQL editor".
 */
export function buildQuery({ mode = "violations", rules = expandRules() } = {}) {
  const ruleRows = rules
    .map((r) => `    (${quote(r.role)}, ${quote(r.facet)}, ${quote(r.privilege)}, ${quote(r.object)})`)
    .join(",\n");
  const scope = SCOPE_SCHEMAS.map(quote).join(", ");
  const targets = MEMBERSHIP_TARGETS.map(quote).join(", ");
  const filter = mode === "all" ? "" : "\n where not h.allowed";
  return `
with allowed(role, facet, privilege, object) as (
  values
${ruleRows}
),
raw(facet, schema_name, object_name, grantee, privilege) as (
  -- tables, views, materialised views, foreign tables, sequences
  select case when c.relkind = 'S' then 'sequence' else 'relation' end,
         n.nspname, c.relname,
         case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
         a.privilege_type
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   cross join lateral aclexplode(coalesce(c.relacl,
            acldefault(case when c.relkind = 'S' then 's' else 'r' end::"char", c.relowner))) a
   where n.nspname in (${scope})
     and c.relkind in ('r','p','v','m','f','S')
  union all
  -- functions and procedures. EXECUTE defaults to PUBLIC, so the
  -- coalesce() is not a formality: it is the only way an ungranted,
  -- unrevoked function shows up at all.
  select 'function', n.nspname,
         -- THE ARGUMENT TYPES, NOT THE ARGUMENT LIST.
         -- pg_get_function_identity_arguments() prints parameter NAMES
         -- as well as types -- foldername(name text) -- so renaming a
         -- parameter would silently change the key an allowlist entry is
         -- matched on, and the rule would go stale without anything
         -- moving. format_type() over proargtypes is the signature.
         p.proname || '(' ||
           coalesce(array_to_string(array(
             select format_type(t, null) from unnest(p.proargtypes) as t), ', '), '') || ')',
         case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
         a.privilege_type
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a
   where n.nspname in (${scope})
  union all
  -- EVERY schema, not only the three. A schema outside the scope above
  -- has its objects unjudged; a grant on the schema itself is still shown.
  select 'schema', '', n.nspname,
         case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
         a.privilege_type
    from pg_namespace n
   cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n'::"char", n.nspowner))) a
   where n.nspname not in ('pg_catalog', 'information_schema')
     and n.nspname not like 'pg\\_toast%'
     and n.nspname not like 'pg\\_temp%'
  union all
  -- ALTER DEFAULT PRIVILEGES: a grant on every table that does not exist
  -- yet. No sweep of existing objects can see one.
  select 'default', coalesce(dn.nspname, ''),
         pg_get_userbyid(d.defaclrole) || ':' ||
           case d.defaclobjtype when 'r' then 'tables' when 'S' then 'sequences'
                                when 'f' then 'functions' when 'T' then 'types'
                                else d.defaclobjtype::text end,
         case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
         a.privilege_type
    from pg_default_acl d
    left join pg_namespace dn on dn.oid = d.defaclnamespace
   cross join lateral aclexplode(d.defaclacl) a
  union all
  -- Who can SET ROLE into an API role. 'MEMBER' rather than 'USAGE'
  -- because it ignores INHERIT: authenticator is NOINHERIT and holds
  -- nothing until it switches, which is exactly the case worth listing.
  -- Superusers are excluded here and reported under 'attribute' instead,
  -- where the statement is stronger.
  select 'membership', '', t.rolname, r.rolname, 'MEMBER'
    from pg_roles r
   cross join pg_roles t
   where t.rolname in (${targets})
     and r.rolname <> t.rolname
     and not r.rolsuper
     and pg_has_role(r.oid, t.oid, 'MEMBER')
  union all
  -- The two attributes that make every policy in this project irrelevant,
  -- and the two that lead to them. None appears in any ACL.
  select 'attribute', '', 'role', r.rolname, v.attr
    from pg_roles r
   cross join lateral (values ('SUPERUSER', r.rolsuper), ('BYPASSRLS', r.rolbypassrls),
                              ('CREATEROLE', r.rolcreaterole), ('CREATEDB', r.rolcreatedb)) v(attr, held)
   where v.held
     and r.rolname not like 'pg\\_%'
  union all
  select 'owner', n.nspname, c.relname, pg_get_userbyid(c.relowner), 'OWNER'
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname in (${scope})
     and c.relkind in ('r','p','v','m','f','S')
),
h as (
  select raw.*,
         case when raw.schema_name = '' then raw.object_name
              else raw.schema_name || '.' || raw.object_name end as object_key,
         exists (
           select 1 from allowed a
            where a.role = raw.grantee
              and (a.facet = '*' or a.facet = raw.facet)
              and (a.privilege = '*' or a.privilege = raw.privilege)
              and (a.object = '*'
                   or a.object = case when raw.schema_name = '' then raw.object_name
                                      else raw.schema_name || '.' || raw.object_name end
                   or (raw.schema_name <> '' and a.object = raw.schema_name || '.*'))
         ) as allowed
    from raw
)
select h.facet, h.schema_name, h.object_name, h.grantee, h.privilege, h.allowed
  from h${filter}
 order by h.allowed, h.facet, h.grantee, h.privilege, h.schema_name, h.object_name;
`.trim();
}

/** psql -tAF'|' output back into holdings. */
export function parsePsql(text) {
  return String(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [facet, schema, object, grantee, privilege, allowed] = line.split("|");
      return {
        facet,
        schema: schema ?? "",
        object: object ?? "",
        grantee: grantee ?? "",
        privilege: privilege ?? "",
        allowed: allowed === "t",
      };
    });
}

/**
 * The verdict. `offList` is what turns a gate red; `roles` is the answer
 * to the question this file is named after — which roles hold anything at
 * all, whether or not they are allowed to.
 */
export function summarise(holdings, rules = expandRules()) {
  const offList = holdings.filter((h) => !isAllowed(h, rules));
  const roles = new Map();
  for (const h of holdings) {
    const r = roles.get(h.grantee) ?? { holdings: 0, offList: 0, facets: new Set() };
    r.holdings++;
    r.facets.add(h.facet);
    if (!isAllowed(h, rules)) r.offList++;
    roles.set(h.grantee, r);
  }
  return {
    total: holdings.length,
    offList,
    roles: [...roles.entries()]
      .map(([role, v]) => ({ role, holdings: v.holdings, offList: v.offList, facets: [...v.facets].sort() }))
      .sort((a, b) => b.offList - a.offList || a.role.localeCompare(b.role)),
  };
}

/** A rule whose object is an exact key and which matched nothing is stale. */
export function staleRules(holdings, rules = expandRules()) {
  return rules.filter(
    (r) => r.object !== "*" && !r.object.endsWith(".*") && !holdings.some((h) => ruleAllows(r, h))
  );
}

// ---------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------
export function parseArgs(argv) {
  return {
    sqlOnly: argv.includes("--sql"),
    all: argv.includes("--all"),
  };
}

const isMain = process.argv[1] && process.argv[1].endsWith("role-grants.mjs");
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  const query = buildQuery({ mode: args.all ? "all" : "violations" });
  if (args.sqlOnly) {
    console.log("-- Paste into the Supabase SQL editor. Read-only: catalog reads, no writes.");
    console.log("-- ZERO ROWS means every privilege in this database is held by a role this");
    console.log("-- project named on purpose. Any row is a role, facet and object nobody argued for.");
    console.log(query);
    process.exit(0);
  }
  const DB = process.env.DATABASE_URL ?? process.env.PGDATABASE;
  if (!DB) {
    console.log("No DATABASE_URL / PGDATABASE. Run with --sql to print the query instead.");
    process.exit(0);
  }
  const out = execFileSync("psql", ["-d", DB, "-v", "ON_ERROR_STOP=1", "-tAF|", "-c", buildQuery({ mode: "all" })], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const holdings = parsePsql(out);
  const s = summarise(holdings);
  console.log(`${holdings.length} privilege holdings across ${s.roles.length} roles\n`);
  console.log("  role                        holdings  off-list  facets");
  for (const r of s.roles) {
    console.log(
      `  ${r.role.padEnd(26)}${String(r.holdings).padStart(8)}${String(r.offList).padStart(10)}  ${r.facets.join(", ")}`
    );
  }
  if (s.offList.length === 0) {
    console.log("\nEvery holding is on the named list.");
    process.exit(0);
  }
  console.log(`\n${s.offList.length} holding(s) nobody argued for:`);
  for (const h of s.offList.slice(0, 60)) {
    console.log(`  ${h.grantee} ${h.privilege} on ${h.facet} ${objectKey(h)}`);
  }
  if (s.offList.length > 60) console.log(`  ... and ${s.offList.length - 60} more`);
  process.exit(1);
}
