# The cache that already exists, and the number nobody has

The brief's rule — *does it need the user's data? No → shared answer; Yes →
fresh call* — is already implemented in this repository, has been shipped
in ten languages, and is enforced by a build gate. This document measures
how well it works, and then answers the four questions the brief says to
answer before building anything more.

One of those four I **cannot** answer, and saying so is the first thing
this document does.

Nothing here is implemented.

---

## 0. The precondition: can the repeat rate even be measured?

The brief's own gate is "if under 5%, it is not worth it". So before
anything else: **is that number obtainable?**

**Yes.** `chat_messages` in the baseline schema keeps the question
verbatim:

```sql
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
```

with an index on `(user_id, created_at)`. Nothing purges it.

**And I cannot run the query** — this environment has no database
credentials. So the one number that decides whether to build a cache at
all is the one number missing from this document. Here is the query, which
is the deliverable in its place:

```sql
-- GLOBAL repeat rate: the same question asked by ANY user, normalised the
-- way the matcher normalises (lower, unaccented, punctuation to spaces).
with q as (
  select lower(regexp_replace(unaccent(content), '[^[:alnum:] ]+', ' ', 'g')) as norm
  from public.chat_messages
  where role = 'user'
    and created_at > now() - interval '90 days'
    and length(content) between 8 and 300      -- a lookup, not a conversation
)
select
  count(*)                                             as questions,
  count(*) - count(distinct norm)                      as repeats,
  round(100.0 * (count(*) - count(distinct norm)) / nullif(count(*), 0), 1) as repeat_pct
from q;
```

And the one that says whether it is worth it *per question*, which matters
more than the aggregate — a 3% overall rate made entirely of one question
asked a thousand times is worth caching, and a 20% rate spread evenly is
not:

```sql
with q as (
  select lower(regexp_replace(unaccent(content), '[^[:alnum:] ]+', ' ', 'g')) as norm
  from public.chat_messages
  where role = 'user' and created_at > now() - interval '90 days'
    and length(content) between 8 and 300
)
select norm, count(*) as asked, count(distinct 1) as _
from q group by norm having count(*) > 2 order by asked desc limit 50;
```

Run either against the same database `npm run db:pending` talks to.

Everything below is what *can* be measured without it.

---

## 1. The cache that already ships

`src/lib/support/knowledge-base.ts` plus
`supabase/migrations/20260816_help_articles_seed.sql`. It answers a
question with a fixed string and makes **no model call at all** — not a
cached prompt prefix, an actual bypass — and `src/app/api/chat/route.ts`
consults it before the model.

**Measured from the seed: 166 rows in 10 locales** — `en=27, el=27` and 14
each in `es, fr, de, it, pt, zh, ja, ar`. The header states the design:
English is complete because it is the fallback; the other eight carry the
14 core articles and fall back to English "visibly, with a marker and a
lang attribute, never silently".

### It is safe: 22 of 22 account-specific probes were refused

Twenty-two first-person, possessive questions — the exact shape the brief
says must never be cached — put through the real `matchCannedAnswer` with
the real seeded triggers for their own locale:

```
locale  guard   matched?   question
  es      -       no       cuántos créditos tengo
  es      -       no       mis créditos
  fr    CAUGHT    no       mes crédits
  de      -       no       wie viele credits habe ich
  it      -       no       quanti crediti ho
  pt      -       no       quantos créditos tenho
  zh      -       no       我的额度
  ja      -       no       私のクレジット
  ar      -       no       كم رصيدي
  el    CAUGHT    no       τα credits μου
  en    CAUGHT    no       how many credits do i have
  …
0 of 22 account-specific probes received a canned answer.
```

**And the reason is not the guard.** `isAccountSpecific` carries
`ACCOUNT_SPECIFIC_MARKERS`, 22 terms in Greek and English only, and it
fires on just 6 of the 22 probes — three of those by accident, because
`n.includes("me")` is true inside French *mes*, German *meine* and
Portuguese *meus*. Substring matching happening to be right is not the
same as being right.

What actually holds the line is the **confidence threshold**:

```ts
const coverage    = t.length / n.length;
const specificity = Math.min(1, t.split(" ").length / 2);
const confidence  = Math.min(1, coverage * 0.75 + specificity * 0.45);
// … best.confidence >= 0.85
```

