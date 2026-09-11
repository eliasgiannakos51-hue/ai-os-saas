// THE NAMED LIST, AND WHETHER A ROLE OUTSIDE IT REALLY GOES RED.
//
// scripts/db/role-grants.mjs inverts the question every other privilege
// check in this repository asks. Instead of "does anon hold this?" it asks
// the database to list every grantee and compares the answer against a
// list somebody wrote down. That is only worth something if two things are
// true, and neither can be read off the file:
//
//   1. a role nobody named is REFUSED — on every facet, not only the one
//      the author happened to think about
//   2. the list is not so wide that naming it means nothing
//
// So this file runs the matcher over a cross-product: four roles that
// should hold nothing, times all eight facets, times the privileges each
// facet can carry. Not a sample — the whole product, because "an
// unknown role is refused" is a claim about every combination and a check
// over three of them is a check about three of them.
//
// AND THE SQL, WHICH IS THE HALF THAT REACHES PRODUCTION. The allowlist is
// compiled into the query so `npm run db:grants -- --sql` gives one
// read-only statement whose empty result IS the verdict. Nobody here can
// run it against the owner's database; what can be checked is that every
// rule reaches the SQL, that the query writes nothing, and that it does
// not contain the one expression that would silently hide the PUBLIC
// pseudo-role.
//
// WHAT THIS FILE DOES NOT DO. It never opens a database. The live half —
// whether the two matchers agree on real rows, and whether the fixture is
// clean — is scripts/tests/role-grants.dbtest.mjs, which needs one.
//
// Run: node scripts/tests/role-grants.test.mjs
import { readFileSync, existsSync } from "node:fs";
import {
  RULES,
  FACETS,
  SCOPE_SCHEMAS,
  MEMBERSHIP_TARGETS,
  expandRules,
  ruleAllows,
  isAllowed,
  objectKey,
  buildQuery,
  parsePsql,
  summarise,
  staleRules,
  parseArgs,
} from "../db/role-grants.mjs";

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

/** A holding, as the query would return it. */
const h = (facet, schema, object, grantee, privilege) => ({ facet, schema, object, grantee, privilege });

const rules = expandRules();

console.log("== 1. the list is a list, and every line on it says why ==");
check(`the rules were loaded (${RULES.length} rules, ${rules.length} tuples)`, RULES.length >= 15 && rules.length >= 30);
check(
  "every rule names a role",
  RULES.every((r) => typeof r.role === "string" && r.role.length > 0),
  JSON.stringify(RULES.filter((r) => !r.role))
);
{
  // A REASON, NOT A LABEL. The whole argument for an allowlist is that
  // somebody had to justify each entry; a one-word `why` is a list
  // without an argument, which is the thing this replaces.
  const thin = RULES.filter((r) => typeof r.why !== "string" || r.why.length < 60);
  check("every rule carries a reason of its own", thin.length === 0, thin.map((r) => r.role).join(", "));
}
{
  const badFacet = rules.filter((r) => r.facet !== "*" && !FACETS.includes(r.facet));
  check("every rule names a facet that exists", badFacet.length === 0, JSON.stringify(badFacet));
}
{
  const seen = new Set();
  const dup = rules.filter((r) => {
    const k = [r.role, r.facet, r.privilege, r.object].join("|");
    if (seen.has(k)) return true;
    seen.add(k);
    return false;
  });
  check("no rule is written twice", dup.length === 0, JSON.stringify(dup));
}

console.log("\n== 2. the roles this round is named after ==");
// THE FOUR THE REQUEST NAMES, plus the ones a Supabase project carries
// beside them. None may appear as a grantee anywhere in the list.
const MUST_NOT_BE_LISTED = [
  "dashboard_user",
  "supabase_storage_admin",
  "supabase_auth_admin",
  "supabase_read_only_user",
  "pgbouncer",
  "supabase_replication_admin",
];
for (const role of MUST_NOT_BE_LISTED) {
  check(
    `${role} is on no rule — a privilege of its would have to be argued for`,
    !rules.some((r) => r.role === role),
    JSON.stringify(rules.filter((r) => r.role === role))
  );
}
// authenticator IS listed, and the distinction is the point: it may BE
// anon or authenticated, and may not be GRANTED anything of its own.
{
  const auth = rules.filter((r) => r.role === "authenticator");
  check(`authenticator is listed (${auth.length} tuples)`, auth.length > 0);
  check(
    "...only for membership, never for a grant",
    auth.every((r) => r.facet === "membership"),
    JSON.stringify(auth.filter((r) => r.facet !== "membership"))
  );
  check(
    "a direct GRANT to authenticator is refused",
    !isAllowed(h("relation", "public", "chat_messages", "authenticator", "SELECT"), rules)
  );
  check(
    "...while its membership of authenticated is allowed",
    isAllowed(h("membership", "", "authenticated", "authenticator", "MEMBER"), rules)
  );
}

