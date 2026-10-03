# Ionexa Intelligence OS — every system, what exists, and the order

Written 2026-10-03. Analysis and plan only: nothing in this document is
built by it. Every "exists" below names the file that makes it true, so it
can be opened rather than trusted; every number carries its date or the
command that re-derives it (CLAUDE.md, "A number in a document carries its
date").

The flow the owner described, which every system below serves:

    Goal → Understand → Research → Plan → Delegate → Execute → Verify → Fix → Deliver → Learn

## 0. The rules every system is built under

The owner's, 2026-10-03, and they bind every row below:

- **One system at a time, finished before the next.**
- **Each one: a gate, its mutations, and a live proof** — the same standard as
  `scripts/tests/published-origin.prodtest.mjs` or `voice-command.prodtest.mjs`.
- **Margin 4× on anything that adds model calls** — the real margin, as
  `scripts/tests/combined-ceiling.test.mjs` holds it (`docs/v6-pricing-2026-10-02.md` §1).
- **Computer Use / Browser Agent: never an action without approval, and only
  after Sandbox and the Permission System exist.**
- **Nothing in the sidebar before it works** — `notBuilt` in
  `scripts/tests/sidebar-structure.test.mjs` until it does.

## 1. The model these systems run on — confirmed, not remembered

Read 2026-10-03 from Anthropic's own models page
(<https://platform.claude.com/docs/en/about-claude/models/overview>), and for
fast mode from Anthropic's API reference (bundled with the `claude-api`
skill, cached 2026-09-25):

| | Claude Opus 5.5 | Claude Sonnet 5.5 | Claude Haiku 4.5 |
|---|---|---|---|
| API id | `claude-opus-5-5` | `claude-sonnet-5-5` | `claude-haiku-4-5-20251001` |
| Context window | 1M tokens | 1M tokens | 200K tokens |
| Max output (sync API) | 128K tokens | 128K tokens | 64K tokens |
| Price, input / output per MTok | $4 / $20 | $2 / $10 | $1 / $5 |
| Prompt-cache read | 5% of input ($0.20) | 10% of input | 10% of input |
| Thinking | adaptive, **always on** | adaptive | extended |
| Effort | `low` · `medium` · `high` · `xhigh` · `max`, **default `medium`** | same five, default `high` | not supported |
| Batch API | 50% off; up to 300K output with a beta header | same | 50% off |

**Fast mode (Opus 5.5):** research preview, **Claude API only** (not Bedrock,
Google Cloud or Foundry), up to 2.5× output tokens per second, **$8 / $40 per
MTok** — twice the standard price. Not with the Batch API.

**Two consequences for this product, measured 2026-10-03:**

1. **Every AI feature here still calls `claude-sonnet-4-6`** ($3 / $15), and
   the deep agent tier calls `claude-opus-4-5` (`src/lib/agents/agent-depth.ts`).
   Sonnet 5.5 is cheaper than Sonnet 4.6 on both sides. Moving to it is a
   **cost reduction** before any system below is built — but
   `src/lib/billing/model-pricing.ts` has no row for it yet and prices
   unknown models at the most expensive rate (`docs/v6-analysis-2026-10-02.md`
   §1b). That row is the first line of the Model Router work.
2. **Opus 5.5 cannot have thinking turned off** and rejects a forced
   `tool_choice` — features built on "force this tool" (the security review in
   `src/lib/website-security-review.ts` is one) need changing before they can
   move to it.

## 2. The inventory — 34 systems

Columns: **Exists** = in production code, used by a feature. **Partly** = a
real piece exists, the system does not. **Missing** = nothing.
The phase column is the order in §4, which differs from the proposal in
three places, each explained there. Estimates are **my judgment of build
days, 2026-10-03, not measurements** — one system per round, gate + mutations
+ live proof included.

### INTELLIGENCE

| System | State | What exists (the file) | What is missing | Phase | Days |
|---|---|---|---|---|---|
| Model Router | Partly | `src/lib/ai/routing/route.ts` + `tiers.ts`: four tiers, escalation, outcome store; failover in `src/lib/ai/providers/failover.ts`. **Measured 2026-10-03: `route()` has 2 importers, both the admin page `/dashboard/routing` and its store — no feature routes through it.** | Wiring every call site through it; Sonnet 5.5 / Opus 5.5 price rows; rollback driven by the Evaluation Lab | 2 | 4–5 |
| Adaptive Compute | Partly | Agent depth tiers simple/standard/deep (`src/lib/agents/agent-depth.ts`) | Effort per request (`low`→`max`) chosen per task; **no model call in `src/` sets `effort` (grep for `output_config`, 2026-10-03)** | 2 | 2–3 |
| Long-Context Engine | Partly | `src/lib/ai/deep-dive-load.ts`, `cross-module-context.ts`, relevance budgets | Use of the 1M window; compaction for long sessions | 3 | 4 |
| Project Context Engine | Partly | Projects (`src/lib/projects/`), `mission-context.ts`, `workspace-context.ts` | One context object every feature reads for "this project"; files + decisions + goals assembled once | 2 | 5 |
| Vision QA | Missing | Vision INPUT exists (reference images to the builder) | Looking at what was MADE — needs a renderer (see Visual QA) | 2 | with Visual QA |

### EXECUTION

| System | State | What exists | What is missing | Phase | Days |
|---|---|---|---|---|---|
| Agent Orchestrator | Partly | Background jobs with reserve → worker → settle (`src/lib/jobs/run-job.ts`); missions with steps (`mission-step-runner.ts`) | One planner that splits a goal into tasks and hands them out | 3 | 6–8 |
| Subagents | Missing | — | Delegated workers with their own context and budget | 3 | 5 |
| Parallel Execution | Partly | Jobs run in parallel across users | **Inside one task nothing is parallel: Deep Research answers its questions in a `while` loop (`src/lib/research/run-research.ts:316`), "up to six sequential, search-enabled model calls" at 60–90 s each (that file's own header)** | 1 | 2 |
| Coding Agent | Partly | AI Coding: one request → code + diff (`src/app/api/coding/run/route.ts`) | Running the code, reading the error, trying again — needs Sandbox first | 3 | 6 |
| Browser Agent | Missing | — | Everything; only after Sandbox + Permission System | 4 | 8+ |
| Computer Use | Missing | — | Everything; only after Sandbox + Permission System, never an action without approval | 4 | 8+ |
| Tool/API Builder | Partly | Integrations / connectors (`src/lib/integrations/`) | Building a NEW tool from a description | 5 | 6 |

### KNOWLEDGE

| System | State | What exists | What is missing | Phase | Days |
|---|---|---|---|---|---|
| Advanced Memory | Exists | `src/lib/memory/` (policy, store, surfaces), `/dashboard/ai-memory` | Forgetting/decay rules; memory per project | 3 | 3 |
| Knowledge Graph | Partly | Entity links between records (`src/lib/knowledge-graph.ts`, 14 importers) — **links a person makes by hand** | Links the system proposes and keeps; queries across them | 3 | 6 |
| RAG | Missing | Word-ranking search; **no embeddings anywhere in `src/` or the migrations (2026-10-03)**, as `src/lib/agents/agent-templates.ts` already says | Embeddings, an index, retrieval with citations | 3 | 5 |
| Caching | Exists | Prompt-cache placement (`src/lib/ai/cached-system.ts`, `providers/cache-policy.ts`) | Cache-hit measurement per feature on the admin page | 2 | 1 |

### VERIFICATION

| System | State | What exists | What is missing | Phase | Days |
|---|---|---|---|---|---|
| **Completion Contract** | Partly | Each feature has its own after-the-fact checks: Greek spelling, invented numbers, link safety, placeholders (`src/lib/website-*.ts`), citations (`src/lib/verification/citations.ts`) | **A contract declared BEFORE the work** — "done means these N checkable things" — shown to the person, evaluated after, with each line passed or failed in the result | **1** | 3 |
| Verification Engine | Partly | The checks above, deterministic, per feature | One engine that runs a contract's checks for any feature | 1 (with the contract) | — |
| Critic Agents | Partly | One: the content-safety reviewer (`src/lib/website-security-review.ts`) | Critics for quality, not only safety | 2 | 3 |
| Automated Testing | Missing (for users' work) | 300+ gates test THIS codebase | Tests run against what the Coding Agent writes — needs Sandbox | 3 | with Coding Agent |
| Visual QA | Missing | `scripts/*.prodtest.mjs` photograph OUR pages in Chromium | Rendering a GENERATED site and looking at it — needs a renderer on the server, which a Vercel function is not | 2 | 5+ |
| Security Agent | Partly | Static scan + review + CSP sandbox for published sites (`src/lib/website-html-security-scan.ts`, `src/lib/publishing/public-serving.ts`) | An agent that reviews code and configs, not only generated HTML | 4 | 4 |

### SAFETY

| System | State | What exists | What is missing | Phase | Days |
|---|---|---|---|---|---|
| Permission System | Partly | Plan capabilities (`src/lib/billing/capability-gate.ts`), owner-only pages, the voice rule "no action without Yes" (`src/lib/voice/voice-command.ts`) | Per-action grants for agents (read / write / spend / external), asked and remembered | **3** (moved from 4) | 5 |
| Sandbox | Missing | Published pages run in a CSP sandbox (2026-10-02) — that isolates a PAGE, not code execution | Somewhere to run code and browsers that cannot reach the app or the database | **3** (moved from 4) | 5–8 |

### OBSERVABILITY

| System | State | What exists | What is missing | Phase | Days |
|---|---|---|---|---|---|
| **Agent Activity Timeline** | Partly | Job step labels (`src/lib/jobs/step-labels.ts`, `ai-steps.ts`), a stop button per unit of work | One timeline per task the person sees: each step, its cost, its evidence, live | **1** | 3–4 |
| Agent Observability | Partly | Provider log, cost log, margin report, `/dashboard/costs`, `/routing`, `/system-health` (owner-only) | Per-run traces an owner can open from a failure | 2 | 3 |
| Evaluation Lab | Partly | Mechanical scorer (`src/lib/evals/scoring.ts`), `scripts/evals/` | A place to run a feature against a fixed set before a change ships — what the Model Router's rollback needs | 2 | 4 |

### OPTIMIZATION

| System | State | What exists | What is missing | Phase | Days |
|---|---|---|---|---|---|
| Cost Optimizer | Partly | Margin policy, estimate-before-action, batch client (`src/lib/ai/batch/`), the price table (`scripts/price-table.mjs`) | Choosing model + effort per request by cost — that is the Router | 2 | with Router |
| Latency Optimizer | Partly | Prefetch on hover, streaming, background jobs | Measured latency per feature; parallelism (Phase 1 starts it) | 2 | 2 |
| Speed Engine | Missing | — | Fast mode for the requests where speed is worth 2× ($8/$40, Claude API only) | 3 | 2 |

### BUILDERS

| System | State | What exists | What is missing | Phase | Days |
|---|---|---|---|---|---|
| Agent Builder | Exists | `src/lib/agents/agent-builder.ts`, templates, `/dashboard/agents` | Agents that use subagents and tools beyond search | 5 | 4 |
| Skill Builder | Missing | — | Saving a way of working as a reusable skill | 5 | 4 |
| Workflow Builder | Partly | Automations with schedules (`src/lib/automation-schedule.ts`) | Multi-step flows with branches, built from a description | 5 | 5 |
| Multi-agent Projects | Missing | Projects exist; agents exist; nothing joins them | Several agents on one project with shared context | 5 | 6 |

**Count (2026-10-03):** of 34 rows, **3 exist**, **20 partly**, **11 missing**.

## 3. Phase 1 — do I agree with the four?

**Yes, with the order changed inside it.**

1. **Agent Activity Timeline first, not fourth.** The Completion Contract has
   to show the person which promise passed and which failed; without a place
   that shows a task's steps, the contract's result is a line in a log. The
   timeline is that place, and every later system writes into it.
2. **Completion Contract** — with the Verification Engine as its other half:
   one declaration, one runner.
3. **Verify loop in the Website Builder** — the first feature to sign a
   contract. It is where the expensive mistakes are: a site costs 90 credits
   on Growth (`node scripts/price-table.mjs`, 2026-10-02) and its existing
   checks run after the person has paid.
4. **Parallel execution in Deep Research** — the cheapest win on the list
   (2 days) and the most visible: six 60–90 s questions in sequence become
   six at once. It is independent of the other three, so it can move up if a
   quick win is wanted first.

## 4. The phases, and the three changes to the proposal

| Phase | Systems |
|---|---|
| **1 (V6.2)** | Activity Timeline · Completion Contract + Verification Engine · Verify loop in the builder · Parallel Research |
| **2 (V6.2)** | Model Router (wired) · Evaluation Lab · Adaptive Compute · Project Context Engine · Critic Agents · Visual QA + Vision QA · Caching measurement · Agent Observability · Latency |
| **3 (V6.3)** | **Sandbox · Permission System** · Coding Agent + Automated Testing · Agent Orchestrator · Subagents · Knowledge Graph · RAG · Long-Context · Advanced Memory · Speed Engine |
| **4 (V6.3)** | Browser Agent · Computer Use · Security Agent |
| **5 (V6.3)** | Agent / Skill / Workflow / Tool Builders · Multi-agent Projects |

**Accepted by the owner on 2026-10-03**, all three changes as written below:
the Activity Timeline first in Phase 1, Sandbox and the Permission System
before the Coding Agent, and the Evaluation Lab before the Router. The table
above is the order V6.2 and V6.3 are built in.

**Why it differs from the proposal:**

1. **Sandbox and Permission System move from Phase 4 to Phase 3.** The Coding
   Agent (Phase 3) is "write code, RUN it, read the error, try again". Running
   code a model wrote, without a sandbox, is the same hole as published pages
   on the app's origin one level deeper. Your own rule already says Browser
   and Computer Use wait for them; the Coding Agent has to as well.
2. **Evaluation Lab moves from Phase 5 to Phase 2.** The Model Router's
   promise is "the cheapest model that is good enough", and "good enough" is
   an eval. `src/lib/ai/routing/tiers.ts` says so in its own header: the
   tiers are a hypothesis rolled back when quality drops. A router without
   the lab is a cost cut with no brake.
3. **Visual QA stays in Phase 2 but carries an infrastructure cost the others
   do not:** rendering a generated site needs a browser on a server, and a
   Vercel function is not one. It needs a decision on where that runs.

## 5. What a verify loop costs per site, and how 4× holds

**DERIVED 2026-10-03**, from the estimator's own website profile
(`src/lib/billing/estimate.ts`, `websiteGenerate`: ~34,000 output characters)
and `claude-sonnet-4-6` at $3 / $15:

| | model cost | Growth credits (real 4× margin) |
|---|---|---|
| The site today, 300-character request | EUR 0.30 | 90 |
| + a **verify** pass: the model reads the page (~8.5K tokens + ~3K system) and lists what fails the contract (~1.5K tokens out) | + EUR 0.05 | + ~16 |
| + one **targeted fix** of what failed (the website-edit profile) | + EUR 0.04 | + ~12 |
| **Verify + one fix** | **EUR 0.39 (+30%)** | **~118** |
| Verify + a full regeneration ("doubling the calls") | EUR 0.65 (+117%) | ~196 |

So "a verify loop doubles the calls" is true only if the fix is a
regeneration. A verify that READS and a fix that EDITS add about 30%.

**How 4× holds, mechanically:** settlement charges what the calls actually
cost, times the margin, for every call recorded on the run's
`CostAccumulator`. A verify call recorded there is priced like any other, so
the margin holds by construction. The two ways it breaks, and what catches
each:

- **A call that is not recorded** — free model time. `billing-coverage.test.mjs`
  section 1 requires every Anthropic call site to be declared.
- **An estimate that does not include the verify pass** — the person is shown
  90 and charged 118. The website profile gains the verify call as an
  `auxiliaryCall`, and `cost-before.test.mjs` already requires the number
  shown before the button.

On Sonnet 5.5 ($2 / $10) the same loop costs about a third less than on
Sonnet 4.6 — the routing row in §1 matters here too.

## 6. Time per sub-version — my estimate, 2026-10-03

Estimates, not measurements, assuming one system per round to the standard in
§0. They will be wrong; each sub-version's closing check says by how much.

| | Contents | Estimate |
|---|---|---|
| **V6.1** | Security ✅ (2026-10-02) · Design part 1 ✅ (2026-10-02) · Design part 2 ✅ (2026-10-03) · Credits one size ✅ (2026-10-03) · the new design (replaces "Ionexa Home", with an app-wide 3D system; mockup 2026-10-03, waiting for the owner's OK) · cinematic sites (replace "3D sites" — analysis and three samples 2026-10-03, `docs/v6-cinematic-sites-2026-10-03.md`; Phase 1 needs `GEMINI_API_KEY`) · Video · Games (quiz from files) | **3–4 weeks** of rounds, estimated 2026-10-03: design 2 ≈ 3 d, credits ≈ 2 d, 3D ≈ 4 d, video ≈ 6–7 d, quiz ≈ 4 d. The new design was not in that estimate. Credits needed **no migration**, which this row said it would: the owner kept monthly balances until their next reset and honoured bought packs as they are, and both already work that way (`docs/v6-pricing-2026-10-02.md`, §3) |
| **V6.2** | Phases 1–2 of §4 | **6–8 weeks** |
| **V6.3** | Phases 3–5 | **3–4 months**; Browser and Computer Use alone are 3–4 weeks after Sandbox |
