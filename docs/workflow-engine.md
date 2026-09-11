# "When X, do Y, then Z" — what the product already promises

The workflow the user is asked to imagine is already in this product's
data model. `automations.suggested_workflow` is a column, on a table with
`task_name`, `idea`, `tools_needed` and `time_saved` beside it, and the
whole module exists so a person can write down the sequence they wish ran
by itself.

Then there is a button labelled "Make this real", and what it produces is
one sentence on a timer.

This document measures the distance between those two, against the four
things a workflow engine has to do and the four questions that decide
whether one is usable.

Nothing here is implemented.

**A note on method.** Every measurement below was taken from `HEAD` with
`git grep`/`git show`, not from the working tree, because a mutation sweep
was rewriting source files while this was written. Reading a file at the
moment a mutant sits in it is exactly the class of false finding this
repository keeps catching, and it would have been undetectable afterwards.

---

## 0. The two tables, and the line between them

| | `automations` | `user_automations` |
|---|---|---|
| what it is | the note | the running thing |
| columns | `task_name`, `idea`, `tools_needed`, `suggested_workflow`, `time_saved` | `description`, `frequency`, `day_of_week`, `day_of_month`, `is_active`, `last_run_at`, `next_run_at` |
| executes? | no — `src/lib/modules.ts` says so: *"a note the user types. Nothing here calls a model."* | yes, from `src/app/api/cron/scheduled-runs/route.ts` |
| structure | five fields, one of them a workflow | one string, one frequency |

The conversion is one line, in
`src/components/automation/automation-realize-list.tsx`:

```ts
const prefill = [taskName, idea, suggestedWorkflow].filter(Boolean).join(" — ");
```

Three fields — including the one that holds the sequence — are joined with
an em dash into a single `description`. `src/app/api/automations/create/route.ts`
takes that string and a frequency, and writes one `user_automations` row.
The cron then runs the whole thing through the same one-shot classifier
every other step uses (`runMissionStepForUser` in
`src/lib/mission-step-runner.ts`), which picks one of 13 modules and
inserts one row.

**The multi-step intent is captured, stored, and then flattened at exactly
one place.** Everything else in this document follows from that line.

---

## 1. Trigger

### Time — implemented twice, incompatibly

| | agents (`user_agents`) | automations (`user_automations`) |
|---|---|---|
| schedule | 5-field cron, `schedule_cron` | one of `daily` / `weekly` / `monthly` |
| timezone | real IANA zone, `timezone` column | **UTC only** |
| dispatcher | `/api/cron/agent-runs`, every 15 minutes | `/api/cron/scheduled-runs`, once a day at 09:00 UTC |
| rate ceiling | at most one run per hour, enforced on the expression | whatever the frequency says |
| status | `active` / `paused` / `disabled` | `is_active` boolean |
| failure handling | `consecutive_failures`, auto-disable at 5 | none |

The agents table names the divergence in its own comment: *"The existing
cron (api/cron/scheduled-runs) has a documented UTC-only limitation; this
feature does not inherit it, because «every morning» has to mean the
user's morning or the agent is useless to them."*

`computeNextRunAt` in `src/lib/automation-schedule.ts` computes in UTC
throughout — `getUTCDate`, `setUTCMonth`, `getUTCDay` — and says why: the
cron itself runs at a fixed UTC hour, so a per-user time would be a
promise the dispatcher cannot keep.

A workflow engine cannot ship both. Whichever it picks, one of these two
existing features is then wrong about when it runs.

### Manual — one good implementation, not generalised

`src/app/api/agents/[id]/run/route.ts`. See §6.

### Event — none, for the user

Two things in the app run without a cron and without a click, and neither
is user-configurable:

- `src/app/api/webhooks/stripe/route.ts` — billing, internal.
- `src/app/api/websites/[id]/submit-form/route.ts` — a visitor submits a
  form on a published site and `lead_classification` runs. Fixed
  behaviour; the user chooses nothing.

So "when X" has, today, exactly one meaning: **when the clock says so.**
The event half of the sentence does not exist, and adding it is the part
of this feature with no precedent in the repository to copy.

---

## 2. Steps in order

One. `user_automations.description` is a single text column;
`user_agents.prompt` is a single text column. Neither table has a steps
array, a step index, or a foreign key to a steps table.

The only ordered list of steps in the product is a mission's `plan_steps`,
and `docs/orchestrator.md` measures what that is and is not: a list with no
dependency field, executed one step per human click or one row per
separately scheduled run.

So of the four requirements, the second is met only by a feature that is
not a workflow, and the first is met by two features that are not
multi-step.

---

## 3. Conditions

The first pass of this section said there were none. That was wrong, and
the way it was wrong is worth keeping: the search looked in the automation
and agent tables, where the workflow feature lives, and a condition engine
had already shipped somewhere else entirely.

