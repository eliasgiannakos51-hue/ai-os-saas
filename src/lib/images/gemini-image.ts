import "server-only";
import type { ImageAspect } from "@/lib/images/image-studio";
import { readImageAnswer, type ImageOutcome } from "@/lib/images/image-answer";

export type { ImageOutcome };

/**
 * ONE PICTURE FROM GEMINI (MASTER 16, package 19), for the Image tool.
 *
 * The same API scripts/cinematic-media.mjs calls — generateContent with
 * responseModalities ["IMAGE"] — and the same key, under either name the
 * owner's environment may carry (key-inventory.ts lists both). With a
 * picture in `source` it is an edit: the picture goes first, the words
 * after, which is how the provider is told to change THIS one.
 *
 * WHAT COMES BACK IS ONE OF FOUR THINGS, and the routes treat each
 * differently, because each costs differently:
 *   ok        a picture; it is charged.
 *   refused   the provider declined (its safety rules) and made nothing;
 *             nothing is charged, and the reader is told it was declined
 *             rather than that something broke.
 *   provider  the call failed (no key, rate limit, outage, a timeout);
 *             nothing is charged.
 *   aborted   the reader pressed stop.
 * No picture is ever invented in place of a failed one.
 */

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
/** Long enough for a 4K picture, short enough to fit the route's own ceiling. */
export const IMAGE_CALL_TIMEOUT_MS = 100_000;

export function imageApiKey(): string {
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
}

export type ImageCall = {
  apiKey: string;
  model: string;
  prompt: string;
  aspect: ImageAspect;
  /** "4K" for the largest size; absent for the provider's default. */
  size?: "4K";
  source?: { data: Buffer; mime: string } | null;
  signal?: AbortSignal;
};

export async function callImage(call: ImageCall): Promise<ImageOutcome> {
  if (!call.apiKey) return { ok: false, kind: "provider", detail: "not_configured" };
  const parts: Record<string, unknown>[] = [];
  if (call.source) parts.push({ inlineData: { mimeType: call.source.mime, data: call.source.data.toString("base64") } });
  parts.push({ text: call.prompt });
  const imageConfig: Record<string, string> = { aspectRatio: call.aspect };
  if (call.size) imageConfig.imageSize = call.size;
  const timeout = AbortSignal.timeout(IMAGE_CALL_TIMEOUT_MS);
  const signal = call.signal ? AbortSignal.any([call.signal, timeout]) : timeout;
  try {
    const response = await fetch(`${BASE}/${encodeURIComponent(call.model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": call.apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig },
      }),
      signal,
    });
    const body = await response.json().catch(() => null);
    return readImageAnswer(response.status, body);
  } catch (err) {
    if (call.signal?.aborted) return { ok: false, kind: "aborted", detail: "stopped" };
    return { ok: false, kind: "provider", detail: err instanceof Error ? err.name : "fetch_failed" };
  }
}
