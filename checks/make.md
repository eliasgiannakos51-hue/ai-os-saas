# The MAKE screens, end to end

The four boxes that were still open after the UI was simplified: a deck
comes out, a change in words changes it, five posts come out, and the
site that was created is still there after a reload. Written 2026-09-27.
The language is in `checks/README.md`.

**These are not free.** Three of the four call a paid model, so the whole
file needs `--allow-cost` and a cost limit above the default of one —
`BOT_COST_LIMIT=4`, with both check files named in one go:
`node scripts/e2e-bot.mjs checks/basic.md checks/make.md --allow-cost`.

(Written unindented on purpose: an indented block in a check file is
read as commands, and a shell line in one fails the whole run before the
browser starts. Which is the right behaviour — a line nobody could parse
must never be quietly skipped.)

**Both files, in that order, in ONE invocation.** `{MARKER}` is minted per
run, and check 4 below looks for the site that `checks/basic.md` check 10
creates. Run this file alone and check 4 reports BROKEN for a site that
was never made — which would be the harness blaming the product.

## Selectors, in one place

The two buttons and the two result panels carry `data-testid` rather than
their labels: the label is translated into ten languages and a check
anchored on the English one is a check that passes in one locale.

    ALIAS deck-prompt    css=#deck-description
    ALIAS deck-go        testid=deck-generate
    ALIAS deck-result    testid=deck-result
    ALIAS deck-change    css=#deck-instruction
    ALIAS post-prompt    css=#post-description
    ALIAS post-go        testid=posts-generate
    ALIAS post-result    testid=posts-result

---

## 1 — a deck comes out of one sentence

    CHECK Presentations generates a deck
    COSTS CREDITS
    OPEN /dashboard/presentations
    EXPECT VISIBLE deck-prompt WITHIN 15s
    TYPE "Οκτώ διαφάνειες για τη νέα τιμολόγηση {MARKER}" IN deck-prompt
    CLICK deck-go
    EXPECT VISIBLE deck-result WITHIN 180s
    EXPECT NO CONSOLE ERROR
    SHOT deck-created

180 seconds because a ten-slide deck is one long model call and the
screen has nothing to show until it returns. A shorter window would
report a working feature as broken on a slow afternoon.

    NOTE The deck's title comes from the model, not from the brief, so
    NOTE {MARKER} may not appear in it. The marker is in the brief for
    NOTE the database row; the assertion is on the result panel.
    NOTE Cleanup: the deck is removable from its own row in History.

## 2 — and a change in words changes it

    CHECK Presentations applies a change written in words
    COSTS CREDITS
    OPEN /dashboard/presentations
    EXPECT VISIBLE deck-change WITHIN 20s
    TYPE "κάνε το πιο επίσημο" IN deck-change
    EXPECT NO CONSOLE ERROR
    SHOT deck-change-typed

This one depends on check 1: the edit box exists only when a deck is on
screen, and the newest deck is the one the page opens with. If check 1
did not run, this reports BROKEN for a box that was never drawn — read
the two together or not at all.

    NOTE The apply button is not clicked here. Doing so would spend a
    NOTE second billable call to prove the same pipe, and the half that
    NOTE was never verified is that the box EXISTS beside a real deck.
    NOTE Raise this to a CLICK when the run has the budget for it.

## 3 — five posts, one for each platform

    CHECK Posts writes one post per platform
    COSTS CREDITS
    OPEN /dashboard/posts
    EXPECT VISIBLE post-prompt WITHIN 15s
    TYPE "Σύντομο post για το θερινό μας ωράριο {MARKER}" IN post-prompt
    CLICK post-go
    EXPECT VISIBLE post-result WITHIN 180s
    EXPECT TEXT "LinkedIn" WITHIN 5s
    EXPECT TEXT "Instagram" WITHIN 5s
    EXPECT TEXT "Facebook" WITHIN 5s
    EXPECT TEXT "Threads" WITHIN 5s
    EXPECT NO CONSOLE ERROR
    SHOT posts-created

The platform names are the assertion because they are the one thing on
that panel that is not translated — they are brand names in every
locale. Four of the five are checked; "X" is one character and matches
half the page.

    NOTE All five platforms are sent when none is unticked — that was a
    NOTE dead button for anyone who unticked all four, fixed in ef30f944.
    NOTE Cleanup: the set is removable from its own row in History.

## 4 — the site that was created is still there after a reload

    CHECK The generated site was saved, not just displayed
    OPEN /dashboard/website-builder
    EXPECT TEXT "{MARKER}" WITHIN 20s
    SHOT site-persisted

Free, and the half of "does the Website Builder work" that the billable
check cannot answer: a page that renders HTML it never wrote to the
database looks identical until you come back. The site's NAME is derived
from the brief (`src/lib/website-name.ts`), so the marker typed into the
brief is what the saved card is called — which is why this can be found
at all.

    NOTE Depends on checks/basic.md check 10 in the SAME invocation.
    NOTE Cleanup for the site itself is still not written — see the note
    NOTE under that check. broken.md prints the marker.