console.log("\n== 3. every unknown role reddens, on every facet ==");
// THE CROSS-PRODUCT. Eight facets times the privileges each can carry
// times four roles nobody named. A gate that checked one combination
// would be a gate about one combination.
{
  const PRIVILEGES = {
    relation: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"],
    sequence: ["USAGE", "SELECT", "UPDATE"],
    function: ["EXECUTE"],
    schema: ["USAGE", "CREATE"],
    default: ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "USAGE", "EXECUTE"],
    membership: ["MEMBER"],
    attribute: ["SUPERUSER", "BYPASSRLS", "CREATEROLE", "CREATEDB"],
    owner: ["OWNER"],
  };
  const OBJECTS = {
    relation: [["public", "chat_messages"], ["public", "user_credits"], ["storage", "objects"], ["auth", "users"]],
    sequence: [["public", "nav_events_id_seq"]],
    function: [["public", "search_all(text)"], ["auth", "uid()"]],
    schema: [["", "public"], ["", "auth"], ["", "storage"]],
    default: [["public", "postgres:tables"], ["public", "postgres:sequences"]],
    membership: [["", "anon"], ["", "authenticated"], ["", "service_role"]],
    attribute: [["", "role"]],
    owner: [["public", "chat_messages"], ["storage", "objects"]],
  };
  const UNKNOWN = ["dashboard_user", "supabase_storage_admin", "a_role_invented_next_month", "PUBLIC"];
  let combos = 0;
  const slipped = [];
  for (const facet of FACETS) {
    for (const privilege of PRIVILEGES[facet]) {
      for (const [schema, object] of OBJECTS[facet]) {
        for (const role of UNKNOWN) {
          combos++;
          const holding = h(facet, schema, object, role, privilege);
          if (!isAllowed(holding, rules)) continue;
          // PUBLIC is the one role on this list with named exceptions —
          // USAGE on schema public and three functions it does not own.
          // Everything else it could hold must still be refused.
          const isNamedPublicException =
            role === "PUBLIC" &&
            ((facet === "schema" && privilege === "USAGE" && object === "public") ||
              (facet === "function" && privilege === "EXECUTE" && objectKey(holding) === "auth.uid()"));
          if (!isNamedPublicException) slipped.push(`${role} ${privilege} on ${facet} ${objectKey(holding)}`);
        }
      }
    }
  }
  check(`the cross-product ran (${combos} role x facet x privilege x object combinations)`, combos >= 250, String(combos));
  check("not one of them is allowed", slipped.length === 0, slipped.slice(0, 12).join("\n        "));
}

console.log("\n== 4. the seven holdings this round actually found ==");
// EACH ONE MEASURED ON A REAL DATABASE ON 2026-09-07, before
// 20260928000000_privileges_rls_cannot_scope.sql took them away. If the
// list stops refusing any of them, the migration stops being enforced.
const FOUND = [
  ["authenticated", "TRUNCATE", h("relation", "public", "chat_messages", "authenticated", "TRUNCATE")],
  ["authenticated", "TRIGGER", h("relation", "public", "chat_messages", "authenticated", "TRIGGER")],
  ["authenticated", "REFERENCES", h("relation", "public", "user_credits", "authenticated", "REFERENCES")],
  ["authenticated", "UPDATE on a sequence", h("sequence", "public", "nav_events_id_seq", "authenticated", "UPDATE")],
  ["anon", "TRUNCATE on help_articles", h("relation", "public", "help_articles", "anon", "TRUNCATE")],
  ["anon", "SELECT on auth.users", h("relation", "auth", "users", "anon", "SELECT")],
  ["authenticated", "SELECT on auth.users", h("relation", "auth", "users", "authenticated", "SELECT")],
];
for (const [role, what, holding] of FOUND) {
  check(`${role} ${what} is refused`, !isAllowed(holding, rules), JSON.stringify(holding));
}

