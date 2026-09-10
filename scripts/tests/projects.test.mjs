// A FOLDER WITH A GOAL — AND FIVE THINGS IT MUST NOT DO (redesign phase 2).
//
// docs/projects.md measured the alternative and this file holds the
// consequences of the choice. The five the owner named, in order, and
// each of them is a way this feature could look finished and be wrong:
//
//   ONE ACCOUNT'S FOLDER IS NOT ANOTHER'S. Section 3 reads the policies
//   out of the migration and the routes out of their own source: every
//   query on the person's own client, no admin client anywhere, and the
//   membership routes reading the project back before they write.
//
//   NOBODY ADDS TO A PROJECT THAT IS NOT THEIRS. Same section: the
//   read-back answers 404 for "yours does not exist" and "it is not
//   yours" alike, which tells a prober nothing.
//
//   MEMBERSHIP IS NOT TRANSITIVE, and this is proved rather than
//   asserted: section 2 builds a project holding one mission, links three
//   steps to THAT MISSION, and requires the steps to stay out. A
//   transitive implementation passes every other check in this file.
//
//   THE CONTEXT INSIDE A PROJECT DOES NOT BREAK THE CACHE. Section 5:
//   the project is chosen when a conversation starts and there is no
//   setter anywhere that moves an existing one, because a mid-conversation
//   switch rewrites the cached prefix on the message that flips it.
//
//   DELETING A PROJECT DOES NOT DELETE THE CONTENTS. Section 4 reads the
//   trigger's DELETE statement and requires it to name entity_links and
//   nothing else.
//
// WHAT THIS ENVIRONMENT COULD NOT DO, said first: there is no database
// here. The isolation checks read POLICIES and CODE, not rows —
// scripts/tests/user-isolation.dbtest.mjs is the one that needs
// DATABASE_URL and it is skipped without one, which the sweep reports as
// skipped rather than green.
//
// Run: node scripts/tests/projects.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};

const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));
const lookup = (obj, dotted) => dotted.split(".").reduce((n, p) => (n == null ? undefined : n[p]), obj);

const PROJECT_TS = "src/lib/projects/project.ts";
const EXTRAS_TS = "src/lib/projects/linkable-extras.ts";
const MIGRATION = "supabase/migrations/20261001000000_projects.sql";
const ROUTE = "src/app/api/projects/route.ts";
const MEMBERS_ROUTE = "src/app/api/projects/[id]/members/route.ts";
const LIST_PAGE = "src/app/dashboard/projects/page.tsx";
const DETAIL_PAGE = "src/app/dashboard/projects/[id]/page.tsx";
const DETAIL_COMPONENT = "src/components/projects/project-detail.tsx";
const CHAT_PAGE = "src/app/dashboard/chat/page.tsx";
const CHAT_WORKSPACE = "src/components/chat/chat-workspace.tsx";
const CHAT_ROUTE = "src/app/api/chat/route.ts";
const USER_CONTEXT = "src/lib/user-context.ts";
const CONV_SCOPE = "src/lib/projects/conversation-scope.ts";

const project = await loadTs(PROJECT_TS);
const {
  IN_PROJECT, PROJECTS_TABLE, PROJECT_STATUSES, MAX_MEMBERS,
  MAX_NAME_CHARS, MIN_NAME_CHARS, MAX_GOAL_CHARS,
  checkProjectName, clampGoal, isProjectStatus, isProjectMemberTable,
  projectMembers, projectModuleTables, projectContextModules, projectMemberTables,
  isUuid, projectEdgeFilter,
  ROWS_PER_MODULE_UNSCOPED, UNSCOPED_MODULE_COUNT, CONTEXT_ROW_BUDGET, rowsPerModuleInProject,
} = project;

ok(`ten locales were read (${LOCALES.length})`, LOCALES.length === 10);

