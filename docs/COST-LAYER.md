# The cost layer: what already saves money, measured, and what is missing

Measured **2026-11-05** by reading and running the code. No database was
reached and no money figure below comes from the invoice. Each figure
either names the command that re-derives it or says it was measured once
by hand on that date. Each money figure is an **estimate**, and the
arithmetic is shown next to it.

The real per-feature spend comes from the production database:

    node scripts/db/model-spend.mjs --sql     # the query, to paste in the SQL editor
    node scripts/db/model-spend.mjs           # with DATABASE_URL

The real per-feature cache hit rate is on the admin margin report
(`src/components/settings/margin-report.tsx`, which reads `ai_cost_log`).
Nothing here replaces either one.

**One rule above the rest.** Training a model of our own on Claude's
answers is forbidden: Anthropic's Commercial Terms D.4 (§ Facts below). The
same holds for OpenAI and xAI. Nothing in this cost layer trains anything
or depends on training.

---

## (a) Prompt caching: which calls use it, and which large ones do not

    node scripts/measure-prompt-cache-headroom.mjs

**The instrument was blind, and it is rewritten in this commit.** The old
version found call sites by grepping for `messages.create`. Since the
provider router (`runCompletion` in `src/lib/ai/providers/complete.ts`)
took over, almost every call goes through the router instead. Run on
2026-11-05 before the rewrite, it saw **5** of the **52** call sites and
printed "1 of 1 uncached call site(s) are worth changing". Its table in
`docs/v7-list.md` §2 is dated 2026-09-25 and is now marked superseded. The
rewrite
counts every `runCompletion(` and direct SDK call, outside the provider
adapters and in comment-stripped source. It builds each uncached site's
real system prompt by running the code's own builder
(`probeTs` in `scripts/tests/load-ts.mjs`). It then judges each prompt by
the repository's own rule, `isWorthCaching` in
`src/lib/ai/cached-system.ts` (characters / 4 ≥ the model's minimum).

**Measured 2026-11-05, by that command:**

| | calls |
|---|---|
| Calls that reach a text model (41 files) | **52** |
| ...that cache their stable prefix, before this commit | 10 |
| ...after this commit | **11** |
| Uncached calls | 41 |
| ...whose stable prefix clears the model's minimum (caching would work) | **3** (was 4) |
| ...whose stable prefix is too short (a marker would be ignored, silently) | 35 measured sites |

The 11 cached calls are Chat; the Website builder (2 of 3); Missions (2
of 3); Create; mission steps; Posts; Slides; Documents; and, new, the
Create Studio intake.

**The large uncached prompts, with the size of their stable prefix:**

| Call site | Stable prefix | Verdict |
|---|---|---|
| `src/app/api/create-studio/detect/route.ts` | 7,669 chars, ~1,918 tok | **wired in this commit.** Every Create sentence sends it, and nothing in it is per-user |
| `src/lib/reflection-agent.ts` | 6,428 chars, ~1,607 tok (Greek, so more in reality) | qualifies. Low volume (weekly, on request), see the TTL caveat below |
| `src/lib/agents/agent-builder.ts` | 5,125 chars, ~1,282 tok | qualifies. Low volume (building an agent) |
| `src/lib/import/map-columns.ts` | 4,125 chars, ~1,032 tok | **at the line**: a real token count under 1,024 makes the marker a no-op. Not worth wiring blind |
| `src/app/api/records/ask/route.ts` | 76 chars of prefix, then the record, then 6,476 chars of constants | would qualify **if reordered**, putting the constants before the record. That changes the prompt, so it is not a wire-up. Next round |

**The high-volume uncached calls are all too short to cache.** Chat's
memory extraction runs after every chat turn with a 1,470-character prompt.
Text actions are 846–896 characters. File questions are 1,473 characters.
A cache marker on any of them would be ignored by the provider, and the
provider would not say so. For these the lever is the model (§ c), not the
cache.

**The TTL caveat, which decides whether a "qualifying" site saves
anything.** Cached reads cost 0.1× the input price
(`src/lib/ai/providers/cache-policy.ts`) and writes cost 1.25× (the write
premium `src/lib/ai/cached-system.ts` names). An entry lives
about five minutes after its last use, per the prompt-caching docs that
`src/lib/ai/cached-system.ts` cites. If *h* is the share of calls that
find a live entry, the prefix costs `0.1·h + 1.25·(1−h)` of full price,
which is cheaper than 1 only when **h > 0.217**. A prompt that is the same
for every user, like the Create Studio intake, is shared across all users'
calls, so a modest flow of traffic keeps it warm. A weekly reflection or a
rare agent build may never be hit inside five minutes, and then caching
costs 25% more on that prefix. That is why only the Create Studio intake
was wired.

**Estimate: the Create Studio wire-up.** Model `claude-sonnet-4-6`, $3
input and $15 output per MTok (`src/lib/ai/providers/catalog.ts`); prefix
1,918 tokens.

    saved per hit     = 1,918 × ($3.00 − $0.30) / 1M = $0.00518
    extra per miss    = 1,918 × ($3.75 − $3.00) / 1M = $0.00144
    per call at h=0.8 = 0.8 × 0.00518 − 0.2 × 0.00144 = $0.00386
    per 10,000 calls  ≈ $38.6

**ESTIMATE:** h = 0.8 is an assumption. The real h is the cache hit rate
the margin report shows for this feature once it ships.
A report that shows writes and no reads (`writingWithoutReading`) means
the estimate was wrong.

**The gate.** `scripts/tests/prompt-caching.test.mjs`, section "Create
Studio detect", measures the real prompt through the route's own template
and the real constants, and requires it to clear Sonnet's minimum. It
reads the wiring from comment-stripped source.
`scripts/tests/prompt-caching.mutation.mjs` makes three mutations: a plain
block, the user's sentence folded into the cached half, and the constants
dropped under the minimum. All three go red (3 of 3 caught, 2026-11-05).

## (b) Jobs that are not urgent and still run at full price

The batch API is half price for work returned within 24 hours
(`src/lib/ai/batch/batch-policy.ts`). Its test is "is anybody waiting".
Read on 2026-11-05:

| Job | Where | Who is waiting | Today |
|---|---|---|---|
| Scheduled agent runs (daily or slower, delivered by email or Slack) | `src/app/api/cron/agent-runs/route.ts` → `src/lib/ai/batch/agent-batch.ts` | nobody | **batch path built, OFF by default**: `AI_BATCH_ENABLED` defaults to false. Whether production sets it is not visible from the repository. The owner checks it in Vercel |
| Scheduled mission steps and scheduled automations (daily, 09:00) | `src/app/api/cron/scheduled-runs/route.ts` → `runMissionStepForUser` | nobody (the result goes out by email and push) | **full price**, synchronous. Its prefix is cached, but it is not batched |
| Scheduled automation flows (cron every 15 minutes) | `src/app/api/cron/automation-flows/route.ts` → `src/lib/automations/runner.ts` | nobody for daily-or-slower flows. Event-triggered flows have someone waiting | **full price** |
| Lead classification when a site form is submitted | `src/lib/lead-classification.ts` | the owner is not watching, but the 15-minute lead reminders read the result | full price. Better as a cheaper model (§ c) than as a batch |
| Memory extraction after every chat turn | `src/lib/chat/memory.ts` | nobody, but the next turn should already know it | full price. A 24-hour delay would be a product change. Better as a cheaper model (§ c) |

The weekly digest (`src/app/api/weekly-digest/route.ts`) makes no model
call.

**Estimate.** The saving is `0.5 × monthly spend` of the rows marked
"nobody". That spend is a number in `ai_cost_log`
(`node scripts/db/model-spend.mjs`), and it was not run here. Turning
batch on for scheduled agents is an owner decision, because "a 07:00
briefing that starts arriving sometime before 07:00 tomorrow is a product
change" (`batch-policy.ts`). Extending batch to scheduled mission steps
and to daily automation flows is code, and it belongs to QUEUE E.3.

## (c) Routes that always use a strong model where routing could start cheap

    grep -rnE 'MODEL\s*=\s*"claude-' src --include=*.ts

Read call by call on 2026-11-05. **47 of the 52 calls name
`claude-sonnet-4-6` as a fixed constant.** The other five:

- `src/lib/agents/template-fill.ts` is on Haiku.
- Coding (`src/app/api/coding/run/route.ts`) takes the model from the
  person's power choice (`src/lib/coding/power.ts`: fast is Haiku, normal
  is Sonnet, max is Opus).
