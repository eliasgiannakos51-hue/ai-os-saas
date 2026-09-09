# The tool registry that does not exist yet

An inventory of everything this app can be asked to *do*, measured rather
than listed from memory, and an answer to the question that follows from
it: what a tool would have to declare about itself so that adding one is a
single edit instead of a dozen.

Nothing in this document is implemented. It is the analysis that has to
come first, because the shape of the registry is decided by what the
existing tools already disagree about.

Every number below was produced by parsing the TypeScript, not by grepping
for names, and every number that is soft says so.

---

## 1. How many tools are there?

The honest answer depends on what counts as a tool, and the codebase does
not say — there is no list. Four different namespaces name the same work,
none of them complete, and only one of them is a single file you could read
to find out what exists:

| namespace | what it is | where | size |
|---|---|---|---|
| estimation profile key | how much to hold, in tokens | `ACTION_PROFILES` in `src/lib/billing/estimate.ts` | 28 keys |
| reserve action string | what the hold is labelled | 3rd argument of `reserveCredits` in `src/lib/billing/reservations.ts` | 28 distinct |
| settlement feature string | what the charge is labelled, and what the margin knob is named after | `feature` of `settleReservation` | 49 distinct |
| route path | what the browser calls | `src/app/api/**/route.ts` | 134 routes |

Counted on 2026-09-08 (26 / 26 / 47 / 130) and moved by V5 #21, which added one
profile (`presentationGenerate`), one reserve string and one feature
(`presentation_generate`) and three routes (`api/presentations/generate`,
`api/presentations/[id]/pptx`, `api/presentations/[id]/pdf`), then again by
V5 #22 (`postsGenerate` / `posts_generate` / `api/posts/generate`). Nothing else
in this document was re-measured.

The four do not line up. `estimateForAction` is called at 37 sites — 34 of
them naming one of 22 profile keys literally, 3 computing one.
`settleReservation` is called at 36 sites — 29 naming one of 24 features
literally, 7 computing one.

**23 of the 49 settlement features exist only at runtime.** They are built
by string concatenation and are invisible to any static list — a grep for
`"create_stopped"` finds nothing, because the string is
`` `${kind}_stopped` `` in `src/lib/jobs/run-job.ts`. The seven computing
sites:

```
src/app/api/chat/route.ts        isFreeMessage ? "chat_free" : "chat_message"     (twice)
src/app/api/websites/generate/route.ts
                                 costs.callCount === 0 ? "clarification_free"
                                                       : "website_generate_precheck"
src/lib/agents/execute-agent.ts  cannotComplete ? "agent_run_cannot_complete" : "agent_run"
src/lib/jobs/run-job.ts          `${handled.feature ?? kind}_refunded`
src/lib/jobs/run-job.ts          handled.feature ?? kind
src/lib/jobs/run-job.ts          `${kind}_stopped`
```

Grouped by product — one tool being one thing a person starts and is
charged for — there are **24**: website generate, website edit, chat,
Create Anything, mission plan, mission review, transition detect, create
studio detect, automation run, agent build, agent template fill, agent run,
record ask, text action, document translate, weekly reflection, import map,
import paste, insight narrate, file ask, deep research, data analysis, code
assist, voice. A twenty-fifth, lead classification, is not started by the
account holder at all: it fires when a visitor submits a form on a
published site (`src/app/api/websites/[id]/submit-form/route.ts`), and it
is the only settling path in the app with no reservation before it.

### Two execution models

- **Synchronous.** The route obtains the user, checks the limits, sizes an
  estimate, reserves, does the work and settles, all inside one request.
  Nineteen of the twenty-four work this way.
- **Queued.** The route reserves and returns a job id; a worker does the
  work later. Five kinds, listed in `JOB_KINDS` in
  `src/lib/jobs/job-types.ts`: `agent_build`, `agent_run`, `mission_plan`,
  `create`, `file_ask`. Their handlers are registered in
  `src/lib/jobs/handlers/index.ts`, and `src/lib/jobs/run-job.ts` owns the
  hold, the settlement, the refund, the stop and the retry for all five.

