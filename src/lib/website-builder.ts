import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 8192;

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
