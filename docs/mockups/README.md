# Three mockups for the next interface, each in two themes

Not the product. Three HTML pages that exist to be compared and for one of
them to be chosen. Nothing in `src/` changed to make them.

    node scripts/mockups.mjs              # writes the three, photographs them
    SKIP_SHOTS=1 node scripts/mockups.mjs # just the HTML
    FRAG_DIR=... node scripts/mockups.mjs # also writes the publishable form

Published as artifacts, 2026-10-01 — the files here open the same page:
Paper `claude.ai/artifact/WLeoDnbpAbVxdHAjocSBHZ`,
Graphite `claude.ai/artifact/Ro2HbGqsVZ8jGagwYkD3NK`,
Slate `claude.ai/artifact/QukqSADXg9QikUA7hHdA7o`.

| file | what it is |
|---|---|
| `a-claude.html` | Warm paper and warm graphite, serif headline, clay accent |
| `b-linear.html` | Near-black, tight type, 8px corners, indigo accent |
| `c-hybrid.html` | Deep grey never black, slate indigo, generous spacing |

Each page carries seven screens behind the tab strip at the bottom, in both
themes, and responds at 390px. The tab strip is a mockup affordance and is
hidden when `body` carries `shot`, which is how the photographs are taken.

## One structure, three palettes, two themes each

The three differ in **colour, typography and corner radius**. Nothing else.
That is deliberate twice over: it makes the comparison a comparison rather
than a vote on whichever page got the better sentence, and it is the same
reason the dark and light versions of each are the same markup. If dark and
light differed in anything but colour, one of them would rot, and it would
be the one nobody opens.

Every colour is a CSS variable, declared three times: as the default, under
`[data-theme="light"]`, and under `prefers-color-scheme` for the person who
picked Auto. Changing theme is one attribute.

## The switch has three states, not two

Dark, light, **auto**. Auto is the only one that can be right for a person
whose machine already knows what time it is, and it is the state where no
attribute is set at all. The icon is the state, so the button says which one
is on, and the choice is kept in `localStorage` — a person who picks light
and gets dark back tomorrow has been given a gesture, not a choice.

Dark is the default.

## Hidden and reachable are different words

Every one of the seventeen tools is reachable three ways, for three
different people:

1. **Type it.** The newcomer does not know the names yet, so they describe
   what they want and the routed chip says which tool that was.
2. **The palette** (`/`, or the row at the foot of the rail). Seventeen rows
   are unusable unprioritised, so typing narrows them — `site` leaves one,
   and the header counts `1 of 17` so the person can see that the other
   sixteen still exist.
3. **The grid.** `All tools` opens a page of seventeen cards in the same
   four groups. A palette rewards knowing the name; a grid does not require
   it, and it is the only one of the three a person can browse.

Each card and each palette row carries the same three things: the icon, the
name a customer would say, and one line of what it does. Seventeen icons
with no lines is a quiz, not a menu — which is why the line lives in `NAV`
beside the name, one source for the rail, the palette and the grid.

## What a rail with no tools in it owes the person

If they no longer pick the tool, the system picks it, and a system that
picks silently is one nobody can correct: the credits are spent before the
mistake is visible. So the typed state prints the choice and offers to undo
it —

    Going to  [ Build a site ]  change
    Images [Mine only]  Pages [One]   30 credits

— which is the difference between understanding someone and claiming to.
The `typed` screen is what the whole idea stands on; the rest is paint.

## What all three keep, because it is the product and not the paint

- **The data.** Home says what it is already reading; chat shows SOURCES
  under the answer; the panel beside is built out of the person's own
  records. This is the only thing that distinguishes Ionexa from a prompt
  box, so it survives every skin and both themes.
- **"What this does NOT do"** on Build a site, in full.
- **"What it can see"** under the chat composer, in full.
- **Voice says it needs a speech key**, in its one line, because it does.

## What all three drop

The background network art, the amber-on-black contrast, the heavy shadows,
the second row of buttons, and the duplicate action (the builder had both a
send arrow and a Build it button). The shadows that remain are two variables
per theme and are used on four things.

## The numbers inside them are a sample

Each page says so in its own footer. 14 invoices, EUR 4,180 past due and the
three late customers are invented furniture for a screenshot, not a
measurement of anything. They exist so the layout can be judged with
realistic text lengths in it.

## The one check the photographs get

A screenshot named `dark` that is in fact light is the only way this script
can fail without anyone noticing. So the theme is read back off the body
rather than trusted, and at the end the two are required to differ and the
dark one to be darker:

    a-claude: dark rgb(38, 38, 36)  light rgb(250, 249, 247)
    b-linear: dark rgb(8, 9, 10)    light rgb(255, 255, 255)
    c-hybrid: dark rgb(26, 27, 30)  light rgb(255, 255, 255)

Those three lines are printed by the run, not copied into this file by hand.

## One content, two envelopes

A page published as an artifact must NOT carry its own doctype, `html`,
`head` or `body`: the host supplies those and pads the root element by the
phone's safe-area insets. The same page opened as a file on disk must carry
all four, or the browser reads it in quirks mode.

So `page()` emits the inside and `standalone()` wraps it, and the run writes
both. Two generated envelopes around one source beats two hand-kept copies —
the same argument that made this a generator rather than three files.

Three things that only matter in the published form, and all three were
wrong first:

- the reset was `* { margin: 0; padding: 0 }`, which takes the host's
  safe-area padding off `:root` and runs the page under the status bar;
- `localStorage` was read unguarded. It throws in a private window, with
  site data blocked, and during thumbnail capture — and that read sits in
  the same script as the tab strip, so the whole page would have gone inert
  rather than merely forgetting the theme;
- the dark-theme guard was `:root:not([data-theme])`, which breaks the
  page's own Auto: Auto removes the attribute, so the guard has to be
  `:not([data-theme="dark"])`.
