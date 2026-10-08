import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { allowExport } from "@/lib/export-guard";
import { isFeatureOn } from "@/lib/flags/flags";
import { isPostPlatform, parseStoredPostSet } from "@/lib/posts/platforms";
import { postImageFilename } from "@/lib/posts/post-images";
import { cutForPlatform, loadPostSource } from "@/lib/posts/post-image-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * A POST'S PICTURE AT ITS PLATFORM'S SIZE (MASTER 16, package 15), behind
 * the switch "posts-images": `?platform=instagram` is 1080 x 1350, and so
 * on (lib/posts/post-images.ts). Cut on request from the one picture the
 * set keeps, so nothing is stored five times.
 *
 * Read with the person's own session, by id AND owner; their own photo is
 * read only from their own folder. `&download=1` sends it as a file named
 * for what it is (instagram-1080x1350.jpg), bounded like every export.
 * An Unsplash photo's use was registered once, when the posts chose it
 * (api/posts/generate), which is what Unsplash asks — not once per file.
 * No model, no charge.
 */
export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const url = new URL(request.url);
  const platform = url.searchParams.get("platform");
  const download = url.searchParams.get("download") === "1";
  if (!isPostPlatform(platform)) return NextResponse.json({ ok: false, code: "bad_platform" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
  if (!(await isFeatureOn("posts-images", user))) return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });

  try {
    if (download && !(await allowExport(user.id))) return NextResponse.json({ ok: false, code: "too_many_exports" }, { status: 429 });
    const { data: row, error } = await supabase
      .from("generated_posts")
      .select("posts")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!row) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
    const set = parseStoredPostSet(row.posts);
    if (!set || !set.image || !set.posts.some((p) => p.platform === platform)) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });
    // THE PERSON'S OWN FOLDER ONLY, whatever a row says.
    if (set.image.kind === "own" && !set.image.path.startsWith(`${user.id}/`)) return NextResponse.json({ ok: false, code: "not_found" }, { status: 404 });

    const source = await loadPostSource(supabase, set.image, platform);
    if (!source) return NextResponse.json({ ok: false, code: "unavailable" }, { status: 502 });
    const jpeg = await cutForPlatform(source, platform);
    return new NextResponse(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${postImageFilename(platform)}"`,
        "Cache-Control": "private, max-age=3600",
        "Content-Length": String(jpeg.length),
      },
    });
  } catch (err) {
    logApiError("/api/posts/[id]/image", err);
    return NextResponse.json({ ok: false, code: "failed" }, { status: 500 });
  }
}
