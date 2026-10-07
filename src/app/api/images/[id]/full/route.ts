import { NextResponse } from "next/server";
import { logApiError } from "@/lib/log-error";
import { UUID, imageContext, loadOwnImage, refuse } from "@/lib/images/image-route";
import { remakeVariant } from "@/lib/images/image-remake";
import { IMAGE_VARIANTS } from "@/lib/images/image-studio";

export const dynamic = "force-dynamic";
// One 4K picture, bounded by IMAGE_CALL_TIMEOUT_MS.
export const maxDuration = 120; // @function-limit 120

/**
 * THE PICTURE AT THE LARGEST SIZE (MASTER 16, package 19), behind the
 * switch "image-studio": «την κατεβάζω στην υψηλότερη ανάλυση». Made from
 * the picture, not from the words again, by the provider's 4K model
 * (lib/images/image-pricing.ts, IMAGE_FULL_MODEL); made once and charged
 * once — asked again it is the same file, free. Answers with an address
 * that saves it under a readable name.
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

  const ctx = await imageContext({ spending: true, endpoint: "image_full", fingerprint: `${id}:${index}:full` });
  if (ctx instanceof NextResponse) return ctx;
  try {
    const row = await loadOwnImage(ctx, id);
    if (!row) return refuse("not_found", 404);
    return await remakeVariant(ctx, row, index, { kind: "full" }, request.signal);
  } catch (err) {
    logApiError("/api/images/[id]/full", err);
    return refuse("failed", 500);
  }
}
