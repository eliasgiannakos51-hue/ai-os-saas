# A folder with its own context, against the context there already is

"The chat inside the project sees only these" assumes there is a *these*
and a *those* — one context, which a project would narrow.

Measured, there is no single context. A chat request assembles **seven**
independent blocks from seven files, each with its own cap, its own toggle
and its own failure mode, and the one that reads the thirteen modules by
name is not used by chat at all. A project scopes all seven or it scopes
nothing.

Nothing here is implemented.

---

## 1. What one chat request sends today

From `scripts/measure-context.mjs`, run on this branch. Static blocks are
exact (they are literals in the source); dynamic blocks are modelled from
the caps the code enforces, and the tool says which is which.

```
STATIC — identical on every message, and cached:
  persona line (Greek)                  1044 chars     261 tok    5%
  AI_CONDUCT_EL                         4734 chars    1184 tok   23%
  AI_QUALITY_CHECKLIST_EL               1323 chars     331 tok    6%
  — static subtotal                     7101 chars    1776 tok   34%

PER-REQUEST — re-sent in full:
  AI Life Context (all modules)         4817 chars    1205 tok   23%
  memories                               720 chars     180 tok    3%
  entity mentions                        320 chars      80 tok    2%
  — per-request subtotal                5857 chars    1465 tok   28%

CONVERSATION HISTORY:
  20 turns                              8000 chars    2000 tok   38%

TOTAL                                  20958 chars    5240 tok
```

And the number that decides this whole question — what caching already
did:

```
  static prefix         1776 tok   cached before and after
  per-user block        1385 tok   full price -> cached
  conversation history  2000 tok   full price -> cached
  this message's entities 80 tok   full price, unavoidable

  BEFORE   3643 full-price-equivalent tokens
  AFTER     596
  SAVED    3047  (84%)
```

An ongoing message costs **596** full-price-equivalent tokens, not 5,240,
because everything except the last 80 tokens sits behind a cache boundary.

---

## 2. How context building changes

### The seven builders

| block | file | its cap |
|---|---|---|
| chat memories | `src/lib/chat/memory.ts` | `DEFAULT_MEMORY_LOAD_LIMIT` 20, and per-plan `chatMemoryLimit` |
| entity mentions | `src/lib/chat/entity-mentions.ts` + `src/lib/entity-links.ts` | headline substring match, then the linked entities |
| AI Life Context | `src/lib/user-context.ts` | `PER_MODULE_LIMIT` 5, `MAX_HEADLINE_LENGTH` 60, missions ≤ 14 days |
| deep dive | `src/lib/ai/deep-dive.ts` | 25 dated rows **with amounts**, for the one module the question points at, and nothing when it points at none |
| mentor context | `src/lib/chat/mentor-context.ts` | 5 per module × 15 × 60 chars — only with Mentor Mode on |
| trading / product mentor | `src/lib/chat/{trading,product}-mentor-context.ts` | 20 trades / 20 products — only with the matching preset |
| coding cross-module | `src/lib/ai/cross-module-store.ts` + `cross-module-context.ts` | pool 40, ≤ 90 days, 4 items × 280 chars, 900 chars total |

An eighth exists and chat does not use it: `loadWorkspaceContext` in
`src/lib/ai/workspace-context.ts` has **exactly one caller**,
`src/app/api/coding/run/route.ts`. Its four stated rules — the user's own
RLS client, headlines only, bounded twice, explicit — are the right rules,
and they govern one route.

### So a project changes seven things, not one

Each of the seven reads a different table set with a different shape. A
`project_id` filter is not one predicate added in one place; it is seven
edits, in seven files, each of which must also decide what "no project"
means. That is the same "a guard repeated at N call sites is a guard the
N+1th forgets" that `src/lib/agents/cron-expression.ts` was restructured
to avoid.

### And the narrowing question is already open, deliberately

`src/lib/ai/module-relevance.ts` is a built, tested and wired mechanism for
sending fewer modules. Asked of the code rather than the comment,
`DEFAULT_SELECTION_CONFIG` is
`{ enabled: false, minKeep: 6, maxDropShare: 0.5, minQuestionChars: 25 }` —
so even switched on it would never drop below six modules or more than half
of them, and would not judge a question under 25 characters. Its file comment is the reason, and it is the reason a project is a
better answer than a matcher:

