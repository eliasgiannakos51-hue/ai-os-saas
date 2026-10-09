// A MEETING'S ACTIONS BECOME THE STEPS OF A GOAL, INSIDE A PROJECT
// (MASTER 16, package 17), behind the switch "meeting-goal".
//
// What would be wrong quietly:
//
//   A STEP THE MEETING DID NOT PRODUCE. The browser says which actions,
//   never what they say; section 2 holds the route to re-reading them from
//   the meeting row, by index, as api/meetings/[id]/actions does.
//
//   A GOAL IN SOMEBODY ELSE'S PROJECT, or from somebody else's meeting.
//   Section 2 holds every read and write to the person's own client and to
//   their own rows.
//
//   A GOAL OUTSIDE THE PROJECT IT WAS MADE FOR. When the link fails the
//   goal is taken back; section 2 holds that.
//
//   A PROJECT PAST THE PLAN'S CAP. A new project is made through
//   api/projects, where the cap lives; section 3 holds the screen to it.
//
// Run: node scripts/tests/meeting-goal.test.mjs
import { readFileSync } from "node:fs";
import { loadTs } from "./load-ts.mjs";
import { stripComments } from "../check-mutation-markers.mjs";

let pass = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { failures.push(name); console.log(`  FAIL  ${name}${detail !== undefined ? "\n        " + detail : ""}`); }
};
const read = (f) => stripComments(readFileSync(f, "utf8"));
const LOCALES = ["en", "el", "es", "fr", "de", "it", "pt", "zh", "ja", "ar"];
const messages = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, "utf8"))]));

const G = await loadTs("src/lib/meetings/meeting-goal.ts");
const { MAX_PROPOSED_ACTIONS } = await loadTs("src/lib/meetings/meeting-analysis.ts");

console.log("== 1. the steps are the meeting's own actions ==");
{
  ok("the indexes ticked: whole, in range, once each, in the meeting's order", JSON.stringify(G.chosenIndexes([3, "1", 1, -1, 2.5, MAX_PROPOSED_ACTIONS, "x", 0])) === "[0,1,3]");
  ok("...and anything that is not a list is nothing", G.chosenIndexes("0,1").length === 0 && G.chosenIndexes(null).length === 0);
  const proposals = [
    { what: "Στείλε την προσφορά στο ξενοδοχείο", who: "Μαρία", when: "μέχρι την Παρασκευή" },
    { what: "Κλείσε ραντεβού με τον λογιστή" },
    { what: "   " },
    { what: "Ετοίμασε τον προϋπολογισμό", who: "Γιώργος" },
  ];
  ok("a step says what, who and when, as the meeting said them", G.stepText(proposals[0]) === "Στείλε την προσφορά στο ξενοδοχείο — Μαρία (μέχρι την Παρασκευή)" && G.stepText(proposals[1]) === "Κλείσε ραντεβού με τον λογιστή" && G.stepText(proposals[3]) === "Ετοίμασε τον προϋπολογισμό — Γιώργος");
  const plan = G.goalPlan(proposals, [3, 0, 2, 9]);
  ok("the plan holds the ticked actions that are actions, each pending", plan && plan.steps.length === 2 && plan.steps.every((s) => s.status === "pending") && plan.steps[0].text.startsWith("Ετοίμασε") && plan.steps[1].text.startsWith("Στείλε"), JSON.stringify(plan));
  ok("...and nothing ticked that is an action is no plan", G.goalPlan(proposals, [2, 9]) === null && G.goalPlan([], [0]) === null);
  ok("the goal is what was written, or the meeting's title", G.goalText("  Νέα   συνεργασία ", "Σύσκεψη") === "Νέα συνεργασία" && G.goalText("", "Σύσκεψη Δευτέρας") === "Σύσκεψη Δευτέρας" && G.goalText(42, "Σύσκεψη") === "Σύσκεψη");
  ok("...bounded", G.goalText("α".repeat(900), "x").length === G.MAX_GOAL_CHARS);
}