console.log("== 1. the contract ==");
ok(`three statuses (${PROJECT_STATUSES.join(", ")})`, PROJECT_STATUSES.length === 3 && PROJECT_STATUSES.every(isProjectStatus));
ok("...and the migration's CHECK is the same three",
  PROJECT_STATUSES.every((s) => readFileSync(MIGRATION, "utf8").includes(`'${s}'`)) &&
  /check \(status in \('active', 'done', 'archived'\)\)/.test(readFileSync(MIGRATION, "utf8")));
ok("an unnamed project is refused, a long one is refused, a normal one is kept",
  !checkProjectName("").ok && !checkProjectName("x").ok && !checkProjectName("y".repeat(MAX_NAME_CHARS + 1)).ok &&
  checkProjectName("  Launch   the  shop ").name === "Launch the shop");
ok("bounds are sane", MIN_NAME_CHARS >= 2 && MAX_NAME_CHARS >= 60 && MAX_GOAL_CHARS >= 500);
ok("a goal is clamped, never rejected", clampGoal("g".repeat(MAX_GOAL_CHARS + 100)).length === MAX_GOAL_CHARS && clampGoal(null) === "");
ok(`the relationship type is one string (${IN_PROJECT}) and the table is one string (${PROJECTS_TABLE})`,
  IN_PROJECT === "in_project" && PROJECTS_TABLE === "projects");
ok(`a project is capped at ${MAX_MEMBERS} members`, MAX_MEMBERS >= 50 && MAX_MEMBERS <= 1000);

const edge = (table, id, projectId = "p1", type = IN_PROJECT) => ({
  relationship_type: type, source_table: table, source_id: id, target_table: PROJECTS_TABLE, target_id: projectId,
});