A one-word trigger caps specificity at 0.5, contributing 0.225, so it needs
`coverage ≥ 0.833` — the trigger must be five-sixths of the message by
characters. "cuántos créditos tengo" gives the trigger `créditos` a
coverage of about a third, and it scores ~0.50 against a bar of 0.85.

That is a real defence and it is the right one, because it does not depend
on enumerating pronouns in ten languages. It is worth writing down
explicitly, though, because the file's own comment credits
`isAccountSpecific` with the job, and eight locales have no markers at all.

### It under-covers, which is the safe direction

Eleven genuinely general questions, one per locale plus two extra:

```
  en  YES  1.000  pricing-overview    how much does it cost
  en  YES  1.000  cancel              how do i cancel
  el  YES  1.000  pricing-overview    ποσο κοστιζει
  es  YES  1.000  what-are-credits    qué son los créditos
  fr  no     -    -                   comment annuler
  de  YES  1.000  what-are-credits    was sind credits
  it  no     -    -                   cosa sono i crediti
  pt  YES  1.000  what-are-credits    o que são créditos
  zh  YES  0.975  what-are-credits    什么是额度
  ja  YES  0.975  what-are-credits    クレジットとは
  ar  no     -    -                   ما هي الأرصدة

8 of 11 general questions answered without a model call.
```

Three real, general, answerable questions fell through to the model —
French *comment annuler*, Italian *cosa sono i crediti*, Arabic *ما هي
الأرصدة* — because those locales' trigger lists do not carry those
phrasings. That is a **coverage** gap, not a safety gap, and it is the
brief's own safe default working: when unsure, do not cache.

---

## 2. Exact match or semantic?

Three options, and their costs are very different because one of them
spends money to decide whether it can save money.

### Exact — free today, and half-built

`src/lib/request-fingerprint.ts` is already a stable exact key:

```ts
export function fingerprintRequest(...parts): string {
  const normalized = parts.map((p) => p ?? "").join(" ");
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}
```

Every AI route already computes one, for the identical-request breaker. It
is **not usable as a global cache key as it stands**, for one reason:
`checkIdenticalRequestBreaker` builds its identifier as
`` `${userId}:${endpoint}:${fingerprint}` `` — the user is *in* the key, so
it can only ever see one person repeating themselves. A global cache needs
the same hash without the user id, which is the whole change.

Note also that the breaker's rows live in `rate_limit_log` and the daily
cron deletes anything older than 24 hours, so that table can never answer
the repeat-rate question. `chat_messages` can (§0).

### Semantic — no infrastructure exists

Installed extensions across every migration: `pgcrypto`, `unaccent`,
`pg_trgm`. **There is no `pgvector`, no `vector` column and no embedding
provider wired anywhere.** The only mention is a forward-looking note in
`supabase/migrations/20260824000000_unified_search.sql` describing what a
future version *would* add.

The economics are the argument, not the missing extension: a semantic cache
must embed **every incoming question** to look it up, so it pays a model
call on every MISS as well as every hit. Below some hit rate it is strictly
more expensive than no cache at all — and §0 says nobody knows the hit rate
yet. Exact match is the only shape whose break-even does not depend on a
number this project does not have.

### The middle, which is already installed

`pg_trgm` and `tsvector` are in the database today and already back unified
search. Trigram similarity gives "the same question with a typo or a
different word order" without an embedding call, without a new extension,
and without a by-hand migration to install one. If exact match proves too
narrow, this is the next step, not vectors.

---

## 3. Storage cost per type

Answer sizes from `ACTION_PROFILES`, key at 32 characters, 40 bytes of row
overhead. The "saved per hit" column prices the output tokens plus a
typical 600-token input at Sonnet 4.6 rates.

| type | answer | row | 100k rows | 1M rows | saved per hit | hits to pay for 1 GB-month* |
|---|---|---|---|---|---|---|
| chat reply | 2,000 B | 2,072 B | 198 MB | 1.93 GB | $0.00930 | 13 |
| a canned answer | 260 B | 332 B | 32 MB | 0.31 GB | $0.00277 | 45 |
| transition detect | 120 B | 192 B | 18 MB | 0.18 GB | $0.00225 | 56 |
| create classification | 800 B | 872 B | 83 MB | 0.81 GB | $0.00480 | 26 |
| website generate | 34,000 B | 34,072 B | 3.2 GB | 31.7 GB | $0.12930 | 1 |

\* $0.125/GB-month is a **stated assumption**, not a figure read off an
invoice.

