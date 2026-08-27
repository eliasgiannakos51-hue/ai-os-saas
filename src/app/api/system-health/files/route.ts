import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { FILE_BUCKET } from "@/lib/files/file-types";
import { FILES_STORAGE_REPAIR_SQL } from "@/lib/files/ingest";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Answers, from INSIDE the deployment, the four questions a broken upload
 * raises and nothing on the outside can check:
 *
 *   1. does the 'user-files' bucket exist?            (service role)
 *   2. is the user_files table readable?              (caller's session)
 *   3. do the bucket's INSERT/DELETE policies let an
 *      authenticated user write their own folder?     (canary object)
 *   4. does user_files RLS let them insert/delete?    (canary row)
 *
 * Checks 3 and 4 run AS THE CALLING ADMIN — a real session through the
 * real policies, not the service role, because the service role bypasses
 * RLS and would report a missing policy as healthy. Each canary is
 * removed in the same request.
 *
 * Owner-only, like the rest of /dashboard/system-health.
 */

type Check = { name: string; ok: boolean; detail: string };

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!isAdminEmail(user.email)) return NextResponse.json({ ok: false }, { status: 404 });

  const checks: Check[] = [];

  // 1. Bucket existence — service role, because getBucket is an admin
  // operation and this is the one check that must not depend on policies.
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage.getBucket(FILE_BUCKET);
    if (error || !data) {
      checks.push({
        name: "bucket",
        ok: false,
        detail: `storage.getBucket('${FILE_BUCKET}') failed: ${error?.message ?? "no bucket returned"}`,
      });
    } else {
      checks.push({
        name: "bucket",
        ok: data.public !== true,
        detail: data.public
          ? `bucket exists but is PUBLIC — it must be private`
          : `bucket exists, private, file_size_limit=${(data as { file_size_limit?: number | null }).file_size_limit ?? "none"}`,
      });
    }
  } catch (err) {
    checks.push({
      name: "bucket",
      ok: false,
      detail: `service-role storage client unavailable: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  // 2. user_files table readable through the caller's own session (RLS).
  {
    const { error } = await supabase
      .from("user_files")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    checks.push({
      name: "user_files table",
      ok: !error,
      detail: error ? `select failed: ${error.message}` : "select through RLS works",
    });
  }

  // 3. Storage INSERT + DELETE policies, exercised by a real canary
  // object in the caller's own folder.
  {
    const canaryPath = `${user.id}/${randomUUID()}.txt`;
    const { error: upError } = await supabase.storage
      .from(FILE_BUCKET)
      .upload(canaryPath, Buffer.from("diagnostic canary"), {
        contentType: "text/plain",
        upsert: false,
      });
    if (upError) {
      checks.push({
        name: "storage write policy",
        ok: false,
        detail: `canary upload refused: ${upError.message}`,
      });
    } else {
      const { error: rmError } = await supabase.storage.from(FILE_BUCKET).remove([canaryPath]);
      checks.push({
        name: "storage write policy",
        ok: !rmError,
        detail: rmError
          ? `canary uploaded but delete refused: ${rmError.message}`
          : "canary object written and removed through RLS",
      });
    }
  }

  // 4. user_files INSERT + DELETE RLS, with a canary row.
  {
    const { data: row, error: insError } = await supabase
      .from("user_files")
      .insert({
        user_id: user.id,
        filename: "_diagnostic-canary.txt",
        file_type: "txt",
        size_bytes: 1,
        storage_path: `${user.id}/_diagnostic-canary`,
        extracted_text: null,
        page_count: null,
        char_count: 0,
        processing_status: "failed",
        error: "diagnostic canary — safe to delete",
      })
      .select("id")
      .single();
    if (insError || !row) {
      checks.push({
        name: "user_files RLS",
        ok: false,
        detail: `canary insert refused: ${insError?.message ?? "no row returned"}`,
      });
    } else {
      const { error: delError } = await supabase.from("user_files").delete().eq("id", row.id);
      checks.push({
        name: "user_files RLS",
        ok: !delError,
        detail: delError
          ? `canary row inserted but delete refused: ${delError.message}`
          : "canary row inserted and removed through RLS",
      });
    }
  }

  // 5. ai_jobs visibility. The worker writes progress with the service
  // role, so a build SUCCEEDS even when the user's own client cannot read
  // the row — and then every progress indicator renders nothing, forever,
  // with no error anywhere. A canary row written as admin must be
  // readable through the caller's session.
  {
    try {
      const admin = createAdminClient();
      const { data: canary, error: insError } = await admin
        .from("ai_jobs")
        .insert({ user_id: user.id, kind: "agent_build", status: "done", input: {} })
        .select("id")
        .single();
      if (insError || !canary) {
        checks.push({
          name: "ai_jobs table",
          ok: false,
          detail: `service-role canary insert failed: ${insError?.message ?? "no row returned"}`,
        });
      } else {
        const { data: readBack, error: readError } = await supabase
          .from("ai_jobs")
          .select("id")
          .eq("id", canary.id)
          .maybeSingle();
        checks.push({
          name: "ai_jobs visibility (RLS)",
          ok: Boolean(readBack) && !readError,
          detail: readBack
            ? "worker-written job rows are readable by their owner"
            : `the owner CANNOT read their own job row (${readError?.message ?? "0 rows through RLS"}) — progress indicators will show nothing while work succeeds`,
        });
        await admin.from("ai_jobs").delete().eq("id", canary.id);
      }
    } catch (err) {
      checks.push({
        name: "ai_jobs visibility (RLS)",
        ok: false,
        detail: `check failed to run: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  const ok = checks.every((c) => c.ok);
  return NextResponse.json({
    ok,
    checks,
    remedy: ok
      ? null
      : `Run ${FILES_STORAGE_REPAIR_SQL} and supabase/migrations/20260819000001_ai_jobs_visibility_repair.sql in the Supabase SQL editor, then run this check again.`,
  });
}
