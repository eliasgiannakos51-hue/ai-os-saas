#!/usr/bin/env node
/*
 * WOULD A SCREEN THAT QUIETLY STOPPED TELLING THE TRUTH BE NOTICED?
 *
 * Agents Κομμάτι 1 moved a 1664-line component into the common shell, and
 * the two ways that goes wrong are both silent. One: a function the old
 * screen had stops being reachable and nothing says so — the directive's
 * own rule is that nothing is lost (docs/TOOL-RULES.md §46-47). Two: a
 * row the panel is asked for has no data, and the screen draws something
 * plausible instead of saying so.
 *
 * THE ONE WORTH READING FIRST is "a run paints another agent's boxes".
 * It is a one-word edit — `ownRunJob` back to `runJob` — that leaves
 * every type correct, every box rendering and the whole screen looking
 * right. What it destroys is the only reason the Done/Working/Waiting
 * states mean anything: select a second agent while the first one runs
 * and the second one's plan reads as half finished, about work it has
 * never done. §4 of the gate exists for that mutant.
 *
 * AND ONE ABOUT THE GATES THIS PIECE CHANGED. Four shared gates grew a
 * branch for "a tool in the shell" (empty-states, example-prompts,
 * accent-search, voice-reach). A branch nobody can turn red is a branch
 * that excuses the surface it was written for, so each of those four is
 * mutated here through the file it now reads.
 *
 * EVERY MUTATION IS AN EDIT OF REAL CODE, never an `if (false)`:
 * scripts/check-mutation-markers.mjs fails the build on that literal.
 *
 * Run: node scripts/tests/agents-shell.mutation.mjs
 */
import { runMutations } from "./lib/mutation-runner.mjs";

const GATE = "scripts/tests/agents-shell.test.mjs";
const SHELL = "src/components/agents/agents-shell.tsx";
const PAGE = "src/app/dashboard/agents/page.tsx";
const TOOLSHELL = "src/components/shell/tool-shell.tsx";
const REGISTRY = "src/lib/list-empty-states.ts";
const EL = "messages/el.json";
const ZH = "messages/zh.json";

