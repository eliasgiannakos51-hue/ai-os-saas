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
