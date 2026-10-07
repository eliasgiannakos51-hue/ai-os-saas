import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { UUID, everyPath, imageContext, loadOwnImage, refuse } from "@/lib/images/image-route";
import { IMAGE_BUCKET, readVariants } from "@/lib/images/image-studio";

export const dynamic = "force-dynamic";

/**
 * THE PERSON DELETES ONE OF THEIR IMAGES (MASTER 16, package 19), behind
 * the switch "image-studio": the row and every picture it names — the
 * four, their largest sizes and every picture a change replaced
 * (lib/images/image-route.ts, everyPath). The pictures go FIRST: the other
 * order would leave files in the bucket that nothing points at.
 * The owner's row only; 404 for anybody else's, never 403.
 */
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID.test(id)) return refuse("not_found", 404);
  const ctx = await imageContext({ spending: false });
  if (ctx instanceof NextResponse) return ctx;
  try {
    const row = await loadOwnImage(ctx, id);
    if (!row) return refuse("not_found", 404);
    const paths = everyPath(readVariants(row.variants, ctx.user.id));
    const admin = createAdminClient();
    if (paths.length > 0) {
      const { error: removeError } = await admin.storage.from(IMAGE_BUCKET).remove(paths);
      if (removeError) {
        logApiError("/api/images/[id]", removeError, { stage: "storage_remove" });
        return refuse("delete_failed", 502);
      }
    }
    const { error } = await ctx.supabase.from("generated_images").delete().eq("id", id).eq("user_id", ctx.user.id);
    if (error) {
      logApiError("/api/images/[id]", error, { stage: "delete_row" });
      return refuse("delete_failed", 500);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/images/[id]", err);
    return refuse("failed", 500);
  }
}
