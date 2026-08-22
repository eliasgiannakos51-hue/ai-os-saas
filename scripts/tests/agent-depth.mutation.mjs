#!/usr/bin/env node
/*
 * CAN THE DEPTH-AND-TEMPLATES GATE GO RED?
 *
 * The defects this workstream can introduce are all quiet ones:
 *
 *   A TIER HELD AT ONE PRICE AND RUN AT ANOTHER. The hold comes from an
 *   estimate profile; the run comes from the spec. Nothing goes red when
 *   they disagree — the user is over-held (and never told) or the
 *   settlement charges past the hold (and the balance goes negative).
 *
 *   A MARGIN THAT SLIPS. Priced work that costs more than it charges
 *   looks exactly like priced work that does not, until the invoice.
 *
 *   AN ANONYMISER THAT LETS SOMETHING THROUGH. A published template
 *   carrying somebody's email address is indistinguishable, from inside
 *   the product, from one that does not.
 *
 *   A HEURISTIC THAT SUGGESTS THE EXPENSIVE TIER. Twelve times the price,
 *   every day, forever, chosen by a keyword.
 *
 * Run: node scripts/tests/agent-depth.mutation.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const GATE = "scripts/tests/agent-depth.test.mjs";

const DEPTH = "src/lib/agents/agent-depth.ts";
const TEMPLATES = "src/lib/agents/agent-templates.ts";
const RUNNER = "src/lib/agents/agent-runner.ts";
const EXECUTE = "src/lib/agents/execute-agent.ts";
const BUILDER = "src/lib/agents/agent-builder.ts";
const ESTIMATE = "src/lib/billing/estimate.ts";
const POLICY = "src/lib/billing/margin-policy.ts";
const SQL = "supabase/migrations/20260826000000_agent_templates.sql";
const ADOPT = "src/app/api/agents/templates/adopt/route.ts";
const SHARE = "src/app/api/agents/templates/share/route.ts";
const RUN_ROUTE = "src/app/api/agents/[id]/run/route.ts";
const PICKER = "src/components/agents/depth-picker.tsx";
const MATCHES = "src/components/agents/template-matches.tsx";
const PAGE = "src/app/dashboard/agents/page.tsx";

const MUTANTS = [
  // ------------------------------------------------------------------
  // THE TIERS THEMSELVES.
  // ------------------------------------------------------------------
  {
    name: "the default depth becomes simple, silently downgrading every existing agent",
    file: DEPTH,
    from: 'export const DEFAULT_AGENT_DEPTH: AgentDepth = "standard";',
    to: 'export const DEFAULT_AGENT_DEPTH: AgentDepth = "simple";',
  },
  {
    name: "parseAgentDepth passes an unknown tier straight to AGENT_DEPTH_SPECS",
    file: DEPTH,
    from: "  return isAgentDepth(value) ? value : DEFAULT_AGENT_DEPTH;",
    to: "  return value as AgentDepth;",
  },
  {
    name: "isAgentDepth coerces, so an array of one tier is a tier",
    file: DEPTH,
    from: 'return typeof value === "string" && (AGENT_DEPTHS as readonly string[]).includes(value);',
    to: "return (AGENT_DEPTHS as readonly string[]).includes(String(value));",
  },
  {
    name: "standard quietly gains searches, so every existing agent costs more",
    file: DEPTH,
    from: "    researchTokens: 1500,\n    researchChars: 6000,\n    outputTokens: 3000,",
    to: "    researchTokens: 1500,\n    researchChars: 6000,\n    outputTokens: 4000,",
  },
  {
    name: "standard's search budget changes under the agents already running",
    file: DEPTH,
    from: "  standard: {\n    model: \"claude-sonnet-4-6\",\n    researchRounds: 1,\n    maxSearches: 4,",
    to: "  standard: {\n    model: \"claude-sonnet-4-6\",\n    researchRounds: 1,\n    maxSearches: 6,",
  },
  {
    name: "deep runs on the same model as standard, so the ladder collapses",
    file: DEPTH,
    from: '  deep: {\n    model: "claude-opus-4-5",',
    to: '  deep: {\n    model: "claude-sonnet-4-6",',
  },
  {
    name: "simple runs on Sonnet, so the cheap tier is not cheap",
    file: DEPTH,
    from: '  simple: {\n    model: "claude-haiku-4-5",',
    to: '  simple: {\n    model: "claude-sonnet-4-6",',
  },
  {
    name: "a tier's model is not in the pricing table, so it bills at the worst rate",
    file: DEPTH,
    from: '  deep: {\n    model: "claude-opus-4-5",',
    to: '  deep: {\n    model: "claude-opus-9-9",',
  },
  {
    name: "each of deep's two passes gets the full search budget",
    file: DEPTH,
    from: "  const perRound = Math.floor(spec.maxSearches / spec.researchRounds);",
    to: "  const perRound = spec.maxSearches;",
  },
  {
    name: "a round can get zero searches",
    file: DEPTH,
    from: "  return round === 0 ? perRound + remainder : perRound;",
    to: "  return round === 0 ? spec.maxSearches : 0;",
  },
  {
    name: "steps stop counting the write call",
    file: DEPTH,
    from: "  return (needsWebSearch ? AGENT_DEPTH_SPECS[depth].researchRounds : 0) + 1;",
    to: "  return needsWebSearch ? AGENT_DEPTH_SPECS[depth].researchRounds : 0;",
  },
  {
    name: "an agent that never searches is advertised as using ten sources",
    file: DEPTH,
    from: "  return needsWebSearch ? AGENT_DEPTH_SPECS[depth].maxSearches : 0;",
    to: "  return AGENT_DEPTH_SPECS[depth].maxSearches;",
  },
  {
    name: "the heuristic starts suggesting the twelve-times tier from a keyword",
    file: DEPTH,
    from: '  if (hasDeep) return { depth: "standard", reason: "deep_signal" };',
    to: '  if (hasDeep) return { depth: "deep", reason: "deep_signal" };',
  },
  {
    name: "the heuristic stops recognising a one-answer question",
    file: DEPTH,
    from: "  if (SIMPLE_SIGNALS.some((signal) => folded.includes(fold(signal)))) {",
    to: "  if (false) {",
  },

  // ------------------------------------------------------------------
  // THE RUNNER DRIFTS FROM THE TIER.
  // ------------------------------------------------------------------
  {
    name: "the runner goes back to one model for every tier",
    file: RUNNER,
    from: "      model: spec.model,\n      max_tokens: spec.outputTokens,",
    to: "      model: AGENT_RUNNER_MODEL,\n      max_tokens: spec.outputTokens,",
  },
  {
    name: "the output cap stops following the tier",
    file: RUNNER,
    from: "      max_tokens: spec.outputTokens,",
    to: "      max_tokens: 3000,",
  },
  {
    name: "the research cap stops following the tier",
    file: RUNNER,
    from: "      max_tokens: spec.researchTokens,",
    to: "      max_tokens: 1500,",
  },
  {
    name: "the search tool is built with a fixed cap, so deep runs at four",
    file: RUNNER,
    from: "      tools: [webSearchTool(searches)],",
    to: "      tools: [webSearchTool(4)],",
  },
  {
    name: "deep stops running its second pass",
    file: RUNNER,
    from: "    for (let round = 0; round < spec.researchRounds; round += 1) {",
    to: "    for (let round = 0; round < 1; round += 1) {",
  },
  {
    name: "a barren pass no longer stops the research, so it pays twice for NONE",
    file: RUNNER,
    from: "      if (!result.findings) {",
    to: "      if (false) {",
  },
  {
    name: "the research text is truncated at a constant, not the tier's ceiling",
    file: RUNNER,
    from: "    return { findings: text.slice(0, spec.researchChars), searchCount };",
    to: "    return { findings: text.slice(0, 6000), searchCount };",
  },
  {
    name: "the depth reaches AGENT_DEPTH_SPECS unvalidated",
    file: RUNNER,
    from: "  const depth = params.depth ? parseAgentDepth(params.depth) : parseAgentDepth(config.depth);",
    to: "  const depth = (params.depth ?? config.depth) as AgentDepth;",
  },

  // ------------------------------------------------------------------
  // THE HOLD DRIFTS FROM THE RUN.
  // ------------------------------------------------------------------
  {
    name: "the hold is sized against one model for every tier",
    file: EXECUTE,
    from: "      model: spec.model,",
    to: '      model: "claude-sonnet-4-6",',
  },
  {
    name: "the hold is sized for a fixed search count",
    file: EXECUTE,
    from: "      expectedWebSearches: params.needsWebSearch ? spec.maxSearches : 0,",
    to: "      expectedWebSearches: params.needsWebSearch ? 4 : 0,",
  },
  {
    name: "the run is executed at a different depth than it was held for",
    file: EXECUTE,
    from: "    depth: runDepth,\n  });",
    to: "    depth: undefined,\n  });",
  },
  {
    name: "the depth stops reaching the cost row",
    file: EXECUTE,
    from: "      depth: runDepth,\n      depthOverridden",
    to: "      depthNote: runDepth,\n      depthOverridden",
  },
  {
    name: "deep's profile loses a research pass, so the hold is short",
    file: ESTIMATE,
    from: "    auxiliaryCalls: [\n      { inputTokens: 600, outputTokens: 2500 },\n      { inputTokens: 900, outputTokens: 2500 },\n    ],",
    to: "    auxiliaryCalls: [{ inputTokens: 600, outputTokens: 2500 }],",
  },
  {
    name: "deep's output allowance drops below what the runner may produce",
    file: ESTIMATE,
    from: "  agentRunDeep: {\n    systemPromptTokens: 1000,",
    to: "  agentRunDeep: {\n    systemPromptTokens: 1000,\n    // eslint-disable-next-line\n",
    edits: [
      { from: "    baseOutputChars: 16000,\n    outputCharsPerInputChar: 2,\n  },\n  // Filling a TEMPLATE", to: "    baseOutputChars: 8000,\n    outputCharsPerInputChar: 2,\n  },\n  // Filling a TEMPLATE" },
    ],
  },
  {
    name: "a research call is sized below the tier's token ceiling",
    file: ESTIMATE,
    from: "  agentRunStandard: {\n    systemPromptTokens: 800,\n    auxiliaryCalls: [{ inputTokens: 400, outputTokens: 1500 }],",
    to: "  agentRunStandard: {\n    systemPromptTokens: 800,\n    auxiliaryCalls: [{ inputTokens: 400, outputTokens: 500 }],",
  },
  {
    name: "a tier gets its own margin key, so one can drop below the floor alone",
    file: POLICY,
    from: '  agentRunDeep: "agent_run",',
    to: '  agentRunDeep: "agent_run_deep",',
  },
  {
    name: "adopting a template settles as a run, not a build",
    file: POLICY,
    from: '  agentTemplateFill: "agent_build",',
    to: '  agentTemplateFill: "agent_run",',
  },

  // ------------------------------------------------------------------
  // THE BUILDER.
  // ------------------------------------------------------------------
  {
    name: "the builder stops being asked for a depth",
    file: BUILDER,
    from: '      "needsWebSearch",\n      "depth",',
    to: '      "needsWebSearch",',
  },
  {
    name: "the builder is no longer told the cost recurs",
    file: BUILDER,
    from: 'WHEN IN DOUBT CHOOSE "standard"',
    to: "Pick whichever seems best",
  },

  // ------------------------------------------------------------------
  // TEMPLATES: FILLING AND ANONYMISING.
  // ------------------------------------------------------------------
  {
    name: "only the first {subject} is filled, so a literal slot is emailed forever",
    file: TEMPLATES,
    from: "  return taskPattern.split(TEMPLATE_SLOT).join(trimmed).slice(0, AGENT_LIMITS.prompt);",
    to: "  return taskPattern.replace(TEMPLATE_SLOT, trimmed).slice(0, AGENT_LIMITS.prompt);",
  },
  {
    name: "the survivor re-check goes back to exact case",
    file: TEMPLATES,
    from: "  if (foldForMatch(pattern).includes(foldForMatch(trimmedSubject))) {",
    to: "  if (pattern.includes(trimmedSubject)) {",
  },
  {
    name: "the survivor re-check disappears entirely",
    file: TEMPLATES,
    from: "  if (foldForMatch(pattern).includes(foldForMatch(trimmedSubject))) {",
    to: "  if (false) {",
  },
  {
    name: "email addresses stop being refused",
    file: TEMPLATES,
    from: "const EMAIL = /[^\\s@]+@[^\\s@]+\\.[a-z]{2,}/i;",
    to: "const EMAIL = /this-never-matches/i;",
  },
  {
    name: "links stop being refused",
    file: TEMPLATES,
    from: "const URL = /\\bhttps?:\\/\\/\\S+|\\bwww\\.\\S+\\.[a-z]{2,}/i;",
    to: "const URL = /this-never-matches/i;",
  },
  {
    name: "@handles stop being refused",
    file: TEMPLATES,
    from: "const HANDLE = /(^|\\s)@[a-z0-9_]{2,}/i;",
    to: "const HANDLE = /this-never-matches/i;",
  },
  {
    name: "long digit runs stop being refused",
    file: TEMPLATES,
    from: "const LONG_DIGITS = /\\d{4,}/;",
    to: "const LONG_DIGITS = /this-never-matches/;",
  },
  {
    name: "a one-character subject is accepted as a slot",
    file: TEMPLATES,
    from: '  if (trimmedSubject.length < 2) return { ok: false, reason: "no_slot" };',
    to: "  if (false) return { ok: false, reason: \"no_slot\" };",
  },
  {
    name: "a pattern with no structure left is shareable",
    file: TEMPLATES,
    from: '  if (pattern.length < MIN_PATTERN_CHARS) return { ok: false, reason: "too_short" };',
    to: '  if (false) return { ok: false, reason: "too_short" };',
  },
  {
    name: "the title and description skip the contact-detail check",
    file: TEMPLATES,
    from: "  for (const field of [title, description, taskPattern]) {",
    to: "  for (const field of [taskPattern]) {",
  },
  {
    name: "a template without a slot can be shared",
    file: TEMPLATES,
    from: "  if (!taskPattern.includes(TEMPLATE_SLOT))\n    return { ok: false, reason: \"The pattern must contain a {subject} slot.\" };",
    to: "  if (false)\n    return { ok: false, reason: \"The pattern must contain a {subject} slot.\" };",
  },
  {
    name: "an unknown depth on a shared template is passed through",
    file: TEMPLATES,
    from: '  const depth = (AGENT_DEPTHS as readonly string[]).includes(input.depth as string)\n    ? (input.depth as AgentDepth)\n    : "standard";',
    to: "  const depth = input.depth as AgentDepth;",
  },
  {
    name: "matching stops weighting the title, so anything mentioning a word wins",
    file: TEMPLATES,
    from: "    else if (title.includes(word)) score += 3;",
    to: "    else if (title.includes(word)) score += 1;",
  },
  {
    name: "single letters start scoring, so every request matches everything",
    file: TEMPLATES,
    from: "    .filter((w) => w.length >= 3);",
    to: "    .filter((w) => w.length >= 1);",
  },
  {
    name: "a built-in template loses its slot",
    file: TEMPLATES,
    from: "Find the current price of {subject} and report it",
    to: "Find the current price and report it",
  },
  {
    name: "a built-in template carries a link",
    file: TEMPLATES,
    from: '    description: "One number, once a day.",',
    to: '    description: "One number, once a day. See https://example.com",',
  },

  // ------------------------------------------------------------------
  // THE ROUTES AND THE MIGRATION.
  // ------------------------------------------------------------------
  {
    name: "the adopt route lets the model write the task instead of the template",
    file: ADOPT,
    from: "    const prompt = fillTemplate(pattern, subject);",
    to: "    const prompt = subject;",
  },
  {
    name: "the plan cap check disappears, so a capped user pays for nothing",
    file: ADOPT,
    from: "    const capCheck = await checkAgentActivationCap(user.id, cap);",
    to: "    const capCheck = { ok: true } as { ok: boolean; reason?: string; message?: string };",
  },
  {
    name: "adoption stops being email-only, so a template can aim an agent",
    file: ADOPT,
    from: 'const ownership = await resolveDeliveryOwnership(user.id, "email");',
    to: "const ownership = await resolveDeliveryOwnership(user.id, template.output_format);",
  },
  {
    name: "a fill call happens even when the user already typed the subject",
    file: ADOPT,
    from: "    const needsFill = Boolean(apiKey) && !subjectOverride;",
    to: "    const needsFill = true;",
  },
  {
    name: "the use counter moves before the agent exists",
    file: ADOPT,
    from: '    const { error: countError } = await admin.rpc("record_template_use", { p_slug: slug });',
    to: "    const { error: countError } = { error: null };",
  },
  {
    name: "the share route stops returning a code, so the refusal cannot be translated",
    file: SHARE,
    from: "{ ok: false, code: anonymised.reason, error: REFUSAL_FALLBACK[anonymised.reason] },",
    to: "{ ok: false, error: REFUSAL_FALLBACK[anonymised.reason] },",
  },
  {
    name: "the slug is derived from the agent's own name",
    file: SHARE,
    from: "    const base = validated.template.title\n      .toLowerCase()",
    to: "    const base = String(agent.prompt)\n      .toLowerCase()",
  },
  {
    name: "the run route stops validating the depth override",
    file: RUN_ROUTE,
    from: "      if (isAgentDepth(body?.depth)) depthOverride = body.depth;",
    to: "      depthOverride = body?.depth;",
  },
  {
    name: "the database stops requiring the slot",
    file: SQL,
    from: "  constraint agent_templates_has_slot check (position('{subject}' in task_pattern) > 0),",
    to: "  constraint agent_templates_has_slot check (true),",
  },
  {
    name: "the database stops refusing contact details",
    file: SQL,
    from: "  add constraint agent_templates_no_contact_details check (",
    to: "  add constraint agent_templates_no_contact_details check (true and",
  },
  {
    name: "the depth column stops being constrained",
    file: SQL,
    from: "  constraint agent_templates_depth_check check (depth in ('simple', 'standard', 'deep')),",
    to: "  constraint agent_templates_depth_check check (depth is not null),",
  },
  {
    name: "a user gains the ability to publish into everybody's library",
    file: SQL,
    from: "revoke insert, update on public.agent_templates from authenticated;",
    to: "grant insert on public.agent_templates to authenticated;",
  },
  {
    name: "anybody may withdraw anybody's template",
    file: SQL,
    from: "  using (shared_by is not null and auth.uid() = shared_by);",
    to: "  using (true);",
  },
  {
    name: "match_agent_templates becomes SECURITY DEFINER",
    file: SQL,
    from: "language sql\nstable\nsecurity invoker\nset search_path = public, pg_catalog",
    to: "language sql\nstable\nsecurity definer\nset search_path = public, pg_catalog",
  },
  {
    name: "the counter function becomes callable by any signed-in user",
    file: SQL,
    from: "  execute 'revoke all on function public.record_template_use(text) from authenticated';",
    to: "  execute 'grant execute on function public.record_template_use(text) to authenticated';",
  },
  {
    name: "the tsvector stops weighting the title above the description",
    file: SQL,
    from: "setweight(to_tsvector('simple', public.search_fold(coalesce(title, ''))), 'A')",
    to: "setweight(to_tsvector('simple', public.search_fold(coalesce(title, ''))), 'C')",
  },
  {
    name: "a seeded template disappears from the library",
    file: SQL,
    from: "  ('price-check', 'Daily price check',",
    to: "  ('price-checkX', 'Daily price check',",
  },

  // ------------------------------------------------------------------
  // THE UI.
  // ------------------------------------------------------------------
  {
    name: "the price becomes optional on an option",
    file: PICKER,
    from: "  credits: number;",
    to: "  credits?: number;",
  },
  {
    name: "the price is only shown on the selected option",
    file: PICKER,
    from: "                {fact ? formatNumber(fact.credits, locale) : \"—\"}",
    to: "                {selected && fact ? formatNumber(fact.credits, locale) : \"—\"}",
  },
  {
    name: "the tier list is retyped instead of read from AGENT_DEPTHS",
    file: PICKER,
    from: "      {AGENT_DEPTHS.map((depth) => {",
    to: '      {(["simple", "standard"] as const).map((depth) => {',
  },
  {
    name: "\"build a new one\" moves inside the matches branch",
    file: MATCHES,
    from: "      {/* ALWAYS RENDERED, ALWAYS ENABLED. Outside the branch above. */}",
    to: "      {/* moved */}",
    edits: [
      { from: "      {/* ALWAYS RENDERED, ALWAYS ENABLED. Outside the branch above. */}\n      <button", to: "      {matches.length > 0 && <button" },
      { from: "        {buildNewLabel}\n      </button>", to: "        {buildNewLabel}\n      </button>}" },
    ],
  },
  {
    name: "the prices are computed in the browser instead of on the server",
    file: PAGE,
    from: "  const depthPrices = agentRunEstimatesByDepth({",
    to: "  const depthPrices = ({} as Record<string, number>) && agentRunEstimatesByDepthX({",
  },
];