> The value of a cross-module assistant IS the cross-module part: the
> answer that notices a competitor note while you are asking about
> pricing. Narrowing the context is the one change in this workstream that
> can make an answer WORSE, and quality has not been measured […] A
> quality change shipped on the strength of a token count is a regression
> nobody is looking for.

Every rule in that file "fails towards sending more": a question it cannot
judge, a question nothing matches, a match that would drop too much — all
return everything.

A project is the third answer to the question that file asks. Not "let the
model guess which modules matter" and not "match the question against a
vocabulary", but **the user says once, explicitly, and it stays said**.
That is better than either, for a reason that is about cost as much as
quality — §3.

---

## 3. Does it cost more or less?

**Less — but only if the project is the cache key, and it costs
substantially MORE if it is a per-message filter.** This is not a
prediction; the repository already priced the three shapes, in
`src/lib/ai/deep-dive.ts` and `scripts/measure-context.mjs`:

```
A. flat 5 -> 20 everywhere            +302 tok   cache intact
B. relevance-weighted, same 65 rows  +1247 tok   the block changes per message
   (0 extra characters — the entire cost is the broken cache)
C. keep flat 5 cached, append 25      +388 tok   cache intact, aimed
```

> **B sends the FEWEST characters and costs the MOST. That is the
> finding.**

And, for narrowing specifically:

> AI Life Context 4817 chars; dropping 6 of 13 modules removes ~2223 chars
> — but that block is now CACHED, so the saving is on a 0.1x line, not a
> 1.0x one. That is the finding: caching it was worth more than narrowing
> it, and narrowing is the only one of the two that can change an answer.

Applied to projects, the arithmetic is:

- **Scoping saves little.** Dropping roughly half the AI Life Context
  removes ~2,223 chars ≈ 556 tokens, at the cached rate ≈ **56
  full-price-equivalent tokens** off a 596-token message — about 9%.
- **Breaking the cache costs a lot.** The per-user block is 1,385 tokens.
  If the block varies per message, that is 1,385 tokens back on a
  full-price line, plus the 1.25× write premium each time the prefix
  changes: the +1,247 of option B.

So the design rule falls out of the measurement, and it is a single
sentence: **a project must be a property of the conversation, fixed for its
lifetime, so its context block is written to the cache once and read
thereafter.** A project *picker* that changes what is sent mid-conversation
is option B with a nicer UI.

The mixed mode the brief asks for — "or the rest too, by choice" — has to
obey the same rule: two cached variants (project-only, project-plus-rest)
chosen when the conversation starts, not a toggle that re-writes the prefix
on turn seven. Two cache entries per project is a bounded cost; a prefix
that changes with a switch is not.

A second, smaller saving that scoping does buy: `MAX_MODULES = 8` and
`PER_MODULE_LIMIT = 5` exist to bound an account's size. Inside a project
those caps can be spent on fewer tables, so a project of three modules can
afford 20 rows each at the same character budget — which is option A's
price with option C's aim, without a matcher deciding anything.

---

## 4. What happens to the existing data

There are two shapes, and the repository has already built one of them.

### The column: `project_id` on every table

Counted: **82 tables carry `user_id uuid not null references auth.users`
across all migrations, 56 of them in the baseline schema alone.** Files,
missions, conversations, all thirteen module tables and every "Build"
artefact are among them.

Adding a nullable `project_id` to the ones a project can hold means a
migration touching dozens of tables, with its RLS unchanged but every
index and every read that wants to scope reconsidered — and, per
`CLAUDE.md`, **applied by hand, by you, in the SQL editor**. Every existing
row is NULL, which means "no project", which means the unscoped behaviour
must remain the default forever. That is not an argument against it; it is
the size of it, stated.

### The edge: `entity_links`, which already exists and is already generic

```sql
create table if not exists public.entity_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_table text not null,
  source_id uuid not null,
  target_table text not null,
  target_id uuid not null,
  relationship_type text not null default 'related',
  created_at timestamptz not null default now()
);
```

There is **no CHECK constraining the table names**, so it can already carry
a link between any two user-owned rows — a file to a mission, a
conversation to a product. `relationship_type` already exists and already
defaults to `'related'`. `LINKABLE_MODULES` in
`src/lib/knowledge-graph.ts` currently lists **19** tables, six more than
the thirteen classifier modules — websites, apps, images, videos,
presentations, campaigns.

