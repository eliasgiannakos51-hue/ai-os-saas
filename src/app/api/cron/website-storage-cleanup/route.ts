import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import { logApiError } from "@/lib/log-error";
import { REFERENCE_IMAGE_BUCKET } from "@/lib/website-reference-image";
import { findOrphanImages, type StoredFile } from "@/lib/websites/orphan-images";
import { normalisePages } from "@/lib/publishing/website-pages";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// A full sweep lists every user folder and reads four tables. 300s is
// generous for the scale this runs at today and is the floor the app
// gives every long-running route; the marker is what scripts/tests/
// function-limits.test.mjs requires so the number is declared rather
// than inherited from whatever the platform tier happens to allow.
export const maxDuration = 300; // @function-limit 300

/**
 * Uploaded photographs that nothing needs any more.
 *
 * WHAT WAS HAPPENING. Deleting a website deletes a row, straight from the
 * browser. The images the owner uploaded for it stayed in Storage
 * forever. Nothing removed them, and nothing ever would have.
 *
 * WHY THIS AND NOT A CASCADE. A file is not owned by one site: the same
 * logo is uploaded once and used by four, and a version or a published
 * snapshot can still be serving a photograph whose draft is long gone. A
 * database cascade knows about rows; the question here is whether any
 * DOCUMENT still embeds the URL. So the rule is "referenced by nothing",
 * decided in lib/websites/orphan-images.ts where it can be tested without
 * deleting anything.
 *
 * DRY RUN BY DEFAULT is deliberately NOT the case — a cleanup nobody runs
 * is the state this replaces. It deletes, and it reports what it kept and
 * why, so the first run can be read rather than trusted.
 *
 * Auth: CRON_SECRET, fail-closed, same as every other cron route.
 */
export async function GET(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const dryRun = new URL(request.url).searchParams.get("dry") === "1";
  const admin = createAdminClient();
  const nowMs = Date.now();

  try {
    // EVERY document that could still embed an upload, from all four
    // tables that carry a site's HTML. Missing one of them is how a
    // cleanup deletes a photograph a published site is serving.
    const documents: string[] = [];
    const collect = (rows: { html_content?: unknown; pages?: unknown }[] | null) => {
      for (const row of rows ?? []) {
        if (typeof row.html_content === "string") documents.push(row.html_content);
        for (const page of normalisePages(row.pages).pages) documents.push(page.html);
      }
    };

    const tables = ["user_websites", "published_sites", "website_versions", "site_versions"] as const;
    for (const table of tables) {
      const { data, error } = await admin.from(table).select("html_content, pages").limit(50_000);
      if (error) throw error;
      collect(data as { html_content?: unknown; pages?: unknown }[]);
    }

    const { data: refRows, error: refError } = await admin
      .from("website_reference_images")
      .select("image_url")
      .limit(50_000);
    if (refError) throw refError;
    const referencedPaths = new Set(
      (refRows ?? [])
        .map((r) => String(r.image_url ?? ""))
        .filter(Boolean)
        // The column stores a Storage PATH, not a URL, despite its name
        // (see the WebsiteReferenceImage type). Both forms are accepted
        // so a row written either way still protects its file.
        .map((value) => {
          const marker = `/${REFERENCE_IMAGE_BUCKET}/`;
          const at = value.indexOf(marker);
          return at === -1 ? value : value.slice(at + marker.length);
        })
    );

    // Storage lists per folder, and the folder is the user id.
    const { data: folders, error: foldersError } = await admin.storage
      .from(REFERENCE_IMAGE_BUCKET)
      .list("", { limit: 10_000 });
    if (foldersError) throw foldersError;

    let deleted = 0;
    let scanned = 0;
    const keptReasons: Record<string, number> = {};
    const sample: string[] = [];

    for (const folder of folders ?? []) {
      // A folder entry has no metadata; a file does. Anything with
      // metadata at the root is not a user folder and is skipped rather
      // than treated as one.
      if (folder.metadata) continue;
      const userId = folder.name;
      const files: StoredFile[] = [];
      const PAGE = 100;
      for (let offset = 0; offset <= 10_000; offset += PAGE) {
        const { data, error } = await admin.storage
          .from(REFERENCE_IMAGE_BUCKET)
          .list(userId, { limit: PAGE, offset });
        if (error) throw error;
        const page = data ?? [];
        for (const file of page) {
          if (!file.metadata) continue;
          files.push({
            path: `${userId}/${file.name}`,
            createdAtMs: file.created_at ? new Date(file.created_at).getTime() : 0,
          });
        }
        if (page.length < PAGE) break;
      }
      scanned += files.length;

      const { orphans, kept } = findOrphanImages({ files, referencedPaths, documents, nowMs });
      for (const k of kept) keptReasons[k.reason] = (keptReasons[k.reason] ?? 0) + 1;
      if (orphans.length === 0) continue;
      if (sample.length < 10) sample.push(...orphans.slice(0, 10 - sample.length));
      if (dryRun) {
        deleted += orphans.length;
        continue;
      }
      // In batches: remove() takes a list, and a single call with
      // thousands of paths is one request that either works or does not.
      for (let i = 0; i < orphans.length; i += 100) {
        const { error } = await admin.storage
          .from(REFERENCE_IMAGE_BUCKET)
          .remove(orphans.slice(i, i + 100));
        if (error) throw error;
        deleted += Math.min(100, orphans.length - i);
      }
    }

    return NextResponse.json({ ok: true, dryRun, scanned, deleted, keptReasons, sample });
  } catch (err) {
    logApiError("/api/cron/website-storage-cleanup", err);
    return NextResponse.json({ ok: false, error: "Cleanup failed." }, { status: 500 });
  }
}
