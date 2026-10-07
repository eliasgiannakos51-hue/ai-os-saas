import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { IMAGE_ROW_COLUMNS, UUID, downloadUrl, imageGate, refuse, type ImageRow } from "@/lib/images/image-access";
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

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return refuse("not_signed_in", 401);
  const gate = await imageGate(user);
  if (gate instanceof NextResponse) return gate;
  try {
    const limited = await checkRateLimit({ scope: "image_download", identifier: user.id, maxAttempts: 240, windowMinutes: 60 });
    if (!limited.allowed) return refuse("rate_limited", 429);
    const { data, error } = await supabase
      .from("generated_images")
      .select(IMAGE_ROW_COLUMNS)
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return refuse("not_found", 404);
    const row = data as ImageRow;
    const variant = readVariants(row.variants, user.id).find((v) => v.index === index);
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