console.log("\n== 2. MEMBERSHIP IS NOT TRANSITIVE — proved, not asserted ==");
{
  // A project holding ONE mission. The mission has three steps, and each
  // step is linked to the MISSION — which is exactly how a person would
  // build it and exactly what a transitive implementation would follow.
  const edges = [
    edge("ai_missions", "m1"),
    { relationship_type: IN_PROJECT, source_table: "ideas", source_id: "step1", target_table: "ai_missions", target_id: "m1" },
    { relationship_type: IN_PROJECT, source_table: "ideas", source_id: "step2", target_table: "ai_missions", target_id: "m1" },
    { relationship_type: "related", source_table: "ideas", source_id: "step3", target_table: "ai_missions", target_id: "m1" },
  ];
  const members = projectMembers(edges, "p1");
  ok(`the project holds the mission and only the mission (${members.length})`,
    members.length === 1 && members[0].table === "ai_missions" && members[0].id === "m1",
    JSON.stringify(members));
  ok("...and none of the mission's own steps came with it",
    !members.some((m) => String(m.id).startsWith("step")),
    "a transitive membership passes every other check in this file");
}
{
  // The same for a website and its form submissions, which is the other
  // half of the decision.
  const edges = [
    edge("ai_websites", "w1"),
    { relationship_type: IN_PROJECT, source_table: "leads", source_id: "f1", target_table: "ai_websites", target_id: "w1" },
  ];
  const members = projectMembers(edges, "p1");
  ok("a website in a project does not bring its submissions", members.length === 1 && members[0].table === "ai_websites");
}
{
  const src = readFileSync(PROJECT_TS, "utf8");
  ok("nothing in the contract expands a member into its own links",
    !/expand|transitive[A-Za-z]*\(|walk\(|recurs/i.test(stripComments(src)),
    "a second pass over the members is the whole thing this decision forbids");
}
ok("an edge of another relationship type is not membership",
  projectMembers([edge("ideas", "i1", "p1", "related")], "p1").length === 0);
ok("an edge to another project is not membership",
  projectMembers([edge("ideas", "i1", "OTHER")], "p1").length === 0);
ok("an edge written the other way round is still read",
  projectMembers([{ relationship_type: IN_PROJECT, source_table: PROJECTS_TABLE, source_id: "p1", target_table: "ideas", target_id: "i7" }], "p1")[0]?.id === "i7");
ok("a table the link picker cannot resolve is refused",
  projectMembers([edge("secret_admin_table", "x")], "p1").length === 0 && !isProjectMemberTable("secret_admin_table"));
ok("the same row twice is one member",
  projectMembers([edge("ideas", "i1"), edge("ideas", "i1")], "p1").length === 1);
ok(`the cap is applied to what comes back (${MAX_MEMBERS})`,
  projectMembers(Array.from({ length: MAX_MEMBERS + 40 }, (_, i) => edge("ideas", `i${i}`)), "p1").length === MAX_MEMBERS);

console.log("\n== 3. ONE ACCOUNT'S FOLDER IS NOT ANOTHER'S ==");
{
  const sql = readFileSync(MIGRATION, "utf8");
  ok("row level security is on", /alter table public\.projects enable row level security/.test(sql));
  for (const verb of ["select", "insert", "update", "delete"]) {
    const re = verb === "insert"
      ? /for insert with check \(auth\.uid\(\) = user_id\)/
      : new RegExp(`for ${verb} using \\(auth\\.uid\\(\\) = user_id\\)`);
    ok(`${verb}: scoped to the owner`, re.test(sql));
  }
  ok("the grant travels with the policies", /grant select, insert, update, delete on public\.projects to authenticated;/.test(sql));
  ok("anon holds nothing", /revoke all on public\.projects from anon;/.test(sql));

  for (const [file, label] of [[ROUTE, "api/projects"], [MEMBERS_ROUTE, "api/projects/[id]/members"]]) {
    const src = stripComments(readFileSync(file, "utf8"));
    ok(`${label}: no admin client anywhere in it`, !/createAdminClient/.test(src),
      "the service role bypasses RLS, which is the one thing keeping these apart");
    ok(`${label}: the user comes from the session`, /supabase\.auth\.getUser\(\)/.test(src));
    ok(`${label}: an unsigned request is refused before anything is read`, /not_signed_in/.test(src) && src.indexOf("not_signed_in") < src.indexOf("try {"));
    ok(`${label}: user_id is never taken from the body`, !/body\.user_id|body\.userId/.test(src));
  }
  const members = stripComments(readFileSync(MEMBERS_ROUTE, "utf8"));
  // EVERY handler, not "somewhere in the file". This check began by
  // testing that `loadOwnProject` was CALLED, which the DELETE
  // handler alone satisfied — dropping the call from POST left it green
  // and left adding a row to somebody else's project on nothing but the
  // link write's own scoping. Counted against the exported handlers so a
  // third one cannot arrive without its read-back.
  const memberHandlers = (members.match(/export async function [A-Z]+\(/g) ?? []).length;
  const memberReadBacks = (members.match(/loadOwnProject\(supabase, user\.id, params\.id\)/g) ?? []).length;
  ok(`adding: the project is read back on the person's own client first (${memberReadBacks} of ${memberHandlers} handlers)`,
    /from\("projects"\)[\s\S]{0,200}\.eq\("user_id", userId\)/.test(members)
      && memberHandlers >= 2 && memberReadBacks === memberHandlers);
  ok("...and a project that is not yours is the same answer as one that does not exist",
    (members.match(/no_such_project/g) ?? []).length >= 2 && /status: 404/.test(members));
  ok("...and every link write is stamped with the session's user", /user_id: user\.id/.test(members));
  ok("...and every link read is scoped to it", (members.match(/\.eq\("user_id", user\.id\)/g) ?? []).length >= 2);
  ok("only a linkable table may be added", /isProjectMemberTable\(table\)/.test(members) && /not_linkable/.test(members));
  ok(`the member cap is enforced where the row is written (${MAX_MEMBERS})`, /MAX_MEMBERS/.test(members) && /project_full/.test(members));

  const listPage = stripComments(readFileSync(LIST_PAGE, "utf8"));
  const detailPage = stripComments(readFileSync(DETAIL_PAGE, "utf8"));
  ok("the pages read through the person's own client", !/createAdminClient/.test(listPage + detailPage));
  ok("the project page answers 404 rather than showing somebody else's", /notFound\(\)/.test(detailPage));
}

console.log("\n== 4. DELETING THE FOLDER DOES NOT DELETE THE CONTENTS ==");
{
  const sql = readFileSync(MIGRATION, "utf8");
  const trigger = sql.slice(sql.indexOf("function public.prune_project_links"), sql.indexOf("prune_orphan_project_links"));
  const deletes = [...trigger.matchAll(/delete from ([a-z_.]+)/g)].map((m) => m[1]);
  ok(`the delete trigger touches only entity_links (${deletes.join(", ") || "nothing"})`,
    deletes.length === 1 && deletes[0] === "public.entity_links",
    "a grouping that can destroy what it groups is the most expensive misclick in the product");
  ok("...and only this project's membership edges", /relationship_type = 'in_project'/.test(trigger) && /target_id = old\.id/.test(trigger));
  ok("...scoped to the deleted project's own user", /user_id = old\.user_id/.test(trigger));
  const sqlCode = sql.replace(/^\s*--.*$/gm, "");
  ok("no member table is named anywhere in the migration",
    !/(ideas|ai_missions|user_files|chat_conversations|generated_posts|ai_presentations)/.test(sqlCode.replace(/'in_project'/g, "")),
    "the folder's migration has no business naming what goes in it");
  ok("nothing is dropped or truncated", !/drop table|truncate/i.test(sqlCode));
  const orphan = sql.slice(sql.indexOf("function public.prune_orphan_project_links"));
  ok("the orphan sweep is service-role only",
    /revoke all on function public\.prune_orphan_project_links\(\) from authenticated;/.test(sql) &&
    /grant execute on function public\.prune_orphan_project_links\(\) to service_role;/.test(sql) &&
    /revoke all on function public\.prune_orphan_project_links\(\) from anon;/.test(sql));
  ok("...and it deletes edges, never members", (orphan.match(/delete from public\.entity_links/g) ?? []).length === 1);
  const routeSrc = stripComments(readFileSync(ROUTE, "utf8"));
  ok("the delete route deletes the project row and nothing else",
    /from\("projects"\)\s*\.delete\(\)/.test(routeSrc) && !/from\("entity_links"\)\s*\.delete\(\)/.test(routeSrc),
    "the cleanup belongs in the trigger, where it happens however the row is removed");
  const detail = stripComments(readFileSync(DETAIL_COMPONENT, "utf8"));
  ok("taking a member out calls the members route, not the member's own table",
    /\/api\/projects\/\$\{encodeURIComponent\(project\.id\)\}\/members/.test(detail) && !/\.from\(/.test(detail));
  for (const l of LOCALES) {
    const confirm = lookup(messages[l], "projects.deleteConfirm");
    // A LENGTH IN CHARACTERS IS NOT A LENGTH IN MEANING. Chinese says
    // the same sentence in a third of the characters, and the first
    // version of this check called that a missing translation.
    const floor = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(String(confirm)) ? 8 : 20;
    ok(`${l}: the delete confirmation says the contents stay`, typeof confirm === "string" && confirm.length > floor);
  }
}

console.log("\n== 5. THE BUDGET, AND THE CACHE IT MUST NOT BREAK ==");
{
  ok(`the unscoped rate is the one lib/user-context.ts enforces (${ROWS_PER_MODULE_UNSCOPED})`,
    /PER_MODULE_LIMIT = 5\b/.test(readFileSync("src/lib/user-context.ts", "utf8")) && ROWS_PER_MODULE_UNSCOPED === 5,
    "the arithmetic below is against the real number or it is against nothing");
  ok(`the budget is rows, held constant (${CONTEXT_ROW_BUDGET} = ${ROWS_PER_MODULE_UNSCOPED} x ${UNSCOPED_MODULE_COUNT})`,
    CONTEXT_ROW_BUDGET === ROWS_PER_MODULE_UNSCOPED * UNSCOPED_MODULE_COUNT);
  const three = rowsPerModuleInProject(3);
  console.log(`        1 module ${rowsPerModuleInProject(1)} rows · 3 modules ${three} · 5 modules ${rowsPerModuleInProject(5)} · 13 modules ${rowsPerModuleInProject(13)}`);
  ok(`a three-module project buys at least 20 rows per module (${three})`, three >= 20);
  ok("a project touching everything is no worse than no project",
    rowsPerModuleInProject(13) === ROWS_PER_MODULE_UNSCOPED && rowsPerModuleInProject(99) === ROWS_PER_MODULE_UNSCOPED);
  ok("the budget never grows with the project", rowsPerModuleInProject(3) * 3 <= CONTEXT_ROW_BUDGET + 3);
  ok("the module count is the DISTINCT tables, not the member count",
    projectModuleTables([{ table: "ideas", id: "a" }, { table: "ideas", id: "b" }, { table: "leads", id: "c" }]).length === 2);

  // THE CACHE. The project is a property of the conversation, chosen at
  // the start, and there is no control anywhere that moves an existing
  // one — a switch mid-conversation rewrites the prefix that was cached.
  const chatPage = stripComments(readFileSync(CHAT_PAGE, "utf8"));
  const workspace = stripComments(readFileSync(CHAT_WORKSPACE, "utf8"));
  ok("the chat page reads ?project= and validates it against the person's own",
    /searchParams\.project/.test(chatPage) && /ownProjectIds\.has\(searchParams\.project\)/.test(chatPage));
  ok("...from a query scoped by RLS, not from the URL", /from\("projects"\)\s*\.select\("id"\)/.test(chatPage));
  ok("the workspace takes it as an INITIAL value", /initialProjectId/.test(workspace));
  ok("...and there is no setter for it anywhere",
    !/setProjectId|setInitialProjectId|changeProject|switchProject/.test(workspace + chatPage + stripComments(readFileSync(DETAIL_COMPONENT, "utf8"))),
    "a mid-conversation switch rewrites the cached prefix on the message that flips it");
  ok("...and it is sent only when the conversation is new",
    /initialProjectId && !sentFromId \? \{ projectId: initialProjectId \} : \{\}/.test(workspace),
    "re-sending it on a later message IS the mid-conversation switch");
  ok("the project page links to a NEW chat carrying the project",
    /\/dashboard\/chat\?project=\$\{encodeURIComponent\(project\.id\)\}/.test(stripComments(readFileSync(DETAIL_COMPONENT, "utf8"))));
  for (const l of LOCALES) {
    ok(`${l}: the screen says a conversation belongs to its project for life`,
      typeof lookup(messages[l], "projects.chatFixed") === "string" && lookup(messages[l], "projects.chatFixed").length > 20);
  }
}

console.log("\n== 6. THE REGISTRY: what a project may hold ==");
{
  const kg = await loadTs("src/lib/knowledge-graph.ts");
  const extras = await loadTs(EXTRAS_TS);
  const tables = projectMemberTables();
  console.log(`        ${kg.LINKABLE_MODULES.length} linkable tables, ${extras.LINK_ONLY_MODULES.length} of them link-only`);
  ok(`the five that were missing are linkable now`,
    ["user_files", "chat_conversations", "ai_missions", "ai_presentations", "generated_posts"].every((t) => tables.includes(t)),
    tables.join(", "));
  ok("...and agents, so the Agents section is not an empty promise", tables.includes("user_agents"));
  ok("every link-only entry carries what a headline needs and no tracker fields",
    extras.LINK_ONLY_MODULES.every((m) => m.table && m.headlineKey && m.titleKey && Array.isArray(m.fields) && m.fields.length === 0));
  ok("no table is registered twice", new Set(tables).size === tables.length);

  // THE COUNT THE DOCUMENT PRINTS. docs/projects.md said nineteen when it
  // was eighteen and named presentations as a build module a round after
  // it had left build-modules.ts — a number nobody could have checked
  // without opening three files. These read the three registries and hold
  // the paragraph to them, so the next table to join makes the sentence
  // that describes the registry go red instead of quietly going stale.
  const classifiers = await loadTs("src/lib/classifier-modules.ts");
  const builds = await loadTs("src/lib/build-modules.ts");
  const sum = classifiers.CLASSIFIER_MODULES.length + builds.BUILD_MODULES.length + extras.LINK_ONLY_MODULES.length;
  ok(`the registry is those three lists and nothing else (${classifiers.CLASSIFIER_MODULES.length} + ${builds.BUILD_MODULES.length} + ${extras.LINK_ONLY_MODULES.length} = ${kg.LINKABLE_MODULES.length})`,
    kg.LINKABLE_MODULES.length === sum);
  const doc = readFileSync("docs/projects.md", "utf8");
  ok(`docs/projects.md prints the real total (${kg.LINKABLE_MODULES.length})`,
    doc.includes(`It now lists **${kg.LINKABLE_MODULES.length}**`),
    "the correction is itself a count claim");
  for (const [label, list] of [["build modules", builds.BUILD_MODULES], ["link-only", extras.LINK_ONLY_MODULES]]) {
    const line = `- ${label} (\`${label === "build modules" ? "src/lib/build-modules.ts" : "src/lib/projects/linkable-extras.ts"}\`): ${list.map((m) => m.slug).join(", ")}`;
    ok(`...and lists the ${label} in registry order`, doc.includes(line), line);
  }
  for (const m of extras.LINK_ONLY_MODULES) {
    const missing = LOCALES.filter((l) => typeof lookup(messages[l], m.titleKey) !== "string");
    ok(`${m.slug}: its name resolves in all ten locales`, missing.length === 0, missing.join(", "));
  }
  // THE HEADLINE COLUMN HAS TO EXIST, or the picker draws a row of blanks.
  const schema = readFileSync("supabase/migrations/20260803000000_baseline_schema.sql", "utf8");
  const laterMigrations = ["20260929000000_presentation_decks.sql", "20260930000000_generated_posts.sql"]
    .map((f) => { try { return readFileSync(`supabase/migrations/${f}`, "utf8"); } catch { return ""; } })
    .join("\n");
  for (const m of extras.LINK_ONLY_MODULES) {
    const all = schema + laterMigrations;
    const declares = new RegExp(`create table if not exists public\\.${m.table}\\b[\\s\\S]{0,3000}?\\n\\s*${m.headlineKey}\\s`).test(all);
    ok(`${m.slug}: ${m.table}.${m.headlineKey} is a real column`, declares, `nothing named ${m.headlineKey} in ${m.table}`);
  }
  {
    // A STAR NEEDS A DESTINATION THAT READS ITS ID, and the link-only
    // tables mostly have none — /dashboard/files and /dashboard/posts
    // both arrived here as `?record=` emitters pointing at pages that
    // read no such parameter, which deep-links.test.mjs caught on the
    // build that introduced them.
    //
    // ai_presentations is the exception and a deliberate one: V5 #21
    // gave that page a `?record=` reader and declared the entry by hand
    // in EXTRA_FAVORITABLE. So the rule is not "no link-only table is
    // favouritable" — it is "none of them is favouritable BY DERIVATION",
    // and any exception is a line somebody wrote next to its reader.
    const fav = await loadTs("src/lib/favoritable.ts");
    const declaredExtras = new Set(fav.EXTRA_FAVORITABLE.map((f) => f.table));
    const derived = fav.FAVORITABLE.filter((f) => !declaredExtras.has(f.table)).map((f) => f.table);
    const leaked = extras.LINK_ONLY_MODULES.filter((m) => derived.includes(m.table)).map((m) => m.table);
    ok(`no link-only table is favouritable by derivation (${extras.LINK_ONLY_MODULES.length} checked)`,
      leaked.length === 0, leaked.join(", "));
  }
}

console.log("\n== 6b. THE BUDGET IS SPENT, NOT DECLARED ==");
{
  // THE WHOLE ARGUMENT FOR PROJECTS IS AN ARITHMETIC IN project.ts, AND
  // AN ARITHMETIC NOBODY CALLS IS A CLAIM. Until this section existed
  // `rowsPerModuleInProject` was read in exactly one place — the project
  // page, to PRINT the number — while /api/chat ignored the projectId its
  // own client was already sending. These are the checks that the number
  // on the screen is the number the prompt is built with.
  const ctx = stripComments(readFileSync(USER_CONTEXT, "utf8"));
  const chat = stripComments(readFileSync(CHAT_ROUTE, "utf8"));
  const scope = stripComments(readFileSync(CONV_SCOPE, "utf8"));

  ok("the context builder takes a project", /getUserFullContext\([\s\S]{0,200}projectId\??: string \| null/.test(ctx));
  ok("...and the chat hands it the one it resolved",
    /getUserFullContext\(supabase, user\.id, activeProjectId\)/.test(chat));
  ok("...before it builds the context, not after",
    chat.indexOf("const activeProjectId") < chat.indexOf("getUserFullContext(supabase, user.id, activeProjectId)"));
  ok("the deeper read names the member rows, it does not merely prefer them",
    /\.in\("id", scope\.ids\)/.test(ctx),
    "without .in(), a row nobody added to the project arrives in its context by being recent");
  ok("...and reads the project's number of rows, not the flat five",
    /\.limit\(scope \? scope\.limit : PER_MODULE_LIMIT\)/.test(ctx));
  ok("...divided by the modules the chat actually reads",
    /rowsPerModuleInProject\(idsByTable\.size\)/.test(ctx));
  ok("the screen divides by the same thing the prompt does",
    /rowsPerModuleInProject\(projectContextModules\(members\)\.length\)/.test(readFileSync(DETAIL_PAGE, "utf8")) &&
    /projectContextModules/.test(ctx));
  ok("...and that is the classifier tables only, because those are the ones scanned",
    projectContextModules([{ table: "ideas", id: "a" }, { table: "user_files", id: "b" }, { table: "chat_conversations", id: "c" }]).length === 1 &&
    projectModuleTables([{ table: "ideas", id: "a" }, { table: "user_files", id: "b" }, { table: "chat_conversations", id: "c" }]).length === 3);
  ok("the provenance line under the answer reports the deeper cap",
    /perModuleCap: scopedSummaries\.length > 0 \? scope!\.rowsPerModule : PER_MODULE_LIMIT/.test(ctx),
    "the screen would otherwise say 'up to 5 rows per module' about an answer that read 20");
  ok("a project changes the HEADLINES and not the health score",
    /const unscopedSummaries = perModule/.test(ctx) && /modulesWithActivity: perModule\.filter/.test(ctx),
    "the thirteen-module pass still runs, so 'Business Health Score' still means the same thing inside a project");
  ok("a project that reads nothing falls back to the unscoped context",
    /scopedSummaries\.length > 0 \? scopedSummaries : unscopedSummaries/.test(ctx));

  // THE CACHE, AGAIN — this time on the server. The client not drawing a
  // switch is not the guarantee; the guarantee is that a body naming a
  // different project on message nine cannot move anything.
  ok("the project is read from the CONVERSATION on every message after the first",
    /projectOfConversation\(supabase, user\.id, conversationId\)/.test(chat));
  ok("...and the body's projectId is honoured only when there is no conversation yet",
    /const activeProjectId = conversationId\s*\?\s*await projectOfConversation[\s\S]{0,120}: await ownedProjectId\(supabase, requestedProjectId\)/.test(chat));
  ok("...and the edge is written only on the message that created it",
    /if \(isNewConversation && activeProjectId\)/.test(chat));
  ok("the project a conversation is put in is read back as the person's own first",
    /from\(PROJECTS_TABLE\)[\s\S]{0,120}\.eq\("id", projectId\)/.test(scope));
  ok("no column was added to chat_conversations for this",
    !/project_id/.test(scope) && !/project_id/.test(chat) &&
    !readFileSync(MIGRATION, "utf8").includes("alter table public.chat_conversations"));

  // THE FILTER STRING. The edges of a project cannot be read with .eq()
  // alone, so the id goes into an .or(...) by concatenation.
  ok("a project id that is not a uuid never reaches a filter string",
    isUuid("11111111-2222-3333-4444-555555555555") &&
    !isUuid("11111111-2222-3333-4444-555555555555,or(user_id.neq.0)") &&
    !isUuid("") && !isUuid(null) && !isUuid("../../etc"));
  {
    let threw = false;
    try { projectEdgeFilter("x,or(user_id.neq.00000000-0000-0000-0000-000000000000)"); } catch { threw = true; }
    ok("...and the builder throws rather than concatenating it", threw);
  }
  ok("both readers of a project's edges go through that builder",
    /\.or\(projectEdgeFilter\(/.test(readFileSync(DETAIL_PAGE, "utf8")) && /\.or\(projectEdgeFilter\(projectId\)\)/.test(ctx));
  ok("the scope read is scoped to the person explicitly, not left to RLS",
    /\.eq\("user_id", userId\)[\s\S]{0,200}\.eq\("relationship_type", IN_PROJECT\)/.test(ctx),
    "two job handlers call getUserFullContext with the service-role client");
}

console.log("\n== 7. THE PAGES ==");
{
  const detail = stripComments(readFileSync(DETAIL_COMPONENT, "utf8"));
  const listPage = stripComments(readFileSync(LIST_PAGE, "utf8"));
  for (const section of ["goal", "tasks", "files", "agents", "results", "activity"]) {
    ok(`the ${section} section is drawn`, new RegExp(`sections\\.${section}`).test(detail) || new RegExp(`"${section}"`).test(detail));
    const missing = LOCALES.filter((l) => typeof lookup(messages[l], `projects.sections.${section}`) !== "string");
    ok(`...and named in all ten locales`, missing.length === 0, missing.join(", "));
  }
  ok("the sections are views over ONE member list, not seven queries",
    (detail.match(/members\.filter\(/g) ?? []).length >= 4 && !/await fetch\([^)]*sections/.test(detail));
  ok("the list page names itself through the nav key", /pageTitle\("sidebar\.items\.projects"\)/.test(readFileSync(LIST_PAGE, "utf8")));
  for (const l of LOCALES) {
    ok(`${l}: the nav name is the page heading`, lookup(messages[l], "sidebar.items.projects") === lookup(messages[l], "projects.title"));
  }
  ok("the row is drawn under Organise", /"\/dashboard\/projects"/.test(readFileSync("src/lib/sidebar-nav.ts", "utf8")));
  const tips = await loadTs("src/lib/help-tips.ts");
  ok("both screens carry a help tip, and they say different things",
    tips.HELP_TIPS.some((t) => t.id === "projects") && tips.HELP_TIPS.some((t) => t.id === "projectDetail") &&
    lookup(messages.en, "help.projects.doesNot") !== lookup(messages.en, "help.projectDetail.doesNot"));
  ok("en: the tip names the absence this feature is built on", /does not pull things in by itself/i.test(lookup(messages.en, "help.projects.doesNot")));
  ok("the member count shown is the edge count, with no expansion in the page",
    /counts\.set\(id, \(counts\.get\(id\) \?\? 0\) \+ 1\)/.test(listPage));
}

console.log(`\n${failures.length === 0 ? "ALL PASS" : "FAILURES"}: ${pass} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