So the edge shape is: one new `projects` table, and membership as rows in
`entity_links` with a `relationship_type` of its own. **No existing table
changes.** Existing data joins a project one row at a time, through the UI
that is already built — `src/components/entity-links/link-to-button.tsx`
and `link-to-modal.tsx` — and `loadLinkedEntities` already resolves both
ends in a bounded number of queries regardless of how many links there are.

The honest trade: the column is faster to read (one predicate, one index)
and slower to ship; the edge is instant to ship and needs a join, plus a
decision about whether membership is transitive (a mission in a project —
are its steps in it too?). The measurement above says the read cost is not
where this feature's money goes, which points at the edge.

---

## 5. Modules — replaces or complements?

**Complements, and it cannot replace them.** A module is a *type*; a
project is a *grouping*, and three shipped features depend on the type:

- `route_entry` (`src/lib/mission-step-runner.ts`, `src/lib/jobs/handlers/create.ts`)
  classifies free text into exactly one of thirteen module slugs and then
  coerces the extracted values into that module's declared fields. Without
  typed tables there is nothing to route into.
- `loadDeepDive` can send "25 dated rows **with amounts**" only because
  the module declares which field is the amount.
- `trading_rules` (`docs/workflow-engine.md` §3) can have eight typed
  condition kinds only because a trade has typed fields.

A folder has no fields. A project that replaced modules would delete the
type system those three features are built on.

The relationship the app already models is the right one, and it is the
edge, not the folder: `entity_links` says *these two records are related*,
across nineteen tables, without either of them changing type. A project is
that same statement with a name on it and a membership test.

Two things a project adds that neither modules nor links give today:

1. **A scope for things that have no module** — files (`user_files`),
   conversations (`chat_conversations`), missions (`ai_missions`). None of
   the three is in `LINKABLE_MODULES` today, and all three are what the
   brief asks a project to hold.
2. **A stable cache key**, per §3. A module is not one, because a chat is
   not "in" a module. A project can be.

---

## 6. What the measurement found

### `MAX_MODULES` promises recency and delivers registry order

`src/lib/ai/workspace-context.ts:53`:

```ts
/** Modules read at all. The most recently touched first. */
export const MAX_MODULES = 8;
```

The loop below it iterates `CLASSIFIER_MODULES` in the registry's own
order and stops once eight modules have contributed. Nothing sorts by
recency anywhere in the function; the only `.order()` is `created_at`
*within* a module. So for any account with at least one row in each of the
first eight — ideas, competitors, research, finance, learning, trading,
decisions, products — the last five are unreachable: **content, sales,
feedback, analytics, automation**.

A user whose work is in Sales and Content gets a workspace context about
Ideas and Competitors. `omittedModules` counts them honestly, so the UI
says "5 further modules were not included" — the count is true, the
selection is by position.

This is one route (`/api/coding/run`), so the blast radius is small. It
matters here because it is the same defect a project fixes by construction:
selection by declaration instead of by array index.

A second, smaller thing in the same loop: `omittedModules` is incremented
only when the cap is hit, so a module whose query *threw* is silently
absent and uncounted. The catch block logs it and contributes nothing,
which is the right behaviour for the request and the wrong number for the
notice.

### `measure-context.mjs` hardcodes a total it says it measured

`scripts/measure-context.mjs:428`:

```js
const CHAT_REQUEST_CHARS = 20_725; // measured above, one full chat request
```

The section above it now prints **20,958**. The constant was true when it
was written and nothing connects the two, so the "share of request"
percentages in the cross-module section are computed against a stale
denominator.

**It changes nothing today, and that is the point.** The worst case is 707
chars: 707/20,725 is 3.411% and 707/20,958 is 3.373%, and both print as
"3.4%". The output is currently correct by luck of rounding, and it will
stop being correct silently as the context grows. It is reported because it
is a defect in one of this project's own instruments, of exactly the shape
`CLAUDE.md` names: a number that says it was measured and was not. The fix
is one line — use the total computed a few dozen lines above instead of
restating it — and this round is analysis only, so it is named rather than
made.

---

**ΝΕΑ MIGRATIONS ΝΑ ΤΡΕΞΕΙΣ: καμία**
