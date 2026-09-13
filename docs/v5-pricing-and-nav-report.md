# The feature inventory, the pricing page, the sidebar — and the voice ceiling

**2026-09-12 and 2026-09-13.** Every number below is either dated at the
point of use or names the command that reprints it. Nothing here is an
estimate.

---

## 0. The question asked first: what does the voice path actually hold?

The brief said: *"Πες μου ΠΡΩΤΑ τι μέτρησες… Χωρίς αυτά δεν διαλέγω
σχήμα — διαλέγω στα τυφλά."* So, before any shape.

### Where it stops, exactly

| Ceiling | Value | Where it lives |
|---|---|---|
| **One recording** | **120 seconds** | `MAX_CLIP_SECONDS`, `src/lib/voice/voice-pricing.ts` |
| **One upload** | **2 MiB** (2,097,152 bytes) | `MAX_AUDIO_BYTES`, `src/lib/voice/voice-config.ts` |
| The recorder stops itself at | 120 s | `src/components/voice/use-recorder.ts` |
| A conversational turn ends at | 30 s | `SILENCE.maxTurnMs`, `voice-config.ts` |
| Route timeout | **60 s** | `maxDuration`, `src/app/api/voice/transcribe/route.ts` |
| Provider timeout | **20 s** | `PROVIDER_TIMEOUT_MS`, `src/lib/voice/voice-providers.ts` |
| Host request-body limit | **~4.5 MB** | not ours — Vercel's, and already written down in `src/app/api/files/upload/route.ts` and `src/lib/files/file-types.ts` |
| Whisper's own file limit | 25 MB | OpenAI's published limit. **Not measured here and not in our code** — we never get near it |
| Rate limit | 120 recordings / hour / user | `checkRateLimit` in the transcribe route |

**So the answer to "πού ακριβώς δεν χωράνε" is: at two minutes, and at
two megabytes, and neither is the platform's fault.** The 60-second
route timeout and the ~4.5 MB host body limit sit *behind* our own
ceilings and have never been the binding constraint. A meeting does not
fail at the edge of what the stack can do; it fails at a number this
repository chose, for a reason its comment states — a tab left recording
would otherwise stream a room to a transcription API until the browser
was closed.

### How many minutes fit

**Two.** That is the whole answer for one recording. Per month, by plan
(`DEFAULT_VOICE_MINUTE_LIMITS`, enforced atomically before the provider
is called): Free **0**, Starter **30**, Growth **90**, Professional
**300**, Ultimate **900**, Enterprise **2000**.

### The largest file that has been through end to end

**—.** Not measured, and not guessable. There is no record of a
transcription of any length having run against the real provider from
this environment: `OPENAI_API_KEY` is a sentinel here, and the same
API-balance blocker that has held items 2 and 3 of `v5-list.md` holds
this. A dash rather than a number, per the rule.

### What a recording at the ceiling costs

Computed by the shipped functions (`transcribeCostUsd`, `voiceCredits`)
against the shipped config (`creditPriceEur` €0.02, margin ×4, USD→EUR
0.92) — re-derivable, not typed in:

| Length | Provider cost | Charged |
|---|---|---|
| 120 s (the current ceiling) | **$0.012** | **3 credits** (€0.06) |
| 60 minutes | **$0.36** | **67 credits** (€1.34) |
| 90 minutes | **$0.54** | **100 credits** (€2.00) |

Whisper is $0.006/minute. **An hour of audio costs thirty-six cents.**
That is the number that decides the shape, and it is the reason the
answer below is not "60 minutes instead of 90".

### The options, with the cost and the risk of each

**There is no "Meetings" feature to extend.** `grep -ril meeting src/`
returns three files, all incidental prose. The 120-second clip is a chat
composer input, not a truncated meeting recorder. So this is not a
question about raising a limit; it is a question about which shape to
build. Four, in order of cost:

**(A) Raise the clip ceiling to 10 minutes and the byte cap to 12 MB.**
*Cost:* two constants and a gate update. *What it buys:* dictation, a
voice note, a phone call summary. *What it does not buy:* a meeting.
*Risk:* low, and bounded — 10 minutes is 6 cents of provider cost and 17
credits, and the per-month cap still holds. The 60-second route timeout
becomes the binding constraint (Whisper takes roughly a tenth of
real-time, so 10 minutes is ~60 s of provider time plus the upload): it
would need raising to 300, which Vercel allows on the paid plan the
project is already on.

