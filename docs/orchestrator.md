# The orchestrator, three times, unequally

`docs/tool-registry.md` ended on the thing that makes an orchestrator
impossible: no tool declares what it returns, so nothing can be handed
from one to the next except a sentence. This document is the other half —
what an orchestrator would have to do, measured against the ones this
repository has already built.

Because it has built three, and they do not agree. Deep Research is a real
orchestrator with a budget, a hand-off, a ceiling and a verification step.
The mission planner is the naive version. The chat tool loop is two rounds
and a hard stop. None of them shares a line of code with the others.

Nothing here is implemented. As in the previous round, every number was
measured, and every number that is soft says so.

---

## 0. What already exists

| pipeline | plans? | runs steps? | passes results forward? | stops on failure? | charges per step? |
|---|---|---|---|---|---|
| **Deep Research** — `src/lib/research/run-research.ts` | yes, 3–6 questions | yes, in order, across invocations | yes, into the synthesis | **degrades** — synthesises what it has | no: one hold for the whole report |
| **Mission** — `src/lib/mission-agents.ts` + `src/lib/mission-step-runner.ts` | yes, 4–8 steps | one at a time, human-triggered | yes, as prose | no — there is no run to stop | yes, per step |
| **Chat tool loop** — `src/app/api/chat/route.ts` | no | up to 2 rounds, model-chosen | yes, as tool results | ends the loop | no: one settlement per message |
| **Website Builder** — `src/lib/website-builder.ts` | no, fixed pipeline | up to 4 continuations | yes, the text so far | throws | no: one settlement per generation |
| **Agent batch** — `src/lib/ai/batch/agent-batch.ts` | no | one submission, one delivery | n/a | pauses the agent | no hold at all — see below |

Five pipelines, five answers, no shared abstraction.

---

## 1. How does it decide the order?

Four different disciplines, none of them declared anywhere a reader could
find:

**Mission — array position, and then whatever the human does.** The
Planner's tool schema (`create_plan` in `src/lib/mission-agents.ts`) gives
each step a `text`, an `outcome`, an `estimatedMinutes`, an `effort` and up
to four `substeps`. **There is no dependency field.** A plan is a list, not
a graph, and nothing in `src/types/mission.ts`'s `MissionStep` says step 4
needs step 2. Execution order is then whichever step the person clicks
(`buildStep(index)` in `src/components/mission/mission-detail.tsx`) or
schedules (`src/app/api/mission/schedule-step/route.ts` writes one
`scheduled_agent_runs` row per step, each with its own `scheduled_for`).
The cron in `src/app/api/cron/scheduled-runs/route.ts` processes those rows
as an independent queue.

**Deep Research — fan out, then join.** The plan produces
`RESEARCH_MIN_QUESTIONS`–`RESEARCH_MAX_QUESTIONS` (3–6) questions. Their
order does not matter because they are independent; the only real ordering
constraint is that synthesis comes last, and that is expressed as a status
machine: `planning → researching → synthesising → ready`, declared as
`ResearchStatus` in `src/lib/research/research-limits.ts` and checked
against the database's own CHECK constraint by
`scripts/tests/enum-schema-drift.test.mjs`.

**Website Builder — hard-coded, and split across two routes.**
`src/app/api/websites/generate/route.ts` classifies and holds; then
`src/app/api/websites/generate/process/route.ts` generates
(`generateWebsiteHtml`), reviews (`reviewWebsiteContentSafety`) and saves.
The order is the order of the statements.

**Chat — the model decides**, within two rounds.

A registry-driven orchestrator needs a fifth thing none of these has: a
step that declares what it *needs* and what it *produces*, so the order
falls out of the data instead of being chosen by a human, a status column
or a line number.

---

## 2. What if a step needs an input that does not exist?

Three answers exist. Two of them are silence.

**At plan time, the mission planner can refuse.** `create_plan` carries
`clarificationNeeded` / `clarificationQuestion`, and the comment in
`src/lib/mission-agents.ts` explains why they had to be added: a forced
tool call with a required `steps` array "used to leave the Planner no way
to react to a goal like «θέλω να πετύχω» except inventing 4-8 generic,
made-up steps — the tool schema gave it no other option."

**At step time, nothing asks.** The mission UI passes
`skipClarification: true` on every step (`src/components/mission/mission-detail.tsx`),
deliberately and with a stated reason — the card has no inline UI for
answering a question, so a `needsClarification` result would be read as a
failure and burn one of the step's three attempts. The consequence is that
a step whose input is missing cannot ask for it; it can only fail.

