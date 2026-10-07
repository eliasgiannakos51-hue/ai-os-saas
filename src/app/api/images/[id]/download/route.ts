import { NextResponse } from "next/server";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { UUID, downloadUrl, imageContext, loadOwnImage, refuse } from "@/lib/images/image-route";
import { IMAGE_VARIANTS, readVariants } from "@/lib/images/image-studio";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * ONE PICTURE, SAVED (MASTER 16, package 19), behind the switch
 * "image-studio": `?variant=N` the preview, `&size=full` the largest size
 * once it has been made (api/images/[id]/full makes it). The owner's row
 * only; a redirect to a short signed address that saves the file under a
 * readable name. Rate limited, because it mints an address; charges
 * nothing.
 */
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID.test(id)) return refuse("not_found", 404);
  const search = new URL(request.url).searchParams;
  const index = Number(search.get("variant"));
  if (!Number.isInteger(index) || index < 0 || index >= IMAGE_VARIANTS) return refuse("no_such_picture", 400);
  const full = search.get("size") === "full";

  const ctx = await imageContext({ spending: false });
  if (ctx instanceof NextResponse) return ctx;
  try {
    const limited = await checkRateLimit({ scope: "image_download", identifier: ctx.user.id, maxAttempts: 240, windowMinutes: 60 });
    if (!limited.allowed) return refuse("rate_limited", 429);
    const row = await loadOwnImage(ctx, id);
    if (!row) return refuse("not_found", 404);
    const variant = readVariants(row.variants, ctx.user.id).find((v) => v.index === index);
    if (!variant) return refuse("no_such_picture", 404);
    if (full && !variant.fullPath) return refuse("not_made", 404);
    const url = await downloadUrl(row, variant, full);
    if (!url) return refuse("sign_failed", 502);
    const response = NextResponse.redirect(url, 302);
    // The signed address is a bearer token: never cached.
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (err) {
    logApiError("/api/images/[id]/download", err);
    return refuse("failed", 500);
  }
}