The second model is already most of the answer to §6, and the codebase
says so itself, in `src/lib/jobs/handlers/index.ts`:

> A handler does the WORK and nothing else — it never touches the job row,
> never settles credits and never decides a retry. All of that is in
> lib/jobs/run-job.ts, once, so five features cannot end up with five
> different answers to "what happens to the hold when this throws".

---

## 2. What each one accepts, returns, and costs

### Accepts — undeclared

There is no schema library in this project: `zod` appears in zero files.
Sixty-four routes call `req.json()` and validate by hand, each in its own
way. Nothing anywhere states what a tool's input is.

### Returns — undeclared

**Zero of the 134 route files export a type or interface**, and there is no
shared `ApiResponse` or `ToolResult` type in `src/lib` or `src/types`. Each
route hand-builds a `NextResponse.json({...})` whose shape is known only to
the component that calls it.

This is the single fact that makes an orchestrator impossible today. A
planner that wanted to feed a website-generate result into a document
translate has nothing to read: not a type, not a runtime descriptor, not a
convention. Chaining exists only where somebody wrote the chain by hand.

### Costs — the one thing that IS declared

`ACTION_PROFILES` in `src/lib/billing/estimate.ts` is the closest thing in
the repo to a per-tool declaration, and it is a good one. Each entry
declares the tool's cost *shape* rather than a flat number:

```
systemPromptTokens        fixed overhead: system prompt, context, tool schemas
auxiliaryCalls[]          the extra AI calls the action always makes
baseOutputChars           what it writes for a trivial request
outputCharsPerInputChar   how output grows with input
expectedWebSearches       server-tool queries, priced per query
continuationRounds        extra rounds when one output ceiling is not enough
imageCount                vision blocks, at TOKENS_PER_REFERENCE_IMAGE each
```

Every estimate is built from token counts, so a bigger request
mechanically holds more. There is no per-feature flat number in that file.

Two tools have no profile at all: `voiceTranscribe` and `voiceSpeak` have
`ACTION_TO_FEATURE` entries but no `ACTION_PROFILES` entry, because voice
is priced per second of audio by its provider rather than per token — see
`src/lib/voice/voice-providers.ts`.

---

## 3. What can be combined

Almost nothing, and the reason is measurable.

Eighteen files build something that *looks* like a tool — an object with an
`input_schema` handed to the model. Fourteen of the names they define are
the app's own:

```
detect_intent          name_destination     configure_agent      fill_template
evaluate_request_clarity                    route_entry          map_spreadsheet
extract_entries        phrase_findings      classify_lead        create_plan
research_plan          classify_website_request                  review_content_safety
```

**None of them is a capability.** Every one is a forced output shape: the
call passes exactly one tool and pins it with
`tool_choice: { type: "tool", name: ... }`, at 16 sites, so the model has
to answer in JSON instead of prose. `tools: [PLAN_TOOL]`,
`tools: [DETECT_TOOL]`, `tools: [CLASSIFY_TOOL]` — a one-element array,
every time.

There is exactly one place in the app where the model is given a *choice*
of tools, `src/app/api/chat/route.ts`:

```ts
const effectiveTools: Anthropic.ToolUnion[] = isFreeMessage
  ? []
  : integrationSearchTool
    ? [WEB_SEARCH_TOOL, integrationSearchTool]
    : [WEB_SEARCH_TOOL];
```

A menu of at most two, and neither is one of the 24 tools: `web_search` is
Anthropic's server tool, and `search_my_data` reads the user's connected
integrations (`src/lib/integrations/chat-tool.ts`).

**The number of this app's own tools the model can call today is zero.**

What chaining exists is hand-written and one-directional: the mission
planner runs steps through `src/lib/mission-step-runner.ts`, deep research
plans then runs (`src/app/api/research/route.ts` →
`src/app/api/research/[id]/run/route.ts`), data analysis analyses then
answers follow-ups. Each of those is a bespoke call, not a composition.