**(B) Direct-to-storage upload + a background job.** The file goes
browser → Supabase Storage with a signed URL (the pattern
`api/files/register` already uses, and the one that exists *because* of
the ~4.5 MB body limit), then a job transcribes it in chunks and writes
the transcript. *Cost:* a table, a job type, a worker, an upload UI and
a progress screen — a week, not an afternoon; the job infrastructure
(`api/jobs/*`, `api/cron/*`) is already there. *What it buys:* an
arbitrary length, 90 minutes included, at 54 cents. *Risk:* the
transcript is the cheap half. The expensive half is what the brief
actually wants — "οι αποφάσεις μιας συνάντησης λέγονται στο τέλος" —
which is a summarisation pass over 90 minutes of text, and that is a
model call priced per token, not per minute.

**(C) Chunked transcription inside the request.** Split the audio in the
browser into ≤2-minute pieces and post them in sequence. *Cost:* a day.
*Risk:* **this is the option to refuse.** A chunk boundary falls
mid-sentence, Whisper has no context across chunks, and the failure mode
is a transcript that is 95% right and silently wrong at every boundary —
"σιωπηλή απώλεια που μοιάζει με αποτέλεσμα", rule 27, in its purest
form. If it is done at all it needs overlapping windows and a
reconciliation pass, which is most of (B)'s cost without (B)'s honesty.

**(D) Do nothing, and say so.** *Cost:* nothing. *Risk:* a feature the
sidebar now holds a position for (`/dashboard/meetings`, `notBuilt`)
stays unbuilt, visibly, which is the honest state.

**The recommendation is (A) now and (B) when a meeting feature is
actually scheduled** — because (A) is two constants and covers every
use the current UI has, and because at 36 cents an hour the provider
cost is not what makes (B) expensive. What makes (B) expensive is the
part nobody has specified yet: what a meeting produces.

**And the thing the brief already ruled out is already ruled out.** The
route does not truncate. A clip over the ceiling is refused with
`too_large` and a 413, and one over the minute cap with `out_of_minutes`
and a 402 — a named refusal, never a silent cut.

---

## 1. The inventory: what exists, who may use it, what bounds it

`node scripts/tests/feature-catalog.test.mjs` prints and asserts all of
these. **Measured 2026-09-12, and sections 6 and 7 below changed several
of them the next day** — this section is left as it was taken, because
it is the record of what was found. Where a figure has moved, section 7
carries the current one and the command that reprints it.

- **136** API routes. **28** spend credits. **3** read a plan capability:
  `api/chat`, `api/modules/create`, `api/team/invite`.
- **44** pages under `/dashboard`. **8** are plan-aware.
- `PlanCapabilities` has **6** fields. `maxAiAgents` and
  `chatMemoryLimit` are the two the owner already knew about;
  `websiteBuilder`, `aiMemory`, `teamCollaboration` and
  `customAiPersona` gate one screen each.
- **Nine** per-plan ceilings live outside `PlanCapabilities` entirely:
  agents, files, storage, Deep Research runs, integrations, published
  sites, voice minutes, chat pins, website photo storage.

### How many features is everybody getting anyway

**26 of the 43 published rows are available on every plan, Free
included.** That is the answer to "γιατί ένας Ultimate θα πλήρωνε 10×".
The honest form of it: **on this product, the tier does not mostly
decide WHAT you can do — it decides HOW MUCH.** Seventeen rows are
gated; the rest differ by a number or not at all.

Whether that is the right commercial answer is not a thing a test can
hold, and **the 2026-09-12 round did not change a single tier** — it
made the question answerable in one file, and unanswerable silently.
The tiering itself was approved and applied on 2026-09-13; section 7.

### The limits that were invisible

| Limit | Range | Enforced | Was on the pricing page |
|---|---|---|---|
| Voice minutes / month | 0 → 2000 | yes, atomically, before the provider call | **no** |
| Pinned conversations | 3 → 100 | yes, `api/conversations/[id]` | **no** |
| Website photo storage | 50 MB → 100 GB | **advisory only** — a browser-side check plus a nightly cleanup, and `website-builder-workspace.tsx` says so in its own comment | **no** |
| Rows shown in one list | 500, every plan | yes, and the page says when it is capped | no |
| Live edits per site / day | 20, every plan | yes | no |
| Versions kept per site | 20, every plan | yes | no |
| Agent runs / hour | 20 | yes | no |
| File uploads / hour | 30 | yes | no |
| Questions about a file / hour | 40 | yes | no |
| Integration reads / hour | 60 | yes | no |

