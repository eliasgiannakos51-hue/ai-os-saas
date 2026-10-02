# The Ionexa mockup

One design. The page here is still the mockup, not the product — but the
owner approved it on 2026-10-02 and it is going into `src/` in parts.

**Applied 2026-10-02, part 1:**

- **The typeface.** Commissioner across the interface, through
  `@fontsource/commissioner` (`src/app/layout.tsx`).
- **The routing line** under the Home field — `Θα ανοίξει → X · αλλαγή ·
  ≈ N credits` — after the router was measured as the owner asked:
  `node scripts/router-accuracy.mjs`, 50 sentences, 30 of 30 right when it
  names a page (`RouteLine` in `src/components/create/goal-preview.tsx`).
- **The rail** — New, Recent, All tools, Settings
  (`src/components/dashboard/sidebar.tsx`) — and **All tools** as a page
  (`src/app/dashboard/tools/page.tsx`).

`scripts/tests/design-home.prodtest.mjs` drives all three in Greek on a
desktop and a phone.

**Already in the product before this:** ⌘K over every tool, dark by
default with a light switch.

**Not yet:** numbered sources in chat answers (Perplexity), the Build split
view, the Arc-style motion, the Stripe type scale.

    node scripts/mockups.mjs              # writes ionexa.html, photographs it
    SKIP_SHOTS=1 node scripts/mockups.mjs # just the HTML

`ionexa.src.html` is the page, written by hand. `ionexa.html` is what the
script makes of it: the same page with the typeface inlined and a document
skeleton around it, so it opens from disk. Edit the first; the second is
generated.

On 2026-10-02 this replaced three skins (Claude-, Linear- and hybrid-style)
that the owner rejected in favour of one that combines them. Those three were
also published as private artifacts; the pages still exist until they are
deleted from the gallery, and nothing here refers to them any more.

## What it takes from where

- **Claude** — the base. One field in the centre, a quiet rail with New,
  Recent, All tools and Settings, and the result in a panel beside the
  conversation rather than replacing it.
- **Linear** — the palette (`⌘K`, or `/`), with arrow keys, Enter and Esc
  working, and typing that narrows it: `site` leaves `1 of 17`.
- **Arc** — motion: the incoming screen rises six pixels and settles, the
  palette scales in, the result panel slides in from the right. All of it off
  under `prefers-reduced-motion`.
- **Stripe** — type: one face at four weights, tight display tracking, a
  strict scale, tabular figures wherever digits stack.
- **Perplexity** — sources: numbered citations inside the answer and the
  same numbers on the source cards beneath it.

## The typeface, and why not the obvious one

Commissioner, drawn by Kostas Bartsokas. The faces that read most like Stripe
— Geist, Instrument Sans, Hanken Grotesk, Onest, Figtree — have **no Greek**,
checked against Google Fonts' own subset list on 2026-10-02, and this product
sells to Greek businesses. Commissioner, Geologica and Manrope do.

The two subsets used are in `fonts/` with their licence (`fonts/OFL.txt`, SIL
Open Font License 1.1), and are inlined into the page so the published copy
and the photographs cannot quietly render in a fallback face.

The mockup opens in Greek with an `EL / EN` switch, because Greek words run
about a third longer than English ones and a layout that only ever saw English
has not been tested.

## Three roads to every tool

1. **Type it.** The line under the field says what the field already reads
   while it is empty, and where it is going once you type — `Θα ανοίξει →
   Site · αλλαγή`. A system that picks the tool silently is one nobody can
   correct before the credits are spent. Nothing matched means "Ask me",
   never a guess.
2. **The palette.** Every tool, one keystroke away, narrowed by typing.
3. **All tools.** Seventeen cards in four groups — the only road a person can
   browse without knowing a name.

Each tool carries an icon, the name a customer would say, and one line of what
it does, from one list in the page script that the rail, the palette, the grid
and the routed line all read.

The routed line shows a cost only for the four tools `scripts/make-cost.mjs`
has measured (site 87, deck 15, posts 8, code 3 on Growth); the rest show no
number rather than an invented one.

## What it keeps, because it is the product and not the paint

- the data: what the home screen is reading, the sources under an answer, the
  panel built from the person's own records, and the build screen listing
  what it read (menu, hours, photographs) before what it made;
- **What this does not do**, in full, on the build screen;
- **What it can see**, in full, under the chat composer.

The numbers on every screen are a sample, and each screen says so.

## What the photographs are checked against

`window.mock.state()` reports what the page is actually showing, and each of
the 21 shots is refused unless it matches the file name. Two of these checks
exist because the first version passed without them:

- **Which screens are laid out.** The first check read the page's own
  variable for the current screen, and passed while all four screens were
  stacked on top of each other — `.split{display:flex}`, written below
  `.view{display:none}`, won. The check now reads layout. Putting the rule
  back fails with `visible screens are [home, chat, build]`.
- **Whether every icon is centred in its square.** `.opt span` and
  `.tool span` outranked `.tile` and put every icon in the corner. Putting
  one back fails with `an icon sits 7.0px off the centre of its square`.

Also checked on every shot: the theme and language the name claims, that
Commissioner actually loaded, and that nothing scrolls sideways; and at the
end, that the dark background is darker than the light one.
