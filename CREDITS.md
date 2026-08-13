# Credits and margin

Every Claude call costs real money. This document is the contract that
keeps each one profitable, and the short version is one sentence:

> **Never charge a fixed number of credits for an AI call.** Measure what
> the call actually cost and settle against the account's own per-credit
> price.

## Why a fixed number is always wrong

A credit is not worth the same to everyone. Plans sell them in bulk:

| Plan | Price | Credits | € per credit | 1 credit covers a call costing up to (at 4×) |
|---|---|---|---|---|
| Free | €0 | 100 | €0.0200 (list) | €0.00500 |
| Starter | €20 | 1,000 | €0.0200 | €0.00500 |
| Growth | €50 | 3,000 | €0.0167 | €0.00417 |
| Professional | €100 | 10,000 | €0.0100 | €0.00250 |
| Ultimate | €200 | 25,000 | €0.0080 | €0.00200 |
| Enterprise | custom | custom | €0.0200 (list) | €0.00500 |

Credit packs are cheaper still — the €100 / 8,000 pack is €0.0125 each.

So "1 credit per message" means something different on every plan. On
Ultimate one credit buys €0.008 of revenue, which at a 4× target allows a
call costing at most €0.002 (~$0.0022). A single small Sonnet turn —
1,000 input, 500 output — costs **$0.0105**. Five times over budget, on
the cheapest possible call. There is no flat number that works, because
the number would have to differ per plan and per request size.

## The formula

```
creditsCharged = ceil(realCostEur × marginMultiplier / effectiveCreditPriceEur)
```

`effectiveCreditPriceEur` is the **minimum** of the list price, the
account's plan rate, and the cheapest credit pack it has bought — the
cheapest euro a credit could have been sold for. Credits are fungible
once granted; there is no lot accounting that could tell a plan credit
from a pack credit at spend time, so taking the minimum is the only
choice that cannot under-charge.

`ceil` only ever rounds up, so `credits × price / cost ≥ multiplier`
holds by construction. That in turn bounds total AI spend at `1/M` of
revenue — 25% at 4× — no matter how a customer uses their allowance.

Both facts are asserted by brute force in
`scripts/tests/billing-coverage.test.mjs` (§5, §6).

### Which multiplier applies (lib/billing/margin-policy.ts)

`marginMultiplier` is resolved per settlement, not read straight from the
global default. Three inputs:

- the general `CREDIT_MARGIN_MULTIPLIER` (default 4);
- a **per-plan** margin — `CREDIT_MARGIN_<PLAN>`, with built-in defaults
  FREE 6, STARTER 5, GROWTH 4.5, PROFESSIONAL/ULTIMATE/ENTERPRISE 4;
- an optional **per-feature** override — `CREDIT_MARGIN_<FEATURE>`
  (e.g. `CREDIT_MARGIN_DEEP_RESEARCH=8`), with grouped aliases
  `CREDIT_MARGIN_CHAT`, `CREDIT_MARGIN_WEBSITE_GENERATE`,
  `CREDIT_MARGIN_DEEP_RESEARCH`, `CREDIT_MARGIN_AGENT_RUN` covering their
  related feature strings.

**The combination rule: `applied = max(general, plan, feature)`, never
below 4.** Each axis is a floor; taking anything but the highest floor
would let one override silently cancel the other's guarantee — the same
reasoning as `effectiveCreditPriceEur` taking the *minimum* price. Values
outside 4–10 are ignored with a warning. Every `ai_cost_log` row stores
the applied multiplier in `margin_multiplier` and records
`marginSource` (`general` | `plan` | `feature`) plus all three inputs in
its metadata, so a row explains its own price.

### Pricing the model that actually answered (lib/billing/model-pricing.ts)