All ten are rows now.

---

## 2. The pricing page

**43 rows, 7 sections, generated from `lib/billing/feature-catalog.ts`.**
The sections are the sidebar's own headings — Φτιάξε · Ρώτα · Τρέξε ·
Δες · Οργάνωσε — plus Όρια and Υποστήριξη, and the gate fails if the
first five stop matching the nav.

**43 is past the 40 the brief set as the point to worry.** Each section
is a `<details>` the reader can shut, and every one is `open` by
construction: the page's purpose is that nothing about what you get is
hidden, so the reader collapses what they have finished with and the
page never decides that for them. `feature-catalog.test.mjs` holds 45 as
the ceiling, so the question gets asked again rather than drifting.

**"Unlimited" now carries a proof.** Six cells in the table are
unlimited. Each one's entry must declare `unlimitedProof`, and every
bound it names must itself be a visible, finite row *on the same plan* —
so an Ultimate account reading "Files: Unlimited" is reading it next to
"File storage: 50 GB". The gate produces those six by EXECUTING the cell
for every plan, not by reading the source.

### What the live measurement found that the build did not

Both of these were green in every gate and visible only in a browser.

1. **The page scrolled sideways on a phone.** A scroll container inside
   a `<details>` does not stop its overflow reaching the document in
   Chromium 141: the wrapper clipped correctly (clientWidth 358,
   scrollWidth 746 at a 390px viewport) and
   `documentElement.scrollWidth` was still **708**. `position: relative`
   fixes it; `width: 100%`, `min-width: 0`, `overflow: clip` on the
   details and four other candidates do not. Verified at 390, 768 and
   1440, LTR and RTL.
2. **The seven sections did not line up.** Each `<table>` sized its own
   columns, so "Free" sat at x=445 in ΦΤΙΑΞΕ and x=570 in ΡΩΤΑ at 1440.
   Fixed with `table-fixed` and a 34% first column; the header positions
   are now identical across all seven (`144,536,662,789,916,1043,1169`).

Rendered and counted in `en`, `el`, `ar`, `zh` and `ja`: 43 rows and 7
sections in every one, no horizontal overflow at 390, 768 or 1440.

### A locked feature now says four things

What, which plan, **how much**, and a button to that plan's card
(`/pricing#plan-<slug>`). Three of the four call sites had
`planName="Starter"` as a literal — a claim about a gate in another file
that no test could see go stale. The plan is derived from the catalog's
`minPlan` now, and the gate fails if a paid feature cannot produce a
named, priced plan.

---

## 3. The sidebar

**Measured in a browser against the production build, both states, four
viewports.** "Every group open" is not a hypothetical worst case — it is
exactly what the previous default was.

| | 1366×768 | 1440×900 | 1920×1080 | 390×844 |
|---|---|---|---|---|
| **Every group open** (the old default) | 1635px, 13 rows visible | 1635px, 15 | 1635px, 18 | 1704px, 15 |
| **Only the current group** (now) | 789px, 8 rows | 900px, 8 | 1080px, 8 | 858px, 8 |
| Current group = Ask or Settings | — | 923px, 11 rows, all visible | — | 992px, 10 |
| Current group = See (the largest) | — | 1055px, 13 rows, all visible | — | 1124px, 13 |

Twenty-six drawn rows plus six group headings is **32 lines**. The
worst realistic case after the change — Make plus See — is 13 rows and
every one of them is above the fold at both 900 and 844.

**Nothing is stored.** Not localStorage, not a cookie, not a column. The
obvious design is to remember what the user opened, and it is wrong
here for a stated reason: a sidebar that restores three groups from
yesterday is 32 lines again, on the one visit where the person has no
idea why.

**Six positions are held for things that do not exist.** They are
dropped by both filters — not drawn, and not in the command palette or
the hub, because a searchable row whose route 404s is worse than no row.
The gate fails the build if any of their routes starts resolving, which
is what makes the flag come off on the day the page lands rather than
leaving a working feature invisible.

---

## 4. What this round did NOT verify

