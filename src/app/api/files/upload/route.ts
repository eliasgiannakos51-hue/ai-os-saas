import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import {
  MAX_FILE_BYTES,
  extensionOf,
  formatBytes,
  sanitiseFilename,
  sniffFileType,
} from "@/lib/files/file-types";
import {
  maxFilesForPlan,
  maxStorageBytesForPlan,
  maxUploadsPerHour,
} from "@/lib/files/limits";
import { extractText, ExtractionError, serialisePages } from "@/lib/files/extract";
import { FILE_BUCKET, usedStorageBytes } from "@/lib/files/store";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// Extraction of a 50-page PDF is CPU-bound and runs inline. Inline is the
// right call: the alternative is a "processing" row that a killed
// function leaves stuck forever, and the user watching a spinner that
// will never finish. 60s is comfortably above the worst case measured on
// the page and size ceilings this route enforces.
export const maxDuration = 60;

/**
 * Upload one file.
 *
 * Order matters here and is deliberate — every check that can refuse the
 * request happens BEFORE a byte is written to the bucket:
 *
 *   auth → rate limit → size → type (from CONTENT) → plan file cap →
 *   plan storage cap → write object → extract → write row
 *
 * The two that people usually get backwards are the type check and the
 * storage cap. Sniffing the type after storing means the bucket accumulates
 * whatever anyone felt like sending; checking the storage cap after the
 * write means the cap is advisory, because the bytes are already paid for.
 *
 * The row is written LAST, and if extraction fails it is still written —
 * with status 'failed' and a reason. A file the user can see and delete is
 * better than an orphaned object they cannot.
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
    // being read into memory.
    if (entry.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { ok: false, error: `Files must be ${formatBytes(MAX_FILE_BYTES)} or smaller.` },
        { status: 413 }
      );
    }
    if (entry.size === 0) {
      return NextResponse.json({ ok: false, error: "That file is empty." }, { status: 400 });
    }

    const bytes = Buffer.from(await entry.arrayBuffer());
    // And again on the real length: `File.size` is metadata, and the
    // stream is what actually arrived.
    if (bytes.length > MAX_FILE_BYTES) {
      return NextResponse.json(
        { ok: false, error: `Files must be ${formatBytes(MAX_FILE_BYTES)} or smaller.` },
        { status: 413 }
      );
    }

    const filename = sanitiseFilename(entry.name || "untitled");
    // Decided from the first bytes. The browser's Content-Type and the
    // extension are both supplied by whoever is uploading.
    const kind = sniffFileType(bytes, filename);
    if (!kind) {
      return NextResponse.json(
        { ok: false, error: "That file type is not supported. Upload a PDF, Word, Excel, CSV, Markdown or text file." },
        { status: 415 }
      );
    }

    const isAdmin = isAdminEmail(user.email);
    const planSlug = await resolveEffectivePlanSlug(user);
    const fileCap = isAdmin ? Number.POSITIVE_INFINITY : maxFilesForPlan(planSlug);
    const storageCap = isAdmin ? Number.POSITIVE_INFINITY : maxStorageBytesForPlan(planSlug);

    if (Number.isFinite(fileCap)) {
      const { count, error } = await supabase
        .from("user_files")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      // Fails CLOSED, unlike the rate limiter: this cap bounds a resource
      // that costs money every month, and a counting error must not be a
      // way past it.
      if (error) {
        logApiError("/api/files/upload", error, { stage: "count_files" });
        return NextResponse.json({ ok: false, error: "Could not check your file allowance." }, { status: 503 });
      }
      if ((count ?? 0) >= fileCap) {
        return NextResponse.json(
          {
            ok: false,
            limitReached: true,
            error: `Your plan includes ${fileCap} file${fileCap === 1 ? "" : "s"} — delete one or upgrade.`,
          },
          { status: 403 }
        );
      }
    }

    if (Number.isFinite(storageCap)) {
      const used = await usedStorageBytes(supabase, user.id);
      if (used === null) {
        return NextResponse.json({ ok: false, error: "Could not check your storage allowance." }, { status: 503 });
      }
      if (used + bytes.length > storageCap) {
        return NextResponse.json(
          {
            ok: false,
            limitReached: true,
            error: `That would use more than your ${formatBytes(storageCap)} of storage (${formatBytes(used)} used).`,
          },
          { status: 403 }
        );
      }
    }

    // The path is built from ids we generate, never from the filename.
    // The first segment is the owner, which is what the bucket's RLS
    // policies match on — so the path is the ownership proof, and a
    // creative filename cannot reach another user's folder because the
    // filename is not in the path at all.
    const extension = extensionOf(filename) || `.${kind}`;
    const storagePath = `${user.id}/${randomUUID()}${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(FILE_BUCKET)
      .upload(storagePath, bytes, {
        contentType: entry.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      logApiError("/api/files/upload", uploadError, { stage: "storage_upload" });
      return NextResponse.json({ ok: false, error: "The file could not be stored." }, { status: 502 });
    }

    let extractedText: string | null = null;
    let pageCount: number | null = null;
    let status: "ready" | "failed" = "ready";
    let error: string | null = null;

    try {
      const result = extractText(bytes, kind);
      extractedText = serialisePages(result.pages);
      pageCount = result.pageCount;
      if (result.truncated) {
        // Not an error — the file is usable. But saying nothing here is
        // how a user comes to believe the AI read all 300 pages.
        error = `Only the first ${result.pages.length} page${result.pages.length === 1 ? "" : "s"} of this document are searchable.`;
      }
    } catch (err) {
      status = "failed";
      // ExtractionError messages are written for the user. Anything else
      // gets a generic message: a parser's own words are not a sentence
      // anyone should have to read.
      error = err instanceof ExtractionError ? err.message : "This file could not be read.";
    }

    const { data: row, error: insertError } = await supabase
      .from("user_files")
      .insert({
        user_id: user.id,
        filename,
        file_type: kind,
        size_bytes: bytes.length,
        storage_path: storagePath,
        extracted_text: extractedText,
        page_count: pageCount,
        char_count: extractedText?.length ?? 0,
        processing_status: status,
        error,
      })
      .select("id, filename, file_type, size_bytes, page_count, char_count, processing_status, error, uploaded_at")
      .single();

    if (insertError || !row) {
      // The object exists but the row does not, which would be an
      // invisible, uncountable, undeletable file sitting in the bucket
      // against the user's quota forever. Remove it.
      await supabase.storage.from(FILE_BUCKET).remove([storagePath]);
      logApiError("/api/files/upload", insertError, { stage: "insert_row" });
      return NextResponse.json({ ok: false, error: "The file could not be saved." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, file: row });
  } catch (err) {
    logApiError("/api/files/upload", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
