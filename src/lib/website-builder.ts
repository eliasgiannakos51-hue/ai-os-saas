import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { looksLikeCompleteHtmlDocument } from "@/lib/html-document-check";
import { MAX_REFERENCE_IMAGES } from "@/lib/website-reference-image";
import { applyExactReplace } from "@/lib/website-patch";

const MODEL = "claude-sonnet-4-6";
const CLASSIFY_MAX_TOKENS = 300;
// A single-file website (all CSS inline, real copy for every section) can
// run long — much longer than a chat reply. This used to share a much
// smaller ceiling more suited to conversational output; a sufficiently
// long, detailed description could push generation past that budget,
// truncating the response mid-document. See looksLikeCompleteHtmlDocument
// below and its call sites for how that's now caught instead of silently
// shipping broken HTML.
const WEBSITE_MAX_TOKENS = 32000;

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
  description: string
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
- If the user only describes a vibe, pick a fitting pair from the list: e.g. "elegant/luxury" -> a serif display face (Playfair Display, Cormorant Garamond, Fraunces) for headings + a clean sans (Inter, Karla) for body; "modern/tech/startup" -> a geometric sans (Space Grotesk, Manrope, Outfit) for both; "warm/friendly" -> a rounded sans (Nunito, Quicksand, Rubik).
- To actually load a font, add BOTH of these to <head> (this is the one and only external-resource exception in this document — see the rules above):
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=FONT+NAME:wght@400;600;700&display=swap" rel="stylesheet">
  (replace spaces in FONT NAME with + in the URL, e.g. "Playfair Display" -> family=Playfair+Display)
