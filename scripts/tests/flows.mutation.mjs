#!/usr/bin/env node
/*
 * CAN flows.test.mjs SEE A FLOW THAT RUNS WRONG, COSTS WRONG, OR FILES
 * SOMEBODY ELSE'S WORK?
 *
 * A sentence that needs a video started anyway; a deck that does not wait
 * for its research; a step this person cannot use left in the price; a
 * stored step of a kind that does not exist; a site without its colour;
 * a plan taken from the browser; a project past the plan's cap; a row
 * filed into a project without being read back as the person's own; a
 * finished step reopened; a step started twice; two finishing together,
 * one lost; the database that lets the browser write.
 *
 * Run: node scripts/tests/flows.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/flows.test.mjs";
const PLAN = "src/lib/flows/plan.ts";
const BRIEF = "src/lib/flows/brief.ts";
const CREATE = "src/app/api/flows/route.ts";
const STEPS = "src/app/api/flows/[id]/steps/route.ts";
const SHELL = "src/components/flows/flow-shell.tsx";
const MIGRATION = "supabase/migrations/20261022000000_project_flows.sql";

const MUTANTS = [
  {
    name: "a sentence that needs a video runs the half that exists",
    file: PLAN,
    from: "  if (notYet.length > 0) return { steps: [], notYet };\n",
    to: "",
    expect: "6.3, needs video",
  },
  {
    name: "a deck does not wait for the research it is made from",
    file: PLAN,
    from: '    const after = kind === "slides" && kinds.has("research") ? ["research"] : [];',
    to: "    const after: string[] = [];",
    expect: "6.3 #1: a research, and the deck made from it after",
  },
  {
    name: "a step that waits for one taken out stays in",
    file: PLAN,
    from: "      if (!out.has(s.id) && s.after.some((a) => out.has(a))) {",
    to: "      if (false && !out.has(s.id) && s.after.some((a) => out.has(a))) {",
    expect: "...and a step that waits for it goes with it",
  },
  {
    name: "a stored plan keeps a kind that does not exist",
    file: PLAN,
    from: "    if (!(FLOW_KINDS as readonly unknown[]).includes(kind) || seen.has(kind as string)) continue;",
    to: "    if (seen.has(kind as string)) continue;",
    expect: "a stored plan is read defensively",
  },
  {
    name: "a flow with a failed step reads as done",
    file: PLAN,
    from: '  return plan.steps.every((s) => states[s.id]?.status === "done") ? "done" : "failed";',
    to: '  return "done";',
    expect: "a flow runs until every step is finished, and is done only if every one is",
  },
  {
    name: "the site is not told the colour",
    file: BRIEF,
    from: "    return design ? `${text}\\n\\n${design}` : text;",
    to: "    return text;",
    expect: "the site gets the colour in its own design form's words",
  },
  {
    name: "a colour is any string",
    file: BRIEF,
    from: "  return typeof raw === \"string\" && HEX.test(raw.trim()) ? raw.trim().toLowerCase() : null;",
    to: "  return typeof raw === \"string\" ? raw.trim().toLowerCase() : null;",
    expect: "a colour is a colour or nothing",
  },
  {
    name: "the server runs what the browser says the plan is",
    file: CREATE,
    from: "  const plan = withoutUnavailable(planFlow(said), (kind) => available[kind]);",
    to: "  const plan = withoutUnavailable((body.plan as ReturnType<typeof planFlow>) ?? planFlow(said), (kind) => available[kind]);",
    expect: "the plan is made again on the server, from the sentence, without what this person cannot use",
  },
  {
    name: "a project past the plan's cap",
    file: CREATE,
    from: '      if ((count ?? 0) >= cap) return NextResponse.json({ ok: false, code: "project_limit_reached", limit: cap }, { status: 402 });\n',
    to: "",
    expect: "the project under the plan's own cap",
  },
  {
    name: "the flow opens for a person whose switch is closed",
    file: CREATE,
    from: '  if (!(await isFeatureOn("flows", user))) return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });\n',
    to: "",
    expect: "create: signs in, then the switch",
  },
  {
    name: "a row is filed into the project without being read back as the person's own",
    file: STEPS,
    from: '      const { data: made } = await supabase.from(table).select("id").eq("id", row).eq("user_id", user.id).maybeSingle();',
    to: '      const { data: made } = await supabase.from(table).select("id").eq("id", row).maybeSingle();',
    expect: "a step's row is read back, from the step's own table, as the person's own, before it goes in the project",
  },
  {
    name: "a finished step is reopened",
    file: STEPS,
    from: '      if (now?.status === "done") return "already_done";\n',
    to: "",
    expect: "a step is claimed once, waits for what it needs, and is not reopened",
  },
  {
    name: "a step starts twice",
    file: STEPS,
    from: '      if (status === "running" && !row && now?.status === "running") return "already_running";\n',
    to: "",
    expect: "a step is claimed once, waits for what it needs, and is not reopened",
  },
  {
    name: "two steps finishing together, one lost",
    file: STEPS,
    from: '        .eq("updated_at", current.updated_at)\n',
    to: "",
    expect: "two steps finishing together lose neither",
  },
  {
    name: "a step is started before «Έγκριση» answers",
    file: SHELL,
    from: '        say("tool", code === "project_limit_reached" ? t("errors.projectLimit", { limit: Number(data?.limit ?? 0) }) : code === "rate_limited" ? t("errors.rateLimited") : t("errors.failed"));\n        return;',
    to: '        say("tool", code === "project_limit_reached" ? t("errors.projectLimit", { limit: Number(data?.limit ?? 0) }) : code === "rate_limited" ? t("errors.rateLimited") : t("errors.failed"));',
    expect: "nothing starts before «Έγκριση», and a large total asks again",
  },
  {
    name: "the browser may write its own flows",
    file: MIGRATION,
    from: "revoke insert, update, delete on public.project_flows from authenticated;",
    to: "grant insert, update on public.project_flows to authenticated;",
    expect: "project_flows: the owner reads, nobody writes from the browser, gone with its project",
  },
];

runMutations({
  name: "flows",
  gate: GATE,
  targets: [PLAN, BRIEF, CREATE, STEPS, SHELL, MIGRATION],
  mutants: MUTANTS,
});
