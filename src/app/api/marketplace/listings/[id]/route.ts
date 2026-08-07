import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import {
  MAX_LISTING_DESCRIPTION_CHARS,
  MAX_LISTING_SUMMARY_CHARS,
  MAX_LISTING_TITLE_CHARS,
  MAX_PRICE_CENTS,
  MIN_LISTING_TITLE_CHARS,
  MIN_PRICE_CENTS,
  isListingCategory,
} from "@/lib/marketplace/marketplace-config";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const DETAIL_COLUMNS =
  "id, seller_id, kind, title, summary, description, category, price_cents, preview, status, review_notes, purchase_count, rating_sum, rating_count, published_at, created_at";

/**
 * One listing.
 *
 * `preview` is selected; the payload is not, and cannot be — it lives in
 * a different table with no read policy for anyone but the seller. That
 * is the paywall, and it is enforced by the schema rather than by this
 * route remembering not to select a column.
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

    const limited = await checkRateLimit({
      scope: "marketplace_detail",
      identifier: user.id,
      maxAttempts: 300,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    // No status filter here: the RLS policies already decide what this
    // caller may see — their own listings in any status, everyone
    // else's only when published. A draft belonging to somebody else
    // simply does not exist from here.
    const { data: listing, error } = await supabase
      .from("marketplace_listings")
      .select(DETAIL_COLUMNS)
      .eq("id", params.id)
      .maybeSingle();

    if (error) {
      logApiError("/api/marketplace/listings/[id]", error, { stage: "select" });
      return NextResponse.json({ ok: false, error: "Could not load that listing." }, { status: 500 });
    }
    if (!listing) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }

    const [{ data: reviews }, { data: owned }] = await Promise.all([
      supabase
        .from("marketplace_reviews")
        .select("id, rating, body, created_at")
        .eq("listing_id", params.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("marketplace_purchases")
        .select("id, status, installed_entity_id")
        .eq("listing_id", params.id)
        .eq("buyer_id", user.id)
        .eq("status", "paid")
        .maybeSingle(),
    ]);

    return NextResponse.json({
      ok: true,
      listing,
      reviews: reviews ?? [],
      purchase: owned ?? null,
      isSeller: listing.seller_id === user.id,
    });
  } catch (err) {
    logApiError("/api/marketplace/listings/[id]", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

/**
 * Change a listing's text, price, or whether it is live.
 *
 * Service-role with an EXPLICIT column whitelist, because
 * marketplace_listings deliberately has no update policy — the same row
 * carries `purchase_count` and the rating aggregate, and a policy cannot
 * grant "these columns but not those". The whitelist below is that
 * grant, written where it can be read.
 *
 * The one status transition allowed here is publish/withdraw between
 * `published` and `unpublished`. Moving a `rejected` listing back to
 * `published` is deliberately NOT possible: it never passed the scan,
 * and the way back is to fix the item and list it again, which runs the
 * scan afresh.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const limited = await checkRateLimit({
      scope: "marketplace_listing_update",
      identifier: user.id,
      maxAttempts: 60,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("marketplace_listings")
      .select("id, seller_id, status")
      .eq("id", params.id)
      .maybeSingle();

    // Ownership checked explicitly here because the read is on the
    // service-role client, which bypasses RLS by design. A 404 rather
    // than a 403, so this cannot be used to discover whose listing an id
    // belongs to.
    if (!existing || existing.seller_id !== user.id) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }

    const update: Record<string, unknown> = {};

    if (typeof body.title === "string") {
      const title = body.title.trim().slice(0, MAX_LISTING_TITLE_CHARS);
      if (title.length < MIN_LISTING_TITLE_CHARS) {
        return NextResponse.json({ ok: false, error: "That title is too short." }, { status: 400 });
      }
      update.title = title;
    }
    if (typeof body.summary === "string") {
      update.summary = body.summary.trim().slice(0, MAX_LISTING_SUMMARY_CHARS);
    }
    if (typeof body.description === "string") {
      update.description = body.description.trim().slice(0, MAX_LISTING_DESCRIPTION_CHARS);
    }
    if (body.category !== undefined) {
      if (!isListingCategory(body.category)) {
        return NextResponse.json({ ok: false, error: "Unknown category." }, { status: 400 });
      }
      update.category = body.category;
    }
    if (body.priceCents !== undefined) {
      const price = Number(body.priceCents);
      if (!Number.isInteger(price) || price < MIN_PRICE_CENTS || price > MAX_PRICE_CENTS) {
        return NextResponse.json({ ok: false, error: "That price is out of range." }, { status: 400 });
      }
      update.price_cents = price;
    }
    if (body.status !== undefined) {
      if (body.status !== "published" && body.status !== "unpublished") {
        return NextResponse.json({ ok: false, error: "Unsupported status change." }, { status: 400 });
      }
      if (existing.status !== "published" && existing.status !== "unpublished") {
        return NextResponse.json(
          { ok: false, error: "This listing has to be listed again before it can go live." },
          { status: 409 }
        );
      }
      update.status = body.status;
      if (body.status === "published") update.published_at = new Date().toISOString();
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: false, error: "Nothing to update." }, { status: 400 });
    }

    const { data, error } = await admin
      .from("marketplace_listings")
      .update(update)
      .eq("id", params.id)
      .eq("seller_id", user.id)
      .select(DETAIL_COLUMNS)
      .maybeSingle();

    if (error || !data) {
      logApiError("/api/marketplace/listings/[id]", error, { stage: "update" });
      return NextResponse.json({ ok: false, error: "Could not update the listing." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, listing: data });
  } catch (err) {
    logApiError("/api/marketplace/listings/[id]", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

/**
 * Delete a listing.
 *
 * Refused once it has sales. `marketplace_purchases.listing_id` is
 * `on delete restrict` for the same reason: a buyer's receipt has to
 * outlive the seller changing their mind, and "the product you bought no
 * longer exists" is not a state a marketplace gets to create. Withdrawing
 * (`status: "unpublished"`) is what a seller with sales wants anyway — it
 * takes it off the shelf without erasing anyone's purchase history.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const limited = await checkRateLimit({
      scope: "marketplace_listing_delete",
      identifier: user.id,
      maxAttempts: 30,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    const admin = createAdminClient();
    const { count } = await admin
      .from("marketplace_purchases")
      .select("id", { count: "exact", head: true })
      .eq("listing_id", params.id);

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          ok: false,
          hasSales: true,
          error: "This listing has sales, so it can be withdrawn but not deleted.",
        },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from("marketplace_listings")
      .delete()
      .eq("id", params.id)
      .eq("seller_id", user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      logApiError("/api/marketplace/listings/[id]", error, { stage: "delete" });
      return NextResponse.json({ ok: false, error: "Could not delete the listing." }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/marketplace/listings/[id]", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
