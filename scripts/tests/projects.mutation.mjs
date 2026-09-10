#!/usr/bin/env node
/*
 * CAN projects.test.mjs TELL A FOLDER FROM A CLAIM OF ONE?
 *
 * The five things this feature must not do are the five the mutants
 * attack, and the first is the one that would pass every other check in
 * the gate: MAKING MEMBERSHIP TRANSITIVE. A project that quietly drags a
 * mission's steps in still lists, still deletes, still isolates — it is
 * simply a different feature from the one that was decided.
 *
 * Run: node scripts/tests/projects.mutation.mjs
 */
import { readFileSync } from "node:fs";
import { writeFileSync } from "./lib/sidecar-write.mjs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/projects.test.mjs";
const PROJECT = "src/lib/projects/project.ts";
const EXTRAS = "src/lib/projects/linkable-extras.ts";
const MIGRATION = "supabase/migrations/20261001000000_projects.sql";
const ROUTE = "src/app/api/projects/route.ts";
const MEMBERS = "src/app/api/projects/[id]/members/route.ts";
const DETAIL = "src/components/projects/project-detail.tsx";
const CHAT_PAGE = "src/app/dashboard/chat/page.tsx";
const CHAT_WS = "src/components/chat/chat-workspace.tsx";
const ZH = "messages/zh.json";
const KG = "src/lib/knowledge-graph.ts";
const CTX = "src/lib/user-context.ts";
const CHAT_ROUTE = "src/app/api/chat/route.ts";
const CONV_SCOPE = "src/lib/projects/conversation-scope.ts";
const DETAIL_PAGE = "src/app/dashboard/projects/[id]/page.tsx";
const DOC = "docs/projects.md";

const TARGETS = [GATE, PROJECT, EXTRAS, MIGRATION, ROUTE, MEMBERS, DETAIL, CHAT_PAGE, CHAT_WS, ZH, KG, DOC,
  CTX, CHAT_ROUTE, CONV_SCOPE, DETAIL_PAGE];

