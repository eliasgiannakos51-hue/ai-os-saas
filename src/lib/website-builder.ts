import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { looksLikeCompleteHtmlDocument } from "@/lib/html-document-check";
import { extractHtmlDocument, containsHtmlDocumentStart } from "@/lib/website-html-extract";
import { functionBudgetMs } from "@/lib/function-limits";
import { MAX_REFERENCE_IMAGES } from "@/lib/website-reference-image";
import { applyExactReplace } from "@/lib/website-patch";
import { AI_QUALITY_CHECKLIST_EN } from "@/lib/ai-quality-checklist";
import { AI_SAFETY_BOUNDARIES_EN } from "@/lib/ai-conduct";
import { WEBSITE_BUILDER_MODEL } from "@/lib/ai-models";
import type { CostAccumulator, CostStage } from "@/lib/billing/cost-accumulator";
import { multipageInstruction } from "@/lib/website-multipage";
import { QUOTE_FIELDS_BY_INDUSTRY } from "@/lib/websites/form-types";
import { seoInstruction } from "@/lib/seo/prompt";

const MODEL = WEBSITE_BUILDER_MODEL;
// Re-exported so the route's billing estimate prices the same model this
// file actually calls, without the route reaching for a raw string.
export const WEBSITE_MODEL = MODEL;
const CLASSIFY_MAX_TOKENS = 300;
// A single-file website (all CSS inline, real copy for every section) can
// run long — much longer than a chat reply. This used to share a much
// smaller ceiling more suited to conversational output; a sufficiently
// long, detailed description could push generation past that budget,
// truncating the response mid-document. See looksLikeCompleteHtmlDocument
// below and its call sites for how that's now caught instead of silently
// shipping broken HTML.
//
// claude-sonnet-4-6's documented maximum output. This was 64000 — a
// deliberate middle ground, on the theory that a bigger token budget just
// converts "cut off for being too large" into "cut off for taking too
// long" against the route's maxDuration.
//
// Production then cut off at 13,624 output tokens, which is not close to
// either ceiling. The token budget was never the binding constraint, and
// treating it as one is what let the real cause (see
// streamHtmlToCompletion) survive a round of fixes. It sits at the model
// maximum now so that it is unambiguously not the limit; the wall-clock
// ceiling is handled where it actually lives, by CONTINUATION_DEADLINE_MS
// below.
const WEBSITE_MAX_TOKENS = 128000;
// How many extra calls to allow after the first, when the first does not
// come back with a finished document. Each round is a full extra model
// call (latency + real money), so this stays bounded — but 2 was too tight
// once pause_turn rounds are in the mix, since a server-side search loop
// can consume a round without producing much document.
const MAX_CONTINUATION_ROUNDS = 4;
// Vercel kills the function at maxDuration (800s for the generate
// processor) and everything in flight is lost — we have already paid for
// every token generated up to that point. Starting a fresh round with
// almost no time left buys a near-certain hard kill instead of a clean,
// reportable failure, so rounds stop when the remaining window is smaller
// than a round plausibly needs.
// Was a hardcoded 700_000 (~11.7 min), which is only meaningful on a
// platform that grants 800 seconds. On Vercel Hobby the whole invocation
// is 60 seconds, so a deadline of 700s never fires and the function is
// killed mid-round with every token already paid for.
//
// The budget now comes from lib/function-limits.ts, which reads
// MAX_FUNCTION_DURATION. functionBudgetMs() already subtracts a safety
// margin for the writes that follow, so this is the room genuinely
// available for model rounds.
function continuationDeadlineMs(): number {
  return Math.min(700_000, functionBudgetMs());
}

// How much room one more round needs before it is worth starting.
//
// It was a flat 120_000, which on a 60-second budget is larger than the
// budget itself — so the guard would refuse EVERY continuation and a
// truncated document could never be finished. Scaling it to the budget
// keeps the original intent (do not start a round that will certainly be
// killed) at any ceiling: a third of the budget, floored at 15s so it
// stays meaningful, capped at the original 120s so a generous plan
// behaves exactly as before.
function minMsForAnotherRound(): number {
  const budget = continuationDeadlineMs();
  return Math.min(120_000, Math.max(15_000, Math.floor(budget / 3)));
}
const CONTINUATION_INSTRUCTION =
  "Continue the HTML document EXACTLY where you left off — do not repeat anything you already wrote, do not restart the document, and do not add any commentary or markdown code fences. Output only the raw continuation of the HTML from the exact point it was cut off.";

// Same native, server-executed tool used by api/chat/route.ts — was
// missing here entirely before an earlier fix: streamHtmlToCompletion's
// anthropic.messages.stream() call never passed a `tools` array at all,
// so the model had no way to actually search the web no matter what the
// system prompt said to do, for either a fresh generation or an edit
// (both go through this same function).
//
// max_uses was 3, copied from chat's per-reply limit. A chat reply answers
// one question; a website has to establish the AREA, the INDUSTRY and the
// going RATES before it can write a single true sentence, and 3 searches
// cannot cover three subjects. The MANDATORY RESEARCH block below asks for
// one search per subject plus follow-ups, so the ceiling is raised to
// match what is actually being asked for.
//
// Cost is bounded and measured: Anthropic bills $10/1,000 searches and
// every one lands in usage.server_tool_use.web_search_requests, which
// CostAccumulator records and settlement charges at the account's margin
// (see lib/billing/model-pricing.ts's WEB_SEARCH_USD_PER_QUERY). Eight
// searches is $0.08 — real, but a fraction of the generation itself, and
// it is the difference between a page about a real neighbourhood and a
// page of plausible-sounding filler.
const WEBSITE_MAX_SEARCHES = 8;
const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20250305 = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: WEBSITE_MAX_SEARCHES,
};
// Edits are a targeted change to an existing page, not a fresh brief, so
// they keep the smaller budget — an edit rarely needs to re-establish the
// whole context.
const EDIT_MAX_SEARCHES = 3;
const EDIT_WEB_SEARCH_TOOL: Anthropic.WebSearchTool20250305 = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: EDIT_MAX_SEARCHES,
};

// Off-topic guard — without this, a request like "write me a poem" had no
// way to be rejected: generateWebsiteHtml's system prompt is a strong,
// unconditional directive to always output a complete HTML document, so
// it would likely just wrap the poem in a page instead of explaining that
// Website Builder generates websites. This is a small, cheap, forced-tool
// classification call (same pattern as api/create's classifier) run
// BEFORE the expensive generation call and BEFORE credits are deducted
// (see api/websites/generate/route.ts), so an off-topic request costs the
// user nothing and gets a real, helpful message instead of garbage HTML.
const CLASSIFY_SYSTEM_PROMPT = `You determine whether a message actually describes a WEBSITE the user wants built (a page for a business, product, portfolio, event, landing page, personal site, etc.) — as opposed to an unrelated request that has nothing to do with building a website (e.g. "write me a poem", "tell me a joke", a recipe, a general question, small talk).`;

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "classify_website_request",
  description: "Decide whether the given message is actually describing a website to generate.",
  input_schema: {
    type: "object",
    properties: {
      isWebsiteRequest: {
        type: "boolean",
        description: "True if this message describes a website/page the user wants built.",
      },
      message: {
        type: "string",
        description:
          "If isWebsiteRequest is false: a short, friendly message explaining that Website Builder generates websites, and asking them to describe one. Empty string otherwise.",
      },
    },
    required: ["isWebsiteRequest", "message"],
  },
};

const DEFAULT_OFF_TOPIC_MESSAGE =
  "Website Builder generates real websites from a description — try describing the site you want (e.g. its purpose, sections, and style) instead.";

export type WebsiteDescriptionClassification =
  | { isWebsiteRequest: true }
  | { isWebsiteRequest: false; message: string };

// Pure, deterministic interpretation of the classifier's tool_use input —
// separated from the Anthropic call itself so it can be unit tested
// against hand-constructed inputs without a live API call.
export function parseWebsiteClassification(input: {
  isWebsiteRequest?: unknown;
  message?: unknown;
}): WebsiteDescriptionClassification {
  if (input.isWebsiteRequest === false) {
    const message =
      typeof input.message === "string" && input.message.trim() ? input.message.trim() : DEFAULT_OFF_TOPIC_MESSAGE;
    return { isWebsiteRequest: false, message };
  }
  return { isWebsiteRequest: true };
}

