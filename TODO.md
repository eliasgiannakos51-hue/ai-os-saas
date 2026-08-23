# TODO — before launch

Things that are DONE in code but not yet safe to put in front of a paying
customer. Each entry says what is wrong, why it is not a code fix, and what
"done" looks like.

## Help Centre — es / fr / de / it need a native speaker

**What:** `content/help/{es,fr,de,it}.json` — the Spanish, French, German and
Italian help articles were written by AI translation agents, not by people
who speak those languages.

**Why this is not a code problem.** The build gate checks what a machine can
check, and all of it passes:

- every core slug exists in every shipped language
- no article contains a digit (no stale price can reach a reader)
- `el`/`ja`/`ar` are not byte-identical to English, so nothing was copied
- the menu names in each article were looked up in `messages/<locale>.json`
  rather than invented

None of that is the same as the text being **good**. A gate cannot see a
wrong case ending, a register that switches from formal to informal
mid-paragraph, or a sentence that is grammatical and still reads like it
was translated. This project has already shipped one of those: the Greek
delete confirmations came out in the accusative where the passive frame
needs the nominative, and only a reader caught it.

**Also unreviewed:** the adversarial verification pass for these four
languages was written and launched but never ran — the session hit its
limit first. So these four are the only ones with neither a native reader
nor a second machine pass.

**What "done" looks like:** a native speaker of each language reads all 13
articles in that file, checking specifically for
- case, gender and number agreement, especially after prepositions
- formal vs informal address, consistent, and matching `messages/<locale>.json`
- the `triggers` list: are these phrases a real person would type into a
  support box, or translated English?
- menu names matching what that reader actually sees on screen

**Scope:** 4 languages x 13 articles = 52 short texts. `pt`, `zh`, `ja` and
`ar` were written directly rather than by agents and are a lower priority,
but the same review would not hurt.

**Where:** `content/help/<locale>.json`. Edit the JSON, then
`node scripts/generate-help-seed.mjs`, then re-run the migration. Never
edit `supabase/migrations/20260816_help_articles.sql` by hand — a drift
test regenerates it and compares.

---

## P0 — Deleting a plan silently downgrades everyone on it

**The failure.** `getPlan("growth")` resolves against the `PLANS` table. Remove
or rename an entry and it returns `undefined`, and the resolution path falls
through to the Free entitlement. Every customer on that plan keeps paying and
quietly loses what they paid for. Nothing logs, nothing alerts, and the only
symptom is a support ticket saying "I can't use X any more".

This is not hypothetical maintenance risk: a plan slug is a string, renaming
one is a normal refactor, and the compiler cannot see the fall-through.

**The fix, in three parts:**
- a guard where the tier is resolved: if the slug does not resolve BUT the
  account has a `stripe_customer_id`, do NOT fall back to Free. That
  combination means a paying customer on a plan the code no longer knows,
  which is a bug in the code, not a downgrade the customer asked for.
- alert the owner, and log every occurrence with the user id and the
  unresolved slug — a silent fallback is what makes this invisible today.
- a test that goes RED if the guard is removed: delete a tier from the
  fixture table, assert a customer holding it does NOT get Free
  entitlements. The test must fail before the guard exists — verify that.

**Not yet located precisely.** The behaviour was found by reading the
resolution path; the exact file and line need re-confirming before the fix,
rather than trusting this note.

## P0 — Create Studio cannot make an agent, so it makes a broken automation

**The failure.** A user writes "every morning at 8, send me a summary". Create
Studio has no `agent` in `CREATE_STUDIO_TYPES`, so the classifier picks the
nearest thing it does have — an automation. The result runs at 09:00 UTC
whatever the user's timezone, has no delivery, and has no retries. The agent
subsystem that would do all three correctly exists and is unreachable from
the one place a user would naturally ask.

This is a defect in shipped behaviour, not a missing feature: the user asked
for a thing the product can do, and got a worse thing without being told.

**The fix, in four parts:**
- add `agent` to `CREATE_STUDIO_TYPES`.
- the classifier must separate them on the signal that actually
  distinguishes them: RECURRING + A TIME OF DAY -> agent. A one-off
  transformation stays an automation.
- AMBIGUITY MUST ASK, NOT GUESS. Silently picking the weaker of two
  interpretations is how this bug got here. A clarifying question costs one
  round trip; a wrong guess costs a schedule that fires at the wrong hour
  every day and never says so.
- test as a CROSS-PRODUCT, not a sample: 20 phrasings x 10 languages = 200
  cases. Timezone words, relative times ("every morning"), explicit times
  ("at 8"), and one-offs that must NOT become agents. The classifier is
  exactly the kind of surface where a sample passes and one cell is wrong.

**Priority: this one first.** Users are living it now; the plan-deletion bomb
has not gone off yet.
