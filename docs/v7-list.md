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

## 3. The bot system — three built, four deferred with their conditions

    node scripts/e2e-bot.mjs          # signs in, drives the product
    checks/README.md                  # the eleven-command language

**Five of the seven asked for already exist as prodtests**, measured
2026-09-26: 47 `*.prodtest.mjs` files that build the product, start it and
drive a real Chromium, plus 291 build gates. `user-isolation-live.prodtest.mjs`
alone is 426 lines and 25 checks of exactly the "can A see B's data"
question a security bot would ask.

**So the gap is not tooling. It is that none of it runs against the live
deployment, and there is no report that puts the answers in one place.**

| bot | state | what it still needs |
|---|---|---|
| **E2E** | `scripts/e2e-bot.mjs` shipped | `BOT_EMAIL`, `BOT_PASSWORD` |
| **SECURITY** | prodtests exist, unrun against production | **two** accounts — without a second there is no "user B" |
| **i18n** | 40 files exist, unrun against production | one account |
| **BENCHMARK** | not built | `GOOGLE_API_KEY`. Costed 2026-09-26 at **$1.46–$2.16** a run from the rates in `src/lib/ai/providers/catalog.ts` |
| **COST** | tooling exists (`db:spend`, `reserve-accuracy`) | **volume**. With four accounts `ai_cost_log` is nearly empty; ranking features by spend would rank noise |
| **PERFORMANCE** | `input-latency`, `navigation-latency`, `public-route-speed` exist | volume, and a deployment newer than six days |
| **UX** | **declined, with a reason** | see below |

### The UX bot is not deferred, it is declined

An AI told to "pretend to be a new user" writes plausible prose that
cannot be falsified. It will say "I got confused at step 3" with the same
confidence whether or not anything was confusing, because it has no
confusion — it has text patterns. That is the *metric that measures the
wrong quantity* entry in `docs/shapes.md`, and the output would be read as
user data.

Everything MECHANICAL such a bot could find — dead ends, unlabelled
controls, two primary actions on one screen — is already found statically
by `one-primary-action`, `empty-states` and `problem-messages`, without
guessing at anyone's feelings. What would genuinely add to that is the E2E
bot recording **clicks per check** and **which element it failed to
find**: both measurable, both pointing at the same obvious problems.

### The binding constraint, stated plainly

Production has served the 2026-09-19 build for seven days — **36 commits
behind `main`** as of 2026-09-26. Every bot would be measuring code from
last week. Building instruments for a product that cannot change is work
that produces reports nobody can act on.

## 4. The sidebar structure — BUILT 2026-09-26

    node scripts/sidebar-census.mjs          # drawn · declared · palette · dark
    node scripts/sidebar-register.mjs        # the register, per position
    node scripts/tests/sidebar-structure.mutation.mjs   # 26 mutants

**Done.** Eleven groups, 111 declared positions, 27 drawn for an ordinary
account and 28 for the owner. Five groups — Connect, Business,
Engineering, Verify, Personal — hold forty-three positions and not one
live row, so no heading for any of them reaches the screen.
`docs/sidebar-structure.md` is the register and is written by
`scripts/sidebar-register.mjs`, not by hand.

**One row changed state:** Data Analysis, hidden since the September
tidy-up, is drawn again. It was built and it works — upload profiles the
file, `[id]/analyse` hands the profile to a model, `[id]/ask` answers
questions about it, `[id]/export` writes it out. *Verified by reading
those four routes; nothing in this container can sign in, so it has not
been seen working from a browser.*

**Three gates were wrong in the same direction and all three were found
by this round rather than by a screen.**

| gate | what it believed | for how long |
|---|---|---|
| `sidebar-structure.test.mjs` | the marketplace was drawn — its parse read `hidden`/`notBuilt`/`ownerOnly` and not `retired` | since 2026-09-24 |
| `palette-aliases.test.mjs` | the palette searches every label in the config, not `visibleGroups` of it | always; it cost nothing until fifty-five rows were held |
| `lib/palette-aliases.ts` | six aliases pointed at the retired marketplace and reached nothing | since 2026-09-24 |

## 5. Every MAKE feature as a chat — MEASURED, NOT BUILT

    node scripts/measure-make-steps.mjs

**Measured 2026-09-26, on the six rows Make draws:**

The last column is the number of USER inputs, with the busy flag
(`generating`, `running`, `loading`) discounted — it guards a double
press and is not something a person has to satisfy. A chat box waits on
one thing.