export async function classifyWebsiteDescription(
  apiKey: string,
  description: string,
  costs?: CostAccumulator
): Promise<WebsiteDescriptionClassification> {
  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: CLASSIFY_MAX_TOKENS,
    system: CLASSIFY_SYSTEM_PROMPT,
    messages: [{ role: "user", content: description }],
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: "classify_website_request" },
  });

  costs?.record("classification", response.usage, response.model || MODEL);

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  // Fail open (treat as a real website request) on a malformed response —
  // same "best-effort, don't block the real feature" tolerance as every
  // other best-effort AI helper in this app (e.g. lib/user-context.ts).
  if (!toolUse) return { isWebsiteRequest: true };

  return parseWebsiteClassification(toolUse.input as { isWebsiteRequest?: unknown; message?: unknown });
}

// A curated list of real, verified Google Fonts spanning sans body faces,
// display/heading faces, and serif faces — given to the model BY NAME so
// it recognizes a user's specific request ("use Poppins", "something like
// Playfair Display") and can also pick a fitting one itself when the user
// only describes a vibe ("something elegant" -> a serif display face,
// "something modern" -> a geometric sans). Every name here is loadable
// via the exact fonts.googleapis.com/css2?family=... convention shown
// below.
const GOOGLE_FONTS_LIST = [
  "Inter", "Poppins", "Montserrat", "Playfair Display", "Raleway", "Lora",
  "Roboto", "Open Sans", "Nunito", "Work Sans", "DM Sans", "Space Grotesk",
  "Manrope", "Outfit", "Plus Jakarta Sans", "Sora", "Cormorant Garamond",
  "Libre Baskerville", "Merriweather", "Crimson Pro", "Bodoni Moda",
  "Fraunces", "Archivo", "Josefin Sans", "Quicksand", "Karla",
  "Source Sans 3", "IBM Plex Sans", "Urbanist", "Epilogue", "Rubik",
  "Barlow", "Oswald", "Prata", "Cormorant", "Abril Fatface", "Bebas Neue",
  "Domine", "Zilla Slab", "Spectral",
].join(", ");

const FONTS_SECTION = `
FONTS (Google Fonts):
Available named fonts you recognize and can use exactly by this name: ${GOOGLE_FONTS_LIST}.
- If the user names a specific one of these (or something close/misspelled), use that exact font.
- If the user names a font NOT in this list, use the closest visual match from the list instead (never invent a fake font-family name).
- If the user names no font, use the TYPE PAIRING named in this site's DESIGN VARIATION block (it arrives with the brief) and load exactly those families. A seven-way subject-to-font mapping used to live here; it is gone because it produced the same seven looks across every site ever generated, which is what the drawn pairing exists to replace. If no pairing was supplied, pick deliberately from the list above by subject — never Inter by default.
- Inter is a perfectly good body face and it is also the most over-used font on the web. Do not reach for it by default — choose it when it is right, not when nothing else came to mind.
- To actually load a font, add BOTH of these to <head> (this is the one and only external-resource exception in this document — see the rules above):
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=FONT+NAME:wght@400;600;700&display=swap" rel="stylesheet">
  (replace spaces in FONT NAME with + in the URL, e.g. "Playfair Display" -> family=Playfair+Display)
- Then reference it in CSS: font-family: 'Font Name', sans-serif; (or serif, matching the font's actual category).`;

// "reproduce these patterns consistently rather than inventing new ones
// each time" used to be the first line of this section. It is a direct
// order to be identical every time, and it is one of the reasons every
// generated site looked like every other one: the same three effects, on
// the same elements, in the same order, whatever the site was for.
//
// These are now REFERENCE IMPLEMENTATIONS — correct, tested CSS to copy
// when a given effect is the right one — with an explicit instruction
// that most sites need one or none. The literal sunset/purple gradient in
// pattern 4 is gone for the same reason: a caveat saying "pick colours
// that fit" does not survive contact with four concrete hex values sitting
// right above it.
const ANIMATIONS_SECTION = `
ANIMATIONS (pure CSS). These are REFERENCE IMPLEMENTATIONS, not a checklist — copy the CSS for an effect when that effect is right for THIS site, and skip the rest. Most good sites use one, or none. Using all five on every site is a failure, not thoroughness.

1) Scroll-reveal fade-in — add class="reveal" to a section, plus this CSS and this exact tiny script (the ONLY two purposes an inline <script> may ever be used for in this document are this effect and the contact-form handler described below):
   CSS:
     .reveal { opacity: 0; transform: translateY(MOTION_DISTANCE); transition: opacity MOTION_DURATION MOTION_EASING, transform MOTION_DURATION MOTION_EASING; }
     .reveal.is-visible { opacity: 1; transform: translateY(0); }
   Script (place once, right before </body>):
     <script>
       var revealEls = document.querySelectorAll('.reveal');
       var io = new IntersectionObserver(function(entries){
         entries.forEach(function(entry){ if (entry.isIntersecting) entry.target.classList.add('is-visible'); });
       }, { threshold: 0.15 });
       revealEls.forEach(function(el){ io.observe(el); });
     </script>

2) Parallax-style background movement — a section with a background photo:
     .parallax-section { background-image: url('...'); background-attachment: fixed; background-size: cover; background-position: center; }

3) Smooth hover lift — for whatever element this page actually has that should respond to a pointer. Name the class after that element in THIS design; do not introduce a card because a hover effect exists.
     .lift { transition: transform MOTION_DURATION MOTION_EASING, box-shadow MOTION_DURATION MOTION_EASING; }
     .lift:hover { transform: translateY(calc(-1 * MOTION_DISTANCE)) scale(1.02); box-shadow: 0 20px 40px rgba(0,0,0,0.15); }

4) Animated gradient — for any large colour field this design already calls for. The four colour stops below are written as PLACEHOLDERS on purpose: substitute four real colours from THIS site's own palette. Emitting a literal purple/orange gradient on a law firm or a bakery is exactly the kind of copied default this section exists to prevent. Several shapes above forbid a gradient outright; the shape you chose wins over this snippet.
     .gradient-bg { background: linear-gradient(-45deg, COLOR_1, COLOR_2, COLOR_3, COLOR_4); background-size: 400% 400%; animation: gradientShift MOTION_AMBIENT ease infinite; }
     @keyframes gradientShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }

5) Staggered entrance for a list — write one delay rule per item the list ACTUALLY has, however many that is. The count below is an illustration of the pattern, not a target:
     .stagger-item { opacity: 0; animation: fadeInUp MOTION_DURATION MOTION_EASING forwards; }
     .stagger-item:nth-child(n) { animation-delay: calc(n * MOTION_STAGGER); }  /* i.e. one rule per real item */
     @keyframes fadeInUp { from { opacity: 0; transform: translateY(MOTION_DISTANCE); } to { opacity: 1; transform: translateY(0); } }

MOTION_DURATION, MOTION_DISTANCE, MOTION_EASING, MOTION_STAGGER and MOTION_AMBIENT are PLACEHOLDERS, like the gradient's COLOR_1..COLOR_4: substitute the numbers from the MOTION TIMING line of this site's DESIGN VARIATION block, never literals. Every site moving at the same speed reads as the same template however different its layout is.
Reach for these when the description asks for "impressive"/"modern"/"animated" or similar. A restrained, serious or editorial site is BETTER with no animation at all — do not add motion to prove effort.`;