**`trading_rules` is a complete, user-authored, deterministically-evaluated
condition system**, in `supabase/migrations/20260830000000_trading_journal.sql`
and `src/lib/trading/rules.ts`. Nothing in the automation or agent tables
has anything like it, and it is the best answer to this question already in
the repository.

Its shape:

| piece | what it is |
|---|---|
| `kind` | a CHECK-constrained enum of eight condition types — `max_risk_percent`, `max_trades_per_day`, `min_risk_reward`, `allowed_sessions`, `allowed_instruments`, `max_daily_loss`, `no_trade_after_loss`, `max_position_size` |
| `params jsonb` | the kind's own parameters, validated in TypeScript by `parseRuleParams` rather than by a SQL CHECK, because "a jsonb CHECK expressive enough for eight different shapes would be unreadable" |
| `original_text` | the user's own sentence — "Verbatim. Never rewritten, never normalised." |
| `source` | `'ai'` or `'manual'`, recorded because "a rule the user checked and a rule a model guessed deserve different confidence" |
| `account_id` | nullable: null means every account. Scope, as data. |
| `is_active` | on or off, per rule |

And four decisions in `src/lib/trading/rules.ts` a workflow engine should
copy rather than rediscover:

1. **The model parses once; it never evaluates.** *"Read literally that
   means handing 200 trades and a sentence to a model and asking how many
   broke it. The number that comes back would look exactly like a count,
   would be different tomorrow, and nothing in the product could tell — and
   the whole value of «you broke your 2% rule eight times in March» is that
   the eight is TRUE."* After the parse, evaluation is arithmetic, in
   `src/lib/trading/guardian.ts`.
2. **The user confirms the parse, with their own sentence beside it**, so a
   mis-parse is visible before it is acted on. That is also this feature's
   answer to §6 for conditions: you do not test a condition by running it,
   you test it by reading what it became.
3. **A deterministic parser first, the model second** — so it works on a
   deployment with no `ANTHROPIC_API_KEY`, which is also the only reason it
   is exercisable by this repo's own gates.
4. **Reject rather than repair, and bound the parameters.** `RULE_BOUNDS`
   exists because *"a «max 0% risk» rule marks every trade a violation; a
   «max 10,000%» rule marks none. Both are useless, and both are what a
   mis-parse of a stray number looks like."* And `parseRuleParams` refuses
   to save what it cannot understand, because *"a rule that is on, is
   wrong, and never fires is worse than no rule, because the user believes
   they are being watched."*

Evaluation is idempotent by construction: `rule_violations` is unique on
`(trade_id, rule_id)` and written by upsert — *"Without this, re-running
the guardian after the user edits one rule would double every violation
already recorded, and «8 times in March» would become 16."* The violation
row denormalises `rule_kind` and `rule_text` so the history survives the
rule being edited or deleted.

**What it does not give the workflow engine.** These are conditions over
one domain's data, evaluated in a batch after the fact — not branches in a
running flow, and the eight kinds are trading kinds. What transfers is the
architecture: an enum of kinds, typed params, the verbatim sentence, a
confirm step, deterministic evaluation, bounds, and refusal over repair.
What does not transfer is the vocabulary, and §4 is why that is the hard
part.

---

## 4. Passing data between steps

The one mechanism is `buildPriorStepsContext` in
`src/lib/mission-context.ts`, measured in `docs/orchestrator.md`: earlier
completed steps' outputs, rendered as prose lines, appended to the next
step's system prompt. Automations and agents have no equivalent, because
they have no next step.

The blocking fact is the one `docs/tool-registry.md` ends on: **zero of the
130 route files export a response type**, and there is no shared result
shape anywhere in `src/lib` or `src/types`. A workflow engine's data
passing is a typed value moving between declared outputs and declared
inputs. Neither end exists yet.

This is also what stops §3's engine from being lifted straight across.
`trading_rules` can have eight typed kinds because a trade has typed
fields — a risk percent, a session, an instrument — declared in one place.
A condition on a workflow step needs the step's output to have declared
fields in the same way, and no tool has any. So the order is forced: the
tool registry's `output` schema first, then conditions, then branches.
The other way round produces conditions over prose, which is the one thing
`src/lib/trading/rules.ts` was written to avoid.

---

## 5. UI: drag-and-drop or a list?

Measured rather than argued: **there is no drag-and-drop anywhere in this
application.** No `onDragStart`, no `draggable=` attribute in any file
under `src/`, and no drag library in `package.json` — not `dnd-kit`, not
`react-beautiful-dnd`, not `sortablejs`.

Everything the user builds today, they build in a list or a form:
`src/components/agents/schedule-editor.tsx` for a schedule,
`src/components/automation/automation-realize-list.tsx` for an automation,
`src/components/mission/step-controls.tsx` for reordering a mission's
steps.