`MODEL_PRICING_USD` must contain every model Anthropic can serve this
app, at list rates, with cache write (1.25× at the 5-minute TTL, **2× at
the 1-hour TTL**) and read (0.1×) rates. Anthropic reports both TTLs
inside one `cache_creation_input_tokens` total and separates them only in
`usage.cache_creation`, so pricing that total at the 5-minute rate
under-charges a 1-hour write by 37.5% — invisibly, because the stored
margin is computed from the same understated cost. `priceUsage` splits
the total by the breakdown and never adds the two together. Every
`costs.record()` call site passes `response.model`, not the constant the
code requested — so an upgraded or aliased model is priced at what really
served the call. Usage from a model the table does not know is priced at
the most expensive known rates AND raises `billing:unknownModelPricing`
plus the margin alert email: the stored margin is computed from the same
guessed cost and *always looks healthy*, so the guess itself is the only
observable failure. This is exactly how a $0.10 chat message once settled
for 2 credits (0.17×) without a single alert — reproduced and pinned in
`scripts/tests/pricing-margin-bug.test.mjs`.

## What a new AI feature must do

1. Create a `CostAccumulator`.
2. Estimate and **reserve** before calling Claude
   (`estimateForAction` + `reserveCredits`), so a user cannot start work
   they cannot pay for.
3. `costs.record(stage, response.usage, MODEL)` for **every** call,
   including retries and continuation rounds. Every field of Anthropic's
   `Usage` is accounted for — input, output,
   `cache_creation_input_tokens` (1.25× input, or 2× for the 1-hour slice
   reported in `cache_creation`) and `cache_read_input_tokens` (0.1×
   input) — plus web searches at $10/1,000. Missing a sub-call means it
   comes out of margin.
   `scripts/tests/usage-field-coverage.test.mjs` reads the installed
   SDK's `Usage` interface and fails the build if a field exists that
   nothing prices, so an SDK upgrade that adds a billable field cannot
   land silently.

   **One user action, one feature name.** If a job can end in two
   structurally different ways — a cheap pre-check that returns questions
   and an expensive run that produces the thing — settle them under
   *different* feature names (`JobHandlerResult.feature`), the way
   `agent_build` / `agent_build_precheck` and
   `website_generate` / `website_generate_precheck` do. Sharing one name
   averages a €0.001 row with a €0.03 row, and because the user answers
   the questions and resubmits, one action then writes two rows each
   holding half the interaction's cost. Every row is still margin-
   guaranteed, but comparing one of them against the Anthropic Console's
   total for the interaction reads as *half the margin* — which is
   precisely the "agent_build is 2.03×" report reproduced in
   `scripts/tests/agent-build-margin.test.mjs`. Register the new name in
   `FEATURE_MARGIN_GROUPS` so it shares its parent's `CREDIT_MARGIN_*`
   variable.
4. On success, `settleReservation({ userId, reservationId, feature,
   costs, plan, ... })`, passing the plan from
   `resolveEffectivePlan(user)`. Settlement resolves the account's rate,
   charges, releases the hold and writes the `ai_cost_log` row in one
   transaction.
5. On failure, `releaseReservation` — the user is not charged for work
   they did not receive. Note that this is a **real loss**: we paid
   Anthropic. Failures are a margin problem, not just a UX one, which is
   why the Website Builder recovers an interrupted generation instead of
   discarding it.

Add the model to `MODEL_PRICING_USD` in `lib/billing/model-pricing.ts`
if it is not there. An unknown model falls back to the most expensive
known one — over-charging slightly is the safe direction to fail in.

## What enforces this

- **`scripts/tests/billing-coverage.test.mjs`** inventories every
  `messages.create` / `messages.stream` in `src/` and fails on any that
  is not declared with its billing mode. It runs inside `npm run build`
  (via `test:unit`), so a feature that does not say how it bills cannot
  be deployed. It also brute-forces margin over plan × pack × cost.
- **`scripts/tests/website-margin-real-numbers.test.mjs`** prices real
  production rows by hand and checks each token type reaches the cost.
- **Runtime.** `settleReservation` logs `billing:marginBelowTarget` if an
  achieved margin ever lands under the multiplier.
- **Config floors.** `CREDIT_MARGIN_MULTIPLIER` cannot be set below 4,
  and `USD_TO_EUR_RATE` cannot be set below 0.85 — a low FX rate
  understates the euro cost the multiplier is applied to, and the damage
  is invisible from the settled row because the stored `achieved_margin`
  is measured against the same understated euros.

## Agents: the one feature that spends money unattended

