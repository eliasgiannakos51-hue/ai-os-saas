/**
 * WHAT GEMINI'S ANSWER TO "MAKE A PICTURE" MEANS (MASTER 16, package 19).
 * Pure — no network, no environment — so the four outcomes
 * lib/images/gemini-image.ts describes are held by
 * scripts/tests/image-studio.test.mjs without a key.
 */

export type ImageOutcome =
  | { ok: true; data: Buffer; mime: string }
  | { ok: false; kind: "refused" | "provider" | "aborted"; detail: string };

/** The largest picture accepted back: a 4K PNG is well under this. */
const MAX_IMAGE_BYTES = 40 * 1024 * 1024;

/** The provider's reasons for declining, as opposed to failing. */
const DECLINED = new Set(["SAFETY", "IMAGE_SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION", "IMAGE_PROHIBITED_CONTENT", "IMAGE_RECITATION", "NO_IMAGE"]);

type GeminiImageResponse = {
  promptFeedback?: { blockReason?: string | null } | null;
  candidates?: {
    finishReason?: string | null;
    content?: { parts?: { text?: string; inlineData?: { mimeType?: string; data?: string } }[] } | null;
  }[];
};

/** Reads one answer. Pure, so the four outcomes are held without a network. */
export function readImageAnswer(status: number, body: unknown): ImageOutcome {
  if (status < 200 || status >= 300) return { ok: false, kind: "provider", detail: `status ${status}` };
  const answer = (body ?? {}) as GeminiImageResponse;
  const blocked = answer.promptFeedback?.blockReason;
  if (blocked) return { ok: false, kind: "refused", detail: String(blocked) };
  const candidate = answer.candidates?.[0];
  const part = candidate?.content?.parts?.find((p) => typeof p.inlineData?.data === "string" && p.inlineData.data.length > 0);
  if (!part?.inlineData?.data) {
    const reason = String(candidate?.finishReason ?? "NO_IMAGE");
    // A finished answer with words and no picture is the model saying why
    // it will not draw this: declined, not broken.
    const saidWhy = reason === "STOP" && Boolean(candidate?.content?.parts?.some((p) => typeof p.text === "string" && p.text.trim()));
    return { ok: false, kind: DECLINED.has(reason) || saidWhy ? "refused" : "provider", detail: reason };
  }
  const mime = String(part.inlineData.mimeType ?? "image/png");
  if (!/^image\/(png|jpeg|webp)$/.test(mime)) return { ok: false, kind: "provider", detail: `unexpected ${mime}` };
  const data = Buffer.from(part.inlineData.data, "base64");
  if (data.length === 0 || data.length > MAX_IMAGE_BYTES) return { ok: false, kind: "provider", detail: `size ${data.length}` };
  return { ok: true, data, mime };
}
