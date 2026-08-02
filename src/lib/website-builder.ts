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
