# Cinematic sites — analysis, costs, and three samples

The brief of 2026-10-03: realism from AI images and video, the code does the
staging, at the level of Scrolltide's *Colibri* template, for any business,
from one sentence and the business's own data. It **replaces "3D from
geometry"** (`docs/v6-3d-sites-2026-10-02.md`). Three.js stays only as style
Ζ, for abstract subjects.

Each number here is **MEASURED** (on the three samples, by a command named
next to it), **LOOKED UP** (with the date, sources at the end), **DERIVED**
(by `node scripts/cinematic-cost.mjs`, which prints every cost below) or
**ASSUMED** (said so where it is used). A dash is a number nobody has measured.

    node scripts/cinematic-cost.mjs     # every euro and credit figure in §3
    node scripts/cinematic-check.mjs    # every MEASURED figure about the samples
    node scripts/cinematic-media.mjs    # the media trial, once GEMINI_API_KEY exists

## 0. The answer in six lines

1. **One key covers both halves.** Nano Banana Pro (images) and Veo 3.1
   (video, image-to-video, first and last frame) are both served by the
   Gemini API. `generativelanguage.googleapis.com` is also the only
   image/video host this environment's network policy lets through. fal,
   Runway, Kling, BFL and BytePlus are refused (tested 2026-10-03).
2. **The samples are built and published with storyboards in place of the
   AI media.** Every other part is real: the players, the layouts, the data,
   the Greek type, the fallbacks and the checks. The real image and clip go
   in with one command once the key exists, at the same three links.
3. **Style A (the Colibri direction) costs about €1.47 to make**, 368
   credits, or 600 credits with the free retry the brief promises. That fits
   Growth's 2,500 four times a month.
4. **The players are ours and the model writes no JavaScript.** One script,
   `ionexa-players.js` (loop, sequence, rotation, parallax), configured only
   by data attributes. That is what the published-site sandbox and the
   scanner's allowlist can hold.
5. **A pixel check catches text sitting on the subject.** It found four real
   collisions in the first draft of these samples, including the Arabic case:
   a photograph cannot be mirrored, so the title stays on the side the
   picture leaves free.
6. **Kling's terms need a lawyer before it is wired.** They forbid using
   output for "competitive products or services". Generating video for
   Ionexa's customers may be exactly that.

## 1. The style library