- Then reference it in CSS: font-family: 'Font Name', sans-serif; (or serif, matching the font's actual category).`;

const ANIMATIONS_SECTION = `
ANIMATIONS (pure CSS, reproduce these patterns consistently rather than inventing new ones each time):

1) Scroll-reveal fade-in — add class="reveal" to a section, plus this CSS and this exact tiny script (the ONLY two purposes an inline <script> may ever be used for in this document are this effect and the contact-form handler described below):
   CSS:
     .reveal { opacity: 0; transform: translateY(24px); transition: opacity 0.7s ease-out, transform 0.7s ease-out; }
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

3) Smooth hover transforms — cards, buttons, images:
     .card { transition: transform 0.3s ease, box-shadow 0.3s ease; }
     .card:hover { transform: translateY(-6px) scale(1.02); box-shadow: 0 20px 40px rgba(0,0,0,0.15); }

4) Animated gradient background — hero sections, CTAs:
     .gradient-bg { background: linear-gradient(-45deg, #ff7e5f, #feb47b, #6a11cb, #2575fc); background-size: 400% 400%; animation: gradientShift 12s ease infinite; }
     @keyframes gradientShift { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
   (pick colors that fit the site's actual palette — the above is a structural example, not literal colors to always use)

5) Staggered list-item entrance:
     .stagger-item { opacity: 0; animation: fadeInUp 0.6s ease forwards; }
     .stagger-item:nth-child(1) { animation-delay: 0.1s; }
     .stagger-item:nth-child(2) { animation-delay: 0.2s; }
     .stagger-item:nth-child(3) { animation-delay: 0.3s; }
     @keyframes fadeInUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

Use these when the description asks for "impressive"/"modern"/"animated" or similar — don't overdo it on a simple/minimal request.`;

const FUNCTIONAL_ELEMENTS_SECTION = `
FUNCTIONAL CONTACT ELEMENTS (not decorative — these must actually work):
- Every phone number given in the description must be rendered as a real link: <a href="tel:+<digits, include country code if given>">display text</a>.
- Every email address given must be rendered as: <a href="mailto:the@address">display text</a>.
- Never show a phone/email as plain unlinked text if one was actually given.

CONTACT / BOOKING FORMS (only when the description implies one — not every site needs a form):
- Every input needs a real, meaningful name attribute (name="name", name="email", name="phone", name="message", etc.) — never an unnamed input.
- Add one hidden honeypot input, exactly: <input type="text" name="_hp" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px;opacity:0;" aria-hidden="true">
- Do not set a form action attribute.
- For exactly how to wire up the form's submission (the endpoint URL and the script that calls it), see the FORM SUBMISSION INSTRUCTIONS given as a separate block after this system prompt.`;

// Kept as a SEPARATE trailing content block (not interpolated into
// SYSTEM_PROMPT/EDIT_SYSTEM_PROMPT above) specifically so those prompts
// stay 100% identical across every call — this is the one piece of the
// whole system prompt that legitimately differs per website (the submit
// endpoint URL embeds the website's own id). Splitting it out is what
// makes prompt caching on the (much larger, fully static) rest of the
// system prompt actually work: see buildSystemBlocks below.
function buildFormEndpointInstruction(formEndpointUrl: string | undefined): string {
  if (!formEndpointUrl) {
    return `FORM SUBMISSION INSTRUCTIONS:\n- No submission endpoint is available for this generation — build the form visually complete (all fields, honeypot, a submit button) but do NOT add a fetch/submission script, and add an HTML comment near it: <!-- Form is not yet wired to a backend -->.`;
  }
  return `FORM SUBMISSION INSTRUCTIONS:\n- Add exactly one inline <script> block (placed once, right before </body>) that: listens for the form's 'submit' event, calls preventDefault(), collects every named field (including _hp) into a plain object, and POSTs it as JSON { "fields": { ... } } via fetch to EXACTLY this URL: ${formEndpointUrl}
  On a successful response, replace the form's contents with a clear confirmation message (e.g. "Thanks — we'll be in touch soon."). On failure, show a clear inline retry message near the form. Never use alert() or confirm().`;
}

const IMAGE_RULES_HEADER = `
IMAGES:
- If REFERENCE IMAGES are listed below with exact URLs, use them directly via <img src="EXACT_URL"> wherever they fit (hero photo, gallery, a logo in the header, etc. — infer which image is which from context). Never alter the given URL, and never fabricate additional reference-image URLs beyond what's listed.
- For any OTHER real photo the site should show (a product shot, a room, food, a team photo, an interior/exterior) that no reference image already covers, output exactly: <img src="PLACEHOLDER:short-slug" data-image-query="concise English search phrase describing exactly what the photo should show" alt="...">  — a short slug unique within this document, and a real, specific search phrase (e.g. "modern boutique hotel room interior", not just "room"). A post-processing step automatically replaces this with a real, working photo.
- NEVER invent a fake external image URL yourself (no made-up unsplash.com/cdn/placeholder links) — the ONLY two ways to include a photo are a listed reference-image URL, or the PLACEHOLDER convention above.
- Purely decorative graphics (icons, simple shapes, dividers) should still be built with CSS/inline SVG as before, not the PLACEHOLDER convention — that's reserved for actual photos.`;

const PLACEHOLDER_DATA_SECTION = `
DO NOT INVENT CRITICAL FACTS:
- Never invent specific real-world facts that were not given and matter (exact prices, addresses, phone numbers, opening hours, specific named products/services) — a request needing such facts should already have been asked about before generation ever reaches you.
- The ONE exception: if the description explicitly says the user was asked and answered with something like "use whatever"/"I don't care"/"make it up" (look for this in any "Additional details: Q/A" section appended to the description), you may invent plausible placeholder facts — but you MUST mark them: wrap each invented fact in an HTML comment right before it, e.g. <!-- PLACEHOLDER: replace with your real price -->, AND add one small, visible banner just under the header reading "Sample content — edit before publishing" (subtle styling, not alarming). Only include this banner when placeholder data is actually present in the page.`;

const SYSTEM_PROMPT = `You generate complete, production-ready single-file websites from a plain-text description.

CORE RULES:
- Output ONE complete HTML document: <!DOCTYPE html> through </html>. Nothing else — no explanation, no markdown code fences, no commentary before or after.
- All CSS must be inline in a single <style> tag in <head>. The ONLY external resources ever allowed are Google Fonts links (see FONTS below) and photo URLs (see IMAGES below) — no other external stylesheets, no external JS libraries/CDNs, no icon fonts from a CDN.
- No <script> tags EXCEPT the two specific, narrow exceptions described in ANIMATIONS (scroll-reveal) and the contact-form handler described in FUNCTIONAL CONTACT ELEMENTS below — nothing else may use JavaScript. Everything else must be a static page.
- Must be responsive: include a <meta name="viewport"> tag and use relative units / flexbox / grid / media queries so it looks good on both mobile and desktop.
- Use semantic HTML5 (header, nav, main, section, footer, etc.) and a real, polished visual design (not a bare unstyled page) — sensible typography, spacing, and a coherent color scheme that fits what was described.
- Use placeholder text/content that fits the description where specific non-critical content wasn't given — never leave Lorem Ipsum, always write real-sounding copy relevant to the request. See DO NOT INVENT CRITICAL FACTS below for the difference between ordinary filler copy (fine) and specific real-world facts (not fine unless explicitly authorized).
- Fill in a <title> tag that fits the description.
${FONTS_SECTION}
${ANIMATIONS_SECTION}
${IMAGE_RULES_HEADER}
${FUNCTIONAL_ELEMENTS_SECTION}
${PLACEHOLDER_DATA_SECTION}`;

// Strips a leading/trailing markdown code fence if the model wrapped its
// output in one despite the system prompt saying not to — Claude does this
// often enough for code output that it's worth handling defensively rather
// than shipping a raw ```html fence into the user's downloaded file.
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:html)?\n([\s\S]*?)\n```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

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
  if (stopReason === "max_tokens" || !looksLikeCompleteHtmlDocument(html)) {
    throw new Error(
      action === "generated"
        ? "The generated website was too large and got cut off before finishing — try a shorter or simpler description."
        : "The updated website was too large and got cut off before finishing — try a smaller change."
    );
  }
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
  ];
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
export async function generateWebsiteHtml(
  apiKey: string,
  description: string,
  referenceImages?: ReferenceImage[],
  onDelta?: (accumulatedText: string) => void,
  formEndpointUrl?: string
): Promise<string> {
  const anthropic = new Anthropic({ apiKey });
  const images = referenceImages?.slice(0, MAX_REFERENCE_IMAGES) ?? [];

  const userText = description + buildReferenceImageUrlList(images);
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

  // Streamed rather than a single blocking call: at WEBSITE_MAX_TOKENS
  // (32000) a non-streaming request risks the Anthropic SDK's own
  // "Streaming is required for operations that may take longer than 10
  // minutes" error/timeout on a large, detailed generation — streaming
  // removes that ceiling entirely. finalMessage() still hands back the
  // same Message shape (content, stop_reason) as a non-streaming
  // response, so nothing below this call needs to change.
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: WEBSITE_MAX_TOKENS,
    system: buildGenerateSystemBlocks(formEndpointUrl),
    messages: [{ role: "user", content }],
  });

  if (onDelta) {
    let accumulated = "";
    stream.on("text", (delta) => {
      accumulated += delta;
      onDelta(accumulated);
    });
  }

  const response = await stream.finalMessage();

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  const rawText = textBlock?.text.trim();
  if (!rawText) {
    throw new Error("The model did not return a website.");
  }

  const html = stripCodeFence(rawText);
  assertCompleteHtmlResponse(response.stop_reason, html, "generated");
  return html;
}

const EDIT_SYSTEM_PROMPT = `You edit an existing complete single-file website's HTML, applying only the specific change the user asks for.