// THE SECTION THAT DID NOT EXIST, and whose absence is the real reason
// every generated site looked the same.
//
// The rest of this prompt is exhaustively specific about MECHANICS —
// which fonts, which animation CSS, how to embed a photo, how to wire a
// form, what not to invent — and completely silent about STRUCTURE. It
// never said that a lawyer's page and a café's page are different shapes.
//
// A model given detailed mechanics and no structural guidance falls back
// on its own strongest prior, which for "make me a website" is the
// generic centred-hero SaaS landing page: hero with a gradient, three
// feature cards with icons, a testimonial, a CTA band, a fat footer. That
// is what was arriving every time, for every business, and it was the
// prompt's silence producing it rather than any template inside it.
//
// So this names real archetypes with genuinely DIFFERENT shapes, bans the
// default explicitly, and makes the choice the first decision the model
// takes — before it writes any markup.
const SITE_SHAPE_SECTION = `
SITE SHAPE — DECIDE THIS FIRST, BEFORE YOU WRITE ANY HTML:
Different businesses need structurally different pages. Ask "what is a visitor to THIS site actually trying to do, and what is the fastest path to it?", then build that page. The answer is different for a café and for a barrister, and the two pages should not be recognisable as the same template with different words in it.

CHOOSE EXACTLY ONE of the seven shapes below, by subject, and build THAT page. This is a closed list — the archetype you name in your DESIGN DECISIONS block must be one of these seven words. If the subject sits between two, pick the one whose visitor question matches and take nothing from the other.

Each shape sets five things. They are not stylistic preferences; they are what makes two pages structurally different rather than differently worded.

Each shape offers THREE ORDERS, A, B and C. Every one of them is a correct page for that subject — they differ in what a visitor meets first after the opening, which is the difference between two sites of the same kind reading as two sites and reading as one template twice. The DESIGN VARIATION block given below this prompt names which letter to use for THIS generation. Use that letter's order. It is not a suggestion and it is not a tie-break: two tavernas that both build ORDER A are the reported defect, not a coincidence.

- local-place: café, restaurant, taverna, bar, salon, gym, clinic, shop, campsite, hotel.
  FIRST: a full-bleed photograph of the actual place, before any heading.
  ORDER A: photo > menu or price list or timetable > hours and address and phone > gallery > map.
  ORDER B: photo > hours and address and phone > menu or price list or timetable > map > gallery.
  ORDER C: menu or price list or timetable > photo > gallery > hours and address and phone > map.
  TYPE: a warm display face for headings against a plain sans body; prices set large, prose set small.
  IMAGES: many — the room, the food, the pitches, the view. Photography carries this page.
  NEVER: feature cards, a testimonial section, or any marketing prose above the menu.

- professional-services: lawyer, accountant, architect, consultant, therapist, medical practice, engineer.
  FIRST: the practice name and one sentence of plain text stating what is done and for whom.
  ORDER A: name and statement > practice areas as a plain list > credentials and qualifications > people > contact form and direct phone.
  ORDER B: name and statement > people > practice areas as a plain list > credentials and qualifications > contact form and direct phone.
  ORDER C: name and statement > credentials and qualifications > practice areas as a plain list > contact form and direct phone > people.
  TYPE: one serif at two sizes, high contrast, generous line height; no decorative face anywhere.
  IMAGES: sparse — one portrait or one interior at most, and never stock handshakes or headsets.
  NEVER: icon cards, gradients, animation, or a photograph before the first sentence of text.

- gallery: photographer, designer, illustrator, artist, studio, craftsperson, architect's portfolio.
  FIRST: the work itself — a full-width image or a grid, before any headline at all.
  ORDER A: work > more work > one short statement > contact as a single line.
  ORDER B: one short statement > work > more work > contact as a single line.
  ORDER C: work > one short statement > more work > contact as a single line.
  TYPE: one small, quiet sans at one or two sizes; the type must never compete with the images.
  IMAGES: the maximum — the page is images with captions, not text with illustrations.
  NEVER: a hero band with a headline over the work, feature cards, testimonials, or a fat footer.

- editorial: personal site, CV, writer, researcher, essay, newsletter, about-me page.
  FIRST: a name and one true sentence, set as text, in a single column.
  ORDER A: name and sentence > the substance in prose > selected work as a plain list > contact line.
  ORDER B: name and sentence > selected work as a plain list > the substance in prose > contact line.
  ORDER C: name and sentence > the substance in prose > contact line > selected work as a plain list.
  TYPE: one text face at a comfortable measure of 60-75 characters, large body size, real paragraphs.
  IMAGES: almost none — one portrait at most; this page is read, not looked at.
  NEVER: a hero band, cards of any kind, columns, a gradient, or any full-bleed section.

- catalogue: products, properties, vehicles, courses, a priced menu of services.
  FIRST: the items themselves, as a dense grid or a real table, with prices visible immediately.
  ORDER A: items with prices > filters or categories > how to order or enquire > delivery and terms.
  ORDER B: filters or categories > items with prices > delivery and terms > how to order or enquire.
  ORDER C: items with prices > how to order or enquire > filters or categories > delivery and terms.
  TYPE: one compact sans throughout; tabular figures for prices, tight line height, small headings.
  IMAGES: one per item, uniform in crop and size — consistency matters more than individual quality.
  NEVER: a marketing hero above the items, or a page where a price requires scrolling to find.

- event: wedding, conference, launch, fundraiser, festival, one-off campaign.
  FIRST: the date, the place and the single action, together, above everything else.
  ORDER A: date and place and action > what it is > schedule or programme > directions > the action again.
  ORDER B: date and place and action > schedule or programme > what it is > directions > the action again.
  ORDER C: date and place and action > what it is > directions > schedule or programme > the action again.
  TYPE: one strong display face for the date and the action; everything else deliberately quiet.
  IMAGES: one or two atmospheric photographs, used full-bleed as backdrops rather than as content.
  NEVER: more than one call to action, a pricing table, or a features section.

- product-landing: SaaS, app, digital product, subscription tool.
  FIRST: a headline stating the value proposition, with a signup action beside it.
  ORDER A: value proposition > how it works > features > pricing > final call to action.
  ORDER B: value proposition > features > how it works > pricing > final call to action.
  ORDER C: value proposition > how it works > pricing > features > final call to action.
  TYPE: a geometric sans at strong weight contrast, tight headline tracking.
  IMAGES: product screenshots and interface shots, not photographs of people.
  NEVER: use this shape for anything that is not actually a software product — it is the correct answer here and the wrong answer for every other brief on this list.

FORBIDDEN DEFAULT: do NOT produce the generic centred-hero landing page — big centred headline over a gradient, a row of three feature cards with icons, a testimonial, a CTA band, a fat footer — unless the brief genuinely IS a product/SaaS landing page. It is the single most over-used shape on the web and it is wrong for most of the briefs you will receive.

VARY THESE DELIBERATELY, driven by the subject rather than by habit:
- HERO: full-bleed photograph / split text-and-image / purely typographic with no image / asymmetric offset / no hero at all, opening straight into the work or the menu.
- NAVIGATION: a normal top bar / a logo alone / anchored section links / none, for a short single-purpose page.
- SECTION RHYTHM: alternating left-right blocks / full-bleed colour bands / a card grid / one continuous editorial column / an overlapping asymmetric layout.
- PALETTE: build it inside the PALETTE STRATEGY named in this site's DESIGN VARIATION block, deriving the actual hex values from the subject — a taverna is not a fintech. Never the default indigo-to-violet gradient unless the brief asks for it.
- TYPOGRAPHY: vary the pairing, the scale and the weight contrast per the shape above; see FONTS.
- DENSITY: a listings page should be dense; a portfolio should be sparse. Do not apply the same vertical rhythm to both.

If two sites you generated for two different businesses would look like the same page with the words swapped, you have not done this step.

COMMIT TO THE DECISIONS BEFORE YOU WRITE THE PAGE.
The section above lists choices. Listing choices is not making them, and a page written without making them first will drift back to the shape you know best. So the FIRST thing in the document, immediately after <!DOCTYPE html> and before <html>, is a comment recording what you decided FOR THIS SUBJECT — written before the markup, and then actually obeyed by it:

<!-- DESIGN DECISIONS
archetype: <one of: local-place | professional-services | gallery | editorial | catalogue | event | product-landing>
hero: <one of: full-bleed-photo | split | typographic | asymmetric | none>
sections: <the section order you are about to build, comma-separated, in order>
palette: <a two-or-three-word name, then the actual hex values you will use>
type: <heading font / body font>
density: <sparse | medium | dense>
why: <one sentence: what about THIS subject drove the choices above>
-->

Rules for it:
- Decide from the SUBJECT, not from habit. A taverna, a tax accountant and a wedding photographer must not come out with the same archetype, the same hero, the same section order or the same palette.
- The "sections" line must match the sections you actually build, in the order you build them. It is a commitment, not a summary written afterwards.
- product-landing is a real answer for a real SaaS brief and the wrong answer for most others. If you choose it, "why" must say what makes this an actual product landing page.
- Never copy an example from this prompt as your answer. There are no default values here.`;

