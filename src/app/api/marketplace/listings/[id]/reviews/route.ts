import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { MAX_REVIEW_BODY_CHARS } from "@/lib/marketplace/marketplace-config";
import { containsFenceMarker } from "@/lib/marketplace/listing-review";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

/**
 * Leave a review.
 *
 * YOU CANNOT REVIEW WHAT YOU DID NOT BUY. The purchase is looked up
 * first, must be `paid`, and its id is stored on the review — the column
 * is NOT NULL, so a review with no purchase behind it cannot exist even
 * if a future code path forgets to check. The unique
 * `(listing_id, buyer_id)` means one buyer is one voice, whatever they
 * paid.
 *
 * That is the whole anti-astroturf design, and it is deliberately
 * structural rather than heuristic: rate-limiting or scoring review text
 * catches sloppy fakes, while requiring a real payment to a real Stripe
 * account makes a fake review cost the price of the product.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const limited = await checkRateLimit({
      scope: "marketplace_review",
      identifier: user.id,
      maxAttempts: 30,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many requests. Try again shortly." }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const rating = Number(body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ ok: false, error: "Give it a rating from 1 to 5." }, { status: 400 });
    }
    const reviewBody = String(body?.body ?? "").trim().slice(0, MAX_REVIEW_BODY_CHARS);

    // A review is text that later reaches a model — the AI support chat
    // and any future summarisation read listings and their reviews. The
    // fence markers are how every AI feature here tells data from
    // instructions, so they may not appear in text a stranger wrote.
    if (containsFenceMarker(reviewBody)) {
      return NextResponse.json({ ok: false, error: "That review contains reserved markers." }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: purchase } = await admin
      .from("marketplace_purchases")
      .select("id")
      .eq("listing_id", params.id)
      .eq("buyer_id", user.id)
      .eq("status", "paid")
      .maybeSingle();

    if (!purchase) {
      return NextResponse.json(
        { ok: false, error: "You can only review something you have bought." },
        { status: 403 }
      );
    }

    // Upsert on the unique pair, so "change my mind" edits the existing
    // review rather than failing with a constraint violation the user
    // cannot act on.
    const { error } = await admin.from("marketplace_reviews").upsert(
      {
        listing_id: params.id,
        buyer_id: user.id,
        purchase_id: purchase.id,
        rating,
        body: reviewBody,
      },
      { onConflict: "listing_id,buyer_id" }
    );

    if (error) {
      logApiError("/api/marketplace/reviews", error, { stage: "upsert" });
      return NextResponse.json({ ok: false, error: "Could not save your review." }, { status: 500 });
    }

    // Recomputed from the reviews rather than incremented. An increment
    // that runs twice is wrong forever; a recount is wrong only until it
    // runs again — and an upsert that REPLACED a rating would make an
    // increment wrong on the very first edit.
    const { error: rpcError } = await admin.rpc("recompute_listing_rating", { p_listing_id: params.id });
    if (rpcError) {
      logApiError("/api/marketplace/reviews", rpcError, { stage: "recompute" });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/marketplace/reviews", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
