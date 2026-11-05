// A PROJECT'S LINKS AND MEMBERS ARE READ AS ITS OWNER'S, AND A LINK'S TWO
// ENDS ARE ITS OWNER'S (2026-11-05 review, A3).
//
// The public share page (app/shared/[token]/page.tsx) hands the
// service-role client to lib/projects/load-project-detail.ts, where no RLS
// scopes anything. What must hold:
//   1. every read that function makes after the project's own row is
//      filtered to the project's user_id. The population is the file:
//      every `.from(` in it but the first.
//   2. the other shared reader of a link's far end
//      (lib/entity-links.ts) filters to the caller as well
//   3. the database refuses a link whose ends are not the link's owner's
//      (migration 20261115000002_entity_links_same_owner.sql; the
//      behaviour is entity-links-owner.dbtest.mjs)
//
// Run: node scripts/tests/entity-links-owner.test.mjs
import { readFileSync } from "node:fs";

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
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const read = (f) => strip(readFileSync(f, "utf8"));

console.log("== 1. every read after the project's own is the owner's ==");
const loader = read("src/lib/projects/load-project-detail.ts");
check("the project's own row carries its owner", /\.from\("projects"\)\s*\.select\("id, user_id,/.test(loader));
check("...which every read below is filtered to", /const ownerId = String\(project\.user_id\);/.test(loader));
// Each `.from(` up to the statement's end: the chain it starts.
const chains = [...loader.matchAll(/\.from\(([^)]*)\)([\s\S]*?);/g)].map((m) => ({ from: m[1], chain: m[2] }));
check(`the reads were found (${chains.length})`, chains.length >= 3, chains.map((c) => c.from).join(", "));
for (const c of chains.slice(1)) {
  check(`.from(${c.from}) is filtered to the owner`, /\.eq\("user_id", ownerId\)/.test(c.chain));
}
const shared = read("src/app/shared/[token]/page.tsx");
check(
  "the share page reaches the project only through its token",
  /admin\.from\("projects"\)\.select\("id"\)\.eq\("share_token", token\)\.maybeSingle\(\)/.test(shared)
);
check("...and it is the service-role client it hands over, so the filter above is the only fence", /loadProjectDetail\(admin as unknown as/.test(shared));

console.log("\n== 2. the other reader of a link's far end ==");
const links = read("src/lib/entity-links.ts");
check(
  "loadLinkedEntities reads the far end as the caller's own rows",
  /\.from\(otherTable\)\s*\.select\("\*"\)\s*\.eq\("user_id", userId\)\s*\.in\("id", \[\.\.\.otherIds\]\);/.test(links)
);

console.log("\n== 3. the database refuses a link whose ends are not its owner's ==");
const MIG = "supabase/migrations/20261115000002_entity_links_same_owner.sql";
const mig = readFileSync(MIG, "utf8").replace(/--[^\n]*/g, "");
const fn = /create or replace function public\.entity_links_same_owner\(\)[\s\S]*?\n\$\$;/.exec(mig)?.[0] ?? "";
check("the trigger function is defined", fn.length > 0);
check("...definer, with a fixed search_path", /security definer/.test(fn) && /set search_path = pg_catalog, pg_temp/.test(fn));
check("...checks BOTH ends", /select new\.source_table as tbl, new\.source_id as row_id\s*union all\s*select new\.target_table, new\.target_id/.test(fn));
check(
  "...accepts only a public table with an id and a user_id, from the catalog",
  /n\.nspname = 'public'/.test(fn) && /a\.attname = 'id'/.test(fn) && /a\.attname = 'user_id'/.test(fn)
);
check("...names the table only through %I", /format\('select exists \(select 1 from public\.%I where id = \$1 and user_id = \$2\)', side\.tbl\)/.test(fn));
check("...binds the ids, never splices them", /using side\.row_id, new\.user_id;/.test(fn));
check("...and refuses what is not the owner's", /if not owned then\s*raise exception/.test(fn));
check(
  "the trigger runs before every insert AND update",
  /create trigger entity_links_same_owner\s+before insert or update on public\.entity_links\s+for each row execute function public\.entity_links_same_owner\(\);/.test(mig)
);
check(
  "...and nobody can call the function directly",
  ["public", "anon", "authenticated"].every((r) => new RegExp(`revoke all on function public\\.entity_links_same_owner\\(\\) from ${r};`).test(mig))
);

console.log(failures.length === 0 ? `\nALL PASS: ${pass} passed, 0 failed` : `\nFAILURES: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
