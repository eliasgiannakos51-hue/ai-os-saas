# The ten basic checks

Ten things that must be true of a signed-in account before anything else is
worth asking. Written 2026-09-26. The language is in `checks/README.md`.

Nine of these are free. The tenth spends credits and runs only with
`--allow-cost`.

## Selectors, in one place

When a button is renamed, this block changes and the checks below do not.

    ALIAS composer      css=textarea
    ALIAS send          css=button[type="submit"]
    ALIAS thread        testid=chat-thread
    ALIAS sidebar       css=nav
    ALIAS site-prompt   css=textarea
    ALIAS generate      css=button[type="submit"]

---

## 1 — the Home opens at all

    CHECK Home opens
    OPEN /dashboard/overview
    EXPECT URL /dashboard/overview
    EXPECT NO CONSOLE ERROR WITHIN 15s

`EXPECT URL` is not decoration: without an onboarding row the app
redirects to `/onboarding`, and every check below would then be measuring
the onboarding screen.

## 2 — the Home did not fall over

    CHECK Home renders rather than showing its error boundary
    OPEN /dashboard/overview
    EXPECT NO TEXT "This part of the page did not load"
    EXPECT NO TEXT "Αυτό το μέρος της σελίδας δεν φόρτωσε"

Both languages, because the account's locale decides which one appears and
an English-only needle would pass in Greek by being absent.

## 3 — the sidebar is drawn

    CHECK The sidebar is there
    OPEN /dashboard/overview
    EXPECT VISIBLE sidebar WITHIN 15s

## 4 — Marketplace was withdrawn

    CHECK Marketplace is not in the sidebar
    OPEN /dashboard/overview
    EXPECT NO TEXT "Marketplace"

Withdrawn on 2026-09-24: the page still answers its URL and
`agent_templates` is untouched, but nothing navigates to it. This check is
the live half of `scripts/tests/marketplace-retired.test.mjs`, which can
only see the source.

## 5 — the chat page opens

    CHECK Chat opens
    OPEN /dashboard/chat
    EXPECT URL /dashboard/chat
    EXPECT VISIBLE composer WITHIN 15s

## 6 — the chat answers, and is readable while it does

    CHECK Chat answers a Greek message
    OPEN /dashboard/chat
    EXPECT VISIBLE composer WITHIN 15s
    TYPE "Γεια, πες μου μια πρόταση για δοκιμή." IN composer
    CLICK send
    EXPECT GROWING TEXT IN thread WITHIN 30s
    SHOT chat-answered

The answer has to arrive AND arrive visibly. `EXPECT GROWING TEXT` fails
both an answer that appears all at once at the end and one that blanks the
thread while it thinks.

## 7 — Files opens

    CHECK Files opens
    OPEN /dashboard/files
    EXPECT URL /dashboard/files
    EXPECT NO CONSOLE ERROR WITHIN 15s

## 8 — Agents opens

    CHECK Agents opens
    OPEN /dashboard/agents
    EXPECT URL /dashboard/agents
    EXPECT NO CONSOLE ERROR WITHIN 15s

## 9 — the schema behind the product is complete

    CHECK The database has everything the code expects
    OPEN /api/health
    EXPECT STATUS 200
    EXPECT NO TEXT "\"missing\":[{"

A non-empty `missing` means a migration in `supabase/migrations/` has not
been pasted into the SQL editor — the failure mode CLAUDE.md opens with.
On 2026-09-26 this was failing in production: `delete_user_storage_objects()`
absent, so account deletion stops at the storage step.

## 10 — the Website Builder actually produces a site

    CHECK Website Builder creates and saves a site
    COSTS CREDITS
    OPEN /dashboard/website-builder
    EXPECT VISIBLE site-prompt WITHIN 15s
    TYPE "Καφετέρια στην Αθήνα {MARKER}" IN site-prompt
    CLICK generate
    EXPECT TEXT "{MARKER}" WITHIN 120s
    SHOT site-created

The one billable check, and it runs once. `{MARKER}` goes into the site's
own name so the row can be found again — and so a human looking at the
database can tell a bot's site from a customer's.

    NOTE Cleanup is not written yet: deleting a site needs its delete
    NOTE control, and deleting the wrong row is worse than leaving one.
    NOTE Until that line exists, remove the marked site by hand after a
    NOTE run with --allow-cost. broken.md prints the marker.