const FUNCTIONAL_ELEMENTS_SECTION = `
INTERNAL LINKS — ONLY TWO FORMS ARE VALID:
- To a SECTION of the page you are writing: a fragment, <a href="#rooms">, pointing at an id that exists there — so give every linked section a real id, <section id="rooms">.
- To ANOTHER PAGE of this site: the bare slug of a page you actually wrote under MULTIPLE PAGES, <a href="about">; home is <a href=".">. One document means no other pages, so every internal link is a fragment and "home" is href="#".
- NEVER href="/about", href="/contact", href="about.html" or href="/". A published site is served from a sub-path, so a browser resolves a leading slash against the hosting domain and the visitor LEAVES the site — onto a sign-in page belonging to someone else. This has happened on a real customer site.
- Absolute links to OTHER people's sites are fine and often wanted — a Google Maps pin, a Facebook page, a booking platform. Write those in full, starting with https://.
- tel:, mailto: and sms: links are not navigation; use them exactly as described below.

FUNCTIONAL CONTACT ELEMENTS (not decorative — these must actually work):
- Every phone number given in the description must be rendered as a real link: <a href="tel:+<digits, include country code if given>">display text</a>.
- Every email address given must be rendered as: <a href="mailto:the@address">display text</a>.
- Never show a phone/email as plain unlinked text if one was actually given.

CONTACT DETAILS THAT WERE NOT GIVEN — SHOW A GAP, NEVER HIDE ONE:
A visitor who cannot find a phone number does not become a customer, and a site owner who cannot see that the number is missing will never add it. So:
- If no phone number was given, still build the place where it belongs and write a visible, obviously-unfinished placeholder in the language of the site — e.g. [Your phone number] / [Το τηλέφωνό σας]. Square brackets, always.
- Same for a missing email, street address, opening hours or price list: a bracketed placeholder in the right position, never a section quietly dropped and never an invented value.
- Never invent any of these (see DO NOT INVENT CRITICAL FACTS): a plausible-looking fake is far worse than a visible gap, because the owner ships it without noticing.
- Do not wrap a placeholder in tel:/mailto: — leave it as plain bracketed text so it is obviously a blank to fill in.

LOGO — NEVER INVENT ONE:
- If a reference image is identified as the business's logo, use exactly that image in the header.
- Otherwise the header shows the business NAME as a styled text wordmark (a distinctive font-family/weight/letter-spacing treatment of the name is encouraged) — and nothing else.
- NEVER draw, generate or fetch a logo: no abstract marks, no monograms, no icon standing in for the brand, no CSS/SVG shapes posing as a logo, no PLACEHOLDER image with a logo-like query. A wrong logo is a wrong identity — worse than no logo, because the owner ships it thinking it is theirs.

FORMS: see the FORM INSTRUCTIONS block given after this system prompt — what kinds of form exist, which fields each one needs, the consent line, the honeypot and how to wire up the submission are all there.`;

// Kept as a SEPARATE trailing content block (not interpolated into
// SYSTEM_PROMPT/EDIT_SYSTEM_PROMPT above) specifically so those prompts
// stay 100% identical across every call — this is the one piece of the
// whole system prompt that legitimately differs per website (the submit
// endpoint URL embeds the website's own id). Splitting it out is what
// makes prompt caching on the (much larger, fully static) rest of the
// system prompt actually work: see buildSystemBlocks below.
//
// WHY THE WHOLE FORM SPEC LIVES HERE rather than in SYSTEM_PROMPT: the
// static prompt is at 29.4k characters against a 30k ceiling
// (scripts/tests/website-variety.test.ts's last section), and that
// ceiling exists because every character of general instruction competes
// with the user's own brief for the model's attention. Forms are also
// the one subject where the instruction and the per-website endpoint URL
// belong in the same breath — "build this, send it there" — so moving
// the spec down here makes the cached prefix SMALLER, not larger.
const FORM_KINDS = `FORM INSTRUCTIONS

Build a form only when the description implies one — not every site needs one. There are THREE kinds; pick whichever the business actually needs, and more than one is fine (a contact form and a newsletter box is a normal pairing).

1. CONTACT — the default. Fields: name, email, phone (optional), message. Heading and button in the site's language.
2. NEWSLETTER — email alone, or first name + email. One line of honest copy about what gets sent and how often. Never claim a discount, a gift or a frequency the description did not mention.
3. QUOTE REQUEST — the one that must NOT be a contact form with a different heading. Ask for what this trade actually needs in order to price the job, adapting these to the business:
${Object.entries(QUOTE_FIELDS_BY_INDUSTRY)
  .map(([industry, fields]) => `   - ${industry}: ${fields.join(", ")}`)
  .join("\n")}
   Plus name and a way to reply. 4-7 fields total: a quote form nobody finishes is worth less than a contact form somebody does.

BOOKING FORMS: do not build one. A form that takes a date and time without real availability behind it double-books people and sends them to a closed door. If the description asks for bookings, build a CONTACT form whose copy says a booking will be confirmed by reply, and never render a calendar.

EVERY FORM, WITHOUT EXCEPTION:
- Every input needs a real, meaningful name attribute (name="name", name="email", name="phone", name="message") — never an unnamed input. Use these English attribute names even when the visible labels are in another language, so the owner's dashboard can tell a name from an email.
- Add one hidden honeypot input, exactly: <input type="text" name="_hp" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px;opacity:0;" aria-hidden="true">
- A CONSENT CHECKBOX, required, unticked, immediately above the submit button: <input type="checkbox" name="_consent" required> with a short visible sentence in the site's language saying the data is sent to <the business name> so they can reply, and is not passed to anyone else. It must be genuinely unticked and genuinely required — a pre-ticked box is not consent.
- Do not set a form action attribute. Never ask for anything you do not need: no date of birth, no ID number, no payment details.`;

function buildFormEndpointInstruction(formEndpointUrl: string | undefined): string {
  if (!formEndpointUrl) {
    return `${FORM_KINDS}\n\nSUBMISSION: no submission endpoint is available for this generation — build the form visually complete (all fields, consent checkbox, honeypot, a submit button) but do NOT add a fetch/submission script, and add an HTML comment near it: <!-- Form is not yet wired to a backend -->.`;
  }
  return `${FORM_KINDS}

SUBMISSION: add exactly one inline <script> block (placed once, right before </body>) that listens for the submit event of EVERY form on the page, calls preventDefault(), and POSTs JSON via fetch to EXACTLY this URL: ${formEndpointUrl}
The body is { "fields": { ...every named text/email/tel/textarea/select field including _hp... }, "formType": "contact" | "newsletter" | "quote", "consent": <true if the consent box is ticked>, "consentText": "<the exact consent sentence shown next to it>" }.
Set formType from what that particular form is for; if a page has two forms, each sends its own. Do not put _consent inside "fields".
On a successful response, replace that form's contents with a clear confirmation message in the site's language. On failure, show an inline retry message near the form. Never use alert() or confirm().`;
}

const IMAGE_RULES_HEADER = `
IMAGES:
- If REFERENCE IMAGES are listed below with exact URLs, use them directly via <img src="EXACT_URL">. Never alter the given URL, and never fabricate additional reference-image URLs beyond what's listed.
- THE USER'S OWN PHOTOGRAPHS GO IN THE POSITIONS THAT MATTER, FIRST. A stock library has a bakery, not THIS bakery, and that difference is what the page is for. Place EVERY listed reference image before considering a PLACEHOLDER — hero, then gallery, then section illustrations — choosing where each belongs from what is IN it (a wide interior is a hero; a close-up of a product goes beside that product). Only what is still missing becomes a PLACEHOLDER. Unless the DESIGN BRIEF says style-reference-only, every listed URL MUST appear in an <img src="..."> copied character for character; count them before you finish.
- For any OTHER real photo the site should show (a product shot, a room, food, a team photo, an interior/exterior) that no reference image already covers, output exactly: <img src="PLACEHOLDER:short-slug" data-image-query="concise English search phrase describing exactly what the photo should show" alt="...">  — a short slug unique within this document, and a real, specific search phrase. A post-processing step automatically replaces this with a real, working photo from a stock photo library.
- WRITING A GOOD data-image-query (this decides whether the photo actually matches the site):
  * ALWAYS IN ENGLISH, even when the page itself is in another language — the photo library is searched in English, and a Greek or German query returns nothing and falls back to a random photo. This is the single most common reason a generated site ends up with unrelated images.
  * 3-6 words, concrete and visual: "specialty coffee shop interior wooden", not "coffee" and not "a nice photo of the inside of our lovely café".
  * Name the SUBJECT and the STYLE/SETTING, not the business: "greek mezze plates taverna table" — never the trading name, and never a city name unless the shot really is that skyline (a place name usually returns tourist postcards instead of the subject).
  * One query per distinct photo. Two placeholders that would return the same image are one photo.
- IMPORTANT — if the description lists SPECIFIC photos ("photos of the rooms", "a picture of the pool", "our 3 menu items"), each one individually gets its own PLACEHOLDER with a query specific to THAT item — never fewer tags than photos requested, never one generic tag standing in for several. List them and confirm each has a tag before moving on.
- NEVER invent a fake external image URL yourself (no made-up unsplash.com/cdn/placeholder links) — the ONLY two ways to include a photo are a listed reference-image URL, or the PLACEHOLDER convention above.
- Purely decorative graphics (icons, simple shapes, dividers) should still be built with CSS/inline SVG as before, not the PLACEHOLDER convention — that's reserved for actual photos. This licence does NOT extend to brand marks: see LOGO — NEVER INVENT ONE.`;