| row | textarea | one-line | selects | waits on | n |
|---|---|---|---|---|---|
| Website Builder | 2 | 2 | 1 | `!description.trim()` | **1** ← was 2, fixed 2026-09-27 |
| Documents | 0 | 1 | 1 | nothing — there is no prompt at all | 0 |
| Presentations | 1 | 0 | 1 | `!description.trim()` | **1** |
| Posts | 1 | 0 | 0 | `!description.trim()` | **1** ← was 2, fixed 2026-09-27 |
| AI Coding | 1 | 0 | 3 | `!input.trim()` | **1** |
| Data Analysis | 0 | 1 | 0 | a FILE is the way in; the follow-up question is one line | 0 |

Both instruments discount busy flags since 2026-09-27 — `generating`,
`running`, `loading` guard a double press and are not something a
person satisfies. They did not agree before, which meant two
measurements of one screen.

`scripts/tests/make-as-chat.test.mjs` holds each of those numbers as a
per-row baseline that may only FALL, requires every drawn Make row to
have a free-text way in, and floors at one the count of rows whose
result can be changed by saying so. A per-row baseline rather than a
total, because a total lets one row get worse while another gets
better.

**Presentations is already the shape asked for** — one free-text field,
one gate, the slide count defaulted. **Coding is one operation-picker
away from it.** The three that are not:

1. ~~**Website Builder requires a name.**~~ **DONE 2026-09-27.** The
   required "Website name" input is gone and `lib/website-name.ts`
   derives it from the description — deterministically, because the
   `(user_id, name)` duplicate check depends on the same description
   giving the same name. Not a new idea: the `?brief=` path from Create
   Studio had always filled the name with a slice of the brief and
   submitted. The gate's baseline for this row moved 2 → 1 and may only
   fall.
2. ~~**Posts requires at least one platform.**~~ **DONE 2026-09-27.** All
   four start selected, so the refusal could only fire for somebody who
   had unticked every one — and what it gave them was a dead button
   with no explanation. An empty selection means all four now, in
   `generate()` **and** in the result panel: the request is sent for the
   fallback, so a panel built from the empty selection would have shown
   no platforms beside four posts that exist.
3. **Documents has no prompt.** You create an empty document and type
   into it. "Write me a one-page brief about X" is not expressible.

**What is NOT done, and the honest size of it.** The pattern the owner
asked for is two things, and only the first is close: a single free-text
way in, and *changing the result by saying so*. Only the Website Builder
has the second (`editText` → `api/websites/edit`), and it is 2,006 lines.
Rewriting five workspaces to a chat-plus-preview layout is not one round
of work, and the measurement above is what says where to start rather
than an impression of it.

**Re-run the measurement after each one.** The number to watch is the
last column: a chat box waits on one thing, the text.

## 6. The deploy — FOUND AND FIXED, 2026-09-26

    node scripts/tests/no-worktree.test.mjs
    node scripts/tests/no-worktree.mutation.mjs

**Sixteen consecutive red deploys since 2026-09-19 12:00, and the
difference between a green `build:ci` and a red Vercel was one thing:
`.git`.**

Vercel hands the builder a source tarball and sets
`VERCEL_GIT_COMMIT_SHA` rather than shipping a repository. Two gates
demanded answers only a working tree can give.

| gate | what it demanded | where the build died |
|---|---|---|
| `db-inventory.test.mjs` | a stamp `db-inventory.mjs` could only produce from git | gate 70 of 292 (fixed 2026-09-26, `4419002a`) |
| `mutation-tree.test.mjs` | that `check-mutation-tree` WARN about an uncommitted file | gate 167 of 292 |

Reproduced on demand, which nothing in fifteen rounds of guessing had
been:

    git clone --no-hardlinks . /tmp/clean && cd /tmp/clean
    git checkout 9d84b80c && rm -rf .git && npm ci
    env -i PATH="$PATH" HOME="$HOME" TZ=UTC CI=1 VERCEL=1 \
      VERCEL_ENV=production NODE_ENV=production npm run build

RED before the fix, naming the gate. GREEN after it, all 292 gates and
`next build`. One change.

**The timings agree, independently.** The last green build answered in
5m46. The reds before the morning's `db-inventory` fix answered in
2m16–3m16 — gate 70 is 24% of the way through. `9d84b80c`, after that
fix moved the failure to gate 167 (57%), answered in about four minutes.
A failure whose fraction of a successful build moves exactly as far as
the failing gate moves is not a flake, a timeout or a memory limit.

