import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { logSecurityCheck } from "@/lib/security-check-log";
import {
  scanWebsiteHtmlForSecurityIssues,
  stripDisallowedExternalScripts,
  describeSecurityScanIssue,
} from "@/lib/website-html-security-scan";
import {
  validateSubdomain,
  publishedSiteUrl,
  publishedSiteBasePath,
  SUBDOMAIN_TOKEN,
} from "@/lib/publishing/subdomain";
import { makeGeneratedLinksSafe } from "@/lib/website-link-safety";
import { enforceSeoHead } from "@/lib/seo/head";
import { enforceImageAltText } from "@/lib/seo/alt-text";
import { siteNap } from "@/lib/seo/nap";
import {
  maxPublishedSitesForPlan,
  MAX_SITE_VERSIONS,
  MAX_LIVE_EDITS_PER_SITE_PER_DAY,
} from "@/lib/publishing/publish-limits";
import { getSiteUrl, getSiteHostname } from "@/lib/site-url";
import type { UserWebsite } from "@/types/user-website";
import { normalisePages } from "@/lib/publishing/website-pages";

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
      // The address the publish dialog previews as the user types, built
      // by the SAME function that builds the real one — with the
      // subdomain replaced by a token the client splits on.
      //
      // A client-side `${origin}/s/${value}` would have been simpler and
      // silently wrong the day PUBLISHED_SITE_DOMAIN is set, because that
      // form puts the subdomain at the FRONT (acme.example.com), not after
      // a path. A preview that lies about the address being chosen is
      // worse than no preview.
      urlTemplate: publishedSiteUrl(
        SUBDOMAIN_TOKEN,
        getSiteUrl(),
        process.env.PUBLISHED_SITE_DOMAIN
      ),
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
    // makeGeneratedLinksSafe here as well as at generation time, and the
    // repetition is the point: this is the boundary where HTML becomes a
    // public page, and it is the only one that can help a site generated
    // BEFORE the link fix existed. Those documents are already stored with
    // <a href="/about"> in them; one press of Publish now repairs them.
    //
    // Done here rather than in /s/[subdomain] on purpose. Measured at
    // 3.28ms on a 135KB document — negligible once, wasteful on every
    // uncached page view of a popular site. It is idempotent, so paying it
    // again on republish costs nothing.
    //
    // THE PAGE LINKS ARE RESOLVED HERE, and only here, because this is
    // the first moment the site's address is known. The model writes the
    // nav relative (href="about"), which is right on a sub-page and
    // WRONG on the home page: /s/acme has no trailing slash, so a
    // browser resolves "about" against /s/ and drops the site. Publishing
    // rewrites them to absolute paths under the site's own base — which
    // also means a site keeps working after its address changes, since
    // this runs again on every publish.
    const { pages: draftPages } = normalisePages(website.pages);
    const siteContext = {
      pageSlugs: draftPages.map((pg) => pg.slug),
      basePath: publishedSiteBasePath(subdomain),
    };
    const html = makeGeneratedLinksSafe(
      stripDisallowedExternalScripts(website.html_content),
      siteContext
    ).html;
    // THE SAME TREATMENT FOR EVERY PAGE, and the same scan. published_sites
    // is a SNAPSHOT — /s/<subdomain> reads it, not user_websites — so a
    // page that is not copied here is a navigation link to a 404, and a
    // page copied without this pass is a page that skipped the checks its
    // home page passed.
    const safePages = draftPages.map((pg) => ({
      ...pg,
      html: makeGeneratedLinksSafe(stripDisallowedExternalScripts(pg.html), siteContext).html,
    }));
    const issues = [html, ...safePages.map((pg) => pg.html)].flatMap((doc) =>
      scanWebsiteHtmlForSecurityIssues(doc, { appHost: getSiteHostname() ?? undefined })
    );
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

    // ---------------------------------------------------------------
    // THE HALF OF SEO THAT NEEDS AN ADDRESS.
    //
    // Generation already wrote the title, the description, the alt text
    // and the schema that depend only on the page. Everything below
    // depends on WHERE the site lives, which is not known until this
    // moment — and changes when the owner changes their address, which
    // is why it is redone on every publish rather than baked in once.
    // Getting it wrong is not visible on the page: a canonical URL
    // pointing at a previous address tells a search engine that the live
    // site is a copy of one that no longer exists.
    //
    // NAP FIRST, so every page's structured data gives ONE name, address
    // and phone (lib/seo/nap.ts). A multi-page site is the first time
    // this could go wrong here: four documents written in one turn agree
    // by luck, not by construction.
    const siteBaseUrl = publishedSiteUrl(subdomain, getSiteUrl(), process.env.PUBLISHED_SITE_DOMAIN);
    const napReport = siteNap([
      { label: "home", html },
      ...safePages.map((pg) => ({ label: pg.slug, html: pg.html })),
    ]);
    if (napReport.disagreements.length > 0) {
      // Reported, never rewritten: the visible text is the owner's, and
      // silently editing a customer's contact details is worse than the
      // inconsistency. The schema uses the home page's answer.
      logApiError(
        "/api/websites/[id]/publish",
        new Error(`${napReport.disagreements.length} page(s) state a different name, address or phone`),
        {
          websiteId,
          subdomain,
          detail: napReport.disagreements
            .map((d) => `${d.page}:${d.field} "${d.page_value}" vs home "${d.home}"`)
            .join(" | ")
            .slice(0, 400),
        }
      );
    }

    const homeCrumb = { name: napReport.nap.name ?? subdomain, url: siteBaseUrl };
    const seoFor = (doc: string, pageUrl: string, crumbs: { name: string; url: string }[]) =>
      enforceSeoHead(enforceImageAltText(doc).html, {
        canonicalUrl: pageUrl,
        siteUrl: siteBaseUrl,
        siteName: napReport.nap.name ?? null,
        breadcrumb: crumbs,
        nap: napReport.nap,
      }).html;

    const publishedHtml = seoFor(html, siteBaseUrl, []);
    const publishedPages = safePages.map((pg) => ({
      ...pg,
      html: seoFor(pg.html, `${siteBaseUrl.replace(/\/+$/, "")}/${pg.slug}`, [
        homeCrumb,
        { name: pg.label, url: `${siteBaseUrl.replace(/\/+$/, "")}/${pg.slug}` },
      ]),
    }));
    // ---------------------------------------------------------------

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
          html_content: publishedHtml,
      pages: publishedPages.length > 0 ? publishedPages : null,
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
      versionNumber = await nextVersionFor(supabase, existing.id);
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
          html_content: publishedHtml,
      pages: publishedPages.length > 0 ? publishedPages : null,
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
      html_content: publishedHtml,
      pages: publishedPages.length > 0 ? publishedPages : null,
      version_number: versionNumber,
      change_description: changeDescription || null,
      published_at: nowIso,
    });
    if (versionError) {
      // Non-fatal: the site IS live. Losing a history entry is worth less
      // than failing a publish that already succeeded.
      logApiError("/api/websites/[id]/publish", versionError, { stage: "insert_version" });
    }
    await pruneVersions(supabase, publishedSiteId);

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

async function nextVersionFor(
  supabase: ReturnType<typeof createClient>,
  publishedSiteId: string
): Promise<number> {
  const { data } = await supabase
    .from("site_versions")
    .select("version_number")
    .eq("published_site_id", publishedSiteId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.version_number ?? 0) + 1;
}

/** Keeps the newest MAX_SITE_VERSIONS. Each version is a full copy of the
 *  HTML, so an unbounded history is a table of megabyte rows that every
 *  dashboard query has to step over. */
async function pruneVersions(
  supabase: ReturnType<typeof createClient>,
  publishedSiteId: string
): Promise<void> {
  const { data } = await supabase
    .from("site_versions")
    .select("id")
    .eq("published_site_id", publishedSiteId)
    .order("version_number", { ascending: false })
    .range(MAX_SITE_VERSIONS, MAX_SITE_VERSIONS + 200);
  const ids = (data ?? []).map((row) => row.id);
  if (ids.length === 0) return;
  const { error } = await supabase.from("site_versions").delete().in("id", ids);
  if (error) logApiError("/api/websites/[id]/publish", error, { stage: "prune_versions" });
}
