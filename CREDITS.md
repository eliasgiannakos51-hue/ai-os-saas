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

## What a new AI feature must do

1. Create a `CostAccumulator`.
2. Estimate and **reserve** before calling Claude
   (`estimateForAction` + `reserveCredits`), so a user cannot start work
   they cannot pay for.
3. `costs.record(stage, response.usage, MODEL)` for **every** call,
   including retries and continuation rounds. All four token types are
   priced — input, output, `cache_creation_input_tokens` (1.25× input)
   and `cache_read_input_tokens` (0.1× input) — plus web searches at
   $10/1,000. Missing a sub-call means it comes out of margin.
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

## Known gaps

These predate the settlement system and are **not** margin-guaranteed.
They are listed in `billing-coverage.test.mjs` so the count cannot grow
silently, and each needs converting to reserve/settle:

| Where | Charge | Problem |
|---|---|---|
| `api/records/ask` | flat 1 credit | Ask-AI sends a whole record as context; on Ultimate that is €0.008 of revenue. |
| `api/text-actions` | flat 1 credit | Same. |
| `api/reflection/generate` | flat 2 credits | Records no usage at all. |
| `lib/chat/memory.ts` | none | Memory extraction inside a chat turn; only a call *count* reaches the circuit breaker. |
| `lib/lead-classification.ts` | none | Reached from `api/websites/[id]/submit-form`, which is **public** — an anonymous visitor triggers a Claude call no account pays for and no balance bounds. |