let caught = 0;
const missed = [];
for (const m of MUTANTS) {
  const original = readFileSync(m.file, "utf8");
  const edits = m.edits ?? [{ from: m.from, to: m.to }];
  const stale = edits.find((e) => !original.includes(e.from));
  if (stale) {
    missed.push({ ...m, why: `the mutation target no longer exists in ${m.file}` });
    console.log(`  STALE   ${m.name}\n          anchor not found in ${m.file}`);
    continue;
  }
  let mutated = original;
  for (const e of edits) mutated = mutated.replace(e.from, e.to);
  if (mutated === original) {
    missed.push({ ...m, why: "the mutation left the file byte-identical — it is not a defect" });
    console.log(`  NO-OP   ${m.name}`);
    continue;
  }
  writeFileSync(m.file, mutated);
  // Decided by the EXIT CODE, never by finding the word FAIL in stdout —
  // a gate that goes red with empty output is a gate that went red.
  let failed = false;
  let detail = "";
  try {
    execFileSync("node", [GATE], { encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    failed = true;
    const out = String(e.stdout || "") + String(e.stderr || "");
    detail = (out.split("\n").find((l) => l.includes("FAIL")) || out.split("\n")[0] || "").trim();
  } finally {
    writeFileSync(m.file, original);
  }
  if (failed) {
    caught++;
    console.log(`  CAUGHT  ${m.name}\n          ${detail.slice(0, 130)}`);
  } else {
    missed.push({ ...m, why: "the gate stayed green with the defect re-introduced" });
    console.log(`  MISSED  ${m.name}`);
  }
}

try {
  execFileSync("node", [GATE], { stdio: "pipe" });
  console.log("\nbaseline: the gate is green on the unmutated tree");
} catch {
  console.log("\nBASELINE IS RED — a mutation was not restored. Check `git diff`.");
  process.exit(1);
}
console.log(`\n${caught} of ${MUTANTS.length} mutations caught.`);
if (missed.length) {
  console.log("\nHOLES:");
  for (const m of missed) console.log(`  - ${m.name}\n    ${m.why}`);
  process.exit(1);
}
console.log("Every re-introduced defect turned the gate red.");
