import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { FILE_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/files/store";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Mint a short-lived download link.
 *
 * The bucket is private, so this route is the ONLY way to read a stored
 * file, which makes it the single place the ownership check has to be
 * right. It is done the same way the delete route does it: the storage
 * path comes back from a query filtered on `user_id`, so the URL is
 * signed for an object the requester provably owns.
 *
 * A signed URL is a bearer token. Sixty seconds is chosen against how it
 * actually leaks — browser history, a pasted link, a referrer header —
 * rather than against convenience. It is enough to begin a download and
 * short enough that a leaked link is almost always already dead.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // Rate limited even though it is a read: this endpoint mints
    // credentials, and an unbounded loop of it is a way to accumulate a
    // pile of live URLs for later.
    const limited = await checkRateLimit({
      scope: "file_download",
      identifier: user.id,
      maxAttempts: 120,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many download requests. Try again shortly." },
        { status: 429 }
      );
    }

    const { data: file, error } = await supabase
      .from("user_files")
      .select("id, filename, storage_path")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      logApiError("/api/files/[id]/download", error, { stage: "load" });
      return NextResponse.json({ ok: false, error: "Could not load that file." }, { status: 500 });
    }
    if (!file) {
      return NextResponse.json({ ok: false, error: "File not found." }, { status: 404 });
    }

    const { data: signed, error: signError } = await supabase.storage
      .from(FILE_BUCKET)
      .createSignedUrl(String(file.storage_path), SIGNED_URL_TTL_SECONDS, {
        download: String(file.filename),
      });

    if (signError || !signed?.signedUrl) {
      logApiError("/api/files/[id]/download", signError, { stage: "sign" });
      return NextResponse.json({ ok: false, error: "Could not prepare the download." }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      url: signed.signedUrl,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    });
  } catch (err) {
    logApiError("/api/files/[id]/download", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
