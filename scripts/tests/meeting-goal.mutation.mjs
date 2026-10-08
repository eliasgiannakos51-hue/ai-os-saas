#!/usr/bin/env node
/*
 * CAN meeting-goal.test.mjs SEE A STEP THE MEETING DID NOT PRODUCE, A GOAL
 * IN SOMEBODY ELSE'S PROJECT, OR A GOAL LEFT OUTSIDE ITS PROJECT?
 *
 * The steps taken from the body, the meeting read without its owner, the
 * project never checked, a full project filled, the goal left behind when
 * its link fails, the switch never asked, the steps out of the meeting's
 * order, an empty action made a step, the screen sending the words.
 *
 * Run: node scripts/tests/meeting-goal.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/meeting-goal.test.mjs";
const LIB = "src/lib/meetings/meeting-goal.ts";
const ROUTE = "src/app/api/meetings/[id]/goal/route.ts";
const WORKSPACE = "src/components/meetings/meetings-workspace.tsx";

const MUTANTS = [
  {
    name: "the steps are taken from the body",
    file: ROUTE,
    from: "    const plan = goalPlan(proposals, indexes);",
    to: "    const plan = goalPlan((body.actions as ProposedAction[]) ?? proposals, indexes);",
    expect: "the steps come from the meeting's own actions, by index",
  },
  {
    name: "the meeting is read without its owner",
    file: ROUTE,
    from: '      .eq("id", params.id)\n      .eq("user_id", user.id)',
    to: '      .eq("id", params.id)',
    expect: "the meeting is read by id AND owner",
  },
  {
    name: "the project is never checked",
    file: ROUTE,
    from: '    if (!project) return NextResponse.json({ ok: false, code: "no_such_project" }, { status: 404 });',
    to: "",
    expect: "...and a project that is not theirs is refused, before the goal is written",
  },
  {
    name: "a full project is filled",
    file: ROUTE,
    from: "    if ((count ?? 0) >= MAX_MEMBERS) return",
    to: "    if (false) return",
    expect: "...and a full project is refused",
  },
  {
    name: "a goal whose link failed is left behind",
    file: ROUTE,
    from: '      await supabase.from("ai_missions").delete().eq("id", mission.id).eq("user_id", user.id);\n',
    to: "",
    expect: "a goal that could not go into the project is taken back",
  },
  {
    name: "the switch is never asked",
    file: ROUTE,
    from: '  if (!(await isFeatureOn("meeting-goal", user))) return',
    to: "  if (false) return",
    expect: "the switch is asked before anything is read",
  },
  {
    name: "the steps are in the order they were ticked, not the meeting's",
    file: LIB,
    from: ".filter((n) => Number.isInteger(n) && n >= 0 && n < MAX_PROPOSED_ACTIONS))].sort((a, b) => a - b);",
    to: ".filter((n) => Number.isInteger(n) && n >= 0 && n < MAX_PROPOSED_ACTIONS))];",
    expect: "the indexes ticked: whole, in range, once each, in the meeting's order",
  },
  {
    name: "an empty action becomes a step",
    file: LIB,
    from: '    .filter((a): a is ProposedAction => Boolean(a) && typeof a.what === "string" && a.what.trim().length > 0)',
    to: "    .filter((a): a is ProposedAction => Boolean(a))",
    expect: "the plan holds the ticked actions that are actions, each pending",
  },
  {
    name: "the screen sends the actions' words",
    file: WORKSPACE,
    from: "        body: JSON.stringify({ keep: [...ticked], goal: goalWords.trim(), projectId }),",
    to: "        body: JSON.stringify({ keep: [...ticked], actions: proposals, goal: goalWords.trim(), projectId }),",
    expect: "only the indexes are sent, with the goal's words and the project",
  },
  {
    name: "a new project skips the plan's cap",
    file: WORKSPACE,
    from: '        const made = await fetch("/api/projects", {',
    to: '        const made = await fetch("/api/meetings/projects", {',
    expect: "a new project is made through api/projects first",
  },
];

runMutations({ name: "meeting-goal", gate: GATE, targets: [LIB, ROUTE, WORKSPACE], mutants: MUTANTS });
