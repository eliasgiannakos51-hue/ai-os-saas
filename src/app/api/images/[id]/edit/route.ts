import { NextResponse } from "next/server";
import { logApiError } from "@/lib/log-error";
import { fingerprintRequest } from "@/lib/ai-circuit-breaker";
import { UUID, imageContext, loadOwnImage, refuse } from "@/lib/images/image-route";
import { remakeVariant } from "@/lib/images/image-remake";
import { IMAGE_VARIANTS, MAX_IMAGE_INSTRUCTION_CHARS, checkImageText } from "@/lib/images/image-studio";

export const dynamic = "force-dynamic";
// One picture, bounded by IMAGE_CALL_TIMEOUT_MS.
export const maxDuration = 120; // @function-limit 120

/**
 * ONE OF THE FOUR, CHANGED WITH WORDS (MASTER 16, package 19), behind the
 * switch "image-studio": «αλλάζω μία με λόγια». The picture itself goes to
 * the provider with the words, so what changes is what was asked; the
 * picture it replaces is kept (lib/images/image-remake.ts). The owner's
 * row only, one change at a time, the price of one picture.
 */
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID.test(id)) return refuse("not_found", 404);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return refuse("invalid_body", 400);
  }
  const index = Number(body.variant);
  if (!Number.isInteger(index) || index < 0 || index >= IMAGE_VARIANTS) return refuse("no_such_picture", 400);
  const verdict = checkImageText(body.instruction, MAX_IMAGE_INSTRUCTION_CHARS);
  if (!verdict.ok) return refuse(verdict.reason, 400, { limit: verdict.limit });

  const ctx = await imageContext({ spending: true, endpoint: "image_edit", fingerprint: fingerprintRequest(verdict.text, `${id}:${index}`) });
  if (ctx instanceof NextResponse) return ctx;
  try {
    const row = await loadOwnImage(ctx, id);
    if (!row) return refuse("not_found", 404);
    return await remakeVariant(ctx, row, index, { kind: "edit", instruction: verdict.text }, request.signal);
  } catch (err) {
    logApiError("/api/images/[id]/edit", err);
    return refuse("failed", 500);
  }
}
