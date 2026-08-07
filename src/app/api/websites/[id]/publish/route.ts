import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { logSecurityCheck } from "@/lib/security-check-log";
import {
  scanWebsiteHtmlForSecurityIssues,
  stripDisallowedExternalScripts,
  describeSecurityScanIssue,
} from "@/lib/website-html-security-scan";
import { validateSubdomain, publishedSiteUrl } from "@/lib/publishing/subdomain";
import {
  maxPublishedSitesForPlan,
  MAX_LIVE_EDITS_PER_SITE_PER_DAY,
} from "@/lib/publishing/publish-limits";
import { getSiteUrl } from "@/lib/site-url";
import { nextSiteVersion, pruneSiteVersions } from "@/lib/publishing/site-versions";
import type { UserWebsite } from "@/types/user-website";

export const dynamic = "force-dynamic";

const MAX_CHANGE_DESCRIPTION = 200;

// The current published state of one website — what the publish control
// renders from. Cheap, owner-scoped, and deliberately not folded into the
// website list query: the builder page is the hottest read in the app and
// most of its rows are never published.
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const { data: site } = await supabase
      .from("published_sites")
      .select("id, subdomain, status, view_count, published_at, updated_at")
      .eq("website_id", params.id)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      site: site
        ? {
            ...site,
            url: publishedSiteUrl(site.subdomain, getSiteUrl(), process.env.PUBLISHED_SITE_DOMAIN),
          }
        : null,
    });
  } catch (err) {
    logApiError("/api/websites/[id]/publish", err, { stage: "get" });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

// Publish, re-publish and unpublish one website.
//
// NO AI CALL and NO CREDIT CHARGE, deliberately. This route takes HTML that
// has already been generated (and already paid for, and already passed the
// AI content-safety review at generation/edit time — see
// api/websites/generate/process and api/websites/edit) and makes it
// reachable. Charging again for moving bytes the user already owns would
// be charging twice for one thing.
//
// What DOES run on every publish is the deterministic half of the AI
// Output Protection Layer: the static scan, fail-closed. That matters more
// here than anywhere else in the app, because this is the moment the HTML
// stops being a sandboxed preview and starts being a page served from our
// origin to strangers.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const websiteId = params.id;
    if (!websiteId) {
      return NextResponse.json({ ok: false, error: "Missing website id." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    let requestedSubdomain: unknown;
    let changeDescription: string;
    try {
      const body = await request.json();
      requestedSubdomain = body?.subdomain;
      changeDescription =
        typeof body?.changeDescription === "string"
          ? body.changeDescription.trim().slice(0, MAX_CHANGE_DESCRIPTION)
          : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
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

    // Ownership through the user-scoped client: RLS decides, so an id from
    // the URL can never reach someone else's website.
    const { data: websiteRow, error: websiteError } = await supabase
      .from("user_websites")
      .select("*")
      .eq("id", websiteId)
      .maybeSingle();

    if (websiteError || !websiteRow) {
      return NextResponse.json({ ok: false, error: "Website not found." }, { status: 404 });
    }
    const website = websiteRow as UserWebsite;

    if (website.status !== "completed" || !website.html_content) {
      return NextResponse.json(
        { ok: false, error: "This site isn't finished generating yet." },
        { status: 400 }
      );
    }

    // Is this a first publish or an update of a live site?
    const { data: existing } = await supabase
      .from("published_sites")
      .select("*")
      .eq("website_id", websiteId)
      .maybeSingle();

    // --- the address ---------------------------------------------------
    let subdomain: string;
    if (existing) {
      // A live site keeps its address unless the owner explicitly changes
      // it. Silently re-deriving it would break every link that exists.
      const wanted =
        typeof requestedSubdomain === "string" && requestedSubdomain.trim()
          ? requestedSubdomain
          : existing.subdomain;
      const check = validateSubdomain(wanted);
      if (!check.ok) {
        return NextResponse.json(
          { ok: false, reason: check.reason, error: check.message },
          { status: 400 }
        );
      }
      subdomain = check.subdomain;
    } else {
      const check = validateSubdomain(requestedSubdomain);
      if (!check.ok) {
        return NextResponse.json(
          { ok: false, reason: check.reason, error: check.message },
          { status: 400 }
        );
      }
      subdomain = check.subdomain;
    }

    // --- the plan ceiling ----------------------------------------------
    const isAdmin = isAdminEmail(user.email);
    const planSlug = await resolveEffectivePlanSlug(user);
    const cap = maxPublishedSitesForPlan(planSlug);

    if (!isAdmin && !existing) {
      if (cap <= 0) {
        return NextResponse.json(
          { ok: false, upgradeRequired: true, error: "Publishing is available on paid plans." },
          { status: 403 }
        );
      }
      if (Number.isFinite(cap)) {
        // Counts LIVE sites only: an unpublished one is not costing us a
        // served request, and holding a slot for it would make "unpublish"
        // pointless.
        const { count, error: countError } = await supabase
          .from("published_sites")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("status", "live");
        if (countError) {
          logApiError("/api/websites/[id]/publish", countError, { stage: "count_published" });
          return NextResponse.json({ ok: false, error: "Could not check your publishing limit." }, { status: 500 });
        }
        if ((count ?? 0) >= cap) {
          return NextResponse.json(
            {
              ok: false,
              limitReached: true,
              error: `You've reached your plan's limit of ${cap} published site${cap === 1 ? "" : "s"} — unpublish one or upgrade.`,
            },
            { status: 403 }
          );
        }
      }
    }

    // --- the AI Output Protection Layer, fail-closed --------------------
    //
    // stripDisallowedExternalScripts first: an external <script src> has no
    // place in this app's generation contract, so removing it can only ever
    // remove something that should not have been there. Then scan what is
    // left, and REFUSE if anything remains. At generation time a flagged
    // site becomes a draft the user can regenerate; here it would become a
    // live page on our origin, so there is no "flag and continue" path.
    const html = stripDisallowedExternalScripts(website.html_content);
    const issues = scanWebsiteHtmlForSecurityIssues(html);
    if (issues.length > 0) {
      const described = issues.map(describeSecurityScanIssue);
      void logSecurityCheck(supabase, {
        userId: user.id,
        resourceType: "website",
        resourceId: websiteId,
        result: { passed: false, checks: ["pre-publish static security scan"], issues: described },
      });
      return NextResponse.json(
        {
          ok: false,
          securityBlocked: true,
          issues: described,
          error: "This site can't be published — the security check found something that shouldn't go live.",
        },
        { status: 422 }
      );
    }

    const nowIso = new Date().toISOString();
    let publishedSiteId: string;
    let versionNumber: number;

    if (existing) {
      // The address is only checked for a clash when it actually changed —
      // otherwise a re-publish would collide with the site's own row.
      if (subdomain !== existing.subdomain) {
        const taken = await subdomainTaken(supabase, subdomain, existing.id);
        if (taken) {
          return NextResponse.json(
            { ok: false, reason: "taken", error: "That address is already taken." },
            { status: 409 }
          );
        }
      }

      const { error: updateError } = await supabase
        .from("published_sites")
        .update({
          subdomain,
          html_content: html,
          status: "live",
          is_active: true,
          updated_at: nowIso,
        })
        .eq("id", existing.id);
      if (updateError) {
        logApiError("/api/websites/[id]/publish", updateError, { stage: "update_published" });
        return NextResponse.json({ ok: false, error: "Could not publish that change." }, { status: 500 });
      }
      publishedSiteId = existing.id;
      versionNumber = await nextSiteVersion(supabase, existing.id);
    } else {
      const taken = await subdomainTaken(supabase, subdomain, null);
      if (taken) {
        return NextResponse.json(
          { ok: false, reason: "taken", error: "That address is already taken." },
          { status: 409 }
        );
      }

      const { data: created, error: insertError } = await supabase
        .from("published_sites")
        .insert({
          website_id: websiteId,
          user_id: user.id,
          subdomain,
          html_content: html,
          status: "live",
          is_active: true,
          published_at: nowIso,
          updated_at: nowIso,
        })
        .select("id")
        .single();

      if (insertError || !created) {
        // The unique index is the real arbiter of who got the address —
        // two people publishing "acme" in the same second both pass the
        // check above and one of them loses here. Reported as the clash it
        // is rather than as a server error.
        if (insertError && /duplicate key|unique/i.test(insertError.message)) {
          return NextResponse.json(
            { ok: false, reason: "taken", error: "That address was just taken." },
            { status: 409 }
          );
        }
        logApiError("/api/websites/[id]/publish", insertError, { stage: "insert_published" });
        return NextResponse.json({ ok: false, error: "Could not publish that site." }, { status: 500 });
      }
      publishedSiteId = created.id;
      versionNumber = 1;
    }

    // Every published state is a version, so rollback means "what the
    // public actually saw", not "what was in the editor".
    const { error: versionError } = await supabase.from("site_versions").insert({
      published_site_id: publishedSiteId,
      user_id: user.id,
      html_content: html,
      version_number: versionNumber,
      change_description: changeDescription || null,
      published_at: nowIso,
    });
    if (versionError) {
      // Non-fatal: the site IS live. Losing a history entry is worth less
      // than failing a publish that already succeeded.
      logApiError("/api/websites/[id]/publish", versionError, { stage: "insert_version" });
    }
    await pruneSiteVersions(supabase, publishedSiteId);

    void logSecurityCheck(supabase, {
      userId: user.id,
      resourceType: "website",
      resourceId: websiteId,
      result: {
        passed: true,
        checks: [
          "pre-publish static security scan (external scripts, inline handlers, form targets, iframes, dynamic code)",
          "external script tags stripped",
          "served under a restrictive CSP with form-action 'self' and frame-ancestors 'none'",
        ],
        issues: [],
      },
    });

    return NextResponse.json({
      ok: true,
      publishedSiteId,
      subdomain,
      url: publishedSiteUrl(subdomain, getSiteUrl(), process.env.PUBLISHED_SITE_DOMAIN),
      versionNumber,
    });
  } catch (err) {
    logApiError("/api/websites/[id]/publish", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

// Unpublish. The row and its history are KEPT — only `status` and
// `is_active` change — so re-publishing restores the same address and
// every link that was ever shared starts working again. Deleting would
// hand the address to the next person who asked for it.
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const websiteId = params.id;
    if (!websiteId) {
      return NextResponse.json({ ok: false, error: "Missing website id." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const { data: updated, error } = await supabase
      .from("published_sites")
      .update({ status: "unpublished", is_active: false })
      .eq("website_id", websiteId)
      .select("id")
      .maybeSingle();

    if (error) {
      logApiError("/api/websites/[id]/publish", error, { stage: "unpublish" });
      return NextResponse.json({ ok: false, error: "Could not unpublish that site." }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ ok: false, error: "That site isn't published." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/websites/[id]/publish", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

/**
 * Is this address already someone's?
 *
 * Uses the user-scoped client, which RLS restricts to the caller's own
 * rows — so this can only ever confirm that the address is free FOR THIS
 * USER, and the unique index decides the rest. That is deliberate: a
 * check that could see every row would be a way to enumerate which
 * addresses exist across the whole platform, one guess at a time.
 */
async function subdomainTaken(
  supabase: ReturnType<typeof createClient>,
  subdomain: string,
  excludeId: string | null
): Promise<boolean> {
  let query = supabase.from("published_sites").select("id").eq("subdomain", subdomain).limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query;
  return Boolean(data && data.length > 0);
}