Every other AI action in this app costs credits because a human just
clicked something. An autonomous agent (`/dashboard/agents`) costs them at
08:00 every morning for as long as the account exists, with nobody
watching. That changes three things about how it bills:

- **The hold covers retries, not one attempt.** An execution retries up to
  `AGENT_MAX_ATTEMPTS` (3) times on a transient failure, and settlement
  charges the measured usage of *every* attempt from one `CostAccumulator`.
  So `estimateAgentRun` reserves `reserveCredits x AGENT_MAX_ATTEMPTS`. A
  hold sized for a single attempt would let a retried run charge more than
  was ever held, which is precisely the balance-goes-negative case the
  three-phase flow exists to prevent. The remainder is released at
  settlement, so over-holding costs the user nothing.
- **A failed run still settles.** Every attempt spent real tokens. A failed
  run that released instead of settling would be spend the margin report
  cannot see.
- **Fair use is a cost control, not a packaging decision.** The per-plan
  agent counts (`AGENT_LIMIT_*`) cap how many recurring schedules an
  account can own; `AGENT_MAX_RUNS_PER_HOUR` caps how hard it can drive
  them; and a schedule may not fire more than once an hour, enforced in the
  cron expression itself. Free is zero agents for the same reason.

## Known gaps

None. Every `messages.create` / `messages.stream` in `src/` reserves,
records measured usage and settles at the account's own per-credit rate.
`billing-coverage.test.mjs` asserts that count is 13 settled, 0 flat, 0
unbilled, and the build fails if a new call site appears undeclared.

Two of them are worth knowing about because their shape is unusual:

- **`lib/lead-classification.ts`** is reached from the **public**
  `api/websites/[id]/submit-form`, so there is no caller to charge. It
  settles against the site **owner** — who the triage is for. A
  stranger's form POST cannot hold the owner's credits while it runs, so
  solvency is checked *before* the call rather than reserved; an owner
  who cannot pay gets the submission without a priority tag, and the
  visitor's form never fails. A per-website hourly cap and a honeypot
  bound the volume.
- **`lib/chat/memory.ts`** is a second Claude call on every chat turn. It
  runs *before* `settleReservation` and records onto the same
  accumulator, so one chat turn is one charge covering both calls. The
  `chatMessage` estimate profile carries an auxiliary call for it — if it
  did not, every hold would be short by exactly one Claude call.

## The environment

`lib/env-check.ts` reports, once at startup via `src/instrumentation.ts`,
which variables are missing and which are set to something suspicious. It
runs at **runtime only** and never throws: env validation that can fail a
build is worse than the problem it solves.

Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SITE_URL`.

Recommended: `USD_TO_EUR_RATE` (0.92), `CREDIT_MARGIN_MULTIPLIER` (4),
`CREDIT_PRICE_EUR` (0.02), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`CRON_SECRET`, `RESEND_API_KEY`.

Margin policy (all optional, range 4–10, invalid values warn and fall
back): `CREDIT_MARGIN_FREE` (6), `CREDIT_MARGIN_STARTER` (5),
`CREDIT_MARGIN_GROWTH` (4.5), `CREDIT_MARGIN_PROFESSIONAL` (4),
`CREDIT_MARGIN_ULTIMATE` (4), `CREDIT_MARGIN_ENTERPRISE` (4), and
`CREDIT_MARGIN_<FEATURE>` per feature (e.g. `CREDIT_MARGIN_CHAT`,
`CREDIT_MARGIN_WEBSITE_GENERATE`, `CREDIT_MARGIN_DEEP_RESEARCH`,
`CREDIT_MARGIN_AGENT_RUN`).

Free chat: `FREE_CHAT_MAX_COST_EUR` (0.02) — the marginal-cost ceiling a
message must fit under to spend a free-chat grant; larger messages take
the paid path and the client is told the estimated charge.

The three pricing knobs have defaults, which is why a wrong value is more
dangerous than a missing one — `USD_TO_EUR_RATE=0.80` charged 45 credits
where 52 was correct while every settled row still reported a healthy
margin. Values outside their sane range are rejected in favour of the
default *and* flagged at startup.