| What | Why | What you would check |
|---|---|---|
| Anything against the deployed site | the branch is not deployed; every measurement above is against `next start` on the production build, locally | reload `/pricing` after the deploy and count 43 rows in 7 sections |
| The pricing page while signed in | the local build runs with sentinel Supabase credentials, so `getUser()` returns nobody | the "Set Up Team" button should skip checkout for a Professional+ owner |
| The sidebar inside the real dashboard | it needs a session and a database; it was measured through a temporary page that mounts the real component with the real config, deleted in the same session | open any dashboard page and check that only its own group is open |
| One transcription end to end | the API key here is a sentinel, and the account behind the real key has no balance — the same blocker as `v5-list.md` items 2 and 3 | record a clip, and read the credits charged against the 3-credit figure above |
| Whether the tiers are the RIGHT tiers | a commercial decision; no test can hold it | the 26 rows available to everybody, one at a time |

---

## 5. Two instruments were wrong, and both are fixed

- **`combined-ceiling.test.mjs`'s English-sentence scan was partly blind
  to backtick strings.** It pairs backticks in order, so a template that
  followed an odd number of earlier backticks was read as the GAP
  between two templates rather than as its own content. Adding one
  balanced template two lines above realigned every pair after it and a
  className arrived at the predicate for the first time. It now strips
  `${…}` before judging, which is both the fix and the reason the
  Tailwind exemption had stopped recognising class lists.
- **`route-shadowing.test.mjs`'s "the config is never mutated" compared
  lengths.** A filter that writes `group.items = group.items.filter(…)`
  replaces the array with a new one of the same length whenever nothing
  is removed, so the check passed over a config that had been rewritten
  in place. It compares identity now, and the mutation that was
  surviving is caught.

And `scripts/tests/load-ts.mjs` gained two error messages instead of two
anonymous ones: a top-level name declared in two modules of one bundle
(four pairs collided building the catalog, each arriving as
`SyntaxError: Identifier 'MB' has already been declared` against a 60 KB
base64 URL naming no file), and an aliased local import, which the
concatenation silently leaves undefined until the first line that reads
it.

---

## 6. `maxFileMb`: the name does not exist, the shape does

**Asked for by name, and it is worth being exact:** there is no
`maxFileMb` anywhere in this repository and there never has been.
`grep -rni 'maxfilemb\|max_file_mb\|filemb'` over the working tree
returns nothing, and `git grep -i maxfilemb` over every reachable
revision returns nothing. The nearest real thing, `MAX_FILE_BYTES`
(20 MB, `lib/files/file-types.ts`), **is** enforced — in
`lib/files/ingest.ts`, before a byte is written, on both upload paths.

**But the shape was real, and it was worse than a file-size cap.**
Scanning every field of `PlanCapabilities` for "declared and not
enforced" found it:

| Field | Read by | Refuses anything | Verdict |
|---|---|---|---|
| `maxAiAgents` | agent-limits → api/agents | yes | enforced |
| **`websiteBuilder`** | **3 places, all drawing a ✓/✕** | **NO** | **the active lie** |
| `aiMemory` | memory/page.tsx | yes — but by `planMeetsMinimum(…, "starter")`, which never names the field | enforced by a parallel rule |
| `teamCollaboration` | api/team/invite | yes | enforced |
| `chatMemoryLimit` | api/chat | bounds the load | enforced |
| `customAiPersona` | api/chat | yes | enforced |
| `hasTeamSeats` / `teamSeatsIncluded` | checkout, team/invite | yes | enforced |

**`capabilities.websiteBuilder` was false on Free, drawn as a ✕ on the
pricing page and on the signup grid, and read by nothing that refuses.**
A Free account could open `/dashboard/website-builder` and generate a
site. It survived because `maxPublishedSitesForPlan` is 0 on Free and
the publish route does refuse — so the paywall people found was one step
later than the one the page claimed, and the expensive half ran first.

And the page's own comment was part of it: *"already has its own credit
cost + plan gating"* — true of the tracker at `/dashboard/websites`, and
read for months as true of the builder.

**My own claim from 2026-09-12 was wrong too, and this corrects it
explicitly.** `feature-catalog.ts` said the `websiteBuilder` row was
enforced in `lib/build-modules.ts` by `minPlanSlug`. That file and that
symbol both exist — they gate the hand-typed *tracker* — so the gate
passed. It was the wrong feature, and the gate could not see the
difference. `plan-enforcement.test.mjs` can: it requires the named file
to read the capability **and** to contain a refusal.

### What changed