// MANDATORY RESEARCH — the section this whole feature's credibility rests
// on, and the one that was getting ignored.
//
// The tool was wired up correctly (see WEB_SEARCH_TOOL) but the
// instruction was permissive: "use it when the description implies…"
// followed by "do NOT search for things you already know well". A model
// asked for "a café in Thessaloniki" believes it knows what a café is and
// where Thessaloniki is, so both clauses resolved to "no search needed"
// and the page came out as generic filler with no trace of the actual
// city. That is the reported defect — not a missing tool, a permissive
// prompt around a wired one.
//
// So the trigger is inverted. Rather than asking the model to judge
// whether it needs facts, this NAMES the three subjects a local/business
// site cannot be honest without, and requires a search for each one that
// applies. "You already know this" is explicitly removed as a reason to
// skip: the model's training data does not contain which streets are busy
// in Thessaloniki this year, and a page that pretends otherwise is the
// failure being fixed.
//
// The boundary against PLACEHOLDER_DATA_SECTION is stated inline and
// matters: research establishes facts about the AREA and the MARKET (real
// neighbourhoods, what similar businesses charge, what the industry's
// customers expect). It never invents facts about the USER'S OWN business
// — their address, their phone number, their opening hours. Those are
// still theirs to supply, and inventing one is still forbidden.
const WEB_SEARCH_SECTION = `
MANDATORY RESEARCH (do this BEFORE writing any HTML):
You have a real web search tool. Do not treat it as optional. Before writing the page, search for each of the following that applies to this brief — "I already know this" is NOT a reason to skip a search, because your training data cannot contain what is true about a specific place or market right now:

1. THE PLACE — if the brief names a city, neighbourhood, region or country, search it together with the business type (e.g. "cafés Thessaloniki Ladadika neighbourhood", "Thessaloniki city centre character"). You are looking for real, checkable specifics you can write into the copy: the actual character of the area, real landmarks and districts nearby, what locals and visitors actually come there for, seasonality. A page that could be about any city in the world has failed this step.
2. THE INDUSTRY — search what websites for this kind of business actually contain and what their customers look for (e.g. "what customers look for in a specialty coffee shop", "typical sections on a restaurant website"). Use it to decide which SECTIONS the page needs, not just how to word them.
3. THE NUMBERS — if the page should show or imply money, quantities or statistics (typical prices for this service in this market, opening-hours conventions, market size), search for them. Never invent a number you could have looked up.

Then, while writing:
- Write the researched facts into the copy as ordinary, confident sentences about the AREA and the MARKET. Naming a real nearby district, a real landmark, or a genuine local characteristic is exactly what this research is for.
- HARD BOUNDARY: research establishes facts about the place and the industry. It NEVER establishes facts about THIS user's own business. Do not state their address, phone number, opening hours, staff names or exact prices unless the brief gave them — see DO NOT INVENT CRITICAL FACTS below, which still applies in full.
- PARAPHRASE. Never paste search-result text verbatim into the HTML.
- Do not search to "double check" something the brief already told you.
- Your FINAL output is still ONLY the HTML document. Any thinking or narration you do while researching must not appear in the answer.`;

// Requested explicitly as a final compliance pass: catches the common
// failure mode of a long, multi-part description where one or two
// specific asks (a named section, a specific requested photo, a color,
// a piece of text) get dropped simply because the model's attention
// moved on while writing everything else. This is the LAST section in
// the system prompt on purpose — it's meant to be the last instruction
// in context right before the model starts producing its final answer.
// Layered on top of (not a replacement for) AI_QUALITY_CHECKLIST_EN
// below, which is the same shared instruction every other AI-generation
// feature in this app also gets — this section is the website-specific
// elaboration of that same checklist's rule 1 (sections/photos/colors/
// copy/contact details are exactly the kinds of "specific things asked
// for" a website description tends to contain).
const FINAL_SELF_CHECK_SECTION = `
FINAL SELF-CHECK (do this before you output anything):
1. Re-read the user's brief line by line and write down, for yourself, every EXPLICIT requirement in it — every named section, every specific requested photo (see IMAGES above), every colour, every font, every piece of copy given verbatim, every contact detail, every stated preference about tone or layout.
2. Go through that list one item at a time against the HTML you are about to return, and confirm each one is actually present. Not "addressed in spirit" — present.
3. A requirement you decided against is still a requirement. If the brief asked for something you think is a bad idea, DO IT ANYWAY; it is their site. The only exceptions are the safety limits below and inventing facts you were not given.
4. Anything missing, add it now. Do not return an answer you have not checked this way.
5. Finally, look at the page as a whole and ask whether it is recognisably a page for THIS business, or a generic template with this business's words swapped in. If it is the second one, restructure it before returning — a page that would look identical for a completely different business has failed, however clean it is.`;

// The user's brief has to WIN, and it has to be LAST.
//
// The measured problem: the static system prompt is ~16,500 characters
// against a typical description of ~250. Sixty-six to one. Every one of
// those 16,500 characters is a rule the model is asked to follow, and
// nothing anywhere said that the person's own instructions outrank them —
// so a brief that asked for something the prompt has an opinion about
// ("make it plain, no animations", "use dark green, not blue") lost the
// argument silently.
//
// Two fixes, and they are separate:
//   PRECEDENCE — stated explicitly, here, rather than left to be inferred.
//   POSITION — this block is the LAST thing in the system prompt, and the
//     brief itself is the LAST thing in the user message (see
//     buildUserBriefBlock). Recency is the cheapest lever available on
//     instruction-following and it was being spent on a reference-image
//     URL list.
//
// Kept OUT of the cached static block deliberately: it is tiny, and
// leaving the big block byte-identical is what keeps the prompt cache
// hitting.
const USER_BRIEF_PRECEDENCE = `PRECEDENCE — READ THIS LAST AND APPLY IT ABOVE EVERYTHING ELSE:
Everything above is DEFAULT behaviour, for the parts of a site the user did not specify. The user's own brief follows in the next message, and it OVERRIDES every general preference stated above — every style suggestion, every font mapping, every layout convention, every animation, every structural recommendation.

If the brief contradicts a default above, the brief wins. Silently. Do not compromise between the two, do not apply the default "as well", and do not decide the user would prefer your judgement.

The only things the brief cannot override are: the output format (one complete HTML document, nothing else), the technical constraints (inline CSS, no external scripts or libraries, responsive), the rule against inventing facts you were not given, and the safety limits.`;

const PLACEHOLDER_DATA_SECTION = `
DO NOT INVENT CRITICAL FACTS:
- Never invent specific real-world facts that were not given and matter (exact prices, addresses, phone numbers, opening hours, specific named products/services) — a request needing such facts should already have been asked about before generation ever reaches you. A LOGO is a critical fact too: see LOGO — NEVER INVENT ONE.
- The ONE exception, and it is narrower than it looks: if the description explicitly says the user was asked and answered with something like "use whatever"/"I don't care"/"make it up" (look for this in any "Additional details: Q/A" section appended to the description), you may invent descriptive PROSE — the story of the place, the tone, the section copy. You may NOT invent a NUMBER or a CONTACT FACT under any circumstances, and "make it up" does not extend to one: no price, no phone number, no opening time, no street address, no email, no year of founding, no capacity, no distance, no rating, no review count. Those stay bracketed placeholders exactly as above, because a number is the one thing a reader will act on — somebody will ring it, turn up at it, or expect to pay it — and a wrong one is worse than a blank.
- When you do invent prose under that exception you MUST mark it: wrap each invented passage in an HTML comment right before it, e.g. <!-- PLACEHOLDER: replace with your own words -->, AND add one small, visible banner just under the header reading "Sample content — edit before publishing" (subtle styling, not alarming). Only include this banner when placeholder content is actually present in the page.`;