console.log("\n== 5. and what must stay allowed, or the product stops working ==");
const KEEP = [
  ["a signed-in user reads their own rows", h("relation", "public", "chat_messages", "authenticated", "SELECT")],
  ["...and writes them", h("relation", "public", "chat_messages", "authenticated", "INSERT")],
  ["nextval on a bigserial key", h("sequence", "public", "nav_events_id_seq", "authenticated", "USAGE")],
  ["a signed-out visitor reads published help", h("relation", "public", "help_articles", "anon", "SELECT")],
  ["PostgREST resolves a name at all", h("schema", "", "public", "anon", "USAGE")],
  ["a policy calls auth.uid() as the signed-out role", h("function", "auth", "uid()", "anon", "EXECUTE")],
  ["PUBLIC keeps USAGE on schema public", h("schema", "", "public", "PUBLIC", "USAGE")],
  ["the server key bypasses RLS on purpose", h("attribute", "", "role", "service_role", "BYPASSRLS")],
  ["the owner owns its own tables", h("owner", "public", "chat_messages", "postgres", "OWNER")],
  ["the ten storage policies have a grant behind them", h("relation", "storage", "objects", "authenticated", "DELETE")],
];
for (const [what, holding] of KEEP) {
  check(`${what} — allowed`, isAllowed(holding, rules), JSON.stringify(holding));
}

console.log("\n== 6. how a rule matches, one clause at a time ==");
{
  const rule = { role: "authenticated", facet: "relation", privilege: "SELECT", object: "public.*" };
  check("the exact case matches", ruleAllows(rule, h("relation", "public", "ideas", "authenticated", "SELECT")));
  check("a different role does not", !ruleAllows(rule, h("relation", "public", "ideas", "anon", "SELECT")));
  check("a different facet does not", !ruleAllows(rule, h("owner", "public", "ideas", "authenticated", "SELECT")));
  check("a different privilege does not", !ruleAllows(rule, h("relation", "public", "ideas", "authenticated", "DELETE")));
  // THE SCHEMA WILDCARD IS A SCHEMA, NOT A PREFIX. `public.*` must not
  // reach storage.objects, and a check that compared with startsWith
  // would let it.
  check("a different schema does not", !ruleAllows(rule, h("relation", "storage", "objects", "authenticated", "SELECT")));
  const exact = { role: "anon", facet: "relation", privilege: "SELECT", object: "public.help_articles" };
  check("an exact object matches only itself", ruleAllows(exact, h("relation", "public", "help_articles", "anon", "SELECT")));
  // THE NEIGHBOUR HAS TO BE ONE THE MISTAKE WOULD ACTUALLY REACH. The
  // first draft of this line used `help_article_votes`, which is not a
  // prefix extension of `help_articles` at all — so a matcher rewritten
  // as key.startsWith(rule.object) still refused it and the mutation that
  // does exactly that came back MISSED. A table whose name BEGINS with an
  // allowed one is the case: publish help_articles and you would have
  // published help_articles_drafts with it.
  check("...and not a table whose name merely begins with it", !ruleAllows(exact, h("relation", "public", "help_articles_drafts", "anon", "SELECT")));
  check("...nor an unrelated neighbour", !ruleAllows(exact, h("relation", "public", "help_article_votes", "anon", "SELECT")));
  const anywhere = { role: "postgres", facet: "*", privilege: "*", object: "*" };
  check("the full wildcard matches every facet", FACETS.every((f) => ruleAllows(anywhere, h(f, "public", "x", "postgres", "Y"))));
  // A FACET WITH NO SCHEMA HAS NO SCHEMA WILDCARD. `public.*` must not
  // accidentally match a membership whose object is the word "public".
  const schemaWild = { role: "anon", facet: "membership", privilege: "MEMBER", object: "public.*" };
  check("a schema wildcard cannot reach a schemaless facet", !ruleAllows(schemaWild, h("membership", "", "public", "anon", "MEMBER")));
}

