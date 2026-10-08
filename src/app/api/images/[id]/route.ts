import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { IMAGE_ROW_COLUMNS, UUID, everyPath, imageGate, refuse, removePictures, type ImageRow } from "@/lib/images/image-access";
import { readVariants } from "@/lib/images/image-studio";

export const dynamic = "force-dynamic";

/**
 * THE PERSON DELETES ONE OF THEIR IMAGES (MASTER 16, package 19), behind
 * the switch "image-studio": the row and every picture it names — the
 * four, their largest sizes and every picture a change replaced
 * (lib/images/image-access.ts, everyPath). The pictures go FIRST: the
 * other order would leave files in the bucket that nothing points at.
 * The owner's row only; 404 for anybody else's, never 403.
 */
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  if (!UUID.test(id)) return refuse("not_found", 404);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuse("not_signed_in", 401);
  const gate = await imageGate(user);
  if (gate instanceof NextResponse) return gate;
  try {
    const { data, error } = await supabase
      .from("generated_images")
      .select(IMAGE_ROW_COLUMNS)
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return refuse("not_found", 404);
    const row = data as ImageRow;
    if (!(await removePictures(everyPath(readVariants(row.variants, user.id))))) return refuse("delete_failed", 502);
    const { error: deleteError } = await supabase.from("generated_images").delete().eq("id", id).eq("user_id", user.id);
    if (deleteError) {
      logApiError("/api/images/[id]", deleteError, { stage: "delete_row" });
      return refuse("delete_failed", 500);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/images/[id]", err);
    return refuse("failed", 500);
  }
}