- Agents (`src/lib/agents/agent-runner.ts`, both calls, and the batch
  submit in `src/lib/ai/batch/batch-client.ts`) take the model from the
  depth set when the agent is built (`src/lib/agents/agent-depth.ts`).

The router exists and is **shadow only**: `src/lib/ai/routing/shadow.ts`
says "No request changes model because of this file". It records what it
*would* have chosen in `ai_cost_log.metadata.routing`, shown on
/dashboard/costs.

The candidates, by what the call outputs. Output type is what decides
whether a cheaper model is safe; `docs/v7-list.md` §2 made the first three
calls on 2026-09-25:

| Call site | Output | Verdict |
|---|---|---|
| `src/lib/lead-classification.ts` | a closed enum | **candidate**. No prose leaves it |
| `src/lib/import/map-columns.ts` | a column mapping, validated, confirmed by a person | **candidate** |
| `src/app/api/transitions/detect/route.ts` | an id from a closed list | candidate after a ten-language eval |
| `src/lib/chat/memory.ts` (extraction) | structured facts, Greek included | **candidate with the highest volume** of the background calls. Needs the quality set (QUEUE E.4), because a wrong memory is worse than none |
| `src/app/api/create-studio/detect/route.ts` | a forced tool call | **depends on output length**, worked below |
| translation, Greek spelling, security review | prose in a language; a safety verdict | **never** (v7-list §2) |

