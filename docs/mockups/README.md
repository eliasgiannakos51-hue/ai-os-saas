# Three mockups for the next interface

Not the product. Three HTML pages that exist to be compared and for one of
them to be chosen. Nothing in `src/` changed to make them.

    node scripts/mockups.mjs              # writes the three, photographs them
    SKIP_SHOTS=1 node scripts/mockups.mjs # just the HTML

| file | what it is |
|---|---|
| `a-claude.html` | Light paper, serif headline, one clay accent, no rail on home |
| `b-chatgpt.html` | Near-black, white send button, rail always on, history first |
| `c-hybrid.html` | White canvas, muted indigo, rail always on, panel is first class |
| `c-simple.html` | C's paint, four rows in the rail, every tool one click away by three roads |

Each page carries its screens behind the tab strip at the bottom and
responds at 390px. The first three carry home, chat and Build a site;
`c-simple.html` carries seven, because the four it adds are the ones its
claim rests on: the field after you have typed into it, the palette, the
palette narrowed by a query, and the grid. The tab strip is a mockup
affordance and is hidden when `body` carries `shot`, which is how the
photographs are taken.

## What all three keep, because it is the product and not the paint

- **The data.** Home says what it is already reading; chat shows SOURCES
  under the answer; the panel beside is built out of the person's own
  records. This is the only thing that distinguishes Ionexa from a prompt
  box, so it survives every skin.
- **"What this does NOT do"** on Build a site, in full.
- **"What it can see"** under the chat composer, in full.

## What all three drop

The background network art, the amber-on-black contrast, the shadows, the
second row of buttons, and the duplicate action (the builder had both a
send arrow and a Build it button).

## The numbers inside them are a sample

Each page says so in its own footer. 14 invoices, EUR 4,180 past due and
the three late customers are invented furniture for a screenshot, not a
measurement of anything. They exist so the layout can be judged with
realistic text lengths in it.

## c-simple, and the one thing a three-row rail owes the person

Hiding the tools is easy. What it costs is that the person no longer
chooses the tool, so the system chooses for them — and a system that
chooses silently is one nobody can correct. The credits are spent before
the mistake is visible.

So the typed state shows the choice and offers to undo it:

    Going to  [ Build a site ]  change
    Images [Mine only]  Pages [One]   30 credits

That line is the whole difference between "it understands you" and "it
claims to understand you". `c-simple-desktop-typed.png` is the screen the
idea stands or falls on; the rest of the skin is paint.

## Hidden and reachable are different words

Nothing was removed, and nothing is one-road-only. Every one of the
seventeen is reachable three ways, for three different people:

1. **Type it.** The newcomer does not know the names yet, so they describe
   what they want and the routed chip says which tool that was.
2. **The palette** (`/`, or the row at the foot of the rail). Seventeen
   rows are unusable unprioritised, so typing narrows them — `site` leaves
   one, and the header counts `1 of 17` so the person can see that the
   other sixteen still exist.
3. **The grid.** `All tools` opens a page of seventeen cards in the same
   four groups. A palette rewards knowing the name; a grid does not require
   it, and it is the only one of the three a person can browse.

Each card and each palette row carries the same three things: the icon,
the name a customer would say, and one line of what it does. Seventeen
icons with no lines is a quiz, not a menu — which is why the line is part
of the feature's identity and lives in `NAV` beside its name, one source
for the rail, the palette and the grid.