const MUTANTS = [
  // ---- the plan boxes, and the state that is derived ------------------
  {
    // THE EXPENSIVE ONE. One word, nothing else changes.
    name: "a run started on one agent paints the next agent's plan boxes",
    file: SHELL,
    from: "const ownRunJob = selected && runAgentId === selected.id ? runJob : null;",
    to: "const ownRunJob = selected ? runJob : null;",
    expect: "a run's timeline is never read for another agent",
  },
  {
    name: "a step that has not started reads as finished",
    file: SHELL,
    from: '  if (!entry) return "waiting";',
    to: '  if (!entry) return "done";',
    expect: "Done / Working / Waiting are derived from the run's timeline, in one function",
  },
  {
    name: "the step still running reads as finished, so nothing is ever Working",
    file: SHELL,
    from: '  return entry.seconds === null && running ? "working" : "done";',
    to: '  return "done";',
    expect: "Done / Working / Waiting are derived from the run's timeline, in one function",
  },
  {
    name: "the boxes are three typed-out steps rather than the worker's own list",
    file: SHELL,
    from: "    return JOB_STEPS.agent_run.map((token) => ({",
    to: '    return ["preparing", "working", "delivering"].map((token) => ({',
    expect: "the boxes range over JOB_STEPS.agent_run, the worker's own list",
  },
  {
    name: "every agent's first box claims it searches the web, whatever its own setting says",
    file: SHELL,
    from: '      preparing: searching ? t("capability.stepSearch") : t("capability.stepNoSearch"),',
    to: '      preparing: t("capability.stepSearch"),',
    expect: "each box's one line is derived from THIS agent's own config, not written per box",
  },
  {
    name: "a screen with no run draws three Waiting boxes and says nothing about why",
    file: SHELL,
    from: '{!ownRunJob && <p className="mt-2 text-[11px] leading-relaxed text-muted">{t("shell.noRunYet")}</p>}',
    to: "{null}",
    expect: "before any run, the screen says so in words rather than drawing a state it does not have",
  },
  {
    // The data source itself. If a finished job left its last step with no
    // seconds, the final box would sit on "Working" for ever.
    name: "a finished job's last step never gets its seconds, so the last box never turns Done",
    file: "src/lib/jobs/job-timeline.ts",
    from: "  const ends = entries.map((_, i) => (i + 1 < entries.length ? entries[i + 1].at : done ? job.finishedAt : null));",
    to: "  const ends = entries.map((_, i) => (i + 1 < entries.length ? entries[i + 1].at : null));",
    expect: "...and when it finishes, every step has its seconds — which is what 'Done' reads",
  },

  // ---- sending never spends -------------------------------------------
  {
    name: "pressing send calls the builder, so the cheap route is offered after the expensive one is paid for",
    file: SHELL,
    from: "    setRequestText(trimmed);",
    to: "    setRequestText(trimmed);\n    void build(trimmed, false);",
    expect: "pressing send calls neither the builder nor the template adopt route",
  },
  {
    name: "the field stops writing the open agent's task, so the old edit form's job is simply gone",
    file: SHELL,
    from: '      const body = fieldTarget === "task" ? { prompt: trimmed } : { description: trimmed };',
    to: "      const body = { description: trimmed };",
    expect: "...and with an agent open it writes that agent's task or description, through PATCH",
  },

  // ---- the bar: one white button --------------------------------------
  {
    name: "Run now becomes a second white button",
    file: SHELL,
    from: 'className={`${ACTION} w-auto gap-1.5 px-2 disabled:opacity-40 sm:px-3`}',
    to: 'className="inline-flex min-h-[44px] items-center gap-1.5 rounded-card bg-button px-3 text-sm"',
    expect: "exactly one bg-button in the file, and it is Παύση/Συνέχιση",
  },
  {
    name: "the white button no longer switches the schedule on and off",
    file: SHELL,
    from: '                  { status: selected.status === "active" ? "paused" : "active" },',
    to: '                  { status: "active" },',
    expect: "...and it really switches the schedule on and off",
  },
  {
    name: "Run now runs at a hard-coded tier, so a Deep agent is charged at Standard",
    file: SHELL,
    from: "onClick={() => void runNow(selected, effectiveRunDepth(selected, runOverride))}",
    to: 'onClick={() => void runNow(selected, "standard")}',
    expect: "Run now resolves the tier through the shared helper",
  },
  {
    name: "the bar stops saying a run is in flight",
    file: SHELL,
    from: '              {runningNow && runAgentId === selected.id\n                ? t("runRunning")',
    to: '              {false\n                ? t("runRunning")',
    expect: "the status is the agent's own, and says Running while it runs",
  },

  // ---- the three phone-only ones --------------------------------------
  {
    name: "the [◧] drawer opens over the landing on a phone, with a scrim over the first tap",
    file: SHELL,
    from: "    if (window.matchMedia(\"(min-width: 768px)\").matches) setHistoryOpen(true);",
    to: "    setHistoryOpen(true);",
    expect: "the [◧] column opens beside the landing and stays a closed drawer over it",
  },
  {
    name: "«back» forgets the agent, so a phone can never change one by words",
    file: SHELL,
    from: "      onCloseWork={hideWork}",
    to: "      onCloseWork={() => setSelectedId(null)}",
    expect: "«back» closes the work and keeps the agent chosen, so the field can still reach it",
  },
  {
    name: "the column stays open beside the work, squeezing the field into 200px",
    file: SHELL,
    from: "    setHistoryOpen(false);\n  }\n  function hideWork() {",
    to: "  }\n  function hideWork() {",
    expect: "opening an agent puts the column away, and closing it brings the column back",
  },
  {
    name: "closing the work no longer brings the list back, so the Αρχική never returns",
    file: SHELL,
    from: '    if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) setHistoryOpen(true);',
    to: "",
    expect: "opening an agent puts the column away, and closing it brings the column back",
  },
  {
    name: "the field stops saying which agent the next sentence lands on",
    file: SHELL,
    from: "            <ChosenBox label={selected.name} onClear={() => setSelectedId(null)} />",
    to: "            {null}",
    expect: "...and the shell's own ChosenBox says which agent the next sentence lands on",
  },
  {
    name: "the panel keeps its own height on a phone, pushing the tabs off the screen",
    file: SHELL,
    from: '              <div className="w-full space-y-4 lg:w-72 lg:shrink-0 lg:overflow-y-auto" data-testid="agents-settings-panel">',
    to: '              <div className="w-full shrink-0 space-y-4 overflow-y-auto lg:w-72" data-testid="agents-settings-panel">',
    expect: "the two columns are two scrollers on a computer and one page on a phone",
  },
  {
    name: "the bar's labels stay at every width, breaking the title to one letter per line",
    file: SHELL,
    from: '              <span className="hidden text-xs sm:inline">{t("menuRunNow")}</span>',
    to: '              <span className="text-xs">{t("menuRunNow")}</span>',
    expect: "the bar's two labels stand down below `sm`, and the press keeps its name",
  },
  {
    name: "the white button loses the name a screen reader reads when its label is hidden",
    file: SHELL,
    from: '              aria-label={selected.status === "active" ? t("menuPause") : t("menuResume")}\n              className="inline-flex min-h-[44px] shrink-0',
    to: '              className="inline-flex min-h-[44px] shrink-0',
    expect: "the bar's two labels stand down below `sm`, and the press keeps its name",
  },
  {
    name: "the option under the field overflows the column again, under the work pane",
    file: SHELL,
    from: '              <span key="target" className="flex flex-wrap items-center gap-1.5">',
    to: '              <span key="target" className="flex items-center gap-1.5">',
    expect: "...and the option under the field wraps inside itself, not only as a whole",
  },

  // ---- the panel's two real numbers -----------------------------------
  {
    name: "the per-run price is a number in the component instead of the server's own",
    file: SHELL,
    from: "  const perRunCredits = editDraft ? (depthFacts[editDraft.depth]?.credits ?? 0) : 0;",
    to: "  const perRunCredits = 6;",
    expect: "the per-run figure is the server's own price for the chosen tier, not a number in this file",
  },
  {
    name: "the monthly figure ignores how often this agent actually runs",
    file: SHELL,
    from: "  const monthlyRuns = editDraft ? RUNS_PER_MONTH[editDraft.parts.frequency] : 0;",
    to: "  const monthlyRuns = 30;",
    expect: "the monthly figure is that price times how often THIS schedule fires",
  },
  {
    name: "an hourly agent's monthly estimate is a daily agent's",
    file: SHELL,
    from: "  hourly: 730,",
    to: "  hourly: 30,",
    expect: "the monthly figure is that price times how often THIS schedule fires",
  },

  // ---- the four honest gaps -------------------------------------------
  {
    name: "the panel stops saying the agent has no address of its own",
    file: SHELL,
    from: '                  <p className="text-[11px] leading-relaxed text-muted">{t("shell.ownEmailNone")}</p>',
    to: '                  <p className="text-[11px] leading-relaxed text-muted">{accountEmail}</p>',
    expect: "the gap in its own address is said, where it is missing",
  },
  {
    name: "the cost figures stop saying they are cost rather than a limit that stops anything",
    file: SHELL,
    from: '                    {t("shell.capNoHardStop", { max: AGENT_MAX_CONSECUTIVE_FAILURES })}',
    to: '                    {t("depth.legend")}',
    expect: "the gap in a credit limit that stops it is said, where it is missing",
  },
  {
    name: "the approval row becomes an empty heading",
    file: SHELL,
    from: '                  <p className="text-[11px] leading-relaxed text-muted">{t("shell.approvalsNone")}</p>',
    to: "                  {null}",
    expect: "the gap in approval rules is said, where it is missing",
  },
  {
    name: "one language loses the sentence that explains a gap it still has",
    file: ZH,
    from: '"approvalsNone": "没有，因为不需要：这个助手所做的一切，没有你就不会离开 Ionexa。"',
    to: '"approvalsNone": "无"',
    expect: "...in all ten languages, as a real sentence (shell.approvalsNone)",
  },
  {
    name: "a placeholder is quoted into literal text, so the number never prints",
    file: EL,
    from: '"capPerMonthValue": "{credits} credits · {runs} εκτελέσεις"',
    to: '"capPerMonthValue": "\'{credits}\' credits · {runs} εκτελέσεις"',
    expect: "...and no placeholder is quoted into literal text",
  },

  // ---- the Inbox -------------------------------------------------------
  {
    name: "the Inbox half that cannot fill yet stops saying why",
    file: SHELL,
    from: '                      {t("shell.inboxReceivedNone")}',
    to: '                      {t("historyEmpty")}',
    expect: "...and each half says why it is empty, in its own words",
  },
  {
    name: "the approvals half of the Inbox disappears",
    file: SHELL,
    from: '                    <h3 className="mb-1 text-xs font-semibold text-muted">{t("shell.inboxApprovals")}</h3>',
    to: "                    {null}",
    expect: "the Inbox has both halves the directive names",
  },

  // ---- nothing was lost ------------------------------------------------
  {
    name: "a route the old screen called is no longer called",
    file: SHELL,
    from: 'const response = await fetch("/api/agents/templates/adopt", {',
    to: 'const response = await fetch("/api/agents/templates/adopt-v2", {',
    expect: "every route the old screen called is still called (8)",
  },
  {
    name: "the capability box stops being shown at the moment of the decision",
    file: SHELL,
    from: '      <div className="grid gap-3 rounded-card border border-border bg-panel p-3 sm:grid-cols-2" data-testid="agents-capability-box">',
    to: '      <div className="hidden" data-testid="agents-capability-box-off">',
    expect: "what an agent can and cannot do is still shown, at the moment of the decision",
  },
  {
    name: "where the result goes stops being said before anything is built",
    file: SHELL,
    from: '            {t("deliveryNote", { email: accountEmail })}',
    to: '            {t("latestOutput")}',
    expect: "where the result goes is said before anything is built",
  },
  {
    name: "the counter counts every row again, so two paused agents on a cap of two read as full",
    file: SHELL,
    from: '  const activeCount = useMemo(() => agents.filter((a) => a.status === "active").length, [agents]);',
    to: "  const activeCount = agents.length;",
    expect: "the cap counts ACTIVE agents, as the server does, and is shown",
  },
  {
    name: "listening to a past run's result is dropped",
    file: SHELL,
    from: "                                <div className=\"mt-2\">\n                                  <VoicePlayer text={run.output} compact />\n                                </div>",
    to: "                                {null}",
    expect: "listening to a result is still offered, for the latest and for every past run",
  },
  {
    // THE BUG THE MERGE EXISTS FOR, re-introduced: the parameter is
    // forgotten before the id branch can read it, so a link straight to
    // an agent lands on the landing with its UUID in the thread.
    name: "the address bar is cleared before the two meanings are told apart",
    file: SHELL,
    from: '    const requested = new URLSearchParams(window.location.search).get("agent") ?? initialAgent ?? "";',
    to: '    forgetExampleParam("agent");\n    const requested = new URLSearchParams(window.location.search).get("agent") ?? "";',
    expect: "one effect reads ?agent= and decides which of its two meanings it is",
  },
  {
    name: "a free-text repeat example stops arriving as a request on the table",
    file: SHELL,
    from: "      setRequestText(requested);",
    to: "      setRequestText(\"\");",
    expect: "...anything else arrives as a request on the table, priced before it is built",
  },
  {
    name: "the deep link trusts any id in the address bar",
    file: SHELL,
    from: "    if (agents.some((a) => a.id === requested)) {",
    to: "    if (requested.length > 0) {",
    expect: "...an id of this account's own agents opens that agent",
  },
  {
    name: "a route's English reaches the reader again",
    file: SHELL,
    from: '        addToast(limitText(data) ?? t("createError"), "error");',
    to: '        addToast(data.error ?? t("createError"), "error");',
    expect: "no toast repeats a route's or a job's own English",
  },
  {
    name: "the page goes back to stacking a header above a full-height child",
    file: PAGE,
    from: '    <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">',
    to: '    <div className="min-h-full">',
    expect: "it renders ToolShell, and the page draws it in the full-height wrapper",
  },
  {
    name: "the landing stops drawing the sentence that says what an agent is for",
    file: SHELL,
    from: '        why: t("empty.why"),',
    to: "",
    expect: "the landing is the registry's own two keys plus the shared examples",
  },

  // ---- the four shared gates that grew a branch for this screen --------
  {
    name: "the shell's landing silently drops the optional sentence every tool may pass it",
    file: TOOLSHELL,
    from: '              {empty!.why && <p className="max-w-sm text-sm leading-relaxed text-muted">{empty!.why}</p>}',
    to: "              {null}",
    expect: "...and one optional sentence under it, for a surface whose empty screen owes the reader a why",
    gate: "scripts/tests/tool-shell.test.mjs",
  },
  {
    name: "the empty-state registry's shell branch stops requiring the examples",
    file: SHELL,
    from: '        examples: exampleKeys("agents").map((key) => ({ key, label: tExamples(key as never) })),',
    to: "        examples: [],",
    expect: "agents: presses through to the tool shell's one field",
    gate: "scripts/tests/empty-states.test.mjs",
  },
  {
    name: "a surface declared as a shell landing stops being one",
    file: REGISTRY,
    from: "    shell: true,",
    to: "",
    expect: "agents: the component renders empty.title and empty.why",
    gate: "scripts/tests/empty-states.test.mjs",
  },
  {
    name: "the shared chips are gone from Agents in both of the two shapes that count",
    file: SHELL,
    from: '  const tExamples = useTranslations("aiExamples.agents");',
    to: '  const tExamples = useTranslations("dashboard.agents");',
    expect: "agents renders the shared chips",
    gate: "scripts/tests/example-prompts.test.mjs",
  },
  {
    name: "the shared [◧] column stops searching accent-insensitively, for every tool at once",
    file: "src/components/shell/shell-history-column.tsx",
    from: "    return rows.filter((r) => matchesSearch(r.title, q));",
    to: "    return rows.filter((r) => r.title.toLowerCase().includes(q.toLowerCase()));",
    expect: "shell/shell-history-column.tsx imports and calls matchesSearch",
    gate: "scripts/tests/accent-search.test.mjs",
  },
  {
    // THE CENSUS'S OWN DETECTOR, widened the same day: it read one
    // implementation of pressing with a finger (the hand-rolled CDP
    // pair) rather than the property, so a suite that presses with
    // Playwright's own tap() counted "mouse only". A detector that says
    // yes to everything looks exactly like a working one, and so does
    // one that says no to a shape it has not met.
    name: "the phone pass stops pressing with a finger and clicks like a mouse",
    file: "scripts/tests/agents-shell.prodtest.mjs",
    from: "    await locator.tap();",
    to: "    await locator.click();",
    expect: "mouse-only interaction tests: 25, ceiling 24",
    gate: "scripts/tests/interaction-coverage.test.mjs",
  },
  {
    name: "the chain that carries the mic to Agents is broken in its middle link",
    file: TOOLSHELL,
    from: "            <ChatComposer",
    to: "            <ChatComposerX",
    expect: "Agents' mic is the shared field's: agents-shell -> ToolShell -> ChatComposer -> VoiceInput",
    gate: "scripts/tests/voice-reach.test.mjs",
  },
];

runMutations({
  name: "agents-shell",
  gate: GATE,
  targets: [
    SHELL,
    PAGE,
    TOOLSHELL,
    REGISTRY,
    "scripts/tests/agents-shell.prodtest.mjs",
    EL,
    ZH,
    "src/lib/jobs/job-timeline.ts",
    "src/components/shell/shell-history-column.tsx",
  ],
  mutants: MUTANTS,
});