- `lib/billing/capability-gate.ts` — one way to ask "may this account".
- `api/websites/generate`, `api/websites/edit` and the builder page now
  refuse. Not `api/websites/[id]/regenerate`: it only accepts a site
  already marked `flagged`, runs free, and exists to repair something
  the product produced badly — refusing it would leave a downgraded
  account holding a broken page with no way to fix it.
- `/dashboard/memory` reads `aiMemory` instead of a plan rank.

## 7. The approved tiering, and the two things deliberately not built

| | gained | enforced in |
|---|---|---|
| **Starter** | website builder, Presentations, Posts (Voice was already Starter) | the three `generate` routes + their pages |
| **Growth** | Predictions, 5 published sites (was 3), 5 projects | `api/insights/generate`, `publish-limits.ts`, `api/projects` |
| **Professional** | up to 5 team members, unlimited projects | `api/team/invite`, `api/projects` |
| **Ultimate** | unlimited team members, included | `api/team/invite` |

**Projects had no limit at all on any plan** until this round — the
create route validated the *name* and inserted. Now 1 / 3 / 5 /
unlimited, refused with a translated message that names the number.

**The team ceiling is a second, different check** from the paid-seat
count already in `api/team/invite`. That one asks how many seats were
bought; this one asks how many the plan allows. Without it a
Professional account could buy twenty seats and have twenty members,
which made Professional and Ultimate the same feature at two prices.

**PRIORITY was not built, on the owner's instruction, and the reasoning
is recorded because it is the same reasoning as the defect above:**
there is no queue, so a "priority processing" row would be a promise
with no mechanism — exactly `websiteBuilder`. It goes to V6 with the
queue. **Deep Research stays on every paid plan** rather than becoming
an Ultimate exclusive.

**Four tiers are decided and withheld.** Custom domain (Growth), public
API (Professional), private marketplace (Ultimate), SLA (Ultimate):
fields in `PlanCapabilities`, no row on the pricing page, because none
of them exists. The gate holds both halves — the row is not published,
and nothing anywhere may read the capability. The day something
enforces one, the build is red until its row goes up.

### Tier coverage, printed on every build

Run it rather than reading the copy below — the figures moved between
rounds 2 and 3, and this section is where they moved:

    node scripts/tests/plan-enforcement.test.mjs

On 2026-09-13 it prints:

    free          22/45        starter       40/45
    growth        41/45        professional  44/45
    ultimate      45/45        enterprise    45/45
    capabilities  14 declared, 4 held for unbuilt features, 10 enforced

It is printed **and judged**: Free must stay under three quarters of the
table, the top plan must exceed Free, and no plan may include less than
the plan below it.

**23 rows were available to everybody on 2026-09-12; 22 are now**, out of
45 — the free tier lost the website builder, Presentations, Posts and
Predictions, and gained nothing. The answer to "why would an Ultimate pay
10×" is no longer "mostly credits".

### Measured live again

`next start` on the production build: **45 rows, 7 sections, no
horizontal overflow and identical column positions across all seven
sections**, in `en`, `el`, `ar` (RTL), `zh` at 390 and `ja` at 768, and
**no held row visible on any of them**.

---

## 8. Round 3: the scan — how many other fields are declared and never read

The question, in the owner's words: *"Πόσα ΑΛΛΑ πεδία config δηλώνονται
και δεν διαβάζονται πουθενά;"* — in PLANS (covered in §7), in other config
objects, and in env vars.

### The instrument, because the number has to be re-derivable

    node scripts/scan-declared-never-read.mjs --object CREDIT_COSTS \
         --file src/lib/billing/credits.ts

It does not grep. It **renames one declaration, runs `tsc --noEmit`, and
puts it back** — a reader anywhere in the TypeScript tree becomes a
compile error — then greps `.mjs`/`.js` separately, because the gate suite
is JavaScript and `tsc` cannot see it.

That distinction is the whole finding, not a detail of method. Of the
eleven dead prices below, **five would have survived a grep**, and they
were the five with the largest numbers: `createAnything`,
`automationCreate`, `missionPlan`, `websiteGenerate` and `websiteEdit`
are all live keys of `ACTION_PROFILES` in `lib/billing/estimate.ts`, so
`grep -w createAnything` returns fifteen confident-looking lines and not
one of them reads this table.

### What it found: `CREDIT_COSTS` is not a price list

**11 of its 15 entries were read by nothing**, and of the four that
remain only **one** decides a charge.