**Worked example: why "cheaper model" is not always cheaper.** Take the
Create Studio intake, now cached on Sonnet. Its 1,918-token prefix is
below Haiku's 4,096 minimum, so on Haiku the prefix is never cached.
Haiku is $1/$5 per MTok. Assume 50 fresh input tokens and *o* output
tokens:

    Sonnet, cache hit:  1,918×0.30 + 50×3 + o×15   (per 1M)  = $0.000725 + 15e-6·o
    Haiku, no cache:    1,918×1.00 + 50×1 + o×5    (per 1M)  = $0.001968 +  5e-6·o
    equal at o ≈ 124 output tokens

Below about 124 output tokens, Sonnet with its cache is cheaper than
Haiku. Above that, Haiku wins. **ESTIMATE:** the real output length is in
`ai_cost_log` (`output_tokens` for this feature). This is exactly the
comparison `comparedRequestCostUsd` in
`src/lib/ai/providers/cache-policy.ts` makes, and it is why the router
must leave shadow per feature only after the quality set (E.4) passes for
that feature.

## (d) Is there an answer cache for generic, non-personal questions?

**No cache of model answers exists.** What exists:

1. **Ready answers for product questions, with no model call at all.**
   `matchCannedAnswer` (`src/lib/support/knowledge-base.ts`) matches a
   message against the curated `help_articles` rows for the user's
   language. It is wired in `src/app/api/chat/route.ts` before the circuit
   breaker and before credits. Its two rules are no numbers that move
   (money questions go to /pricing) and nothing personal (first-person
   account questions fall through to the model). It never stores a model's
   answer, and it is already the right tool for "how do I…" questions
   about Ionexa itself.