**Why nothing caught it.** `build:ci` runs the real build twice in two
environments, and the axis it varies is the VARIABLES. Both runs happen
inside a repository, as did every run of both gates, as did every
experiment run here for a week. The tree was never a variable.

`no-worktree.test.mjs` makes it one, cheaply: a PATH shim whose `git`
exits 128 with git's own out-of-repository message, and the population
derived from the source — every program under `scripts/` that invokes
git (13 of 699 files), the three the build runs directly, and the ten
gates that spawn or read one of them. Section 0 proves the shim hides
git before anything is concluded from it.

**Measured 2026-09-26: 13 programs, all exit 0 with git hidden; 0
exemptions.** The one exemption written into the first draft was deleted
on the first run — the both-ways check showed
`mutation-tree-environments.test.mjs` passes under the shim anyway.

**4 of 4 mutations caught**, two of them putting the original defect
back at each of the two sites it lived, two emptying the instrument
itself (bypass the shim; select no gates).

**Still unread after eleven requests:** any line of a Vercel build log.
`api.vercel.com` is refused by this container's egress policy
(`connect_rejected`, measured) and no token is present, so the
confirmation that this was THE failure has to come from
`npx vercel inspect <id> --logs` or from the next deploy going green.

## 7. No env var was ever wrong — the control that settles it, 2026-09-27

    node scripts/tests/env-shape.test.mjs
    node scripts/tests/env-shape.mutation.mjs

**Asked: which env var holds a wrong value? Answer: none, and it is
measured rather than argued.** `build:ci` runs the real build with all
178 project variables set to a deliberately unusable value, and again
with none of them set. Both `exit=0`. A wrong VALUE does not fail this
build.

`BOT_EMAIL` and `BOT_PASSWORD` are read by `scripts/e2e-bot.mjs` and by
nothing else; the build script does not contain the string `e2e-bot`.
They cannot affect it. *(Separately: a password in the deployment's
runtime environment is readable by every route. It should not be there.)*

**THE CONTROL, and it is the whole answer to "what changed on 19/09".**
`0a71fdb4` is the last commit Vercel built green — 2026-09-19 12:00.
Built here twice, same environment, `npm ci` from an empty tree:

| tree | result |
|---|---|
| **with** `.git` | `exit=0` |
| **without** `.git` | `exit=1`, at `db-inventory.test.mjs`, on the two stamp clauses |

One variable, two answers. And the stamp check has existed since
**2026-08-19** (`ae9fec96`) — a month before the reds began.

So on 2026-09-19 at 12:00 Vercel's builder **had a working tree**, and by
17:45 it did not. Nothing in the four commits between those times
touches git, the build script, or any variable. **The change was in the
Vercel project or the platform, not in this repository** — which is
where to look, and is why changing an environment variable would have
fixed nothing.

**The shape gate, which is a real gap and a different one.** A value can
be present, well-formed for the sentinel sweep, and still impossible —
`NEXT_PUBLIC_SUPABASE_URL=abc`. That killed `build:ci`'s own first run
with `TypeError: Invalid URL`, naming neither the variable nor the file,
and `env-sensitivity.mjs`'s header named the gap and left it open.

`scripts/lib/env-shape-rules.mjs` is now the one place a name's promised
shape is written, read by the sentinel builder and by `next.config.mjs`,
which refuses an impossible value **by name** before the build starts.
**12 of the 144 declared variables have a shape to check** (4 url, 3
email, 3 number, 2 key32).

`NEXT_PUBLIC_*` is fatal — it is baked into the bundle, so refusing it
can only rename a failure that was certain. Everything else is reported
loudly and is NOT fatal: the build never reads it, and on the day
sixteen red deploys were traced to a missing `.git`, adding a new way for
a deploy to go red over values nobody here can see would be the wrong
trade. One line moves a name into the fatal set.

**Absent is not malformed** — an unset variable and an empty string are a
different, handled condition, and that property is what makes the
build-time refusal safe. It is the third mutant of six.

**31 checks, 6 of 6 mutations caught.** One of the six found a fault in
this gate the hour it was written: the clause "the build calls it"
matched the string `refuseMalformedEnv();` and stayed green when the
call was commented out, because the text survives inside the comment.
Fourth time in one session. It imports the config in a child process
with a malformed value and requires it to throw.

## 8. The build builds — and the .git finding was WRONG, 2026-09-27

**THE CORRECTION FIRST.** §6 and §7 of this list say the deploy failed
because Vercel's builder has no `.git`. **That is wrong, and the
owner's own Vercel log disproves it:**

    19:28:15  mutation-tree: ...WARNING (advisory, not failing):
              1 of 1 uncommitted file(s) are mutation targets: vercel.json

