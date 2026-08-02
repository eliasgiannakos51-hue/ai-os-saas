import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 8192;

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
    max_tokens: 300,
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

// Website Builder (see api/websites/generate/route.ts) — a real Claude
// call that returns a complete, standalone HTML document, not a tracked
// "idea" like the existing Websites Build module (ai_websites table,
// lib/build-modules.ts) which never calls AI at all.
export async function generateWebsiteHtml(apiKey: string, description: string): Promise<string> {
  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: description }],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  const text = textBlock?.text.trim();
  if (!text) {
    throw new Error("The model did not return a website.");
  }

  return stripCodeFence(text);
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

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: EDIT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `CURRENT HTML:\n\n${currentHtml}\n\nCHANGE REQUEST: ${changeRequest}`,
      },
    ],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  const text = textBlock?.text.trim();
  if (!text) {
    throw new Error("The model did not return an updated website.");
  }

  return stripCodeFence(text);
}