**And a missing prerequisite is invisible.** This is the sharp one.
`buildPriorStepsContext` in `src/lib/mission-context.ts` is:

```ts
return steps
  .slice(0, index)
  .filter((s) => s.status === "completed" && s.output)
  .map((s) => `- ${s.text} → ${s.output}`)
  .join("\n");
```

A step that FAILED and a step that has NOT RUN YET produce exactly the same
thing: nothing. Step 4 is not told that step 2 failed — it is handed a
shorter context and runs anyway, and it has no way to distinguish "the
number I need was never produced" from "there was no number to produce".
The only signal that a prerequisite is missing is that the model writes a
worse entry, which nothing measures.

The one place the missing input IS named is inside a step, not between
steps: `runMissionStepForUser` checks the chosen module's required fields
and returns `matched: false` with a message naming the field it could not
extract. That is a good message. It ends the step; it does not reach the
plan.

---

## 3. How does it verify each step?

There are three real verification primitives in the repository, and they
cover three different things. Between them they do not cover the one thing
an orchestrator needs.

**The plan is verified, structurally.** `parsePlanMissionToolInput` in
`src/lib/mission-agents.ts` is an "AI Output Protection Layer": it drops
steps under 8 characters, drops exact case-insensitive duplicates, drops
`estimatedMinutes` outside 1..480 rather than clamping them ("a bogus
estimate is worse than none, because the user cannot tell it is bogus"),
discards a single sub-step as "the step restated", and ignores an `effort`
outside the enum. Fewer than two surviving steps is treated as an unusable
plan. That is deterministic, cheap and right — and it checks the SHAPE of
the plan, never whether the plan is any good.

**Truncation is detected, in four files out of twenty-two.**
`src/lib/verification/truncation.ts` exists because, in its own words,
"THIRTY-FOUR call sites pass a max_tokens, and ONE of them ever looked at
the answer". Today 22 files call `anthropic.messages.create`, there are 34
`max_tokens:` sites, and **4 files take the text through `modelText` /
`modelTextFrom`**: `src/app/api/documents/[id]/pdf/route.ts`,
`src/lib/agents/agent-runner.ts`, `src/lib/jobs/handlers/file-ask.ts`,
`src/lib/research/research.ts`. Two more import `truncationNotice` for the
user-facing message: `src/lib/agents/execute-agent.ts` and
`src/lib/research/run-research.ts`.

That is not eighteen unguarded sites, and saying so would be the mistake
the previous round's import-graph scan made. Most of the remaining files
force a tool call, so their output is a `tool_use` block rather than text,
and a truncated tool call surfaces as a missing block — which
`src/lib/mission-agents.ts` and `src/lib/mission-step-runner.ts` both
handle, reporting "the model did not return a classification". The cause
they report is wrong, but the failure is caught.

**Content is verified deterministically in two places, and they check
different things.** `scanWebsiteHtmlForSecurityIssues` in
`src/lib/website-html-security-scan.ts` scans generated HTML against a list
of dangerous constructs — output against a danger list. `checkCitations` in
`src/lib/verification/citations.ts` asks whether the report cites sources
it actually has — output against the INPUTS the step was given, which is
the only instance of that shape in the app.

Note what `checkCitations` does when it fails, at
`src/lib/research/run-research.ts`: the run does not stop. It logs, and
passes the report through `annotateDanglingCitations` so the reader sees
which citations are unsupported. Degrade, do not discard.

**And the acceptance criterion nobody reads.** The Planner is asked, per
step, for an `outcome` — "What you will have once this step is done", and
`src/types/mission.ts` says why: "«Analyse the market» and «Analyse the
market → you will have 5 competitors with their prices logged» are the
difference between a step you can act on and one you skip." The step then
produces an `output` summary via `buildOutputSummary`.

`outcome` is read in exactly two places, and both of them are rendering:
`src/components/mission/mission-detail.tsx` shows it under the step, and
`src/app/api/mission/[id]/pdf/route.ts` prints it in the PDF. **Nothing
ever compares `output` against `outcome`.** The per-step acceptance
criterion is already written down, already stored, and has never been
checked.

That is the cheapest verification an orchestrator could add, because the
data is already there.

---

## 4. What does the orchestration itself cost?

Priced with the app's own estimator (`estimateForAction`), Sonnet 4.6, at
the default credit rate, for a mission of N steps. A step's text is taken
at 120 characters — the length the Planner is instructed to write — and a
completed step's `output` summary at 180.

| mission | the plan | the steps, bare | carrying results forward | total | orchestration share |
|---|---|---|---|---|---|
| 4 steps | $0.0350 (39.2%) | $0.0460 (51.5%) | $0.0083 (9.3%) | $0.0892 | **48.5%** |
| 6 steps | $0.0350 (28.1%) | $0.0689 (55.4%) | $0.0206 (16.6%) | $0.1245 | **44.7%** |
| 8 steps | $0.0350 (21.1%) | $0.0919 (55.6%) | $0.0385 (23.3%) | $0.1654 | **44.4%** |

Two things that table says.

**Roughly 45% of a mission's spend is the orchestration, not the work** —
one planning call (which itself makes two auxiliary calls: a clarification
pre-check and a research pass) plus the cost of re-sending earlier results
into later steps. And in this pipeline the "work" is itself a
classification: what the user gets for the other 55% is a row in one of the
13 tables in `src/lib/classifier-modules.ts`.

**Carrying results forward is quadratic.** Step k re-sends the outputs of
steps 1..k-1, so a mission of N steps re-sends O(N²) characters:

```
 4 steps ->   1,830 chars ≈    458 tokens re-sent in total
 6 steps ->   4,575 chars ≈  1,144 tokens
 8 steps ->   8,540 chars ≈  2,135 tokens
12 steps ->  20,130 chars ≈  5,033 tokens
20 steps -> 57,950 chars ≈ 14,488 tokens
```

Twelve and twenty are not reachable today — `MAX_STEPS` is 8 — but they are
the shape an orchestrator that plans longer runs would inherit, and the
growth is the argument for passing a typed reference instead of a prose
summary.

**Three caveats, stated rather than buried.** First, `estimateActionCost`
prices `systemPromptTokens` at full input rate and models no cache, while
these calls go through `buildCachedSystem` (`src/lib/ai/cached-system.ts`)
and the classifier's static prefix is measured in
`src/lib/mission-step-runner.ts` at 7,147 characters — so the real spend is
lower than the table and the table is the number that sizes the HOLD, not
the charge. Second, settlement always uses measured usage, so none of these
figures is what anyone was billed. Third, the hold barely notices the
growth: an 8-step mission holds 4 credits for its first step and 5 for its
last, because credits are integers and 23% of a fraction of a cent rounds
away.

---

## 5. And the money across a multi-step run

Three pipelines, three different answers to "how do you hold credits across
work that spans minutes or hours", each defensible on its own:

- **Per step.** Mission reserves and settles once per step
  (`src/app/api/cron/scheduled-runs/route.ts` for a scheduled one, the
  `create` job for a clicked one). A failed step releases its own hold and
  costs nothing.
- **Once for the whole run.** Deep Research keeps `reservation_id` on the
  report row and settles at the end. `RESERVATION_TTL_MINUTES` is 60
  (`src/lib/billing/reservations.ts`), `MAX_RESEARCH_CHUNKS` is 12, and
  `RESEARCH_DEADLINE_MS` is 640 seconds per chunk — so a worst-case
  chunked report outlives its own hold. That is not a bug: the hold is
  swept to `expired` by `release_expired_reservations`, and
  `settle_reservation` charges anyway, with the balance floored at zero.
  The baseline migration says so in place, at the subtraction:
  *"negative, even if a reservation expired mid-action and was swept"*.
  The cost of that design is that a run which outlives its hold can be
  charged against a balance that is no longer there, and the floor means
  the difference is absorbed rather than owed.
- **No hold at all.** `src/lib/ai/batch/batch-policy.ts` states it
  outright: a batch may take 24 hours, a hold lives 60 minutes, so
  affordability is checked at submit and the charge taken at settle — "the
  gap is real and is stated rather than papered over".

An orchestrator has to pick one, and the third is the honest model for
anything long: per-step holds for what runs now, an affordability check for
what runs later.

---

## 6. The ceilings, and why there are nine of them

Every one of these bounds a loop that spends money. Every one lives alone:

| ceiling | value | file |
|---|---|---|
| `MAX_TOOL_ROUNDS` | 2 | `src/lib/integrations/chat-tool.ts` |
| `MAX_JOB_ATTEMPTS` | 2 | `src/lib/jobs/job-types.ts` |
| `MAX_STEP_ATTEMPTS` | 3 | `src/lib/mission-context.ts` |
| `AGENT_MAX_ATTEMPTS` | 3 | `src/lib/agents/agent-failure-limits.ts` |
| `MAX_CONTINUATION_ROUNDS` | 4 | `src/lib/website-builder.ts` |
| `MAX_STEPS` | 8 | `src/lib/mission-agents.ts` |
| `MAX_RESEARCH_CHUNKS` | 12 | `src/lib/research/research-limits.ts` |
| `FALLBACK_ATTEMPTS_ALLOWED` | 1 | `src/lib/ai/batch/batch-policy.ts` |
| `MAX_GENERATION_ATTEMPTS` | 3 | `src/lib/website-generation-limits.ts` |

The two best-reasoned of them say the same thing in different words.
`MAX_TOOL_ROUNDS`: *"a hard stop rather than a convention: an unbounded
loop is an unbounded bill."* `MAX_RESEARCH_CHUNKS`: *"a chunk that hands
off to a chunk that hands off is a loop, and a loop that spends money on
every pass needs a ceiling that does not depend on every hand-off being
correct."*

An orchestrator adds a tenth loop unless it inherits one of these.

---

## 7. What the design would have to add

Deep Research already contains most of an orchestrator, and it is the
thing to generalise — the same argument as the previous round's, where the
answer was to generalise `src/lib/jobs/handlers/index.ts` rather than
invent a mechanism.

What it has that the others do not:

1. **A budget check before starting a step.** `RESEARCH_QUESTION_BUDGET_MS`
   is 45 seconds and is deliberately larger than the timeout, for a reason
   worth quoting: *"Starting a question that does not finish loses BOTH the
   tokens and the record of them, because a platform kill takes the write
   with it. Refusing to start one that would have fitted costs one extra
   handoff — about a second. The asymmetry is the whole reason this is a
   separate, larger number."*
2. **A hand-off instead of a deadline.** When the budget runs out the run
   continues in a new invocation, with an atomic claim (`claimChunk`) so
   two workers cannot take the same report.
3. **A ceiling with a degradation path.** At `MAX_RESEARCH_CHUNKS` the
   worker stops researching and synthesises what it has, marking the rest
   unanswered — *"a partial report the user can read beats a perfect one
   they never receive."*
4. **A reaper.** `isResearchJobStale` lets the polling endpoint fail a job
   whose worker died without writing anything, because a platform kill runs
   no catch block.

What even it does not have, and an orchestrator needs:

- **Declared inputs and outputs per step**, so the order is derived rather
  than chosen, and so a step can be told *why* its input is missing instead
  of receiving a shorter prompt.
- **An acceptance check per step.** The mission plan already stores one,
  per step, and never reads it (§3).
- **A distinction between "not yet" and "failed".** `buildPriorStepsContext`
  currently collapses them.
- **One place that owns the loop**, the way `src/lib/jobs/run-job.ts`
  already owns the hold, the settlement, the refund, the stop and the
  retry for the five job kinds — so a sixth pipeline does not arrive with
  a ninth ceiling and a fourth answer about money.

---

## 8. What the measurement found

### The plan declares an acceptance criterion that nothing checks

`outcome` is produced by the Planner, validated by
`parsePlanMissionToolInput`, stored on `MissionStep`, and read in two
places, both of which draw it on a screen or a page. No code compares it
with the step's `output`. This is not a defect — nothing claims otherwise —
but it is the cheapest verification available, already paid for, and
currently unused.

### A failed prerequisite and an unrun one are the same value

`buildPriorStepsContext` filters on `status === "completed" && s.output`.
Both a failed step and a future step contribute nothing, so a later step
cannot tell that something it depends on will never arrive. In the cron
driver the two cases are also treated identically: `continue` to the next
scheduled run.

### The two mission drivers do not enforce the same retry cap

`MAX_STEP_ATTEMPTS` is 3, and `stepAttemptsExhausted` is called in exactly
one file, `src/components/mission/mission-detail.tsx` — the UI. The cron
driver in `src/app/api/cron/scheduled-runs/route.ts` neither reads
`attempts` nor writes it: a step that failed three times in the UI can
still be scheduled and run by cron, and a cron failure does not count
against the UI's three. Each scheduled run is one row and runs once, so
this is not an unbounded loop; it is two drivers with different rules over
one piece of state.

---

**ΝΕΑ MIGRATIONS ΝΑ ΤΡΕΞΕΙΣ: καμία**