const MUTANTS = [
  // ---- the decision itself -------------------------------------------
  {
    // THE ONE THAT PASSES EVERYTHING ELSE. A second pass that follows a
    // member's own links is exactly the transitive membership that was
    // refused, and nothing but section 2 would notice.
    name: "membership becomes transitive — a mission drags its steps in",
    file: PROJECT,
    from: "  return out;\n}\n\n/** The distinct tables a project touches",
    to: `  for (const edge of edges ?? []) {
    if (!edge || edge.relationship_type !== IN_PROJECT) continue;
    const parent = out.find((m) => m.id === edge.target_id);
    if (parent && isProjectMemberTable(edge.source_table) && typeof edge.source_id === "string") {
      out.push({ table: String(edge.source_table), id: edge.source_id });
    }
  }
  return out;
}

/** The distinct tables a project touches`,
    expect: "none of the mission's own steps came with it",
  },
  {
    name: "an edge of any relationship type counts as membership",
    file: PROJECT,
    from: "    if (!edge || edge.relationship_type !== IN_PROJECT) continue;\n    // The edge is written member -> project.",
    to: "    if (!edge) continue;\n    // The edge is written member -> project.",
    expect: "an edge of another relationship type is not membership",
  },
  {
    name: "a table the picker cannot resolve is accepted",
    file: PROJECT,
    from: "    if (!isProjectMemberTable(table) || typeof id !== \"string\" || !id) continue;",
    to: "    if (typeof id !== \"string\" || !id) continue;",
    expect: "a table the link picker cannot resolve is refused",
  },
  {
    name: "the member cap stops being applied",
    file: PROJECT,
    from: "    if (out.length >= MAX_MEMBERS) break;",
    to: "    if (out.length >= MAX_MEMBERS * 10) break;",
    expect: "the cap is applied to what comes back",
  },
  // ---- isolation ------------------------------------------------------
  {
    name: "the members route stops reading the project back",
    file: MEMBERS,
    from: "    const project = await loadOwnProject(supabase, user.id, params.id);\n    if (!project) return NextResponse.json({ error: \"no_such_project\" }, { status: 404 });\n\n    const { count }",
    to: "    const { count }",
    expect: "adding: the project is read back on the person's own client first",
  },
  {
    name: "a link is written with a user id from the body",
    file: MEMBERS,
    from: "    const { error } = await supabase.from(\"entity_links\").insert({\n      user_id: user.id,",
    to: "    const { error } = await supabase.from(\"entity_links\").insert({\n      user_id: String(body.user_id ?? user.id),",
    expect: "user_id is never taken from the body",
  },
  {
    name: "the create route reaches for the service role",
    file: ROUTE,
    from: 'import { createClient } from "@/lib/supabase/server";',
    to: 'import { createClient } from "@/lib/supabase/server";\nimport { createAdminClient } from "@/lib/supabase/admin";',
    expect: "no admin client anywhere in it",
  },
  {
    name: "the insert policy stops checking the owner",
    file: MIGRATION,
    from: "  for insert with check (auth.uid() = user_id);",
    to: "  for insert with check (true);",
    expect: "insert: scoped to the owner",
  },
  {
    name: "anon keeps its grant",
    file: MIGRATION,
    from: "revoke all on public.projects from anon;",
    to: "-- revoke removed",
    expect: "anon holds nothing",
  },
  // ---- deleting the folder --------------------------------------------
  {
    name: "deleting a project deletes what was in it",
    file: MIGRATION,
    from: "  delete from public.entity_links\n   where user_id = old.user_id",
    to: "  delete from public.ideas where user_id = old.user_id and false;\n  delete from public.entity_links\n   where user_id = old.user_id",
    expect: "the delete trigger touches only entity_links",
  },
  {
    name: "the trigger stops scoping to the deleted project's user",
    file: MIGRATION,
    from: "   where user_id = old.user_id\n     and relationship_type = 'in_project'",
    to: "   where relationship_type = 'in_project'",
    expect: "scoped to the deleted project's own user",
  },
  {
    name: "the orphan sweep is handed to every signed-in account",
    file: MIGRATION,
    from: "revoke all on function public.prune_orphan_project_links() from authenticated;",
    to: "grant execute on function public.prune_orphan_project_links() to authenticated;",
    expect: "the orphan sweep is service-role only",
  },
  {
    name: "the delete route cleans up the edges itself instead of the trigger",
    file: ROUTE,
    from: '    const { error } = await supabase.from("projects").delete().eq("id", id).eq("user_id", user.id);',
    to: '    await supabase.from("entity_links").delete().eq("user_id", user.id);\n    const { error } = await supabase.from("projects").delete().eq("id", id).eq("user_id", user.id);',
    expect: "the delete route deletes the project row and nothing else",
  },
  // ---- the budget and the cache ---------------------------------------
  {
    // NOT by moving the constant — that reddens "the budget is rows, held
    // constant" first and says nothing about growth. This spends the same
    // declared budget on fewer modules than the project actually has, so
    // the constant still checks out and 3 modules x 65 rows quietly buys
    // three times what no project buys.
    name: "a project quietly buys more context than no project",
    file: PROJECT,
    from: "  return Math.max(ROWS_PER_MODULE_UNSCOPED, Math.floor(CONTEXT_ROW_BUDGET / modules));",
    to: "  return Math.max(ROWS_PER_MODULE_UNSCOPED, Math.floor(CONTEXT_ROW_BUDGET / Math.max(1, modules - 2)));",
    expect: "the budget never grows with the project",
  },
  {
    name: "a project of everything reads fewer rows than no project",
    file: PROJECT,
    from: "  return Math.max(ROWS_PER_MODULE_UNSCOPED, Math.floor(CONTEXT_ROW_BUDGET / modules));",
    to: "  return Math.floor(CONTEXT_ROW_BUDGET / modules);",
    expect: "a project touching everything is no worse than no project",
  },
  {
    name: "the project can be switched mid-conversation",
    file: CHAT_WS,
    from: "          ...(initialProjectId && !sentFromId ? { projectId: initialProjectId } : {}),",
    to: "          ...(initialProjectId ? { projectId: initialProjectId } : {}),",
    expect: "it is sent only when the conversation is new",
  },
  {
    name: "the chat trusts the project id in the URL",
    file: CHAT_PAGE,
    from: "searchParams.project && ownProjectIds.has(searchParams.project) ? searchParams.project : undefined",
    to: "searchParams.project ? searchParams.project : undefined",
    expect: "validates it against the person's own",
  },
  // ---- the budget, SPENT ----------------------------------------------
  {
    // THE ONE THAT LOOKS LIKE NOTHING. The number is still computed, the
    // page still prints it, the tests on the arithmetic still pass — and
    // every chat is back to five rows per module.
    name: "the chat stops telling the context which project it is in",
    file: CHAT_ROUTE,
    from: "await getUserFullContext(supabase, user.id, activeProjectId)",
    to: "await getUserFullContext(supabase, user.id)",
    expect: "the chat hands it the one it resolved",
  },
  {
    name: "the deeper read takes recent rows instead of the project's rows",
    file: CTX,
    from: 'const { data, error } = await (scope ? base.in("id", scope.ids) : base)',
    to: "const { data, error } = await base",
    expect: "the deeper read names the member rows",
  },
  {
    name: "the deeper read keeps the flat five",
    file: CTX,
    from: "      .limit(scope ? scope.limit : PER_MODULE_LIMIT);",
    to: "      .limit(PER_MODULE_LIMIT);",
    expect: "reads the project's number of rows, not the flat five",
  },
  {
    name: "the answer says five rows per module about one that read twenty",
    file: CTX,
    from: "    perModuleCap: scopedSummaries.length > 0 ? scope!.rowsPerModule : PER_MODULE_LIMIT,",
    to: "    perModuleCap: PER_MODULE_LIMIT,",
    expect: "the provenance line under the answer reports the deeper cap",
  },
  {
    name: "a project of nothing but files loses the context entirely",
    file: CTX,
    from: "  const moduleSummaries = scopedSummaries.length > 0 ? scopedSummaries : unscopedSummaries;",
    to: "  const moduleSummaries = scope ? scopedSummaries : unscopedSummaries;",
    expect: "a project that reads nothing falls back to the unscoped context",
  },
  {
    name: "the page divides the budget by tables the chat never reads",
    file: DETAIL_PAGE,
    from: "rowsPerModuleInProject(projectContextModules(members).length)",
    to: "rowsPerModuleInProject(projectModuleTables(members).length)",
    expect: "the screen divides by the same thing the prompt does",
  },
  {
    // THE CACHE, ON THE SERVER. The client has no switch; this is what
    // stops a client that grows one from moving a conversation on
    // message nine and rewriting the cached prefix.
    name: "the body's project id is honoured on every message",
    file: CHAT_ROUTE,
    from: "    const activeProjectId = conversationId\n      ? await projectOfConversation(supabase, user.id, conversationId)\n      : await ownedProjectId(supabase, requestedProjectId);",
    to: "    const activeProjectId = await ownedProjectId(supabase, requestedProjectId);",
    expect: "the body's projectId is honoured only when there is no conversation yet",
  },
  {
    name: "a conversation is filed under a project nobody proved was theirs",
    file: CONV_SCOPE,
    from: '      .from(PROJECTS_TABLE)\n      .select("id")\n      .eq("id", projectId)\n      .maybeSingle();',
    to: '      .from(PROJECTS_TABLE)\n      .select("id")\n      .maybeSingle();',
    expect: "read back as the person's own first",
  },
  {
    name: "the edge filter concatenates whatever it is handed",
    file: PROJECT,
    from: '  if (!isUuid(projectId)) throw new Error("projectEdgeFilter: not a project id");\n',
    to: "",
    expect: "the builder throws rather than concatenating it",
  },
  // ---- the registry ----------------------------------------------------
  {
    name: "a link-only entry claims to be a tracker",
    file: EXTRAS,
    from: '    table: "chat_conversations",\n    headlineKey: "title",\n    fields: [],',
    to: '    table: "chat_conversations",\n    headlineKey: "title",\n    fields: [{ key: "title", labelKey: "module.fields.title", type: "text" }],',
    expect: "every link-only entry carries what a headline needs and no tracker fields",
  },
  {
    name: "a headline column that does not exist",
    file: EXTRAS,
    from: '    headlineKey: "filename",',
    to: '    headlineKey: "display_name",',
    expect: "user_files.display_name is a real column",
  },
  {
    // A TABLE THAT IS IN NEITHER OF THE THREE. This is the shape the
    // document's old "19 tables" claim came from: a registry that is no
    // longer the sum of the lists it says it is.
    name: "the registry grows a table that belongs to no list",
    file: KG,
    from: "  ...LINK_ONLY_MODULES,\n];",
    to: '  ...LINK_ONLY_MODULES,\n  { slug: "notes", titleKey: "sidebar.items.notes", table: "user_notes", headlineKey: "title", fields: [] },\n];',
    expect: "the registry is those three lists and nothing else",
  },
  {
    name: "the document goes back to a total nobody counted",
    file: DOC,
    from: "> It now lists **24**",
    to: "> It now lists **19**",
    expect: "docs/projects.md prints the real total",
  },
  {
    // The count can be right while the list beside it is wrong — which is
    // exactly how presentations survived a round in this paragraph after
    // it had left build-modules.ts.
    name: "the document drops a link-only module from its own list",
    file: DOC,
    from: "files, conversations, missions, agents, presentations, posts",
    to: "files, conversations, missions, presentations, posts",
    expect: "lists the link-only in registry order",
  },
  {
    name: "the Agents section becomes an empty promise again",
    file: EXTRAS,
    from: '    table: "user_agents",',
    to: '    table: "user_agents_removed",',
    expect: "agents, so the Agents section is not an empty promise",
  },
  // ---- the copy ---------------------------------------------------------
  {
    name: "the Chinese delete confirmation stops saying the contents stay",
    file: ZH,
    from: '"deleteConfirm": "删除这个项目？里面的内容会留在原处。"',
    to: '"deleteConfirm": "删除？"',
    expect: "zh: the delete confirmation says the contents stay",
  },
  // ---- the gate going blind ---------------------------------------------
  {
    name: "the gate reads one locale and calls it ten",
    file: GATE,
    from: 'const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];',
    to: 'const LOCALES = ["en"];',
    expect: "ten locales were read",
  },
];