---

## 4. What is irreversible

Nothing in the repository declares this. The only way to answer it is to
read the code, and the first two attempts to automate the reading were
wrong in instructive ways — recorded here because the same trap will catch
the registry's own checker.

**Attempt 1** walked the import graph from each of 31 entry points to a set
of effect modules. It reported EMAIL and CHANNEL on all 31. Both were
artefacts of edges every route has: `src/lib/log-error.ts` imports
`src/lib/email/error-alert.ts` (an alert to the owner when a route throws),
and `src/lib/billing/credits.ts` reaches `src/lib/notify/dispatch.ts` (the
overage notice). Neither is the tool's effect. It also *missed* Anthropic
on ten routes. `src/lib/ai/providers/registry.ts` is imported by two files
in the whole app, while **33 files import `@anthropic-ai/sdk` directly** —
one of those 33 being the adapter the registry wraps. There is no
chokepoint for "spend money at the model provider".

**Attempt 2** cut those edges and detected the package import. Still wrong
in three places, all of them file-granularity errors:

- `src/lib/jobs/handlers/agent-build.ts` was reported as delivering results
  and sending email. It imports one function from
  `src/lib/agents/execute-agent.ts` — `estimateAgentRun`, a pure
  estimator. Delivery lives in that same file, but not in the function
  the handler took, and file granularity cannot see the difference.
- Chat and template-adopt were reported as posting to Slack because they
  reach `src/lib/integrations/read.ts`, which holds six exported functions
  of which one writes. `postToSlack` has exactly one caller in the whole
  app: `src/lib/agents/deliver.ts`.
- Every job handler reached every other handler's effects, because
  `src/lib/jobs/run-job.ts` imports `src/lib/jobs/handlers/index.ts`, which
  imports all five handlers. The very pattern that makes "declare once"
  work is what makes import-reachability useless for this question.

The hand-verified result, in three grades:

### Grade A — irreversible outside the system

| effect | where it actually happens | which tools |
|---|---|---|
| money spent at Anthropic | 33 files calling `@anthropic-ai/sdk` | every tool except voice — 23 of the 24, plus lead classification |
| money spent at a voice provider | `src/lib/voice/voice-providers.ts` | voice transcribe, voice speak |
| a result delivered to email / Slack / Telegram / Discord | `src/lib/agents/deliver.ts` | agent run, scheduled agent run, automation run, agent batch |
| an email to a person | `src/lib/email/send-website-form-submission-email.ts`, `src/lib/email/send-scheduled-run-complete-email.ts`, `src/lib/email/send-agent-emails.ts` | lead classification, scheduled runs, agent run |

`deliverAgentResult` in `src/lib/agents/deliver.ts` has two callers:
`src/lib/agents/execute-agent.ts` and `src/lib/ai/batch/agent-batch.ts`.
The five destinations it can reach are declared in
`src/lib/agents/delivery-channels.ts` as
`"email" | "slack" | "telegram" | "discord" | "in_app"` — four of which
leave the system for good.

### Grade B — irreversible inside the system

Storage writes: `src/lib/files/ingest.ts` and
`src/lib/attachment-image-server.ts`. The Create Anything worker
(`src/lib/jobs/handlers/create.ts`) downloads attachment images into
storage before it runs.

### Grade C — reversible

Everything that only writes a row. Website generation is in this grade:
it does **not** publish. Publishing is a separate action, and a published
site can be rolled back — `src/app/api/published/[id]/rollback/route.ts`.

The distinction that matters for an orchestrator: a plan may re-run a
Grade C step freely, must not re-run a Grade A step without asking, and
must never re-run a delivery.

---

## 5. `agent-capability.ts` is the inverse, and that is the point

`src/lib/agents/agent-capability.ts` answers "can an agent do this?" by
matching the user's prose against six blocked categories —
`AGENT_BLOCKED_CATEGORIES` is `["code", "system_access", "other_platforms",
"physical", "financial", "phone"]` — and five things it is willing to claim
it can do, `AGENT_CAN_IDS`: `["search", "analyse", "summarise", "monitor",
"schedule"]`.