const SYSTEM_PROMPT = `You generate complete, production-ready single-file websites from a plain-text description.

CORE RULES:
- Output complete HTML documents: <!DOCTYPE html> through </html>. Nothing else — no explanation, no markdown code fences, no commentary before or after. Most sites are ONE document; see MULTIPLE PAGES below for when to write more and how to separate them.
- All CSS must be inline in a single <style> tag in <head>. The ONLY external resources ever allowed are Google Fonts links (see FONTS below) and photo URLs (see IMAGES below) — no other external stylesheets, no external JS libraries/CDNs, no icon fonts from a CDN.
- No <script> tags EXCEPT the two specific, narrow exceptions described in ANIMATIONS (scroll-reveal) and the contact-form handler described in FUNCTIONAL CONTACT ELEMENTS below — nothing else may use JavaScript. Everything else must be a static page.
- Must be responsive: include a <meta name="viewport"> tag and use relative units / flexbox / grid / media queries so it looks good on both mobile and desktop.
- Use semantic HTML5 (header, nav, main, section, footer, etc.) and a real, polished visual design (not a bare unstyled page) — sensible typography, spacing, and a coherent color scheme that fits what was described.
- Use placeholder text/content that fits the description where specific non-critical content wasn't given — never leave Lorem Ipsum, always write real-sounding copy relevant to the request. See DO NOT INVENT CRITICAL FACTS below for the difference between ordinary filler copy (fine) and specific real-world facts (not fine unless explicitly authorized).
- Fill in a <title> tag that fits the description.
${SITE_SHAPE_SECTION}
${multipageInstruction()}
${FONTS_SECTION}
${ANIMATIONS_SECTION}
${IMAGE_RULES_HEADER}
${WEB_SEARCH_SECTION}
${FUNCTIONAL_ELEMENTS_SECTION}
${PLACEHOLDER_DATA_SECTION}
${seoInstruction()}
${FINAL_SELF_CHECK_SECTION}
${AI_SAFETY_BOUNDARIES_EN}${AI_QUALITY_CHECKLIST_EN}`;

// Was stripCodeFence — a narrower cleanup that only fired when the WHOLE
// response was one fenced block. It is superseded by extractHtmlDocument
// (lib/website-html-extract.ts), which also handles the case that was
// actually breaking generations in production: a search-using turn that
// narrates a sentence before the document. See that file for the full
// explanation of the "generation was interrupted" failure.

// Guards against the "white/blank page" bug: a sufficiently long, detailed
// description can push a full single-file website's generation right up
// against (or past) WEBSITE_MAX_TOKENS, cutting the response off mid-
// document — often mid-<style>, before any real <body> content is ever
// written. Browsers render that as a near-blank page instead of a clear
// error. Checking response.stop_reason catches the common case directly;
// looksLikeCompleteHtmlDocument is a second, independent check (structural
// completeness of the actual text) so a truncation that doesn't surface as
// stop_reason "max_tokens" for some other reason is still caught before
// ever being saved or rendered.
function assertCompleteHtmlResponse(
  stopReason: string | null,
  html: string,
  action: "generated" | "updated"
): void {
  if (stopReason !== "max_tokens" && looksLikeCompleteHtmlDocument(html)) return;

  // The reason has to match reality. "Too large — try a shorter
  // description" was reported for a response that stopped at 13,624 of
  // 128,000 available output tokens, i.e. it sent the user off to fix a
  // problem they did not have, on a request that would fail again.
  //
  // Only an exhausted token budget is genuinely a size problem. Everything
  // else that reaches here — a search loop that never converged, a model
  // that stopped early, a refusal — is an interrupted run, and the honest
  // advice is to try again.
  const tooLarge = stopReason === "max_tokens";
  const subject = action === "generated" ? "generated" : "updated";
  throw new Error(
    tooLarge
      ? action === "generated"
        ? "The generated website was too large and got cut off before finishing — try a shorter or simpler description."
        : "The updated website was too large and got cut off before finishing — try a smaller change."
      : `The website generation was interrupted before the ${subject} page was finished. Nothing was charged — please try again.`
  );
}

// Reference images (Website Builder's optional "attach up to 20 reference
// images — logo, product photos, a style screenshot" upload — see
// api/websites/generate/route.ts and api/websites/edit/route.ts). Only
// jpeg/png are accepted client-side and server-side, matching what
// Claude's vision input supports well and what the upload form allows.
// `url`, when present, is this image's real, hotlinkable Storage public
// URL — passed to the model as literal text alongside the vision input so
// it can embed the image FOR REAL via <img src="url"> in the generated
// HTML (see IMAGE_RULES_HEADER above), not just use it as style
// inspiration.
export type ReferenceImageMediaType = "image/jpeg" | "image/png";
export type ReferenceImage = { base64: string; mediaType: ReferenceImageMediaType; url?: string };

// Validates a stored file's content-type is one of the two types the
// upload form accepts — used server-side after downloading from Storage,
// so a file that somehow bypassed the client-side check (or was uploaded
// by another client entirely) never reaches the vision API mislabeled.
export function isSupportedReferenceImageMediaType(contentType: string): contentType is ReferenceImageMediaType {
  return contentType === "image/jpeg" || contentType === "image/png";
}

// Builds the text block describing each reference image's real URL to the
// model, in the same order as the vision image blocks that precede it —
// so "reference image 1" in the text matches the first image block Claude
// actually sees. Images without a resolved url (a download succeeded but
// getPublicUrl somehow didn't) are still sent as vision input for style
// context, just not offered as an embeddable URL.
function buildReferenceImageUrlList(images: ReferenceImage[]): string {
  if (images.length === 0) return "";
  const lines = images
    .map((image, i) => (image.url ? `Reference image ${i + 1}: ${image.url}` : null))
    .filter((line): line is string => line !== null);
  if (lines.length === 0) {
    return "\n\nThe user attached reference image(s) for style/color inspiration only — no embeddable URLs are available for them, so do not use the PLACEHOLDER or reference-image <img> conventions for these; treat them purely as visual style reference.";
  }
  return `\n\nREFERENCE IMAGES (use these exact URLs per the IMAGES rules above):\n${lines.join("\n")}`;
}