console.log("\n== 7. the query that goes to production ==");
{
  const all = buildQuery({ mode: "all" });
  const violations = buildQuery({ mode: "violations" });
  check(`the query was built (${all.length} chars)`, all.length > 1500);
  // EVERY RULE REACHES THE SQL. Two matchers exist so a person can get a
  // verdict without this repository; a rule that lives only in
  // JavaScript would make the pasted query stricter than the gate, and
  // the owner would chase a row that is not a finding.
  const missing = rules.filter((r) => !all.includes(`('${r.role.replace(/'/g, "''")}', '${r.facet}', '${r.privilege}', '${r.object}')`));
  check(`all ${rules.length} rule tuples are compiled into the SQL`, missing.length === 0, JSON.stringify(missing.slice(0, 4)));
  for (const s of SCOPE_SCHEMAS) check(`the SQL scopes objects to '${s}'`, all.includes(`'${s}'`));
  for (const t of MEMBERSHIP_TARGETS) check(`the SQL lists membership of '${t}'`, all.includes(`'${t}'`));
  for (const facet of FACETS) check(`the SQL emits the '${facet}' facet`, new RegExp(`'${facet}'`).test(all));

  // THE TRAP THAT COST THE FIRST DRAFT ITS MOST IMPORTANT ROW.
  // pg_get_userbyid(0) returns the STRING 'unknown (OID=0)', not NULL, so
  // `coalesce(pg_get_userbyid(grantee), 'PUBLIC')` never prints PUBLIC —
  // the pseudo-role every default EXECUTE grant lands on arrives wearing
  // a different name and matches no rule and no exception.
  check(
    "PUBLIC is found by grantee = 0, not by coalescing pg_get_userbyid",
    !/coalesce\(\s*pg_get_userbyid/.test(all) && /grantee\s*=\s*0/.test(all)
  );

  // READ-ONLY, because the whole offer is "paste this into your
  // production SQL editor".
  const body = all
    .split("\n")
    .filter((l) => !/^\s*--/.test(l))
    .join("\n");
  // EVERY SQL VERB IN IT IS COLLECTED FIRST, and the writing ones are a
  // filter of that. Scanning only for writes and asserting zero is
  // trivially true of a regex that stopped matching — gate-vacuity.
  // test.mjs failed this very check on its first run for exactly that,
  // and it was right. The floor is on the verbs, which is the collection
  // that can silently empty.
  const verbs = [
    ...body.matchAll(/\b(select|with|insert\s+into|update\s+\w|delete\s+from|drop\s|create\s|grant\s|revoke\s|alter\s|truncate)\b/gi),
  ].map((m) => m[0].toLowerCase().trim());
  check(`the query is made of SQL verbs (${verbs.length})`, verbs.length >= 10, verbs.slice(0, 6).join(", "));
  const writes = verbs.filter((v) => v !== "select" && v !== "with");
  check("not one of them writes", writes.length === 0, writes.join(", "));

  check("--sql asks only for what is off the list", violations.includes("where not h.allowed"));
  check("--all asks for everything", !all.includes("where not h.allowed"));
  const args = parseArgs(["--sql"]);
  check("--sql is parsed", args.sqlOnly === true && args.all === false);
  check("--all is parsed", parseArgs(["--all"]).all === true);
}

console.log("\n== 8. reading the answer back ==");
{
  const rows = parsePsql(
    [
      "relation|public|chat_messages|authenticated|SELECT|t",
      "relation|public|chat_messages|dashboard_user|SELECT|f",
      "attribute||role|service_role|BYPASSRLS|t",
      "",
    ].join("\n")
  );
  check(`three rows parsed (${rows.length})`, rows.length === 3);
  check("the allowed flag is a boolean, not the letter", rows[0].allowed === true && rows[1].allowed === false);
  check("a schemaless facet keeps an empty schema", rows[2].schema === "");
  check("the key of a schemaless holding is the object alone", objectKey(rows[2]) === "role");
  check("the key of a schema-scoped holding is joined", objectKey(rows[0]) === "public.chat_messages");

  const s = summarise(rows, rules);
  check("the summary counts every holding", s.total === 3);
  check("...and names the one nobody argued for", s.offList.length === 1 && s.offList[0].grantee === "dashboard_user");
  check("...and reports per role", s.roles.length === 3 && s.roles[0].role === "dashboard_user");
  // AN EMPTY LIST IS NOT A CLEAN DATABASE, and summarise must not say it
  // is. This is the shape gate-vacuity.test.mjs refuses one level up.
  check("no holdings means no roles, not a clean bill", summarise([], rules).roles.length === 0);
}

console.log("\n== 9. a rule that matches nothing is stale, and says so ==");
{
  // A LIST THAT KEEPS ENTRIES FOR OBJECTS THAT NO LONGER EXIST stops
  // being a list somebody maintains. grants-and-policies.dbtest.mjs made
  // the same check about its nine function names, for the same reason.
  const live = [
    h("relation", "public", "help_articles", "anon", "SELECT"),
    h("schema", "", "public", "PUBLIC", "USAGE"),
  ];
  const stale = staleRules(live, [
    { role: "anon", facet: "relation", privilege: "SELECT", object: "public.help_articles", why: "x" },
    { role: "anon", facet: "relation", privilege: "SELECT", object: "public.a_table_that_went_away", why: "x" },
    { role: "authenticated", facet: "relation", privilege: "SELECT", object: "public.*", why: "x" },
  ]);
  check("a named object that matched nothing is reported stale", stale.length === 1, JSON.stringify(stale));
  check("...and it is the one that went away", stale[0]?.object === "public.a_table_that_went_away");
  check("a wildcard rule is never called stale — it is a policy, not an inventory", !stale.some((r) => r.object.endsWith(".*")));
}

console.log("\n== 10. the two files the list depends on ==");
{
  const MIG = "supabase/migrations/20260928000000_privileges_rls_cannot_scope.sql";
  check("the migration that took the three verbs away exists", existsSync(MIG));
  // COMMENTS STRIPPED FIRST. This file's header spends eighty lines
  // explaining what it revokes and why; a check that reads the raw text
  // is satisfied by the explanation and would pass over a migration that
  // does nothing — the mistake two gates in this repository have already
  // made, and the one that made "the migration stops revoking TRUNCATE"
  // come back MISSED the first time this was run.
  const sql = (existsSync(MIG) ? readFileSync(MIG, "utf8") : "").replace(/^\s*--.*$/gm, "");
  for (const verb of ["truncate", "references", "trigger"]) {
    check(
      `...and revokes ${verb.toUpperCase()} on every existing relation`,
      // `on table\\b`, NOT `on table`. Section 3 of the same migration says
      // "revoke truncate, references, trigger ON TABLES", and `on tables`
      // contains `on table` — so the loose form was satisfied by the
      // DEFAULT-privilege line and reported the per-relation revoke
      // present after it had been deleted. Measured: the mutation that
      // removes it came back MISSED twice before this boundary was added.
      new RegExp(`revoke[^;]*\\b${verb}\\b[^;]*\\bon\\s+table\\b`, "i").test(sql)
    );
  }
  check(
    "...and takes them off the DEFAULT privilege too, so the next table does not inherit them",
    /alter default privileges[^;]*revoke[^;]*truncate[^;]*\bon\s+tables\b/i.test(sql)
  );
  check("...and revokes setval's UPDATE on sequences while keeping USAGE", /revoke update on sequence/i.test(sql));

  const BOOT = "scripts/db/bootstrap-supabase.sql";
  const boot = readFileSync(BOOT, "utf8");
  // THE FIXTURE HAS TO HAVE THE ROLES, or section 3 above is a check
  // whose subject does not exist in the database it guards.
  for (const role of ["authenticator", "dashboard_user", "supabase_storage_admin"]) {
    check(`${BOOT} creates ${role}`, new RegExp(`create role ${role}\\b`).test(boot));
  }
  check("...and authenticator is NOINHERIT, which is what makes membership different from a grant", /create role authenticator noinherit/.test(boot));
  check("...and is granted the three API roles", /grant anon, authenticated, service_role to authenticator/.test(boot));
  check(
    "the fixture no longer hands auth.users to anon",
    !/grant select on auth\.users to [^;]*anon/.test(boot),
    (boot.match(/grant select on auth\.users to.*/) ?? [""])[0]
  );
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