**Storage is not the constraint.** Thirteen to fifty-six cache hits pay for
a gigabyte-month, and a million cached chat replies is under 2 GB. The
constraint is correctness: every row is an answer that can go stale, and
the only entry that is genuinely large — a generated website — is also the
one that must never be shared, because two users asking for "a website for
my bakery" must not receive the same bakery.

---

## 4. What never goes in

The brief names three: *"now"*, *"today"*, agents. The repository's own
list is broader, and one of its rules is machine-enforced.

| never cached | why | enforced by |
|---|---|---|
| anything account-specific | "A canned answer is identical for every user, so it may only ever answer a question about the PRODUCT." | `isAccountSpecific` + the 0.85 threshold (§1) |
| **any number that can move** | "a stale number in a canned answer is worse than no answer at all — it is a quote the user will hold us to" | `scripts/tests/canned-answers.test.mjs` — a digit scan over every body, and the generator refuses to emit a digit |
| anything with a person waiting on freshness | — | not enforced; see below |
| agent output | it is delivered, and delivery is irreversible (`docs/tool-registry.md` grade A) | not enforced |

The digit rule is the one the brief does not name and the one most worth
keeping: it is stricter than "no prices", it is checked in the build, and
its rationale is that a wrong cached answer costs more than the call it
saved.

**What is not enforced anywhere: time.** The concept exists — but as a
sentence asking a model to judge, not as a rule. `src/lib/agents/agent-builder.ts`
tells the builder to set `needsWebSearch` *"true when the task depends on
information that changes — news, prices, releases, competitors, anything
«latest» or «today»"*. That is the right instinct, aimed at a different
decision (whether to search), and it is a model's opinion rather than a
refusal.

Searched across `src/lib`, the only other hits for *today* / *σήμερα* /
*τώρα* / *now* are date arithmetic in `src/lib/ai-circuit-breaker.ts`,
prompt-injection patterns, and crisis wording in `src/lib/ai-conduct.ts`.
**No deterministic time guard exists.**

Today that is harmless: the 166 canned articles are product documentation
with no temporal content, and the threshold keeps them narrow. It stops
being harmless the moment anything else is cached, and a time-word refusal
is the cheapest possible rule — a word list, applied before lookup, failing
towards *do not cache*, in the shape `parseRuleParams` already uses:
reject rather than repair.

---

## 5. The safe default, and where it already points

The brief's rule — *if you are not SURE it is general, do not cache* — is
implemented as a threshold rather than as a classifier, and that is why it
holds in eight languages whose pronouns nobody enumerated. Three general
questions being missed (§1) is the price, and it is the correct price.

Given §0, the honest order of work is:

1. **Run the two queries.** If the global repeat rate is under 5%, the
   brief's own gate says stop, and the answer is to widen the canned-answer
   triggers in `fr`, `it` and `ar` instead — that is a content change with
   no new machinery and a measured 3-question gap to close.
2. **If it is above 5%,** the cheapest correct build is exact-match on the
   existing `fingerprintRequest` with the user id removed from the key,
   scoped to the tools that take no user data at all — and
   `docs/tool-registry.md` is the list of which those are.
3. **Semantic is last, not first,** because it spends per miss and the miss
   rate is the unknown.

---

## 6. What the measurement found

### The guard is credited with work the threshold does

`isAccountSpecific` fired on 6 of 22 account-specific probes; the other 16
were stopped by the 0.85 confidence bar. Three of the six were caught by
substring accident (`"me"` inside *mes*, *meine*, *meus*), which is the
substring-matching trap this repository already has a rule about. The
defence is sound; the file's comment attributes it to the wrong mechanism,
and eight of the ten seeded locales have no markers of their own.

### Two errors in my own instruments this round, both caught before shipping

- The probe's seed parser read `'([a-z]+)'` for the category column and
  silently dropped every `getting-started` row — **152 of 166**, one core
  article per locale and three each in `en`/`el`. Had it stayed, "0 of 22
  leaked" would have been a claim about 92% of the corpus presented as a
  claim about all of it. Fixed to `[a-z-]+`; the numbers above are over all
  166.
- The storage table's first version computed megabytes as `bytes / 1e6`
  **per row** and printed "a million cached chat replies is about 0.0 MB".
  It is 1.93 GB. An instrument that reports 0.0 for two gigabytes is the
  exact shape `CLAUDE.md` is about, and it existed for one command.

---

**ΝΕΑ MIGRATIONS ΝΑ ΤΡΕΞΕΙΣ: καμία**