| entry | what read it |
|---|---|
| `clarificationCheck` | a real charge — `hasEnoughCredits` in two routes |
| `chatMessage` | `recordAiCallForDailySpend` — a telemetry counter |
| `textAction` | the same counter |
| `weeklyReflection` | the same counter |
| `agentCreate` 40 · `automationCreate` 50 · `createAnything` 1 · `missionPlan` 2 · `missionReview` 2 · `mobileAppCreate` 300 · `saasProjectCreate` 700 · `webSearchPerQuery` 1 · `websiteCreate` 100 · `websiteEdit` 50 · `websiteGenerate` 100 | **nothing** |

Every AI charge moved to reserve-then-settle on measured usage and the
flat number each route used to charge stayed behind. `websiteCreate: 100`
reads as "creating a site costs 100 credits" to anyone who opens the
file, and had not been true for months. The eleven are gone; the header
of `CREDIT_COSTS` now says what each of the four survivors is for, and
that three of them size a graph rather than a bill.

### Env vars: 17 candidates, **nothing dead**

Every env-var candidate the scan raised turned out to be read. The four
that reached a verdict only in this round were settled the same way:
`COST_ALERT_BURST_RATIO` and `COST_ALERT_BURST_FLOOR_CALLS` are compared
in `if (latest.calls < config.burstFloorCalls * config.burstRatio)`, and
`ERROR_ALERT_WINDOW_MINUTES` / `ERROR_ALERT_COOLDOWN_MINUTES` reach
`production-errors.ts:92-93` through their accessor functions. This is a
negative result and it is worth as much as the positive one: the env
surface is clean.

### The rest, in the order the scan raised them

Each was settled by the rename-and-typecheck above; none by reading.

| what | where | what it claimed |
|---|---|---|
| `FALLBACK_ATTEMPTS_ALLOWED` | `lib/ai/batch/batch-policy.ts` | `docs/orchestrator.md` §6 counted it among "every one of these bounds a loop that spends money". `fallBack()` increments `batch_fallbacks` and never reads it back. |
| `AGENT_LIMITS.deliveryTarget` | `lib/agents/agent-config.ts` | sat between four caps every one of which is applied with a `.slice()`, and read as the fifth. `resolveDeliveryTarget` decides by **ownership** and never looks at length. |
| `AGENT_MAX_WEB_SEARCHES` | `lib/agents/agent-runner.ts` | its comment opened "every caller that still imports it is asking…". There were none. |
| `STEP_NAMES` | `lib/ui/step-flows.ts` | "for the i18n gate to check against". `step-flow.test.mjs` builds the identical list itself and imports nothing. |
| `describeSchedule` + `ScheduleDescription` | `lib/agents/cron-expression.ts` | a complete second cron-to-sentence implementation. The label a user reads comes from `useScheduleLabel()` in `schedule-editor.tsx` — and `agents-ui.prodtest.mjs` credited the dead one in a comment. |
| `CONDUCT_REFUSAL_KEY` | `lib/trading/conduct.ts` | described the replace-the-whole-answer refusal in the present tense. Nothing renders it. The **message stays** — translated in ten locales, required by `trading-journal.test.mjs:1100`. |
| `TRADING_DISCLAIMER_KEY` | `lib/trading/conduct.ts` | spelled out a path `trading-disclaimer.tsx` assembles from two separate literals. |
| `MAX_CATEGORICAL_UNIQUE` | `lib/data-analysis/profile.ts` | "how many distinct values before a column stops being categorical". There is no categorical column type. |
| `EvalCase.rubric` | `lib/evals/scoring.ts` | the input to a grader model. No case sets one, no grader exists, and `run.mjs` prints "no model grades any case in this run". |
| `PUBLIC_RATE_LIMIT` | `lib/publishing/public-serving.ts` | an exported mirror of two module-private numbers, kept in step by nothing. |
| `OVERAGE_STATE_OFF` | `lib/billing/overage-store.ts` | the fails-to-off sentinel; both places that need one spread `OVERAGE_OFF` inline. Changing it changed nothing. |
| `NO_RESEARCH_CONTEXT` | `lib/research/research-context.ts` | the failure value; every failure path builds its own literal. |
| `DELIVERY_PROVIDERS` | `lib/integrations/providers.ts` | "providers an agent can deliver to" — a **second** list, already disagreeing with `DELIVERY_CHANNELS`, which is the one that decides. |
| `DATE_SORT_ORDERS`, `ALPHABETICAL_SORT_ORDERS` | `lib/use-sort-and-paginate.ts` | a third copy of values `sort-toggle.tsx` writes inline and `SortOrder` spells out by hand. |
| `FULL_CHAT_WORST_CASE` | `lib/billing/free-chat.ts` | a dead alias; every caller and every gate uses the function. |
| `HOUR_MS` | `lib/time-constants.ts` | see below — the interesting one. |

