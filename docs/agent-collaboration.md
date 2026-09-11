# Many agents, one problem — and the four mechanisms already in the tree

The brief asks for a shared workspace rather than serial hand-off. This
document measures what the repository has, and then proposes the simplest
thing that works, which turns out to be **no new mechanism at all**: every
piece is already shipped, in service of something else.

Nothing here is implemented.

**Method.** Measured from `HEAD` with `git grep`/`git show`, because a
mutation sweep was rewriting the working tree while this was written —
the same declaration as `docs/workflow-engine.md`.

---

## 0. The starting point: "AI Company" is one call with an adjective

`src/lib/agent-roles.ts` is 31 lines. `AGENT_ROLES` is
`["general", "marketing", "finance", "research"]`, and a role is **one
sentence appended to the classifier's system prompt**:

> You are currently acting as the Marketing Agent: when logging content
> […] emphasize persuasive copy, target audience, calls-to-action, and
> marketing strategy in the fields you produce.

`general` returns the empty string. There is no second agent, no second
context, no second output — one model call, steered by an adjective, into
one `route_entry` classification.

That is the honest baseline, and it means the brief is not asking to
change a collaboration model. There is not one yet.

### And nothing in this application runs two model calls at once

Every `Promise.all` in `src/lib` and `src/app/api` is over **database
queries**, never model calls. The two that look like exceptions are not:
`src/app/api/chat/route.ts:1200` parallelises *tool executions* (the
integration search) inside one turn, and `src/lib/attachment-image-server.ts`
parallelises downloads. Deep Research says it outright — *"A report is up
to six SEQUENTIAL, search-enabled model calls"* — and runs
`while (answered < questions.length)`. The agent cron
(`src/app/api/cron/agent-runs/route.ts`) is a `for` inside a `for`.

**Concurrent model calls in this app today: zero.**

---

## 1. Where does the shared space live?

**It already exists, and it is already multi-writer safe.**
`updateMissionPlanSteps` in `src/lib/mission-plan-steps.ts`:

```ts
const { data: current } = await supabase
  .from("ai_missions")
  .select("plan_steps, plan_steps_version, status")
  .eq("id", missionId).maybeSingle();

const currentVersion = (current.plan_steps_version as number) ?? 0;
const { planSteps: nextPlanSteps, extraFields } = mutate({ ... });

const { data: updated } = await supabase
  .from("ai_missions")
  .update({ plan_steps: nextPlanSteps, plan_steps_version: currentVersion + 1, ...extraFields })
  .eq("id", missionId)
  .eq("plan_steps_version", currentVersion)     // <- the compare-and-swap
  .select("id");

if (!updated || updated.length === 0) return { ok: false, conflict: true };
```

Read, apply a pure mutation, write only if the version is unchanged, and
report a conflict rather than clobbering. **Two independent writers already
use it**: a person in `src/components/mission/mission-detail.tsx` and a
worker in `src/app/api/cron/scheduled-runs/route.ts`, whose comment says
why —

> runMissionStepForUser above is a real AI call that can take many
> seconds, during which a user could complete a DIFFERENT step of this
> same mission live in another tab — a blind overwrite here would silently
> erase that.

A shared workspace for N agents is that document with N writers instead of
two. The concurrency control does not need designing; it needs re-using.

### The two other candidates, and why they are not it