console.log("\n== 2. the route: the person's own rows, the actions re-read, nothing left half-made ==");
{
  const route = read("src/app/api/meetings/[id]/goal/route.ts");
  const user = route.indexOf("supabase.auth.getUser()");
  ok("the body is read before the user, and an empty choice is refused", route.indexOf("request.json()") < user && /if \(indexes\.length === 0\) return NextResponse\.json\(\{ ok: false, code: "nothing_chosen" \}, \{ status: 400 \}\);/.test(route));
  ok("the switch is asked before anything is read", /if \(!\(await isFeatureOn\("meeting-goal", user\)\)\) return NextResponse\.json\(\{ ok: false, code: "not_enabled" \}, \{ status: 403 \}\);/.test(route) && route.indexOf('isFeatureOn("meeting-goal"') < route.indexOf('.from("meetings")'));
  ok("the meeting is read by id AND owner, with the person's own client", /\.from\("meetings"\)\s*\.select\("id, title, proposed_actions"\)\s*\.eq\("id", params\.id\)\s*\.eq\("user_id", user\.id\)/.test(route) && !/createAdminClient/.test(route));
  ok("the steps come from the meeting's own actions, by index — never from the body's words", /const plan = goalPlan\(proposals, indexes\);/.test(route) && !/body\.(steps|what|actions|text)/.test(route));
  ok("the project is read by id AND owner before anything is written", /\.from\(PROJECTS_TABLE\)\s*\.select\("id"\)\s*\.eq\("id", projectId\)\s*\.eq\("user_id", user\.id\)/.test(route) && route.indexOf(".from(PROJECTS_TABLE)") < route.indexOf('.from("ai_missions")'));
  const refuse = route.indexOf('if (!project) return NextResponse.json({ ok: false, code: "no_such_project" }, { status: 404 });');
  ok("...and a project that is not theirs is refused, before the goal is written", refuse > 0 && refuse < route.indexOf('.from("ai_missions")'));
  ok("...and a full project is refused", /if \(\(count \?\? 0\) >= MAX_MEMBERS\) return NextResponse\.json\(\{ ok: false, code: "project_full" \}/.test(route));
  ok("the goal is the person's, with the plan, and goes into the project", /\.from\("ai_missions"\)\s*\.insert\(\{ user_id: user\.id, goal: goalText\(body\.goal, String\(meeting\.title \?\? ""\)\), status: "planning", plan_steps: plan \}\)/.test(route) && /source_table: "ai_missions",\s*source_id: mission\.id,\s*target_table: PROJECTS_TABLE,\s*target_id: projectId,\s*relationship_type: IN_PROJECT,/.test(route));
  ok("a goal that could not go into the project is taken back", /if \(linkError\) \{\s*await supabase\.from\("ai_missions"\)\.delete\(\)\.eq\("id", mission\.id\)\.eq\("user_id", user\.id\);\s*throw linkError;/.test(route));
  ok("it is bounded and asks no model", /checkRateLimit\(\{ scope: "meeting_actions"/.test(route) && !/anthropic|runCompletion|reserveCredits/i.test(route));
}

console.log("\n== 3. the screen ==");
{
  const ws = read("src/components/meetings/meetings-workspace.tsx");
  const page = read("src/app/dashboard/meetings/page.tsx");
  ok("the page offers it only with the switch, with the person's active projects", /const goals = \(await isFeatureOn\("meeting-goal", user\)\)/.test(page) && /\.from\("projects"\)\.select\("id, name"\)\.eq\("status", "active"\)/.test(page) && /goals=\{goals\}/.test(page));
  ok("it appears once actions are ticked, and only with the switch", /\{goals && ticked\.size > 0 \? \(\s*<div data-testid="meeting-goal"/.test(ws));
  ok("a new project is made through api/projects first, where the plan's cap is", /if \(projectChoice === "new"\) \{\s*const made = await fetch\("\/api\/projects"/.test(ws) && /madeBody\?\.error === "project_limit_reached"\s*\? t\("goal\.projectLimit"\)/.test(ws));
  ok("only the indexes are sent, with the goal's words and the project", /body: JSON\.stringify\(\{ keep: \[\.\.\.ticked\], goal: goalWords\.trim\(\), projectId \}\)/.test(ws));
  ok("what was made is said, with the project one press away", /data-testid="meeting-goal-done"/.test(ws) && /href=\{`\/dashboard\/projects\/\$\{goalMade\.projectId\}`\}/.test(ws));
}

console.log("\n== 4. the words, and the switch ==");
{
  const KEYS = ["title", "goalLabel", "projectLabel", "newProject", "newProjectName", "make", "done", "openProject", "openGoals", "projectLimit", "projectName", "projectFull"];
  for (const l of LOCALES) {
    const g = messages[l].dashboard?.meetings?.goal ?? {};
    const missing = KEYS.filter((k) => typeof g[k] !== "string" || !g[k].trim());
    const counted = ["title", "make", "done"].filter((k) => !/\{count, plural,/.test(g[k] ?? ""));
    ok(`${l}: every sentence, and the counted ones counted`, missing.length === 0 && counted.length === 0, [...missing, ...counted].join(", "));
  }
  ok('the switch "meeting-goal" is declared', /\n  "meeting-goal": "/.test(readFileSync("src/lib/flags/flags.ts", "utf8")));
  ok("the route is claimed by Meetings in the catalog", /"meetings\/\[id\]\/goal",/.test(readFileSync("src/lib/billing/feature-catalog.ts", "utf8")));
}

console.log(failures.length ? `\nFAILURES: ${pass} passed, ${failures.length} failed` : `\nALL PASS: ${pass} passed, 0 failed`);
process.exitCode = failures.length ? 1 : 0;