2. **A measurement that said not to build a general one.**
   `docs/v7-list.md` §1: 0 repeats out of 4 questions, measured
   2026-09-25, against the owner's 5% threshold. "Re-measure when there
   are 1,000+ questions": `node scripts/db/question-repetition.mjs`.
3. **The owner's own spec for one**: `docs/BUILD-SPECS.md` 2.14, QUEUE
   E.6–E.8, not started. It covers a shared space and a personal space,
   a PII check, exact matching only, and a 25% charge.

## The proposed next build

**Order, cheapest certain saving first:**

1. **Model routing out of shadow, one feature at a time**: lead
   classification, then column mapping, then memory extraction, each only
   after E.4's quality set passes for it. Each feature is a model constant
   plus a gate, so the code cost is small. The saving is about two thirds
   of that feature's spend (Haiku $1/$5 against Sonnet $3/$15), minus the
   cache effect worked in § c.
2. **Batch for scheduled mission steps and daily-or-slower automation
   flows**: `src/app/api/cron/scheduled-runs/route.ts` and
   `src/lib/automations/runner.ts` join the eligibility test in
   `src/lib/ai/batch/batch-policy.ts`. Behind the same `AI_BATCH_ENABLED`
   and the owner's yes. The saving is 50% of their spend.
3. **The records-ask reorder**: put its 6,476 characters of constants
   before the record, then `buildCachedSystem`. It needs the same "prompt
   unchanged in meaning" care as Chat's split, so it gets its own round.
4. **The answer cache, last, and only if the measurement says so.**

### The answer cache, if built

**Precondition:** `node scripts/db/question-repetition.mjs` on at least
1,000 questions shows at least 5% exact repeats, the owner's threshold. If
it shows less, the cache is not built, and the help articles grow instead
(QUEUE H41.2).

Files:

| File | What |
|---|---|
| `supabase/migrations/<ts>_answer_cache.sql` (new) | `answer_cache_shared`: `key_hash`, `locale`, `tool`, `category`, `model`, `prompt_version`, `answer`, `created_at`, `expires_at NOT NULL`, `hits`, `negative_votes`. **No user-id column at all.** RLS on, no policies (deny-all; service role only). `answer_cache_personal`: the same plus `user_id` with `on delete cascade`, and RLS on own rows. Header `-- How to undo: drop table …` (`migration-undo.test.mjs`). |
| `key.ts` (new, pure, in a new `answer-cache` folder under `src/lib/`) | folds the question the way `public.search_fold` does (case, accents, spacing, trailing punctuation), then `sha256(fold ‖ locale ‖ tool ‖ model ‖ prompt_version)`. |
| `eligibility.ts` (new, pure, same folder) | decides **shared / personal-only / never**, from rules over the question, the answer, and the turn's own record of what it used. |
| `store.ts` (new, server-only, same folder) | get and put through the admin client; a read ignores `expires_at < now()`; an admin purge by key, by category, or all. |
| `src/app/api/chat/route.ts` | one branch after the canned-article branch: only a **new** conversation, no attachments, not Mentor Mode. The answer is served with a "ready answer" mark and an "ask again" button, charged at 25%, minimum 1 credit (2.14 Ε). |
| `src/lib/flags/flags.ts` | the switch `answer-cache`, starting at "you and the test account" (CLAUDE.md). |
| `answer-cache.test.mjs` and `answer-cache.mutation.mjs` (new, in `scripts/tests/`) | the rules below over at least 100 fixtures, Greek and English, half of them with personal data (2.14 Β). The DDL holds no user-id column in the shared table. `expires_at` is NOT NULL. Two locales never share a key. |

**The safety rules, each tied to the thing that enforces it:**

