# How to tell the bot what to try

    BOT_EMAIL=... BOT_PASSWORD=... node scripts/e2e-bot.mjs
    BOT_EMAIL=... BOT_PASSWORD=... node scripts/e2e-bot.mjs checks/basic.md --allow-cost
    ... --base http://127.0.0.1:3000        # run against a local server instead

The bot signs in once, runs every check in order on that one session, and
writes `bot-report/works.md` and `bot-report/broken.md` with a screenshot
per check.

**Write a check in this file's language and the bot runs it. You do not
touch `scripts/e2e-bot.mjs`** — that file holds the runner, and the app's
selectors live here, next to the checks that use them, so a renamed button
changes a check rather than the harness.

## The eleven commands

| command | what it does |
|---|---|
| `CHECK <name>` | starts a check. Everything until the next `CHECK` belongs to it. |
| `ALIAS <name> <selector>` | gives a selector a short name. File-wide. |
| `OPEN <path>` | navigates to `<base>/<path>`. |
| `TYPE "<text>" IN <target>` | fills a field. `{MARKER}` in the text becomes the run's unique marker. |
| `CLICK <target>` | clicks. |
| `WAIT <n>s` | waits. Use sparingly — prefer `EXPECT ... WITHIN`. |
| `EXPECT ...` | the assertions, below. |
| `SHOT <label>` | takes a screenshot at this point. |
| `COSTS CREDITS` | marks the check as billable. See **What it may spend**. |
| `CLEANUP <command>` | a command to run after the check, pass or fail. Repeatable. |
| `NOTE <text>` | a note for a human reading the check. |

A line that is none of these **fails the whole run before the browser
starts**. A typo that got quietly skipped would be a check reporting on
something it never did. Blank lines, `#` comments and ordinary Markdown
around the commands are ignored, so a check file can read like a document.

## The assertions

| assertion | passes when |
|---|---|
| `EXPECT URL /some/path` | the address bar's path is exactly that |
| `EXPECT STATUS 200` | the last `OPEN` returned that HTTP status |
| `EXPECT TEXT "..."` | that text becomes visible |
| `EXPECT NO TEXT "..."` | that text is nowhere on the page |
| `EXPECT VISIBLE <target>` | that element becomes visible |
| `EXPECT GROWING TEXT IN <target>` | the text gets longer at least twice and never blanks |
| `EXPECT NO CONSOLE ERROR` | the browser console logged no error during this check |

Any of them takes `WITHIN <n>s` (default 10). `EXPECT GROWING TEXT` is how
*"readable while it streams"* becomes something a machine can decide: an
answer that appears all at once at the end fails it, and so does one that
blanks the box while it thinks.

## Targets

`<target>` is an alias, or a selector with its kind in front:

    css=textarea            role=button:Send        testid=chat-thread
    text=Δημιουργία         label=Email             placeholder=Γράψε…

Declare aliases once at the top and use the short name everywhere.

## What it may spend

A check that calls a paid model is marked `COSTS CREDITS`. Those are **not
run** unless you pass `--allow-cost`, and at most `BOT_COST_LIMIT` of them
run per invocation (default 1). A harness that can empty the account
overnight is a bug.

## What it leaves behind

Anything the bot names should contain `{MARKER}`, which becomes
`e2ebot-<timestamp>`. Then a `CLEANUP` line can find that row and only
that row. **A cleanup that fails is reported in `broken.md`** with the
marker, so you can remove it by hand — it is never swallowed.

## The three outcomes

**WORKS**, **BROKEN**, **NOT RUN** — and the third is not a quiet version
of the first. If the bot cannot sign in, every check is NOT RUN and says
so. A check that did not run tells you nothing about the product, and is
listed at the foot of `broken.md` so it cannot be read as a clean result.

## What this bot is not for

It answers **does it work technically** — does it load, reply, save, stay
standing. It does not answer **is it any good, would anyone want it, is
the wording right**. Those need a person, and a bot that scored them would
be inventing a number.