It is a blocklist over free text. It has to be, because there is no list of
what the agent *can* call: the only way to say no is to recognise the
shapes of no. Which means:

- a capability that is not blocked is silently allowed;
- a new tool changes nothing about what an agent may do, because agents
  cannot call tools at all (§3);
- the five ids are for display — they are what the UI says an agent does,
  not what it dispatches to.

A registry inverts this. The question stops being "does this prose look
like something we refuse" and becomes "is this tool id in the set this
agent is allowed to call", which is a set membership test, not a matcher
over user-supplied text — and this repository has a standing rule about
matchers over user-supplied text.

---

## 6. How a new tool should be declared

### What it costs today

Adding a billable tool means touching, at minimum:

1. `ACTION_PROFILES` in `src/lib/billing/estimate.ts` — or the hold is unsized.
2. `ACTION_TO_FEATURE` in `src/lib/billing/margin-policy.ts` — or the estimate resolves a margin the settlement will not.
3. The route: obtain the user, rate limit, circuit breaker, bypass ceiling, resolve the plan, estimate, reserve, work, settle, release.
4. If it queues: `JOB_KINDS` in `src/lib/jobs/job-types.ts`, a handler file, and `src/lib/jobs/handlers/index.ts`.
5. If it has a page: `src/lib/sidebar-nav.ts`, `src/lib/sidebar-label-keys.ts`, `src/lib/module-icons.ts`, and ten files under `messages/`.
6. If it stores user data: a migration, its RLS policies, and `src/lib/gdpr/user-data-registry.ts`.
7. If the classifier should route to it: `src/lib/ai/routing/classify.ts`.
8. If a transition should suggest it: `src/lib/transitions/destinations.ts`.
9. Fifteen files under `scripts/tests/` name the website-generate identifiers alone; most carry a per-tool list that a new tool has to join.

Counting source files that name a tool's identifiers, over 24 identifier
families (mission plan and mission review counted together, lead
classification included): the smallest tool
(lead classification) touches 1, the median is 7, and agent run touches 35.
That count is a name census, not a must-change census — a file that only
reads an identifier is counted too — so treat it as an upper bound on
coupling and a lower bound on the reading a newcomer must do.

### And the checklist is not being followed

Over the 25 route files that are a tool's entry point, the three guards
that precede every AI call are present at different rates: the bypass
ceiling in 25 of 25, the circuit breaker in 23, and the rate limit in 11.
That is not evidence of eleven bugs — a rate limit is a judgement call per
route — but it is what a hand-repeated checklist looks like after two
dozen applications, and it is why the two the registry would make
unskippable are the two that are money: the reserve and the settle.

### What a declaration would have to carry

One id, used as the estimation profile key, the reserve action and the
settlement feature — because those are three names for one thing today, and
every place they differ is a place they can drift (§7).

```
id                  one string, the only name
title               an i18n key, not a string
input               a schema — the thing that does not exist yet
output              a schema — the thing that makes chaining possible
cost                the existing ACTION_PROFILES entry, moved here
execution           "sync" | "job"          (JOB_KINDS becomes derived)
effects             "none" | "storage" | "spend" | "delivers"   (§4, declared)
agentCallable       boolean                 (AGENT_CAN_IDS becomes derived)
plans               which plans may call it
```

### The mechanism already exists

Do not invent one. `src/lib/jobs/handlers/index.ts` plus
`src/lib/jobs/run-job.ts` is exactly this pattern working for five tools:
a registry object keyed by id, handlers that do only the work, and one
place that owns the hold, the settlement, the refund, the stop and the
retry. Generalising it means moving the nineteen synchronous tools onto
the same shape, so that the route becomes what the handler already is —
work and nothing else — and the ten steps every settling route currently
repeats are written once.

What makes that generalisation safe rather than a rewrite is that the
gates already exist: `scripts/tests/billing-coverage.test.mjs` and
`scripts/tests/route-refusals.test.mjs` check the shape of every settling
route today, and would check the registry's entries instead.