Three arguments against introducing a canvas here, all of them from
evidence already in this repository rather than from taste:

1. **Mobile.** An earlier round's hover-dependency scan exists because this
   product is used on phones, and a drag canvas is the least
   touch-transferable interaction there is.
2. **Ten locales, two of them RTL.** A list flips with `dir`; a canvas with
   absolute positions does not, and `src/lib/agents/delivery-channels.ts`
   and the RTL work are recent enough that the cost is known.
3. **Nothing to lay out yet.** A canvas earns its complexity when a graph
   has branches. §3 says there are none, and a canvas that draws a straight
   line is a list with worse accessibility.

The honest recommendation is a **list with an explicit "then" between
rows** — the same shape as `plan_steps` — and to revisit a canvas only when
conditions (§3) make the flow an actual graph.

---

## 6. How does the user test before activating?

This one the repository has already answered well, once, and the answer
should be copied rather than redesigned. `src/app/api/agents/[id]/run/route.ts`:

> It is NOT a dry run: it costs credits, it emails the result, and it
> writes a history row, because a test that does not exercise the real path
> proves nothing about whether the thing works. What it deliberately does
> NOT do (see executeAgent's triggerSource handling) is touch the agent's
> schedule or its failure streak — a user pressing "Run now" three times
> while tweaking a task must never be able to auto-disable their own agent,
> and must never shift when it next fires on its own.

The mechanism is a single field, `triggerSource: "schedule" | "manual"`,
threaded through `src/lib/agents/execute-agent.ts` and read at three
decisions: whether a failure counts toward the streak, whether the schedule
advances, and — in `src/lib/ai/batch/batch-policy.ts` — whether the run may
be deferred into a batch at all. A manual run is never batched, because a
test the user is waiting on must not arrive tomorrow at half price.

There is also a tighter cap on the door a human can hammer: 10 manual runs
per hour, checked before ownership, separate from the hourly execution cap.

**What a workflow engine adds to this is one thing: a test must be able to
stop before the irreversible step.** `docs/tool-registry.md` grades effects
— money spent, a message delivered, a row written — and a "Run now" for a
five-step flow that emails a customer on step 4 is not a test, it is the
thing itself. The existing answer is right for one step; it needs the
effect grade to stay right for five.

---

## 7. What happens on failure in the middle?

Today, per surface:

| surface | on failure |
|---|---|
| agent run | `consecutive_failures + 1`; at `AGENT_MAX_CONSECUTIVE_FAILURES` (5) the agent is set `disabled` and the owner emailed. Reset to 0 by any success. A **manual** run never counts. |
| queued job | `MAX_JOB_ATTEMPTS` (2) in `src/lib/jobs/job-types.ts`; the hold is released or the partial work settled, once, in `src/lib/jobs/run-job.ts`. |
| mission step | marked failed; `MAX_STEP_ATTEMPTS` (3) — but only the UI enforces it (`docs/orchestrator.md`). |
| automation | nothing. `user_automations` has no failure column at all. |
| scheduled run | the row is marked `failed` with the reason; the next scheduled row is unaffected. |

There is no notion of a partially-completed flow, because there is no flow.
The question a workflow engine must answer and none of these does: **when
step 3 of 5 fails, what happens to steps 4 and 5, and what happens to the
work steps 1 and 2 already did?**

The repository contains one good precedent and one warning.

The precedent is Deep Research: at its ceiling it stops and synthesises
what it has, *"a partial report the user can read beats a perfect one they
never receive"*. Degrade, and say what is missing.

The warning is `buildPriorStepsContext`: it filters on
`status === "completed" && s.output`, so a failed step and one that has not
run yet are the same absence. A workflow engine that reuses that helper
inherits a bug where step 4 cannot tell that step 3 failed.

---

## 8. How are loops avoided?

Three real mechanisms exist, and one structural fact matters more than all
of them.

**At declaration time.** `MAX_RUNS_PER_HOUR_PER_AGENT` in
`src/lib/agents/cron-expression.ts` is 1, and it is enforced by refusing
any cron whose minute field resolves to more than one value — `0 * * * *`
is accepted, `*/5 * * * *` is rejected with a sentence. The reasoning is
the principle a workflow engine should adopt wholesale:

> The per-user hourly cap in lib/agents/agent-limits.ts is the backstop,
> but a backstop that silently drops runs produces an agent that
> "sometimes doesn't work" — far worse than one that was never allowed to
> be created.

**At creation time.** `src/app/api/automations/create/route.ts` refuses an
exact `description` + `frequency` match for the same user, so a double
submit cannot leave two identical automations "both firing forever".

**At run time.** `src/lib/ai-circuit-breaker.ts`: `USER_HOURLY_MAX_CALLS`
is 20, and the identical-request breaker allows `IDENTICAL_CALL_MAX` (10)
repeats of the same fingerprint within `IDENTICAL_CALL_WINDOW_MINUTES`
(15). A flow that re-triggered itself with the same input would trip that
within minutes — but a flow that re-triggered itself with *different* input
would not.

**And the structural fact: today a cycle is impossible, because nothing a
step does can start anything.** Every writer to the three executable tables
is reached by a human request or by a dispatcher cron —

- `user_automations`: `/api/automations/create`, the cron, the module page,
  the active-list toggle.
- `user_agents`: the agent routes, the cron, `execute-agent`, the batch,
  the job handler.
- `scheduled_agent_runs`: `/api/mission/schedule-step`,
  `/api/mission/[id]/steps`, the cron, and `src/lib/mission-step-edits.ts`
  — whose only callers are that route and `step-controls.tsx`, i.e. a
  person editing or undoing.

No executing step inserts into any of them. The `automation` module a
mission step *can* write to is `automations`, the note table, which runs
nothing.

**So loops are currently prevented by the absence of the feature being
asked for.** "When X, do Y" is precisely the construct that lets Y produce
an X. That is not an argument against building it; it is the reason the
loop rule has to be part of the first version rather than added after the
first incident, and the shape it should take is the cron rule's: make the
cycle **unconstructible at declaration**, not merely survivable at runtime.

The cheapest form of that: a workflow's steps may call tools, and tools are
what `docs/tool-registry.md` proposes to declare — so "may this step start
a workflow?" becomes a field on a tool, defaulting to no, and a cycle needs
an explicit opt-in that a static check over the declared graph can refuse.

---

## 9. What the measurement found

### The condition engine already exists, in the trading journal

`trading_rules` + `src/lib/trading/rules.ts` + `src/lib/trading/guardian.ts`
is a shipped, gated, user-authored condition system with an enum of kinds,
typed parameters, bounds, a confirm step and deterministic evaluation. It
was not found by looking where the workflow feature lives; the first pass
of §3 concluded there were no conditions in the product at all, which was
wrong. Anything built for workflow conditions that does not start from
that file is rebuilding it worse.


### The workflow the user wrote down is destroyed by a `join`

`automations.suggested_workflow` is where a person describes the sequence.
`automation-realize-list.tsx` concatenates it with two other fields and
submits the result as one `description`. Nothing downstream can recover the
steps, because nothing upstream kept them apart. This is not a defect —
`user_automations` was never multi-step — but it is the exact seam where a
workflow engine attaches, and the data is already being collected.

### Two schedulers, two timezone semantics, one product

An agent scheduled for "09:00" runs at 09:00 in the user's IANA zone. An
automation scheduled "daily" runs at 09:00 UTC — 11:00 or 12:00 in Athens
depending on the season. Both are documented in place and each is right for
its own constraints; together they mean the product answers "when does my
thing run?" two different ways.

### `user_automations` has no failure state

`user_agents` carries `consecutive_failures` and auto-disables at 5 with an
email. `user_automations` has `is_active`, `last_run_at` and `next_run_at`
— and no column that records that a run failed.

The user is not charged for it: on `!result.ok || !result.matched` the cron
releases the hold, advances `next_run_at`, and emails the failure. So a
daily automation whose description can never be classified costs the user
nothing and fires forever — making one real Anthropic call per cycle that
earns nothing, and sending one failure email per cycle that never stops.
Nothing accumulates that would ever disable it. The per-run cost is small;
the shape is the one `user_agents` already decided against.

### The two cron failure paths release without settling, which `run-job.ts` stopped doing

Both failure branches in `src/app/api/cron/scheduled-runs/route.ts` — the
scheduled mission step and the automation — call `releaseReservation` and
then `continue`. Correct for the user, and silent about the money: the
model call already happened and was already paid for, and no `ai_cost_log`
row is written, so that spend appears in no margin report.

`src/lib/jobs/run-job.ts` had the same shape and fixed it, and its comment
says exactly why:

> This branch used to return here, writing credits_charged = 0 and no
> cost-log row at all. The refund was correct and the silence was not: a
> refunded job's real spend appeared in nobody's margin report, so the one
> number that says how much saying "no" costs us was structurally
> unobservable.

Its fix is to settle with `bypassCharge: true` — log the real cost, charge
nothing — under a `_refunded` feature. The two cron branches never got it.
Combined with the finding above, a permanently-failing automation is the
one case where that blind spot compounds: it spends every cycle, forever,
and the amount is unobservable by construction.

---

**ΝΕΑ MIGRATIONS ΝΑ ΤΡΕΞΕΙΣ: καμία**