// Prompt caching (Anthropic's cache_control): SYSTEM_PROMPT is now a
// large, fully static block — identical bytes on EVERY generate call,
// for every user, every website, forever, since the one part that used
// to vary per-website (the form endpoint URL) was moved out to its own
// trailing block above. Marking it with cache_control means any generate
// call within the cache's TTL of a previous one (any website, any user)
// pays the full price for the system prompt tokens only once — every
// subsequent hit is billed at Anthropic's cached-read rate (a small
// fraction of the normal input price) instead of full price again. The
// small, per-website form-endpoint block is NOT cached (it's cheap and
// different every time, so caching it would never hit anyway).
function buildGenerateSystemBlocks(formEndpointUrl: string | undefined): Anthropic.TextBlockParam[] {
  return [
    { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    { type: "text", text: buildFormEndpointInstruction(formEndpointUrl) },
    // LAST, and outside the cached block. See USER_BRIEF_PRECEDENCE.
    { type: "text", text: USER_BRIEF_PRECEDENCE },
  ];
}

// The user's own words, wrapped and placed LAST in the user message.
//
// It used to be `description + referenceImageUrlList`, which put a list of
// storage URLs after the brief — so the final thing the model read before
// answering was machine-generated metadata, and the person's actual
// instructions were buried above it. The order is now inverted and the
// brief is labelled, so the last thing in context is what the user asked
// for.
function buildUserBriefBlock(description: string): string {
  return `THE USER'S BRIEF — follow it exactly. It overrides every general preference in the system prompt:\n\n${description}`;
}

// Website Builder (see api/websites/generate/route.ts) — a real Claude
// call that returns a complete, standalone HTML document, not a tracked
// "idea" like the existing Websites Build module (ai_websites table,
// lib/build-modules.ts) which never calls AI at all. `referenceImages` is
// optional — when present, EVERY image is sent as a real vision input
// block alongside the text description (not just described in words), so
// Claude actually sees all of the uploaded logo/photos/screenshot, and
// (when a public url is available) can embed it for real. `formEndpointUrl`,
// when given, is this website's real /api/websites/[id]/submit-form URL —
// see FUNCTIONAL_ELEMENTS_SECTION.
// Streams a generate/edit call to completion, automatically continuing
// (up to MAX_CONTINUATION_ROUNDS extra calls) when the model runs out of
// output tokens mid-document instead of failing outright. Each round's raw
// text is appended verbatim (no per-round code-fence stripping — a
// truncated round never has a closing fence to strip anyway); the fence
// check runs once on the fully assembled text at the end, in the caller.
async function streamHtmlToCompletion(
  anthropic: Anthropic,
  system: Anthropic.TextBlockParam[],
  initialUserContent: Anthropic.MessageParam["content"],
  onDelta?: (accumulatedText: string) => void,
  // Every round is a separately-billed API call, so each one is recorded
  // individually. Recording only the last round — or only the first —
  // would silently undercount a continued generation by however many
  // rounds it took, which is exactly the case where the cost is highest.
  costs?: CostAccumulator,
  stage: CostStage = "generation",
  searchTool: Anthropic.WebSearchTool20250305 = WEB_SEARCH_TOOL
): Promise<{ rawText: string; stopReason: string | null }> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: initialUserContent }];
  const startedAt = Date.now();
  let combined = "";
  let stopReason: string | null = null;

  for (let round = 0; round <= MAX_CONTINUATION_ROUNDS; round++) {
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: WEBSITE_MAX_TOKENS,
      system,
      tools: [searchTool],
      messages,
    });

    let roundText = "";
    if (onDelta) {
      stream.on("text", (delta) => {
        roundText += delta;
        // The live preview gets the DOCUMENT, not the raw stream. With
        // research on, the raw stream opens with a sentence about what the
        // model is looking up, and the preview iframe would render that
        // sentence as the website for the first few seconds.
        onDelta(extractHtmlDocument(combined + roundText));
      });
    }

    const response = await stream.finalMessage();
    costs?.record(round === 0 ? stage : "retry", response.usage, response.model || MODEL);
    if (!onDelta) {
      // EVERY text block, joined — not the first one.
      //
      // A turn that searches the web comes back as
      // [text, server_tool_use, web_search_tool_result, text, ...], so
      // taking `.find(first text block)` kept the sentence before the
      // search and threw away the entire document written after it. The
      // streaming branch above never had this bug (it accumulates deltas
      // from all blocks), which is precisely why it went unnoticed: the
      // generate path streams, the edit path does not.
      roundText = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");
    }
    combined += roundText;
    stopReason = response.stop_reason;

    // Completeness is judged on the DOCUMENT, not on the raw response.
    // Judging the raw text is what made a finished page preceded by one
    // sentence of research narration read as unfinished — see
    // lib/website-html-extract.ts.
    if (looksLikeCompleteHtmlDocument(extractHtmlDocument(combined))) break;
    if (round === MAX_CONTINUATION_ROUNDS) break;
    // Don't start a round that the platform will kill mid-flight: those
    // tokens are billed to us and reach the user as nothing at all.
    if (Date.now() - startedAt > continuationDeadlineMs() - minMsForAnotherRound()) break;

    // Which continuation to send depends on WHY the turn ended. The
    // previous condition only ever recognised "max_tokens" and treated
    // every other stop reason as success — so a document that stopped
    // half-written for any other reason was discarded, and the caller
    // reported it to the user as "too large".
    if (stopReason === "pause_turn") {
      // The server-side web_search loop hit its own iteration limit. This
      // is the documented "I am not finished, hand this back to me"
      // signal, and it is what actually happened in production at 13,624
      // output tokens. The resume is to echo the assistant turn VERBATIM
      // — every block, including server_tool_use and
      // web_search_tool_result — with no new user message. Flattening it
      // to text, or appending a "continue" instruction, breaks the
      // in-flight tool loop the model is trying to resume.
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    if (stopReason === "max_tokens" || stopReason === "end_turn") {
      // A genuine ceiling hit, or a model that simply stopped early. Both
      // are resumed by asking for the rest of the document — but only if
      // a document was actually started, otherwise the reply was prose of
      // some other kind and another round just spends more money on it.
      //
      // "Was a document started" means ANYWHERE in the output, not "does
      // the output begin with one". The prefix test this replaces is half
      // of the interrupted-generation bug: a turn that researched first
      // and then began the document was judged never to have started it,
      // so the half-written page was thrown away un-resumed and reported
      // to the user as an interruption.
      if (!containsHtmlDocumentStart(combined)) break;
      messages.push({ role: "assistant", content: roundText });
      messages.push({ role: "user", content: CONTINUATION_INSTRUCTION });
      continue;
    }

    // refusal / stop_sequence / anything unrecognised: continuing cannot
    // turn these into a finished document, so stop rather than pay for
    // rounds that are certain to fail.
    break;
  }

  return { rawText: combined.trim(), stopReason };
}

export async function generateWebsiteHtml(
  apiKey: string,
  description: string,
  referenceImages?: ReferenceImage[],
  onDelta?: (accumulatedText: string) => void,
  formEndpointUrl?: string,
  costs?: CostAccumulator,
  // The per-site design draw (lib/website-variation.ts), already rendered
  // to text. In the USER message on purpose: the cached system prompt
  // must stay byte-identical, and the draw differs per site — that
  // difference IS the feature.
  variationText?: string
): Promise<string> {
  const anthropic = new Anthropic({ apiKey });
  const images = referenceImages?.slice(0, MAX_REFERENCE_IMAGES) ?? [];

  // Reference-image metadata FIRST, then the variation draw, the user's
  // brief LAST — see buildUserBriefBlock. The brief stays the final thing
  // in context, so the person's own words still outrank the draw.
  const userText = [
    buildReferenceImageUrlList(images).trim(),
    variationText?.trim() ?? "",
    buildUserBriefBlock(description),
  ]
    .filter(Boolean)
    .join("\n\n");
  const content: Anthropic.MessageParam["content"] =
    images.length > 0
      ? [
          ...images.map(
            (image): Anthropic.ImageBlockParam => ({
              type: "image",
              source: { type: "base64", media_type: image.mediaType, data: image.base64 },
            })
          ),
          { type: "text", text: userText },
        ]
      : userText;

  // Streamed rather than a single blocking call: at WEBSITE_MAX_TOKENS a
  // non-streaming request risks the Anthropic SDK's own "Streaming is
  // required for operations that may take longer than 10 minutes"
  // error/timeout on a large, detailed generation — streaming removes
  // that ceiling entirely. streamHtmlToCompletion also transparently
  // continues the generation (up to MAX_CONTINUATION_ROUNDS extra calls)
  // if a single call's output alone isn't enough.
  const { rawText, stopReason } = await streamHtmlToCompletion(
    anthropic,
    buildGenerateSystemBlocks(formEndpointUrl),
    content,
    onDelta,
    costs,
    "generation"
  );
  if (!rawText) {
    throw new Error("The model did not return a website.");
  }

  const html = extractHtmlDocument(rawText);
  assertCompleteHtmlResponse(stopReason, html, "generated");
  return html;
}

const EDIT_SYSTEM_PROMPT = `You edit an existing complete single-file website's HTML, applying only the specific change the user asks for.

CORE RULES:
- You will be given the website's CURRENT complete HTML document, followed by a plain-text change request.
- Output the FULL, updated HTML document: <!DOCTYPE html> through </html>. Nothing else — no explanation, no markdown code fences, no commentary before or after.
- Apply ONLY the requested change. Keep every other section, all copy, and the overall structure and design exactly as they were unless the change necessarily affects them.
- PHOTO CREDITS ARE NOT DECORATION. Any <span class="unsplash-credit"> and any data-unsplash-* attribute on an <img> is a legal attribution required by Unsplash's licence. Copy them forward EXACTLY as they are, next to the image they belong to, including every link and every URL parameter. If you move or resize an image, its credit moves with it. Never delete one, never reword one, never "tidy" its links.
- Keep following the same rules the original site was built under: all CSS inline in a single <style> tag, no external stylesheets/fonts/scripts except the specific exceptions below, responsive with a viewport meta tag, semantic HTML5.
${FONTS_SECTION}
${ANIMATIONS_SECTION}
${IMAGE_RULES_HEADER}
${WEB_SEARCH_SECTION}
${FUNCTIONAL_ELEMENTS_SECTION}
${PLACEHOLDER_DATA_SECTION}
${seoInstruction()}
- THE SEO MARKUP IS NOT DECORATION EITHER. Every data-seo-* attribute, every <address>, every alt, every <details>/<summary> FAQ and every tel:/mailto: link in the current document is what this site's search listing and its map entry are built from. Carry them forward exactly unless the change is ABOUT them. A change to the phone number changes it in every place it appears, including data-seo-* — one page disagreeing with the others is what splits a business in two as far as a search engine is concerned.
If the change request asks to add a photo, a font, an animation, contact info, or a form, apply the same rules above as if generating fresh — e.g. a newly-requested photo still uses the PLACEHOLDER convention (or a newly-attached reference image's real URL) rather than an invented link.
${FINAL_SELF_CHECK_SECTION}
${AI_SAFETY_BOUNDARIES_EN}${AI_QUALITY_CHECKLIST_EN}`;

