# Model tiers

Four tiers, one file (`models.ts`), every AI feature resolves through it.
Prices per million tokens, verified 2026-08-07 against Anthropic's
published pricing; the billing copies live in
`src/lib/billing/model-pricing.ts` and **must change in the same commit**
as any model change here — `scripts/tests/model-coverage.test.mjs` fails
the build otherwise.

| Tier | Default model | Input / Output $/MTok | Env var |
|---|---|---|---|
| MAX | `claude-fable-5` | 10 / 50 | `ANTHROPIC_MODEL_MAX` |
| PREMIUM | `claude-opus-5` | 5 / 25 | `ANTHROPIC_MODEL_PREMIUM` |
| STANDARD | `claude-sonnet-5` | 3 / 15 | `ANTHROPIC_MODEL_STANDARD` |
| FAST | `claude-haiku-4-5-20251001` | 1 / 5 | `ANTHROPIC_MODEL_FAST` |

Cache write is 1.25× input (5-minute TTL), cache read 0.1× input.
`claude-opus-4-8` is also priced (5/25): it is Fable's safety-routing
fallback target, so responses can name it even though no code requests it.

## Who uses what, and why

| Feature | Tier | Why |
|---|---|---|
| Deep Research (plan / question / synthesis) | MAX | Multi-source synthesis and long-horizon reasoning — the shape where the strongest model's output is visibly different. Priced into the action. |
| Mission planning — complex goals (>600 chars) | MAX | A long goal carries constraints and sub-goals; decomposition quality is the product. |
| Website Builder — complex briefs (>2500 chars or ≥3 reference images) | MAX | A spec-like brief with art direction needs the strongest planner. |
| Website Builder — normal | PREMIUM | The deliverable the user pays credits for. |
| Website editing (incl. live editing) | PREMIUM | Changes a paid deliverable; the hard planning happened at generation. |
| Presentations (generate / edit) | PREMIUM | Deliverable. |
| Agents (builder / runner), mission execution | PREMIUM | Autonomous work products. |
| Mission planning — normal goals | PREMIUM | Short goals plan equally well one tier down. |
| Chat, Create Anything, File Q&A, module Q&A, text actions, reflections, website security review | STANDARD | Conversational/analytical work where Sonnet 5 is near-Opus at 60% of the price. |
| Classification (website / create-studio), clarifying checks, lead scoring, chat memory, support chat | FAST | Closed-set decisions; a stronger model returns the same label at 5–10× the cost. |

## Dynamic selection

The complexity rule lives in `models.ts` **only** —
`selectWebsiteBuilderModel({descriptionChars, imageCount})` and
`selectMissionPlannerModel({goalChars})` — and is used by the server call,
the server reserve estimate, and the browser preview estimate, so all
three always price the same model. Thresholds:

- Website: description > **2500 chars** OR reference images ≥ **3** → MAX.
- Mission: goal > **600 chars** → MAX.

## Fable (MAX) call-site contract

Every MAX call site must:

1. **Never configure `thinking` or `temperature`** — Fable rejects both.
2. **Check `stop_reason === "refusal"`** (HTTP 200, safety classifiers)
   and retry once on PREMIUM. A refused-before-output attempt is not
   billed by Anthropic.
3. **Settle from `response.model`, never the requested constant** — under
   safety routing the response can come from another model, and pricing
   the requested one charges the wrong rate invisibly. This rule is
   enforced repo-wide by the gate: every `costs.record(...)` must pass
   `response.model ?? FALLBACK`.

## Adding a new feature

Pick the tier by the work's shape, not its prestige: deliverables →
PREMIUM; conversation/analysis → STANDARD; closed-set decisions → FAST;
MAX only where multi-source synthesis or long-horizon planning is the
product and the action's price carries it. Resolve via
`modelForTier(...)`, record costs with `response.model ?? model`, and if
you introduce a new model id, add its pricing in the same commit — the
gate will hold the door.

## User visibility

Users never pick a model. When an action ran on MAX, the usage receipt
carries `modelTier: "max"` and the credits toast appends "· advanced
model" — enough to explain why a complex brief cost more than a simple
one, without asking anyone to learn model names.
