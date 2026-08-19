import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { MAX_FILE_BYTES, formatBytes } from "@/lib/files/file-types";
import { maxUploadsPerHour } from "@/lib/files/limits";
import { ingestFileBytes } from "@/lib/files/ingest";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// Extraction of a 50-page PDF is CPU-bound and runs inline. Inline is the
// right call: the alternative is a "processing" row that a killed
// function leaves stuck forever, and the user watching a spinner that
// will never finish. 60s is comfortably above the worst case measured on
// the page and size ceilings this route enforces.
export const maxDuration = 60;

/**
 * Upload one file THROUGH the server.
 *
 * This is the FALLBACK path. The primary path is a direct browser →
 * storage write followed by /api/files/register, because this route can
 * never carry the product's 20MB limit: the host refuses request bodies
 * over ~4.5MB before the route runs, with an HTML 413 this code never
 * sees. It stays for the cases where the client cannot reach storage
 * directly, and for small files it is exactly equivalent.
 *
 * Order matters here and is deliberate — every check that can refuse the
 * request happens BEFORE a byte is written to the bucket:
 *
 *   auth → rate limit → size → type (from CONTENT) → plan file cap →
 *   plan storage cap → write object → extract → write row
 *
 * All of that after "rate limit" lives in lib/files/ingest.ts, shared
 * with the register route. Refusals carry a `stage` naming which link in
 * the chain said no — the field the production incident needed and the
 * old generic messages threw away.
 */
export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

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

    const form = await request.formData().catch(() => null);
    const entry = form?.get("file");
    if (!form || !(entry instanceof File)) {
      return NextResponse.json({ ok: false, error: "No file was sent." }, { status: 400 });
    }

    // The declared size first, so an oversized upload is refused without
    // being read into memory. (`File.size` is metadata — ingest checks the
    // real length again.)
    if (entry.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { ok: false, error: `Files must be ${formatBytes(MAX_FILE_BYTES)} or smaller.` },
        { status: 413 }
      );
    }

    const bytes = Buffer.from(await entry.arrayBuffer());

    const result = await ingestFileBytes({
      supabase,
      user,
      bytes,
      rawFilename: entry.name || "untitled",
      contentType: entry.type || null,
    });

    if (!result.ok) {
      const { status, ...body } = result;
      return NextResponse.json(body, { status });
    }
    return NextResponse.json({ ok: true, file: result.file });
  } catch (err) {
    logApiError("/api/files/upload", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
