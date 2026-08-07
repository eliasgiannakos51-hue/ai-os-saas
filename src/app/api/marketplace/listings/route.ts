import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { logSecurityCheck } from "@/lib/security-check-log";
import {
  MAX_LISTING_DESCRIPTION_CHARS,
  MAX_LISTING_SUMMARY_CHARS,
  MAX_LISTING_TITLE_CHARS,
  MAX_PRICE_CENTS,
  MIN_LISTING_TITLE_CHARS,
  MIN_PRICE_CENTS,
  isListingCategory,
  isListingSort,
  isMarketplaceOpen,
} from "@/lib/marketplace/marketplace-config";
import { getListingKindSpec, isListingKind } from "@/lib/marketplace/listing-kinds";
import { buildPayload } from "@/lib/marketplace/payload";
import { payloadForStorage, reviewListing } from "@/lib/marketplace/listing-review";
import { sellerCanBePaid } from "@/lib/marketplace/connect";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const BROWSE_COLUMNS =
  "id, seller_id, kind, title, summary, category, price_cents, preview, purchase_count, rating_sum, rating_count, published_at";

/** Browse. Published listings only — the RLS policy enforces that too,
 *  but the filter is here as well so the query says what it means. */
export async function GET(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const limited = await checkRateLimit({
      scope: "marketplace_browse",
      identifier: user.id,
      maxAttempts: 300,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const category = url.searchParams.get("category");
    const sortParam = url.searchParams.get("sort");
    const sort = isListingSort(sortParam) ? sortParam : "newest";
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);

    let query = supabase.from("marketplace_listings").select(BROWSE_COLUMNS).eq("status", "published");

    if (isListingKind(kind)) query = query.eq("kind", kind);
    if (isListingCategory(category)) query = query.eq("category", category);
    if (q) {
      // ILIKE's own wildcards escaped, so a literal "%" typed by the
      // user matches a "%" instead of everything.
      const pattern = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      query = query.ilike("title", pattern);
    }

    switch (sort) {
      case "popular":
        query = query.order("purchase_count", { ascending: false });
        break;
      case "price_low":
        query = query.order("price_cents", { ascending: true });
        break;
      case "price_high":
        query = query.order("price_cents", { ascending: false });
        break;
      case "rating":
        // Sorted by the raw sum rather than an average, because Postgres
        // cannot order by a computed ratio here without a view, and a
        // sum is the honest proxy: it favours listings that are both
        // well-rated AND actually reviewed, which is what "top rated"
        // should mean. A single 5-star review is not a top-rated product.
        query = query.order("rating_sum", { ascending: false });
        break;
      default:
        query = query.order("published_at", { ascending: false });
    }

    const { data, error } = await query.limit(100);
    if (error) {
      logApiError("/api/marketplace/listings", error, { stage: "browse" });
      return NextResponse.json({ ok: false, error: "Could not load the marketplace." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, open: isMarketplaceOpen(), listings: data ?? [] });
  } catch (err) {
    logApiError("/api/marketplace/listings", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

/**
 * Publish one of the seller's own items.
 *
 * The order below is the security model, and every step of it is before
 * anything becomes visible:
 *
 *   1. The SOURCE row is read under the seller's own id, as a filter.
 *   2. The payload is BUILT by us from that row — never accepted from
 *      the request body, so a seller cannot list content they do not own
 *      by pasting it in.
 *   3. The mandatory review runs, fail-closed.
 *   4. Stripe is asked whether this seller can actually be paid, so we
 *      never list something we would have to take money for and then be
 *      unable to pay out.
 *   5. Only then is the row written — on the service-role client,
 *      because `marketplace_listings` deliberately has no insert policy.
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
      scope: "marketplace_publish",
      identifier: user.id,
      maxAttempts: 20,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many listings at once. Try again shortly." }, { status: 429 });
    }

    if (!isMarketplaceOpen()) {
      return NextResponse.json(
        { ok: false, notOpen: true, error: "The marketplace is not open for sellers yet." },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    const kind = body?.kind;
    const spec = getListingKindSpec(kind);
    if (!spec) {
      return NextResponse.json({ ok: false, error: "Unknown listing type." }, { status: 400 });
    }

    const sourceId = typeof body?.sourceId === "string" ? body.sourceId : "";
    if (!sourceId) {
      return NextResponse.json({ ok: false, error: "Choose something to list." }, { status: 400 });
    }

    const title = String(body?.title ?? "").trim().slice(0, MAX_LISTING_TITLE_CHARS);
    if (title.length < MIN_LISTING_TITLE_CHARS) {
      return NextResponse.json(
        { ok: false, error: `Give the listing a title of at least ${MIN_LISTING_TITLE_CHARS} characters.` },
        { status: 400 }
      );
    }
    const summary = String(body?.summary ?? "").trim().slice(0, MAX_LISTING_SUMMARY_CHARS);
    const description = String(body?.description ?? "").trim().slice(0, MAX_LISTING_DESCRIPTION_CHARS);
    const category = isListingCategory(body?.category) ? body.category : "other";

    const priceCents = Number(body?.priceCents);
    if (!Number.isInteger(priceCents) || priceCents < MIN_PRICE_CENTS || priceCents > MAX_PRICE_CENTS) {
      return NextResponse.json(
        { ok: false, error: `Price must be between €${MIN_PRICE_CENTS / 100} and €${MAX_PRICE_CENTS / 100}.` },
        { status: 400 }
      );
    }

    // --- 1. the source, under the seller's own id -----------------------
    const { data: source, error: sourceError } = await supabase
      .from(spec.sourceTable)
      .select("*")
      .eq("id", sourceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (sourceError) {
      logApiError("/api/marketplace/listings", sourceError, { stage: "read_source", kind });
      return NextResponse.json({ ok: false, error: "Could not read that item." }, { status: 500 });
    }
    if (!source) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }

    // --- 2. build the merchandise ---------------------------------------
    const built = buildPayload(spec.kind, source as Record<string, unknown>);
    if (!built.ok) {
      return NextResponse.json({ ok: false, error: built.error }, { status: 400 });
    }

    // --- 3. the mandatory review, fail-closed ---------------------------
    const review = reviewListing({
      kind: spec.kind,
      title,
      summary,
      description,
      payload: built.built.payload,
    });

    void logSecurityCheck(supabase, {
      userId: user.id,
      resourceType: "marketplace_listing",
      resourceId: sourceId,
      result: {
        passed: review.passed,
        checks: review.checks,
        issues: review.passed ? [] : review.issues,
      },
    });

    if (!review.passed) {
      return NextResponse.json(
        {
          ok: false,
          securityBlocked: true,
          issues: review.issues,
          error: "This can't be listed — the security check found something that shouldn't be sold on.",
        },
        { status: 422 }
      );
    }

    // --- 4. can this seller actually be paid ----------------------------
    const admin = createAdminClient();
    const { data: sellerAccount } = await admin
      .from("seller_accounts")
      .select("stripe_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ ok: false, error: "Payments are not configured." }, { status: 503 });
    }
    const payable = await sellerCanBePaid(createStripeClient(), sellerAccount?.stripe_account_id);
    if (!payable.ok) {
      return NextResponse.json(
        {
          ok: false,
          onboardingRequired: true,
          error: "Finish seller onboarding before listing — we will not take money we cannot pay out.",
        },
        { status: 409 }
      );
    }

    // --- 5. write ---------------------------------------------------------
    const nowIso = new Date().toISOString();
    const { data: listing, error: insertError } = await admin
      .from("marketplace_listings")
      .insert({
        seller_id: user.id,
        kind: spec.kind,
        title,
        summary,
        description,
        category,
        price_cents: priceCents,
        preview: built.built.preview,
        status: "published",
        published_at: nowIso,
      })
      .select("id, kind, title, summary, category, price_cents, status, published_at")
      .single();

    if (insertError || !listing) {
      logApiError("/api/marketplace/listings", insertError, { stage: "insert_listing" });
      return NextResponse.json({ ok: false, error: "Could not create the listing." }, { status: 500 });
    }

    // The merchandise, stored as the SCANNED bytes rather than the
    // submitted ones — storing what was submitted and serving what was
    // scanned is how a scan-then-store split lets the unscanned version
    // reach a buyer.
    const { error: payloadError } = await admin.from("marketplace_listing_payloads").insert({
      listing_id: listing.id,
      seller_id: user.id,
      payload: payloadForStorage(spec.kind, built.built.payload),
    });

    if (payloadError) {
      // The listing exists and has nothing to sell. Withdrawn rather
      // than left live: a buyer reaching a published listing with no
      // payload would pay and receive nothing, which is worse than the
      // seller having to try again.
      logApiError("/api/marketplace/listings", payloadError, { stage: "insert_payload", listingId: listing.id });
      await admin
        .from("marketplace_listings")
        .update({ status: "unpublished" })
        .eq("id", listing.id);
      return NextResponse.json({ ok: false, error: "Could not create the listing." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, listing });
  } catch (err) {
    logApiError("/api/marketplace/listings", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
