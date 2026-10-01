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

Each page carries all three screens — home, chat, Build a site — behind the
tab strip at the bottom, and responds at 390px. The tab strip is a mockup
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
