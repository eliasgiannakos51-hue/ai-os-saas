# The feature inventory, the pricing page, the sidebar — and the voice ceiling

**One day's work, 2026-09-12.** Every number below is either dated at the
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
these. Measured 2026-09-12.

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
hold, and this round did not change a single tier. What it changed is
that the question is now answerable in one file, and unanswerable
silently.

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