| | style | what moves | when it fits | cost to make (§3) | hero weight, target |
|---|---|---|---|---|---|
| **Α** | Subject hero (Colibri) | one clip looping behind the type; bokeh; huge word behind | one photogenic object: cup, dish, flower, bird | €1.47 | 1.5–2.5 MB desktop, under 1 MB phone (a WebM loop) |
| **Β** | Scroll build | scroll picks the frame of a "being built" clip, then the ordinary page | a place or a thing that assembles: hotel, dish, product | €1.69 (1080p) · €3.02 (4K) | 48 frames desktop, 32 phone |
| **Γ** | Product turn | scroll or drag turns the product through 360° | one product with a front and a back: bottle, shoe, jewel | €1.47 | 72 frames desktop, 36 phone |
| **Δ** | Burst / ingredients | the product opens and its parts float | food, drink, cosmetics | €1.47 | as Γ |
| **Ε** | Walk-through | the camera "walks" the space with the scroll | restaurant, villa, gym, shop | €3.55 (1080p) · €7.52 (4K) | 3 clips joined, ~96 frames; the heaviest |
| **ΣΤ** | Simple premium | parallax only, one 4K image | services, professions, any budget | €0.55 | the poster alone |
| **Ζ** | 3D (Three.js) | geometry | abstract and tech subjects, where realism does not matter | page only; priced 8× the simple site (the owner's rule) = 656 credits | three.js 163 KB gzip (measured in `docs/mockups/README.md`) |

The hero weights are **targets**. The samples carry storyboards, so their
measured weight (80–135 KB, below) says nothing about the real media. The
brief's ceilings (2.5 MB phone, 6 MB desktop) are written into
`scripts/cinematic-check.mjs`, so the real frames will be measured against
them the first time they exist.

## 2. Subject by industry

Ionexa picks without asking; the person can change it. **A photo the person
uploads always wins** over an AI image: it becomes the subject, with its
background removed for styles Α, Γ and Δ.

| # | industry | hero subject | style | palette (default; the brand's own colours replace it) |
|---|---|---|---|---|
| 1 | Hotel | the building at dusk | Β or Ε | whitewash, Aegean blue, dusk amber |
| 2 | Restaurant | a steaming dish | Α or Δ | charcoal, warm terracotta, linen |
| 3 | Café | a cup with steam | Α or Δ | dark roast, cream, copper |
| 4 | Cava / drinks | the bottle | Γ | cellar black, burgundy, gold |
| 5 | Clothing / shoes | the product | Γ | bone, ink, one brand colour |
| 6 | Jewellery | the piece in light | Γ | black velvet, champagne |
| 7 | Gym | an athlete moving, no identifiable face | Ε | graphite, electric lime |
| 8 | Real estate / villas | an interior | Ε | limestone, oak, olive |
| 9 | Clinic | a calm room | ΣΤ | white, sage, soft blue |
| 10 | Lawyer / accountant | abstract material (marble, paper, brass) | ΣΤ | navy, ivory, brass |
| 11 | Tech / SaaS | an abstract object | Ζ | near-black, one accent |
| 12 | Pet shop | an animal close up | Α | warm sand, teal |
| 13 | Florist | a bouquet opening | Δ or Α | blush, leaf green |
| 14 | Bakery (φούρνος) | bread breaking, steam | Δ | wheat, crust brown |
| 15 | Pastry shop | a dessert assembling | Β or Δ | pastel, cocoa |
| 16 | Car repair | an engine part, tools | Γ or ΣΤ | steel grey, signal orange |
| 17 | Hair salon | hair in motion, no face | Α | rose gold, charcoal |
| 18 | Barber | razor and tools | Γ or ΣΤ | black, brass |
| 19 | Travel agency | the destination from the air | Ε | sea blue, sand |
| 20 | School / tutoring | an open book on a desk | ΣΤ | ink blue, paper |
| 21 | Olive-oil producer | the pour, the bottle | Γ or Δ | olive green, gold |
| 22 | Winery | the vineyard at dusk | Ε | grape purple, earth |
| 23 | Beach bar | a cocktail with ice | Δ | turquoise, citrus |
| 24 | Dentist | a calm room | ΣΤ | white, mint |
| 25 | Architect / builder | the building rising | Β | concrete, blueprint blue |
| 26 | Furniture shop | the piece turning | Γ | walnut, linen |
| 27 | Cosmetics | the product and its ingredients | Δ | nude, botanical green |
| 28 | Electronics shop | the device turning | Γ or Ζ | black, cool white |
| 29 | Photographer | **their own photographs** | ΣΤ | from the photographs |
| 30 | Events / wedding venue | the venue at dusk | Ε | ivory, candle gold |
| 31 | Yoga / pilates | a calm room with light | ΣΤ or Α | sand, sage |
| 32 | Taverna / fish | meze on a table by the sea | Α | sea blue, white, lemon |
| 33 | Car / boat rental | the boat moving | Ε or Α | sea, white |
| 34 | Honey / local produce | honey dripping | Δ | amber |
| 35 | Bike shop | the bike turning | Γ | graphite, one colour |
| 36 | Kids' activities | toys bursting apart | Δ | soft primaries |

**No identifiable faces** in any generated subject. Gym, salon and barber
avoid them by framing (motion, back, hands, tools). That keeps every site
clear of the brief's "real people" rule and of the EU AI Act's deepfake
disclosure (§11).

## 3. What it costs — DERIVED 2026-10-03

From `node scripts/cinematic-cost.mjs`. The margin, credit price and page
cost are read from the repo; provider prices are dated in the script.
Paid plans apply 5× per action, which is the real 4.00× once free chat is
counted (`combined-ceiling.test.mjs`). A credit is €0.02 on every plan.

| style | media | page + QA | total | credits | with the free retry |
|---|---|---|---|---|---|
| ΣΤ simple premium | €0.22 | €0.32 | €0.55 | 137 | 137 |
| Α subject loop | €1.10 | €0.37 | €1.47 | 368 | **600** |
| Γ product turn | €1.10 | €0.37 | €1.47 | 368 | 600 |
| Δ burst | €1.10 | €0.37 | €1.47 | 368 | 600 |
| Β build, 1080p | €1.32 | €0.37 | €1.69 | 424 | 655 |
| Β build, 4K (Pro) | €2.65 | €0.37 | €3.02 | 755 | 1,318 |
| Ε walk-through, 1080p | €3.09 | €0.45 | €3.55 | 887 | 1,581 |
| Ε walk-through, 4K (Pro) | €7.07 | €0.45 | €7.52 | 1,880 | 3,569 |

**Price the retry in.** The brief promises one free retry when QA fails. If
the price carries only the first take, a failed take sells below 4×. The
"with the free retry" column is the price that holds 4× in the worst case.
I recommend it, and it is still well inside Growth's 2,500 for style Α.

Video is Veo 3.1 **Fast** at 1080p, €0.88 for an 8 s clip. For comparison,
the same clip from Veo 3.1 Standard is €2.94 and from Kling 3.0 native 4K
€3.09. Whether Standard is worth 3.3× is exactly what the trial in §4
measures; until it runs, the table uses Fast.

QA's token counts are ASSUMED (two screenshots and eight frames at ~1,600
tokens each). Until the judge exists, nothing measures them.

