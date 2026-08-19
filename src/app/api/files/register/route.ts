import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { FILE_BUCKET } from "@/lib/files/file-types";
import { maxUploadsPerHour } from "@/lib/files/limits";
import { describeStorageFailure, ingestFileBytes } from "@/lib/files/ingest";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// Same reasoning as /api/files/upload: extraction is CPU-bound and inline.
export const maxDuration = 60;

/**
 * Second half of the PRIMARY upload path.
 *
 * The browser writes the object straight into the private bucket (its own
 * folder — the bucket's RLS makes any other folder unwritable), then calls
 * this with the path. We read the object back, run exactly the same
 * checks as a body upload (size, content-sniffed type, plan caps),
 * extract, and write the row. Any refusal DELETES the object, so a file
 * that was refused does not squat in the bucket.
 *
 * Why not just POST the bytes? Because the host caps request bodies at
 * ~4.5MB — a 20MB product limit cannot travel through a serverless
 * function's request body, and pretending it could is how uploads of
 * ordinary PDFs failed with an HTML 413 the client code never saw.
 *
 * The path is validated to be inside the CALLER's folder before anything
 * else: this route must not become a way to register (or delete) someone
 * else's object. Storage RLS already prevents reading foreign objects —
 * the check here is defence in depth, and gives an honest 400 instead of
 * a confusing "not found".
 */

// `<caller's uuid>/<uuid>` with an optional short extension. The first
// segment is checked against user.id separately so the error can say
// "not yours" things without leaking which paths exist.
const OBJECT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,12})?$/i;

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // Same scope as the body-upload route: however the bytes travel, it
    // is one upload.
    const limited = await checkRateLimit({
      scope: "file_upload",
      identifier: user.id,
      maxAttempts: maxUploadsPerHour(),
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many uploads in the last hour. Try again shortly." },
        { status: 429 }
      );
    }

    let path = "";
    let filename = "";
    try {
      const body = (await request.json()) as { path?: unknown; filename?: unknown };
      path = typeof body.path === "string" ? body.path : "";
      filename = typeof body.filename === "string" ? body.filename : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Malformed request." }, { status: 400 });
    }

    const segments = path.split("/");
    if (segments.length !== 2 || segments[0] !== user.id || !OBJECT_RE.test(segments[1])) {
      return NextResponse.json(
        { ok: false, error: "That storage path is not one of yours." },
        { status: 400 }
      );
    }

    const { data: blob, error: downloadError } = await supabase.storage
      .from(FILE_BUCKET)
      .download(path);

    if (downloadError || !blob) {
      logApiError("/api/files/register", downloadError, { stage: "storage_download" });
      const message = downloadError?.message ?? "";
      if (/not.?found|does not exist/i.test(message) && !/bucket/i.test(message)) {
        return NextResponse.json(
          { ok: false, stage: "storage_download", error: "That upload was not found in storage." },
          { status: 404 }
        );
      }
      const described = describeStorageFailure(message);
      return NextResponse.json(
        { ok: false, stage: "storage_download", error: described.error, detail: message },
        { status: described.status }
      );
    }

    // The whole object is read into memory here, same as the body route.
    // The bucket's own file_size_limit (set by the storage migration) is
    // what bounds a hand-crafted oversized object; ingest re-checks the
    // 20MB product limit on the real length either way and deletes the
    // object when it refuses.
    const bytes = Buffer.from(await blob.arrayBuffer());

    const result = await ingestFileBytes({
      supabase,
      user,
      bytes,
      rawFilename: filename || segments[1],
      contentType: blob.type || null,
      existingPath: path,
    });

    if (!result.ok) {
      const { status, ...body } = result;
      return NextResponse.json(body, { status });
    }
    return NextResponse.json({ ok: true, file: result.file });
  } catch (err) {
    logApiError("/api/files/register", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
