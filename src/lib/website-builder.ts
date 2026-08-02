import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { looksLikeCompleteHtmlDocument } from "@/lib/html-document-check";
import { MAX_REFERENCE_IMAGES } from "@/lib/website-reference-image";

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

const SYSTEM_PROMPT = `You generate complete, production-ready single-file websites from a plain-text description.

Rules:
- Output ONE complete HTML document: <!DOCTYPE html> through </html>. Nothing else — no explanation, no markdown code fences, no commentary before or after.
- All CSS must be inline in a single <style> tag in <head>. No external stylesheets, fonts, scripts, or images from external URLs (no <link>, no CDN references) — everything must render standalone from the HTML alone.
- Do not include any <script> tags or JavaScript — this must be a static page.
- Must be responsive: include a <meta name="viewport"> tag and use relative units / flexbox / grid / media queries so it looks good on both mobile and desktop.
- Use semantic HTML5 (header, nav, main, section, footer, etc.) and a real, polished visual design (not a bare unstyled page) — sensible typography, spacing, and a coherent color scheme that fits what was described.
- Use placeholder text/content that fits the description where specific content wasn't given — never leave Lorem Ipsum, always write real-sounding copy relevant to the request.
- Fill in a <title> tag that fits the description.`;

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

// Reference images (Website Builder's optional "attach up to 5 reference
// images — logo, product photos, a style screenshot" upload — see
// api/websites/generate/route.ts). Only jpeg/png are accepted client-side
// and server-side, matching what Claude's vision input supports well and
// what the upload form allows.
export type ReferenceImageMediaType = "image/jpeg" | "image/png";
export type ReferenceImage = { base64: string; mediaType: ReferenceImageMediaType };

// Validates a stored file's content-type is one of the two types the
// upload form accepts — used server-side after downloading from Storage,
// so a file that somehow bypassed the client-side check (or was uploaded
// by another client entirely) never reaches the vision API mislabeled.
export function isSupportedReferenceImageMediaType(contentType: string): contentType is ReferenceImageMediaType {
  return contentType === "image/jpeg" || contentType === "image/png";
}

// Appended to SYSTEM_PROMPT only when at least one reference image is
// actually attached — worded per spec: the image(s) inform color
// palette/style (and logo placement, described in words) but are never
// embedded into the generated HTML itself, since that would need separate
// image hosting (a deliberately out-of-scope, future step — see the
// route's own comment). Pluralized when more than one image is attached,
// since a single set of images might mix a logo with product photos and a
// style-reference screenshot.
function buildImageSystemPromptAddition(imageCount: number): string {
  if (imageCount <= 1) {
    return `

Ο χρήστης έχει επισυνάψει εικόνα αναφοράς. Χρησιμοποίησέ την για να εμπνευστείς το χρωματικό παλέτα/στυλ του website. Αν είναι λογότυπο, ενσωμάτωσέ το νοητά στο header (περιέγραψε πού θα πήγαινε, μιας και δεν μπορείς να το εισάγεις κυριολεκτικά ως εικόνα στο παραγόμενο HTML χωρίς να το ανεβάσουμε ξεχωριστά).`;
  }
  return `

Ο χρήστης έχει επισυνάψει ${imageCount} εικόνες αναφοράς (π.χ. λογότυπο, φωτογραφίες προϊόντων, screenshot στυλ). Χρησιμοποίησέ τις ΟΛΕΣ μαζί για να εμπνευστείς το χρωματικό παλέτα/στυλ του website. Αν κάποια είναι λογότυπο, ενσωμάτωσέ το νοητά στο header (περιέγραψε πού θα πήγαινε, μιας και δεν μπορείς να το εισάγεις κυριολεκτικά ως εικόνα στο παραγόμενο HTML χωρίς να το ανεβάσουμε ξεχωριστά).`;
}

// Website Builder (see api/websites/generate/route.ts) — a real Claude
// call that returns a complete, standalone HTML document, not a tracked
// "idea" like the existing Websites Build module (ai_websites table,
// lib/build-modules.ts) which never calls AI at all. `referenceImages`
// is optional — when present, EVERY image is sent as a real vision input
// block alongside the text description (not just described in words), so
// Claude actually sees all of the uploaded logo/photos/screenshot, not
// just the first one.
export async function generateWebsiteHtml(
  apiKey: string,
  description: string,
  referenceImages?: ReferenceImage[]
): Promise<string> {
  const anthropic = new Anthropic({ apiKey });
  const images = referenceImages?.slice(0, MAX_REFERENCE_IMAGES) ?? [];

  const content: Anthropic.MessageParam["content"] =
    images.length > 0
      ? [
          ...images.map(
            (image): Anthropic.ImageBlockParam => ({
              type: "image",
              source: { type: "base64", media_type: image.mediaType, data: image.base64 },
            })
          ),
          { type: "text", text: description },
        ]
      : description;

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
    system: images.length > 0 ? SYSTEM_PROMPT + buildImageSystemPromptAddition(images.length) : SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });
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

Rules:
- You will be given the website's CURRENT complete HTML document, followed by a plain-text change request.
- Output the FULL, updated HTML document: <!DOCTYPE html> through </html>. Nothing else — no explanation, no markdown code fences, no commentary before or after.
- Apply ONLY the requested change. Keep every other section, all copy, and the overall structure and design exactly as they were unless the change necessarily affects them.
- Keep following the same rules the original site was built under: all CSS inline in a single <style> tag, no external stylesheets/fonts/scripts/images, no <script> tags, responsive with a viewport meta tag, semantic HTML5.`;

// Website Builder post-generation editing — takes the CURRENT html_content
// as context plus a free-text change request ("make the hero bigger",
// "change the colors to blue") and returns a full updated HTML document.
// A second, separate Claude call from generateWebsiteHtml above (not a
// continuation of the same conversation) — the entire current HTML is
// re-sent as context every time, same one-shot pattern as every other AI
// call in this app.
export async function editWebsiteHtml(
  apiKey: string,
  currentHtml: string,
  changeRequest: string
): Promise<string> {
  const anthropic = new Anthropic({ apiKey });

  // Streamed for the same reason as generateWebsiteHtml above — WEBSITE_MAX_TOKENS
  // is large enough that a non-streaming call risks the SDK's own long-request
  // guard. finalMessage() gives back the same Message shape either way.
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: WEBSITE_MAX_TOKENS,
    system: EDIT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `CURRENT HTML:\n\n${currentHtml}\n\nCHANGE REQUEST: ${changeRequest}`,
      },
    ],
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