// Same prompt-caching split as buildGenerateSystemBlocks above — the
// (large, fully static) EDIT_SYSTEM_PROMPT gets its own cache_control
// breakpoint, separate from the small per-website form-endpoint block.
function buildEditSystemBlocks(formEndpointUrl: string | undefined): Anthropic.TextBlockParam[] {
  return [
    { type: "text", text: EDIT_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    { type: "text", text: buildFormEndpointInstruction(formEndpointUrl) },
    { type: "text", text: USER_BRIEF_PRECEDENCE },
  ];
}

const PATCH_MAX_TOKENS = 4000;

const APPLY_EDIT_TOOL: Anthropic.Tool = {
  name: "apply_website_edit",
  description:
    "Decide whether this change request can be applied as a small, unambiguous find-and-replace within the current HTML, or whether it requires regenerating the whole document.",
  input_schema: {
    type: "object",
    properties: {
      isSimpleChange: {
        type: "boolean",
        description:
          "True ONLY if the change is a small, well-defined edit expressible as replacing ONE exact, contiguous substring of the current HTML with new text — e.g. a color value, a specific piece of visible text, a single CSS property, one attribute. False for anything structural (a new section, reorganizing layout, adding a feature, anything touching multiple unrelated places) or in any way ambiguous.",
      },
      findText: {
        type: "string",
        description:
          "The EXACT, verbatim substring to find in the current HTML — copy it character-for-character, including whitespace, from the given document. Must be specific enough to appear in the document exactly once. Empty string if isSimpleChange is false.",
      },
      replaceText: {
        type: "string",
        description: "The exact replacement text for findText. Empty string if isSimpleChange is false.",
      },
    },
    required: ["isSimpleChange", "findText", "replaceText"],
  },
};

// Cost optimization for small, targeted edits ("change the colors to
// blue", "change the heading to say X") — instead of ALWAYS asking Claude
// to regenerate and return the entire document (potentially tens of
// thousands of output tokens for a one-word change), this first asks a
// cheap yes/no-shaped question: can this be expressed as one exact find-
// and-replace? If so, the actual substitution is applied programmatically
// (a plain string replace, zero AI cost) instead of paying for a second,
// full-document generation call — the biggest lever available here,
// since output tokens (not input) dominate a full-HTML edit's cost. Still
// sends the full currentHtml as INPUT (Claude needs to see it to quote an
// exact substring), so this doesn't reduce input cost — only the far
// larger output cost for the common "small change" case.
//
// Deliberately conservative: returns null (meaning "fall back to full
// regeneration") whenever isSimpleChange is false, findText is empty, OR
// findText doesn't match the current HTML EXACTLY ONCE — an ambiguous or
// missing match is never applied silently, since a wrong or no-op patch
// would be worse than the extra cost of a full regeneration. Images/forms/
// fonts are excluded implicitly: those all require the fuller reasoning
// (embedding a URL, restructuring a form) that this tool's schema isn't
// meant to express, so the model naturally reports isSimpleChange=false
// for them per the tool description above.
async function tryApplySimpleEdit(
  apiKey: string,
  currentHtml: string,
  changeRequest: string,
  costs?: CostAccumulator
): Promise<string | null> {
  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: PATCH_MAX_TOKENS,
    system: [{ type: "text", text: currentHtml, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `CHANGE REQUEST: ${changeRequest}` }],
    tools: [APPLY_EDIT_TOOL],
    tool_choice: { type: "tool", name: "apply_website_edit" },
  });
  costs?.record("classification", response.usage, response.model || MODEL);

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) return null;

  const input = toolUse.input as { isSimpleChange?: unknown; findText?: unknown; replaceText?: unknown };
  if (input.isSimpleChange !== true) return null;
  if (typeof input.findText !== "string" || typeof input.replaceText !== "string") return null;

  return applyExactReplace(currentHtml, input.findText, input.replaceText);
}

// Website Builder post-generation editing — takes the CURRENT html_content
// as context plus a free-text change request ("make the hero bigger",
// "change the colors to blue", "add a photo of the storefront") and
// returns a full updated HTML document. A second, separate Claude call
// from generateWebsiteHtml above (not a continuation of the same
// conversation) — the entire current HTML is re-sent as context every
// time, same one-shot pattern as every other AI call in this app.
// `referenceImages`/`formEndpointUrl` mirror generateWebsiteHtml's — an
// edit can attach new reference images or need to (re)establish the form
// endpoint just like the original generation.
//
// Tries the cheap find-and-replace patch path first (tryApplySimpleEdit)
// whenever there are no new reference images attached (an image-attach
// edit always needs the fuller reasoning) — only falls through to the
// full, expensive regeneration below when that path declines (structural/
// ambiguous change) or fails for any reason.
export type EditWebsiteResult = {
  html: string;
  // Whether the cheap find-replace patch path (tryApplySimpleEdit) was
  // used instead of a full regeneration — the caller (api/websites/edit/
  // route.ts) uses this to charge dynamically: a patch is a tiny
  // forced-tool-use classification call, wildly cheaper in real tokens
  // than a full HTML regeneration, so billing the same flat amount for
  // both (the previous behavior) was a real pricing inconsistency.
  usedCheapPatch: boolean;
};

export async function editWebsiteHtml(
  apiKey: string,
  currentHtml: string,
  changeRequest: string,
  referenceImages?: ReferenceImage[],
  formEndpointUrl?: string,
  // Measured usage of every call this edit makes (the cheap patch, or
  // every round of a full regeneration) — settlement charges from this,
  // so an un-passed accumulator is an unbilled edit.
  costs?: CostAccumulator
): Promise<EditWebsiteResult> {
  const images = referenceImages?.slice(0, MAX_REFERENCE_IMAGES) ?? [];

  if (images.length === 0) {
    try {
      const patched = await tryApplySimpleEdit(apiKey, currentHtml, changeRequest, costs);
      if (patched) {
        assertCompleteHtmlResponse(null, patched, "updated");
        return { html: patched, usedCheapPatch: true };
      }
    } catch {
      // Best-effort: any failure in the cheap-patch path (network hiccup,
      // malformed tool response) falls straight through to the normal,
      // proven full-regeneration path below rather than failing the edit.
    }
  }

  const anthropic = new Anthropic({ apiKey });

  // Same ordering rule as generation: the current HTML and the image
  // metadata are context, the change request is the instruction, and the
  // instruction goes last. It used to sit before the reference-image URL
  // list, so on an image-attaching edit the final thing in context was a
  // list of storage paths.
  const userText = `CURRENT HTML:\n\n${currentHtml}${buildReferenceImageUrlList(images)}\n\nTHE USER'S CHANGE REQUEST — apply exactly this, and nothing else. It overrides every general preference in the system prompt:\n\n${changeRequest}`;
  const content: Anthropic.MessageParam["content"] =
    images.length > 0
      ? [
          ...images.map(
            (image): Anthropic.ImageBlockParam => ({
              type: "image",
              source: { type: "base64", media_type: image.mediaType, data: image.base64 },
            })
          ),
          { type: "text", text: userText },
        ]
      : userText;

  // Streamed for the same reason as generateWebsiteHtml above, and same
  // continuation logic via streamHtmlToCompletion.
  const { rawText, stopReason } = await streamHtmlToCompletion(
    anthropic,
    buildEditSystemBlocks(formEndpointUrl),
    content,
    undefined,
    costs,
    "edit",
    EDIT_WEB_SEARCH_TOOL
  );
  if (!rawText) {
    throw new Error("The model did not return an updated website.");
  }

  const html = extractHtmlDocument(rawText);
  assertCompleteHtmlResponse(stopReason, html, "updated");
  return { html, usedCheapPatch: false };
}