That line is printed by check-mutation-tree's third check, which runs
only when `git rev-parse --is-inside-work-tree` succeeds. **Vercel has a
working tree.** It also explains what §6 could not: why 0a71fdb4 was
green there while it is red here without `.git`.

What survives from that round is worth keeping and is not the cause:
`no-worktree.test.mjs` and the `mutation-tree.test.mjs` branch are
correct — a build that cannot run without a working tree is wrong on its
own terms — but they were presented as the fix and they were not.

**WHAT THE LOG ACTUALLY SHOWS.**

    19:28:12  Warning: Node "24.x" in settings, "22.x" will be used
    19:28:15  mutation-tree warning (advisory)
    19:30:04  Error: Command "npm run build" exited with 1

Two minutes between the fourth build step and the failure — that window
is `npm run test:unit`, 294 gates. The failing gate is still unnamed:
run-gates prints `THE BUILD FAILED IN: <path>` last and that line has
not been read.

**AND THE SHAPE UNDER IT, which is the owner's point and is right.**
`npm run build` — the command Vercel runs — ran the function limits, the
marker check, the mutation-tree check, the i18n check and 294 unit gates
before compiling a line. Checks about this repository's own conventions,
on the critical path of every deployment. A gate that goes red there
takes the DEPLOY with it.

    build:  node scripts/apply-function-limits.mjs && next build
    gates:  apply-function-limits --check && build-identity &&
            check-mutation-markers && check-mutation-tree &&
            check-i18n && test:unit

`apply-function-limits` stays in the build because it WRITES the route
files' maxDuration literals — a producer, not a checker; a build without
it ships different code.

**Measured 2026-09-27, clean clone, `npm ci` from an empty tree, the
platform's environment: the new build is `exit=0` in 2m33.** The old one
took about twenty minutes here.

**Nothing is lost, and that is the argument for it being safe.**
`.github/workflows/verify.yml` runs on every push to every branch and
now runs `npm run gates` before it builds. `ci-coverage.test.mjs` §1b
holds three claims rather than one: the build runs no checker and no
suite; it STILL runs the producer and still compiles (an empty script
would satisfy the first claim); and every checker that left is named in
`gates`, which section 1 requires the workflow to run.

**Six gates read `scripts.build` and would have lied after the split** —
billing-coverage, function-limits, mutation-markers, mutation-tree,
no-worktree, test-export-drift — all re-pointed. **Two mutation anchors
went stale in the same edit**, found by `mutation-suite-shape` (2,572
anchors checked) and by `mutation-markers.mutation.mjs` reporting a HOLE
rather than a pass. 15 of 15 after the fix.

**Still unread:** the ~30 lines before `19:30:04`, which name the gate.
With the gates off the deploy's critical path it no longer blocks
production — but it is still red somewhere, and CI will now say where.

## 9. Clicks to a result — MEASURED AND MOVED, 2026-09-27

    node scripts/measure-make-steps.mjs
    node scripts/tests/make-as-chat.test.mjs     § 2b

The target asked for in words was "you write, it comes out — 1-2 steps".
Counted for somebody who already knows what they want to say: +1 if the
field is behind a button, +1 if it is not focused on arrival, +1 for the
action button. Typing is not a click.

| row | before | after |
|---|---|---|
| Website Builder | **3** | **1** |
| Presentations | 2 | **1** |
| Posts | 2 | **1** |
| AI Coding | 2 | **1** |
| Documents | 2 | 2 — no textarea to focus |
| Data Analysis | 2 | 2 — a file is the way in |

**The Website Builder's third click was invisible in a demo.** The
description field was `useState(initialWebsites.length === 0)`: it
existed only for somebody who had never made a site. Anybody who had
made one pressed "New project" first — a click a first-time visitor
never pays and every returning user does.

The other three were one `autoFocus` each.

§2b holds a per-row ceiling AND the target itself (`worst <= 2`), so the
ceilings cannot all drift up together while each passes its own.

**Sixth self-matching check of the session.** The "field behind a
button" detector looks for `useState(initialWebsites.length === 0)`, and
the commit that removed that line left a comment saying what it removed
— so the detector read the comment and reported the click still being
paid. Both instruments strip comments before detecting now.

**What is still missing is the larger half.** "Say a change in words"
exists on one row of six: the Website Builder's `editText` →
`api/websites/edit`. Presentations, Posts, Coding and Documents generate
and stop.