- **`agent_runs`** is a per-agent log: one row per run, `output text`
  "verbatim — the same text that was emailed", keyed by `agent_id`. There
  is no shared subject, so two agents on one problem write two unrelated
  rows. It is also **service-role write only, by design** ("A user who
  could insert rows here could fabricate a run history"), which is the
  right rule and makes it a record, not a workspace.
- **`entity_links`** (see `docs/projects.md`) is a graph with no ordering
  and no version column. It can say *these findings belong together*; it
  cannot serialise two writers.

---

## 2. How is duplicate work avoided?

By claiming before working — and the repository has already written that
three times, in three shapes:

| where | the claim |
|---|---|
| mission step, `src/app/api/cron/scheduled-runs/route.ts` | `if (!step \|\| step.status === "completed")` → mark the run "Already completed." and skip. Status *is* the claim. |
| automation, same file | `update({ processing_started_at: now })` with `.or("processing_started_at.is.null, processing_started_at.lt.<stale cutoff>")` — an atomic claim with a self-expiring 10-minute window, so a crashed worker's claim is not held forever but a live one is not stolen. |
| research chunk, `src/lib/research/run-research.ts` | `claimChunk(reportId)` — "so two workers cannot take the same report". |

Plus one runtime backstop that is not a claim: the identical-request
breaker in `src/lib/ai-circuit-breaker.ts`, `IDENTICAL_CALL_MAX` 10 in a
15-minute window. It catches a *repeated* request, not two agents
independently deciding to do the same useful thing.

For a panel, the automation cron's `processing_started_at` claim is the one
that fits: **each agent claims a question before answering it**, with a
stale window, so a worker that dies releases its claim and a worker that is
merely slow does not lose it. The
duplicate-work problem for agents is the same problem the automation cron
already solved, at the same granularity.

---

## 3. What if they disagree?

There is exactly one place in the app where two AI opinions meet, and the
answer it gives is **append, never arbitrate**.

`src/app/api/websites/generate/process/route.ts` runs a deterministic scan
and an AI reviewer over the same generated HTML, and then:

```ts
const allIssueDescriptions = [
  ...securityIssues.map(describeSecurityScanIssue),
  ...contentReview.concerns,
];
isFlagged = allIssueDescriptions.length > 0;
```

Both opinions are concatenated, a `security_check_log` row records the
list of checks that ran and every issue either found, and the site's status
becomes `flagged`. Nothing decides which one was right; the disagreement is
recorded and surfaced.

`checkCitations` in Deep Research does the same thing (`docs/orchestrator.md`
§3): when the report cites sources it does not have, the run does not stop
— `annotateDanglingCitations` marks them and the reader sees it.

That is the house rule and it is a good one for a panel: **a disagreement
is an output, not an error.** Two agents that reach different conclusions
produce a shared document that says so, and the person decides. Building an
arbiter — a third model asked who was right — adds a call, adds a failure
mode, and produces a number that "would be different tomorrow and nothing
in the product could tell", which is the objection `src/lib/trading/rules.ts`
already raises about asking a model to judge.

The one thing worth adding, because the repository already has the column
for it: agents disagreeing should be **distinguishable from an agent
failing**. `docs/orchestrator.md` records that `buildPriorStepsContext`
collapses "failed" and "not run yet" into the same absence; a panel must
not inherit that.

---

## 4. The cost multiplies — is it worth it?

Priced with the app's own estimator, Sonnet 4.6, an agent task of 400
characters, each later agent also reading the 1,200 characters the earlier
ones wrote:

| N | blind (no sharing) | shared space | batched at 0.5× | vs one agent |
|---|---|---|---|---|
| 1 | $0.0744 | $0.0744 | $0.0372 | 1.00× (batched 0.50×) |
| 2 | $0.1488 | $0.1587 | $0.0794 | 2.13× (batched **1.07×**) |
| 3 | $0.2232 | $0.2529 | $0.1265 | 3.40× (batched **1.70×**) |
| 5 | $0.3720 | $0.4710 | $0.2356 | 6.33× (batched **3.17×**) |

Two things this says.

**Sharing is not what costs.** Going from blind to shared adds 6.6% at
N=3 — the reading is cheap; the *thinking* is the bill. The extra input is
also already priced in the repo, in `agentRunDeep`'s own profile: its
second research pass declares 900 input tokens against the first's 600,
*"the second is given the first's findings, which is why its input
allowance is larger"*. **+300 tokens per agent that reads its predecessor.**

**Batching is what decides it.** `src/lib/ai/batch/batch-policy.ts` gives
the test, and it is exactly the right test for a panel:

> THE TEST IS "IS ANYBODY WAITING", not "is it expensive".
> YES — a SCHEDULED agent run that delivers by email or Slack. Nobody is
> looking at a screen.
> NO — a MANUAL agent run. Somebody pressed Run and is watching a spinner.
> A 50% saving is not worth a feature that appears broken.

So a panel of three, delivered by email, costs **1.70×** one synchronous
agent. A panel of three answering a chat message costs **3.40×** and cannot
be batched, because a person is watching. That is the whole economic answer:
**a panel is affordable exactly where it is asynchronous, and unaffordable
where it is interactive.**

`AI_BATCH_ENABLED` defaults to false, so today the batched column is
hypothetical — that is the operator's switch, not a code change.

### And the cheapest useful panel is not a panel

`src/lib/website-security-review.ts` already ships the two-agent shape that
earns its money: one generator, and one **narrow** critic with a hard
ceiling — `REVIEW_MAX_TOKENS` 500, `MAX_HTML_CHARS_FOR_REVIEW` 12,000, and
a mandate that says what *not* to flag ("Do NOT flag: ordinary business
sites, opinions you disagree with, aggressive-but-legal sales copy, or
unfinished/placeholder content"). Its cost discipline is stated at the call
site:

> ONE AI CALL FOR THE WHOLE SITE, not one per page. […] four separate
> reviews would cost four times as much to answer the same question.

That review call is ~3,300 input / 500 output tokens ≈ **$0.0174**, against
a generator that costs several times more. A generator plus a narrow critic
is a fraction over 1×, not 2×.

---

## 5. The simplest thing that works

Four pieces, all of them existing code:

1. **The shared space is one `jsonb` document per problem, with a version
   column and compare-and-swap on write.** That is `updateMissionPlanSteps`
   verbatim; give it a `findings` array beside `steps` and the mechanism is
   done. Conflicts already return `{ conflict: true }`, and both existing
   callers already handle it.
2. **Each agent claims its slice before working**, with a self-expiring
   window — the automation cron's `processing_started_at` claim, applied to
   a finding slot instead of an automation row.
3. **Disagreements are appended, not arbitrated** — the
   `allIssueDescriptions` shape, plus a status that distinguishes
   *disagreed* from *failed*.
4. **The panel runs where nobody is waiting**, so it goes through the batch
   path at half price; interactive requests get one agent, or one agent and
   a narrow critic.

What this deliberately does not add: no parallel model calls (there are
none today and adding concurrency is a separate risk), no arbiter model, no
new table, no new claim mechanism, no new concurrency primitive.

The first version that would be worth measuring is the smallest one: **two
agents, one shared document, one narrow critic, delivered by email.** At
N=2 batched that is 1.07× the cost of the single agent it replaces, which
is inside the noise of the estimate itself — and if two agents do not beat
one at 1.07×, five will not beat one at 3.17×.

---

## 6. What the measurement found

### A near-miss worth recording

Pricing a critic as a standalone `ACTION_PROFILES` entry gives 3.7×–8.5×
the call's real cost, because `outputCharsPerInputChar` makes the estimated
*output* grow with the *input*, and a critic reads a lot and answers
briefly. That looked like a defect in the estimator.

It is not. `ACTION_PROFILES` already expresses exactly this shape, through
`auxiliaryCalls`, and `websiteGenerate` already uses it — its third
auxiliary entry is `{ inputTokens: 4000, outputTokens: 300 }`, commented
`// clarification pre-check + off-topic classifier + AI security review`.
Measured against what the review call actually sends (~3,300 in / 500 out),
the declared figure prices it at **0.95×** the real cost.

The finding is therefore the opposite of a bug: **the estimator already has
the right primitive for a critic, and the one critic that ships is
correctly priced within 5%.** It is recorded because the wrong version of
this paragraph was written first, and the check that killed it is the
reason the paragraph is worth having.

### `agent_runs` cannot be the shared space, and that is deliberate

It has no insert, update or delete policy at all: only the service-role
client writes it, so a user cannot fabricate a run they were not charged
for or delete one they were. Any shared workspace agents write into needs
its own table with its own policy, and cannot borrow this one.

---

**ΝΕΑ MIGRATIONS ΝΑ ΤΡΕΞΕΙΣ: καμία**