function runGate() {
  try {
    execFileSync(process.execPath, [GATE], { encoding: "utf8", stdio: "pipe" });
    return { green: true, failed: [] };
  } catch (e) {
    const out = String(e.stdout ?? "") + String(e.stderr ?? "");
    const failed = [...out.matchAll(/^ {2}FAIL {2}(.+)$/gm)].map((m) => m[1].trim());
    return { green: false, failed: failed.length ? failed : ["(the gate exited non-zero without a FAIL line)"] };
  }
}

console.log("projects mutations\n");

const originals = new Map(TARGETS.map((f) => [f, readFileSync(f, "utf8")]));
const restoreAll = () => {
  for (const [file, text] of originals) writeFileSync(file, text);
};

let caught = 0;
const missed = [];
try {
  const base = runGate();
  console.log(`baseline: the gate is ${base.green ? "GREEN" : "RED"} on the unmutated tree`);
  if (!base.green) {
    console.log(`\nBASELINE IS RED — no mutation result below would mean anything.\n  ${base.failed.join("\n  ")}`);
    process.exit(1);
  }

  for (const m of MUTANTS) {
    const edits = m.edits ?? [{ file: m.file, from: m.from, to: m.to }];
    const byFile = new Map();
    const stale = [];
    for (const e of edits) {
      const current = byFile.get(e.file) ?? originals.get(e.file);
      if (current === undefined || !current.includes(e.from)) { stale.push(e); break; }
      byFile.set(e.file, current.replace(e.from, e.to));
    }
    if (stale.length > 0) {
      missed.push({ ...m, why: `the mutation target no longer exists in ${stale.map((e) => e.file).join(", ")}` });
      console.log(`  STALE   ${m.name}`);
      continue;
    }
    if ([...byFile.entries()].every(([file, text]) => text === originals.get(file))) {
      missed.push({ ...m, why: "the mutation left every file byte-identical" });
      console.log(`  NO-OP   ${m.name}`);
      continue;
    }
    for (const [file, text] of byFile) writeFileSync(file, text);
    let result;
    try {
      result = runGate();
    } finally {
      restoreAll();
    }
    if (result.green) {
      missed.push({ ...m, why: "the gate stayed green — nothing here is load-bearing" });
      console.log(`  MISSED  ${m.name}`);
      continue;
    }
    const onTarget = result.failed.filter((f) => f.includes(m.expect));
    if (onTarget.length === 0) {
      missed.push({ ...m, why: `it went red, but on "${result.failed.slice(0, 3).join('", "')}" — nothing matching "${m.expect}"` });
      console.log(`  WRONG   ${m.name}\n          -> red on: ${result.failed.slice(0, 3).join(" | ")}`);
      continue;
    }
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          -> ${onTarget[0]}`);
  }
} finally {
  restoreAll();
}

const after = runGate();
console.log(after.green ? "\nbaseline: the gate is green again on the restored tree" : "\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length > 0 || !after.green) {
  if (missed.length > 0) {
    console.log("\nHOLES:");
    for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  }
  process.exit(1);
}
console.log("The decision, the isolation, the deletion, the budget and the cache are all load-bearing.");