CORE RULES:
- You will be given the website's CURRENT complete HTML document, followed by a plain-text change request.
- Output the FULL, updated HTML document: <!DOCTYPE html> through </html>. Nothing else — no explanation, no markdown code fences, no commentary before or after.
- Apply ONLY the requested change. Keep every other section, all copy, and the overall structure and design exactly as they were unless the change necessarily affects them.
- Keep following the same rules the original site was built under: all CSS inline in a single <style> tag, no external stylesheets/fonts/scripts except the specific exceptions below, responsive with a viewport meta tag, semantic HTML5.
${FONTS_SECTION}
${ANIMATIONS_SECTION}
${IMAGE_RULES_HEADER}
${FUNCTIONAL_ELEMENTS_SECTION}
${PLACEHOLDER_DATA_SECTION}
If the change request asks to add a photo, a font, an animation, contact info, or a form, apply the same rules above as if generating fresh — e.g. a newly-requested photo still uses the PLACEHOLDER convention (or a newly-attached reference image's real URL) rather than an invented link.`;

// Same prompt-caching split as buildGenerateSystemBlocks above — the
// (large, fully static) EDIT_SYSTEM_PROMPT gets its own cache_control
// breakpoint, separate from the small per-website form-endpoint block.
function buildEditSystemBlocks(formEndpointUrl: string | undefined): Anthropic.TextBlockParam[] {
  return [
    { type: "text", text: EDIT_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    { type: "text", text: buildFormEndpointInstruction(formEndpointUrl) },
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
  changeRequest: string
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
export async function editWebsiteHtml(
  apiKey: string,
  currentHtml: string,
  changeRequest: string,
  referenceImages?: ReferenceImage[],
  formEndpointUrl?: string
): Promise<string> {
  const images = referenceImages?.slice(0, MAX_REFERENCE_IMAGES) ?? [];

  if (images.length === 0) {
    try {
      const patched = await tryApplySimpleEdit(apiKey, currentHtml, changeRequest);
      if (patched) {
        assertCompleteHtmlResponse(null, patched, "updated");
        return patched;
      }
    } catch {
      // Best-effort: any failure in the cheap-patch path (network hiccup,
      // malformed tool response) falls straight through to the normal,
      // proven full-regeneration path below rather than failing the edit.
    }
  }

  const anthropic = new Anthropic({ apiKey });

  const userText = `CURRENT HTML:\n\n${currentHtml}\n\nCHANGE REQUEST: ${changeRequest}${buildReferenceImageUrlList(images)}`;
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

  // Streamed for the same reason as generateWebsiteHtml above — WEBSITE_MAX_TOKENS
  // is large enough that a non-streaming call risks the SDK's own long-request
  // guard. finalMessage() gives back the same Message shape either way.
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: WEBSITE_MAX_TOKENS,
    system: buildEditSystemBlocks(formEndpointUrl),
    messages: [{ role: "user", content }],
  });
  const response = await stream.finalMessage();

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  const rawText = textBlock?.text.trim();
  if (!rawText) {
    throw new Error("The model did not return an updated website.");
  }

  const html = stripCodeFence(rawText);
  assertCompleteHtmlResponse(response.stop_reason, html, "updated");
  return html;
}
