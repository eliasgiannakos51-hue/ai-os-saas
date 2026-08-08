import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { logSecurityCheck } from "@/lib/security-check-log";
import {
  scanWebsiteHtmlForSecurityIssues,
  stripDisallowedExternalScripts,
  describeSecurityScanIssue,
} from "@/lib/website-html-security-scan";
import { MAX_LIVE_EDITS_PER_SITE_PER_DAY } from "@/lib/publishing/publish-limits";

export const dynamic = "force-dynamic";

// Roll a live site back to an earlier version, in one click.
//
// A rollback is a PUBLISH, not a rewind: it appends a new version whose
// content is the old one, rather than deleting history. Two reasons —
// rolling back a rollback has to work, and a history that can be erased by
// pressing a button is not a history.
//
// The static security scan runs again on the way out even though this
// content was already live once: the scanner's rules can have tightened
// since, and "it passed last month" is not the claim being made when we
// serve it today.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const publishedSiteId = params.id;
    if (!publishedSiteId) {
      return NextResponse.json({ ok: false, error: "Missing site id." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    let versionId: string;
    try {
      const body = await request.json();
      versionId = typeof body?.versionId === "string" ? body.versionId : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }
    if (!versionId) {
      return NextResponse.json({ ok: false, error: "Which version?" }, { status: 400 });
    }

    const limited = await checkRateLimit({
      scope: "site_publish",
      identifier: user.id,
      maxAttempts: MAX_LIVE_EDITS_PER_SITE_PER_DAY,
      windowMinutes: 24 * 60,
    });
    if (!limited.allowed) {
      return NextResponse.json(
        { ok: false, error: "You've published a lot of changes today. Try again tomorrow." },
        { status: 429 }
      );
    }

    // Both reads go through the user-scoped client, so RLS scopes them —
    // and the version is additionally required to belong to THIS site, so
    // an id from another of the user's own sites cannot be pushed here.
    const { data: site } = await supabase
      .from("published_sites")
      .select("id, subdomain, status")
      .eq("id", publishedSiteId)
      .maybeSingle();
    if (!site) {
      return NextResponse.json({ ok: false, error: "Site not found." }, { status: 404 });
    }

    const { data: version } = await supabase
      .from("site_versions")
      .select("id, html_content, version_number")
      .eq("id", versionId)
      .eq("published_site_id", publishedSiteId)
      .maybeSingle();
    if (!version) {
      return NextResponse.json({ ok: false, error: "That version doesn't exist." }, { status: 404 });
    }

    const html = stripDisallowedExternalScripts(version.html_content);
    const issues = scanWebsiteHtmlForSecurityIssues(html);
    if (issues.length > 0) {
      const described = issues.map(describeSecurityScanIssue);
      void logSecurityCheck(supabase, {
        userId: user.id,
        resourceType: "website",
        resourceId: publishedSiteId,
        result: { passed: false, checks: ["pre-publish static security scan (rollback)"], issues: described },
      });
      return NextResponse.json(
        {
          ok: false,
          securityBlocked: true,
          issues: described,
          error: "That version can't go live — the security check found something that shouldn't.",
        },
        { status: 422 }
      );
    }

    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("published_sites")
      .update({ html_content: html, status: "live", is_active: true, updated_at: nowIso })
      .eq("id", publishedSiteId);
    if (updateError) {
      logApiError("/api/published/[id]/rollback", updateError, { stage: "update" });
      return NextResponse.json({ ok: false, error: "Could not roll that back." }, { status: 500 });
    }

    const { data: latest } = await supabase
      .from("site_versions")
      .select("version_number")
      .eq("published_site_id", publishedSiteId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error: versionError } = await supabase.from("site_versions").insert({
      published_site_id: publishedSiteId,
      user_id: user.id,
      html_content: html,
      version_number: (latest?.version_number ?? 0) + 1,
      change_description: `Rolled back to version ${version.version_number}`,
      published_at: nowIso,
    });
    if (versionError) {
      logApiError("/api/published/[id]/rollback", versionError, { stage: "insert_version" });
    }

    return NextResponse.json({ ok: true, rolledBackTo: version.version_number });
  } catch (err) {
    logApiError("/api/published/[id]/rollback", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
