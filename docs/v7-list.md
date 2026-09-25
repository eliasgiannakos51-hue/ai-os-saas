# V7 — the list

Opened 2026-09-25. Every number here is either dated at the point of use or
names the command that re-derives it, per CLAUDE.md. An undated number with
no source is the third thing, and it is the one that costs rounds.

## 1. Semantic cache — MEASURED AND NOT BUILT, 2026-09-25

    node scripts/db/question-repetition.mjs --sql    # the query, to paste
    node scripts/db/question-repetition.mjs          # with DATABASE_URL

**Measured 2026-09-25: 0 repeats out of 4 questions. 0%.**

The rule set before the measurement was "under 5% repetition, it is not
worth building". The answer came back at zero, so the cache is not built.
It would have been a permanent surface where one account's answer can
reach another, a fold to maintain, an invalidation story for every
time-bound question — for no measurable saving at all.

**This is the counter-example to the eight rounds that preceded it, and
that is why it is the first entry.** There, work was done and re-done
against a cause nobody had measured. Here the measurement came first and
said *don't*. The cheaper outcome is the one where nothing was built.

**Re-measure when there are 1,000+ questions.** The query is unchanged and
takes a second; four questions cannot tell you anything about repetition
whatever they say, and a 0% that comes from a sample of four is not
evidence that the rate is zero — it is evidence that nothing has been
measured yet. Run it again, and let the number decide again.

## 2. The margin levers that are left — the measurement, before any change

    node scripts/measure-prompt-cache-headroom.mjs   # static, no DB
    node scripts/db/model-spend.mjs --sql            # the query, to paste

The cache was lever #1 and it is gone. The other two are model choice and
prompt caching, and the first thing measuring them did was shrink one of
them by a factor of nine.

### Prompt caching: 2 call sites, not 18 — measured 2026-09-25

26 places call the Anthropic API; 8 set `cache_control` or go through
`buildCachedSystem`. The tempting number is *"18 are losses"*. It is a
ceiling wearing the clothes of an outcome — the exact shape
`docs/shapes.md` keeps an entry on. Anthropic will not cache a prefix
under **1,024 tokens**, and it does not error when you ask: it returns
`cache_creation_input_tokens: 0` and the marker reads like an optimisation
that works.

Measuring the static prefix of each uncached site (chars/3.6, or chars/2.2
where the prompt carries Greek, taking only the part before the first
`${}`):

| | sites | |
|---|---|---|
| over the threshold — worth changing | **2** | `agents/agent-builder` 2330 tok, `clarification` 1045 tok |
| near the line, estimate too crude to decide | 4 | `records/ask` 1004, `agents/agent-runner` 903, `create-studio/detect` 574, `text-actions` 553 |
| under half the threshold — would cache nothing | 12 | 484 tok down to 202 tok |

**2 of 18.** The estimate is crude on purpose and says so; it is triage
that names where to look, not a bill.

### Model choice: the candidates, and the ones that must not move

Sonnet is $3/$15 per MTok and Haiku $1/$5 (`lib/billing/model-pricing.ts`),
so a move down saves two thirds. 36 call sites request Sonnet today.

Sorted by what the task actually OUTPUTS, which is the only property that
decides whether a cheaper model is safe:

| call site | output | verdict |
|---|---|---|
| `lib/lead-classification.ts` | a closed enum (`genuine_interest \| question \| spam \| unclear`), validated against `VALID_CLASSIFICATIONS` | **candidate** — no prose leaves it |
| `lib/import/map-columns.ts` | a column→field mapping, validated against the target schema and shown to the person before it is applied | **candidate** — and a human confirms |
| `app/api/transitions/detect/route.ts` | an id from a closed list, re-checked by `destinationById()` | **candidate, but the judgement is cross-lingual** — its own prompt argues in Japanese and Greek. Needs a ten-language eval first |
| `lib/import/paste.ts` | rows that keep *"the user's own words and language"* | **no** — reproducing user text in their language is exactly where a cheap model writes English into a Greek answer |
| `lib/documents/translation.ts` | prose, in a target language | **never** |
| `lib/websites-greek-spelling-check.ts` | a judgement about Greek orthography | **never** |
| `lib/website-security-review.ts` | a safety verdict | **never** — the failure direction is not cost |

**NOTHING MOVES UNTIL THE SPEND IS MEASURED.** `scripts/db/model-spend.mjs`
ranks features by `real_cost_usd` against `credits_charged` over 30 days,
and reports the output/input ratio and whether cache reads are actually
landing. Two thirds of a feature nobody uses is nothing, and it is not
worth a quality risk in ten languages. This is the same discipline that
killed the cache: **measure the volume, then decide.**

**Any model change ships with evidence that quality held in Greek, Arabic
and Chinese**, not with an argument that it should have.