**Plans** (the brief's rule, unchanged): ΣΤ from Starter; Α, Γ, Δ from
Growth; Β and Ε from Growth at 1080p, 4K from Pro. A provider failure
charges nothing; the reservation is released, as every job already does.

## 4. Prompts — written by us

`scripts/lib/cinematic-prompts.mjs` holds them: one template per style,
three variants each, filled with the industry's subject and the brand's
palette. **The person never writes an image prompt.** The variants differ in
one thing each (light, lens, room around the subject), so that whichever
wins, the reason is readable. Every prompt carries the negative list: no
text, no logos, no real or recognisable people, no faces, no warped hands or
geometry. A loop asks for the same first and last frame, and the API is
given both (Veo 3.1's `lastFrame`).

**Which variant wins is not yet known.** The trial needs the key:
`node scripts/cinematic-media.mjs` makes three images and three clips per
sample and keeps every take, I judge them, and the winners and the reasons
are written here. Until then, any "this prompt is best" would be invented.

## 5. Staging — the code

All of it is in the samples and holds in Greek, English and Arabic:

- **the huge word behind the subject**, by z-order (`.bigword` in the café);
- **parallax on three layers** (background, subject, cards) through
  `data-ix-depth`, off under reduced motion;
- **stepped cards with the real prices** (café, cava);
- **one big moving thing per page**; everything after the hero is still;
- **after the hero**: menu / rooms / shelf, booking or buying, place,
  contact, all from the data.

**Type with Greek — MEASURED 2026-10-03** from Google Fonts' own subset list
(`fonts.googleapis.com/css2`):

| has Greek | does **not** have Greek |
|---|---|
| GFS Didot, GFS Neohellenic, EB Garamond, Noto Serif Display, Noto Serif, Literata, Alegreya, Piazzolla, Commissioner, Manrope, Inter, Roboto Flex, Geologica, Ysabeau, Didact Gothic, Comfortaa, Advent Pro | **Playfair Display, Cormorant Garamond, Fraunces, Bodoni Moda, Libre Caslon Display, Montserrat, Figtree, Onest** |

The right-hand column is the trap. Most of the "luxury" faces a generator
reaches for have no Greek, and a Greek headline in them falls back to
something else. Pairs used in the samples:

| style | pair |
|---|---|
| quiet luxury (hotel) | GFS Didot + Manrope |
| warm (café) | Literata + Commissioner |
| editorial (cava) | Noto Serif Display + Manrope |
| Arabic, in all three | Noto Naskh Arabic |

**Colour.** The defaults in §2 are starting points; in production the palette
is taken from the subject image and the logo. Contrast is measured, not
assumed: `cinematic-check.mjs` composes every text colour over its real
background and requires 4.5:1 (3:1 for large text). A mutation that dimmed
the café's secondary text turned it red in all six screen×language
combinations.

**Arabic.** Two rules the samples taught:
- Numbers and prices are kept left-to-right inside Arabic text
  (`.num { direction: ltr; unicode-bidi: isolate }`). Without it, "10–12 °C"
  printed as "C° 12–10".
- The title sits on the side the picture leaves free, whatever the reading
  direction, because a photograph cannot be mirrored.

## 6. Changes in words

| what the person says | what changes | cost |
|---|---|---|
| "warmer colours" | CSS tokens only | page edit, ~11 credits (the `websiteEdit` estimate); no media |
| "slower motion" | `data-speed` on the player | the same; no media |
| "make the subject a cup" | new image + new clip | the style's media cost again (Α: ~368) |
| "use my photo" | background removal + replace | Nano Banana Pro edit at 2K, $0.134, plus the clip if the style has one |

Every change shows its cost first (the existing `cost-before` gate). Each
version is kept, so the person can go back to any earlier one. That needs
one table (`site_versions`) and is in Phase 2. The free CSS changes are
the cheapest win here and need no media at all.

## 7. Performance, phone, accessibility, SEO

Measured on the samples by `node scripts/cinematic-check.mjs`
(headless Chromium, 2026-10-03):

| | café | hotel | cava |
|---|---|---|---|
| loaded, desktop / phone | 135 / 135 KB | 99 / 93 KB | 81 / 81 KB |
| LCP desktop / phone | 568 / 148 ms | 500 / 124 ms | 480 / 144 ms |
| CLS desktop / phone | 0.028 / 0 | 0.007 / 0 | 0.001 / 0 |
| one interaction, desktop | 200 ms | 16 ms | 24 ms |

- These are the **storyboard** pages. Their weight, LCP and interaction
  time will change with the real media.
- Fonts are not in the byte count: Google Fonts sends no
  `Timing-Allow-Origin` header.
- What the numbers do show: posters paint first, nothing shifts, and the
  players add no measurable layout cost.

What every page does, and the checker holds:
- the poster is in the HTML, with real alt text;
- without JavaScript every product, price and address is readable (checked
  against the business's data);
- reduced motion and Save-Data leave the poster and draw nothing over it;
- 2G/3G is treated as Save-Data (`navigator.connection.effectiveType`);
- the phone gets fewer frames (32/36 instead of 48/72);
- a wide build (style Β) gets its own upright frame on a phone;
- schema.org `Hotel`, `CafeOrCoffeeShop` and `LiquorStore`, with offers.

## 8. Quality control — the Completion Contract

`scripts/cinematic-check.mjs` is that contract for the samples, and the
shape the product's will take. A site is not delivered unless:

- **nothing scrolls sideways**, and no text box leaves the screen;
- **no hero text sits on the subject.** Behind every line of the hero, with
  the text hidden, the picture's fine detail must stay under σ = 2.5:
  - calibrated on the samples: calm backgrounds read ≤ 1.6, the real
    collisions 2.6–8.2;
  - it measures pixels, so it works on the AI picture exactly as on a
    storyboard;
  - the first version measured plain luminance spread and failed a title
    for sitting on its own bokeh; it was corrected to measure only what is
    left after a blur;
- **contrast** 4.5:1 / 3:1;
- **all of the business's data** is on the page, with and without
  JavaScript;
- **the players work**: halfway down the scroll, the sequence is at its
  halfway frame;
- **only our scripts run**, and every inline `<script>` is data;
- **within the weight budgets**.

Two mutations were run on it: a dimmed colour and a removed price. Each
went red on its own clause and on nothing else.

Still to build, and needing the media: the **video** checks (distortion,
flicker, a jump at the loop seam). The plan is to compare the first and last
frame of a loop and run a frame-difference check for flicker, with a vision
judge on eight frames. On failure: one targeted retry, then check again.

## 9. Template library

A page of ready examples per style and industry; "I want something like
this" starts from one, filled with the person's own data. A site the person
keeps and publishes can become a template **with their consent**. Built in
Phase 3, once there are real examples to put on it.

## 10. Security and legal

- **Players are ours**, and the model writes HTML and data attributes only.
  The samples run two scripts: `ionexa-players.js`, and `sample.js`, which a
  real site does not have. The checker fails any other `<script>`. In the
  product, the players join the scanner's allowlist (the V6.1 3D item's
  "our own scripts only", now these) and run inside the existing
  published-site sandbox
  (`src/lib/publishing/public-serving.ts`).
- **Commercial use — LOOKED UP 2026-10-03, secondary sources** (each
  provider's own terms page is blocked here):

  | provider | what we found | status |
  |---|---|---|
  | Gemini API (Nano Banana Pro, Veo) | commercial use allowed; Google claims no ownership; outputs carry SynthID | fine for this use |
  | Runway | paid plans own their outputs and may use them commercially | fine for this use |
  | Kling | commercial use allowed for paying members, **"except for the purposes of developing or offering competitive products or services"** | **needs a lawyer**: Ionexa offering video generation to its customers may be exactly that |

- **No third-party brands, no real people**: the negative list in every
  prompt, plus the moderation step the image API applies.
- **EU AI Act, Article 50 — enforceable since 2026-08-02:**
  - The **providers** (Google) must mark output machine-readably; SynthID
    does that.
  - **Deployers** must disclose deepfakes. A cup, a bottle or a hotel is not
    one, and no faces are generated.
  - The samples still say in their footer that the first screen's image and
    clip are made with AI. I recommend keeping that line on every site:
    one sentence, and it removes the question.

## 11. Benchmark against the reference — not yet possible

`scrolltide.co` is blocked by this environment's network policy, so the
reference itself could not be opened. What is known of *Colibri* comes from
search results only: a hummingbird hovering head-on, wings blurred, green
and peach bokeh, the wordmark enormous behind it, two stepped cards with
numbers. Style Α is built to that description. A blind comparison over five
industries needs the real media and the reference pages side by side. It
comes in Phase 4 and will report only what it measured.

## 12. Phases — my estimate, 2026-10-03

| phase | contents | estimate |
|---|---|---|
| 1 | styles Α + ΣΤ, 5 industries, flow 1–8, the checks above in the product, the free retry | **3–4 weeks** |
| 2 | styles Γ + Δ, 15 industries, changes in words, version history | **2–3 weeks** |
| 3 | styles Β + Ε (sequences, frame extraction on the server), the template library | **3–4 weeks** |
| 4 | all industries, the blind benchmark, 4K | **2 weeks** |

**Two dependencies decide Phase 1's real length:**
- **Frame extraction needs ffmpeg on the server.** Vercel functions do not
  ship it, so it is either a static binary in the function or a small worker
  elsewhere. Here it ran from npm (`@ffmpeg-installer/linux-x64`).
- **The "Activity Timeline" and the "Completion Contract"** are the first two
  systems of V6.2 (`docs/intelligence-os.md`). The brief asks for both here:
  progress per step, and nothing delivered unchecked. Built once, they serve
  both.

## 13. The three samples, and what they cost to finish

| sample | style | link |
|---|---|---|
| Αιθρία Suites, Oia | Β (scroll build) | https://claude.ai/artifact/32QHrJBBaocVfZt3mCjVHD |
| Κόκκος, Thessaloniki | Α (subject hero) | https://claude.ai/artifact/UgicUMTZCWUrzqhucXxjuk |
| Οινοθήκη Αμπελών, Athens | Γ (product turn) | https://claude.ai/artifact/Wh6SXQNzNnc2nsPrdSDTyS |

All three are fictional businesses, and each page says so. The media is a
storyboard today, also labelled on the page. The trial that replaces it
(three image prompts and three clips per sample, the best kept) costs
**$11.04, about €10.16**, at Veo 3.1 Fast. At Veo 3.1 Standard it is $31.20.
DERIVED by the cost script.

## Sources, read 2026-10-03

- Veo 3.1 prices: <https://developer.puter.com/tutorials/gemini-api-pricing/>, <https://openrouter.ai/google/veo-3.1>, <https://www.veo3gen.app/blog/veo-3-1-pricing-plans>. The official page, `ai.google.dev`, is blocked here.
- Gemini API commercial use and SynthID: <https://zenn.dev/sora_biz/articles/gemini-api-image-generation-guide?locale=en>, <https://www.aifreeapi.com/en/posts/nano-banana-pro-watermark-commercial-use>
- Kling and Runway terms: <https://hackernoon.com/can-you-use-ai-generated-video-commercially-heres-the-checklist-tool-by-tool>, <https://terms.law/ai-output-rights/runway/>, <https://help.runwayml.com/hc/en-us/articles/18927776141715-Usage-rights>
- EU AI Act Article 50: <https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50>, <https://artificialintelligenceact.eu/transparency-rules-article-50/>
- Scrolltide: <https://www.scrolltide.co/templates> (blocked here; described from search results)
- Image prices: `docs/v6-images-2026-10-02.md`; Kling: `docs/v6-video-2026-10-02.md`