---

## 7. What the measurement found

### The estimate and the settlement read different margin knobs, 14 times

`ACTION_TO_FEATURE` in `src/lib/billing/margin-policy.ts` carries its own
statement of purpose:

> Maps ACTION_PROFILES keys (what estimation sites know) onto settlement
> feature strings (what the margin env vars are named after), so an
> estimate resolves the same multiplier its settlement will.

Measured across every path that both estimates and settles: **25
settlement features share a margin env key with their own estimate, and 14
do not.** The clearest case is Create Anything, whose three names for one
tool are `createAnything` (profile), `create` (reserve action and job kind)
and `create_anything` (what `ACTION_TO_FEATURE` maps it to). Nothing
settles `create_anything`. With `CREDIT_MARGIN_CREATE=9` set on a free
account, the hold is sized at 6× and the charge lands at 9×; with
`CREDIT_MARGIN_CREATE_ANYTHING=9`, the hold moves to 9× and the charge
stays at 6× — a knob that moves the 402 threshold and never changes
revenue.

Create Anything accounts for three of the fourteen — `create`,
`create_precheck` and `create_stopped`. The other eleven are the same
shape: `mission_review` against `mission_plan`, `clarification_check`
against `automation_run`, `chat_clarify` against `chat`,
`clarification_free` against `website_generate`, `scheduled_agent_run` and
`automation_run` against `create_anything` (the cron route sizes both with
the Create Anything profile), `agent_run_cannot_complete`, and the four
remaining `_stopped` features — `agent_build_stopped`, `agent_run_stopped`,
`mission_plan_stopped`, `file_ask_stopped` — which no family knob reaches.

Of the five job kinds, four have an `ACTION_TO_FEATURE` value equal to the
kind — `agent_build`, `agent_run`, `mission_plan`, `file_ask` — and only
`create` does not.

This is **latent, not live**: it costs nothing while no `CREDIT_MARGIN_*`
variable is set, because every path then falls back to the same general or
plan margin. It becomes real the first time the owner tunes one.

`scripts/tests/pricing-margin-bug.test.mjs` brute-forces every feature ×
plan × model × size against the 4× floor over a list of 24 feature strings.
That list contains `create_anything`, which nothing settles, and omits
`create`, which everything on that path settles.

`CREDITS.md` already gives the rule these fourteen break, as step 3 of what
adding a settling feature requires:

> Register the new name in `FEATURE_MARGIN_GROUPS` so it shares its
> parent's `CREDIT_MARGIN_*` variable.

That is a manual step in a nine-place checklist, which is the argument for
§6 in one line. `CREDITS.md` also lists four grouped aliases —
`CREDIT_MARGIN_CHAT`, `CREDIT_MARGIN_WEBSITE_GENERATE`,
`CREDIT_MARGIN_DEEP_RESEARCH`, `CREDIT_MARGIN_AGENT_RUN` — where
`FEATURE_MARGIN_GROUPS` in `src/lib/billing/margin-policy.ts` carries six
distinct variables: those four plus `CREDIT_MARGIN_AGENT_BUILD` and
`CREDIT_MARGIN_CREATE`.

### Voice is outside the circuit breaker

`checkAiCallAllowed` in `src/lib/ai-circuit-breaker.ts` enforces three
things: a platform-wide daily cap, a per-user hourly cap, and an
identical-request breaker. Twenty-six route files call it.
`src/app/api/voice/transcribe/route.ts` and
`src/app/api/voice/speak/route.ts` do not, and neither records its spend
with `recordAiCallForDailySpend` — so voice is invisible to the platform
daily cap in both directions. Both routes do check the rate limit, the
bypass ceiling and the balance, so this is a gap in the platform-wide
brake, not in per-user billing. Both are gated behind `OPENAI_API_KEY` and
`ELEVENLABS_API_KEY`.

---

**ΝΕΑ MIGRATIONS ΝΑ ΤΡΕΞΕΙΣ: καμία**