### `time-constants.ts` was a consolidation that never finished

The file exists because six modules had each declared their own `DAY_MS`
and the duplicates made `load-ts.mjs` unable to load a whole module. Its
comment describes that in the past tense. It was **not finished**: three
holdouts were still writing the numbers themselves — `overview/page.tsx`
and `energy-checkin-widget.tsx` each declared a local `DAY_MS`, and
`lib/reflection.ts` imported `DAY_MS` from this very file and then
declared its own `WEEK_MS = 7 * DAY_MS` one line down. All three now
import. `HOUR_MS` had no importer at all and is gone; two routes still
write `60 * 60 * 1000` inline, so it was a fourth spelling nobody was
coming to collect.

### What the scan did NOT settle, said plainly

- **Type fields are a different question and mostly came back read.** Of
  19 raised, two were dead outright and the rest error at their
  **construction** site when renamed — written, not necessarily read.
  `StorageUsage.usedBytes`/`limitBytes`, `DispatchOutcome.deferredUntil`/
  `groupedInto`, `ResearchContext.readModules` and
  `StructuralComparison.tokensA`/`tokensB` are written-and-never-read;
  `AffiliateStats.lifetimeCents`, `CohortInputs.retained*` and
  `RecordConversationContext.scanned`/`mentioning` are read by gates,
  which is a real reader. None was removed.
- **Two dead type fields were left in place on purpose.**
  `UserWebsite.reference_image_url` says in its own comment that it is
  kept because the column still exists on rows created before the change
  — which is true, and is the reason not to delete it.
  `AffiliateRow.suspended_reason` mirrors a real database column reached
  through `select("*")`; deleting the TypeScript field would not delete
  the column.
- **The i18n and `package.json` candidates were not settled at all.** 13
  of them — `common.whatIsThis`, `dashboard.library.*`,
  `dashboard.overview.progress.*`, the `module.empty*` family, the
  `check:i18n` and `check:markers` script aliases — reached no verdict,
  because a `t()` call is resolved at runtime and neither `tsc` nor this
  scan can see it. They are **candidates, not findings**, and nothing was
  removed on their account.
- **The scan that raised the candidates was itself incomplete.** It ran
  115 agents; 36 died on an account session limit mid-verification. The
  22 listed above were re-settled here by mutation and are solid; what
  36 dead agents mean is that the candidate list is a floor, not a total.
  There is no claim here that these are all of them.
- **The full mutation sweep was NOT run to completion for this round.**
  `npm run build` is green (0 failures across every gate) and
  `npm run build:ci` passes under a deployed environment, but
  `npm run test:mutation` was stopped partway. What WAS run, in full, is
  every mutation suite covering a gate this round touched:
  `pricing-truth` 12/12 · `sidebar-naming` 10/10 · `sidebar-groups` 9/9 ·
  `sidebar-structure` 22/22 · `feature-catalog` 13/13 · `step-flow` 8/8 ·
  `evals` 27/27 · `cron-firing` 12/12. The remaining suites are unrun for
  this change, not passed.

### Two things the sweep itself turned up

**A killed sweep leaves a live defect in the working tree.** Stopping
`test:mutation` partway left `messages/en.json` carrying an applied
mutation — `"presentations"` rewritten to *"It does not create slides."* —
which would have been committed by any `git add -A` that followed. The
sidecar (`scripts/tests/lib/sidecar-write.mjs`) heals this on the NEXT
mutation run, which is the right design and is no help at all to a commit
that happens first. **Check `git status` for files you did not edit before
committing after any interrupted sweep.**

**`feature-catalog.mutation.mjs` had a stale mutant, and it read as
healthy.** Its anchor was the Music row *without* the `hintKey` that row
gained in the V5 sidebar merge, so `from` matched nothing: the runner
printed `STALE` and `12 of 13`, one line among sixty. A mutant whose
target has moved is a check that runs and tests nothing — the same shape
as `db-migrations`' three empty scrapers. It is re-anchored on the
trailing `notBuilt: true`, so the row can gain further fields without
silencing it again, and the suite is 13 of 13.