| Rule | Enforced by |
|---|---|
| **Never personal data** | eligibility: a rule layer on BOTH the question and the answer (email, phone, ΑΦΜ, IBAN, URL, a currency amount, a date of birth, a document number, a street address), plus the 2.14 Β small-model check for names. Any hit or doubt means not shared. The shared table has no user column, so who caused an entry cannot be recovered |
| **Never time-sensitive facts** | eligibility: no web search used in the turn; a deny list for dates and years, "today, σήμερα, now, latest", prices, news, law, tax, and medical, legal or financial advice (2.14 Γ). Creative work is never shared either: "ο χρήστης περιμένει κάτι δικό του" |
| **An expiry date** | `expires_at NOT NULL` in the DDL, held by the gate. Lengths are written in `docs/DECISIONS.md` (2.14 Γ leaves them to us). Changing the model or a prompt changes the key, so old entries are never matched again |
| **Keyed per language** | `locale` inside the hash and in its own column. The gate requires that the same text in `el` and `en` gives two keys |
| **Never across users for anything derived from user data** | eligibility: a turn that read memory, My Stuff, a project, a file, a connector, or earlier messages in the conversation is **personal-only**. A personal entry carries `user_id`, RLS lets only its owner read it, and account deletion cascades. A user cannot plant an answer: only model output that passed the checks is stored (2.14 ΣΤ) |

**Expected saving: ESTIMATE, arithmetic shown.** The model cost of one
eligible Chat turn is built from the measured prompt sizes in
`src/lib/ai/cached-system.ts`. A new conversation carries a 7,510-character
static prefix and a 5,857-character per-user block, both cached, about
3,342 tokens. Assume a 50-token question, a 500-token answer, and the
memory-extraction call (~368 + 300 input and 200 output tokens):

    answer  = 3,342×0.30 + 50×3 + 500×15   per 1M = $0.0087
    memory  =   668×3    + 200×15          per 1M = $0.0050
    c       ≈ $0.0137 per eligible turn

    saving per month = N × e × r × c
      N = chat turns per month, e = share eligible for the shared space,
      r = share of eligible turns that exactly repeat a live entry

    N = 10,000, e = 20%, r = 5%   →  100 turns × $0.0137 ≈ $1.37 per month
    N = 10,000, e = 20%, r = 20%  →  400 turns × $0.0137 ≈ $5.48 per month

e and r are assumptions. The only measured r is 0 of 4 (2026-09-25). The
75% credit discount that 2.14 Ε gives the user comes out of revenue on
those same turns. **On these numbers the answer cache is the smallest
lever of the four**, smaller than the Create Studio wire-up alone (≈ $38.6
per 10,000 calls at h = 0.8, § a). That is why it comes last and stays
behind its measurement.

---

## Facts: the terms on training with model outputs (read 2026-11-05)

- **Anthropic, Commercial Terms of Service, D.4 (effective 2025-06-17):**
  "Customer may not and must not attempt to (a) access the Services to
  build a competing product or service, including to train competing AI
  models or resell the Services except as expressly approved by
  Anthropic; (b) reverse engineer or duplicate the Services; or (c)
  support any third party's attempt at any of the conduct restricted in
  this sentence."
  <https://www.anthropic.com/legal/commercial-terms>
- **OpenAI, Services Agreement / Business Terms, §2(e):** customers may
  not "use Output (as defined below) to develop any artificial
  intelligence models that compete with our products and services." No
  effective date was printed on the page fetched.
  <https://openai.com/policies/business-terms>
- **xAI, Terms of Service (consumer), "What you cannot do":** "Using the
  Service or any Output, to develop models or services that compete with
  xAI". The page fetched labels itself "Effective: January 2, 2025
  (previous version)". The current Enterprise (API) terms could not be
  fetched on 2026-11-05, so re-check them before relying on this.
  <https://x.ai/terms-of-service>

**What follows for us:** every lever above lowers what we pay *for* a model
call, or makes fewer calls. None of them trains a model on any provider's
output, and none of them needs to. Whether storing an answer and serving it
again to our own users is within each provider's terms is a question for
the owner's lawyer before the answer cache ships. The clauses are quoted
above so that question can be asked precisely.
