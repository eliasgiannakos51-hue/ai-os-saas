import "server-only";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { isListingKind } from "@/lib/marketplace/listing-kinds";
import { installPayload } from "@/lib/marketplace/payload";

/**
 * Deliver a marketplace purchase, on Stripe's signed word that the money
 * moved.
 *
 * Called only from the verified webhook. Nothing on the success-URL path
 * installs anything: a browser reaching /?purchase=done is a claim by
 * the browser, and treating it as payment is the oldest free-products
 * bug there is.
 *
 * IDEMPOTENT, because Stripe retries. The guard is the purchase row's
 * own status plus the unique `stripe_session_id`: the update that flips
 * it to `paid` is conditioned on it still being `pending`, so a retried
 * event finds nothing to update and returns without installing a second
 * copy or paying the seller twice.
 *
 * A FAILED INSTALL DOES NOT UNDO THE PAYMENT, and must not pretend to.
 * The purchase stays `paid` with `installed_entity_id` null — which is
 * exactly the state "somebody paid and did not receive it" needs to be
 * findable in. Rolling the status back to pending would hide it, and the
 * money has genuinely moved.
 */
export async function fulfilMarketplacePurchase(
  session: Stripe.Checkout.Session
): Promise<{ ok: boolean; reason?: string }> {
  const purchaseId = session.metadata?.marketplace_purchase_id;
  if (!purchaseId) return { ok: false, reason: "not_a_marketplace_session" };

  const admin = createAdminClient();

  try {
    const { data: purchase, error } = await admin
      .from("marketplace_purchases")
      .select("id, listing_id, buyer_id, seller_id, status, installed_entity_id")
      .eq("id", purchaseId)
      .maybeSingle();

    if (error || !purchase) {
      logApiError("marketplace:fulfil", error ?? new Error("purchase not found"), { purchaseId });
      return { ok: false, reason: "purchase_not_found" };
    }

    // Already delivered. The common case on a retry, and a no-op.
    if (purchase.status === "paid" && purchase.installed_entity_id) {
      return { ok: true, reason: "already_fulfilled" };
    }

    // Flip to paid, conditioned on it still being pending. Two concurrent
    // deliveries of the same event both reach here; only one update
    // matches, and only that one goes on to install.
    if (purchase.status === "pending") {
      const { data: claimed, error: claimError } = await admin
        .from("marketplace_purchases")
        .update({
          status: "paid",
          stripe_payment_intent:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : (session.payment_intent?.id ?? null),
        })
        .eq("id", purchase.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();

      if (claimError) {
        logApiError("marketplace:fulfil", claimError, { purchaseId, stage: "claim" });
        return { ok: false, reason: "claim_failed" };
      }
      if (!claimed) {
        // Somebody else claimed it between the read and the update.
        return { ok: true, reason: "claimed_elsewhere" };
      }
    }

    const { data: listing } = await admin
      .from("marketplace_listings")
      .select("kind, purchase_count")
      .eq("id", purchase.listing_id)
      .maybeSingle();

    const { data: payloadRow } = await admin
      .from("marketplace_listing_payloads")
      .select("payload")
      .eq("listing_id", purchase.listing_id)
      .maybeSingle();

    if (!listing || !isListingKind(listing.kind) || !payloadRow) {
      logApiError("marketplace:fulfil", new Error("listing or payload missing"), { purchaseId });
      return { ok: false, reason: "listing_missing" };
    }

    // The buyer's own verified address, read from auth rather than from
    // anything in the session — it is what an installed agent will
    // deliver to, and it must not be assertable by the payload or by
    // whoever filled in the Stripe form.
    const { data: buyer } = await admin.auth.admin.getUserById(purchase.buyer_id);
    const buyerEmail = buyer?.user?.email ?? "";
    if (!buyerEmail) {
      logApiError("marketplace:fulfil", new Error("buyer has no email"), { purchaseId });
      return { ok: false, reason: "no_buyer_email" };
    }

    const installed = await installPayload({
      admin,
      kind: listing.kind,
      payload: (payloadRow.payload ?? {}) as Record<string, unknown>,
      buyerId: purchase.buyer_id,
      buyerEmail,
    });

    if (!installed.ok) {
      // Left `paid` with no installed_entity_id, deliberately. See the
      // header: this is the state that has to be findable.
      return { ok: false, reason: "install_failed" };
    }

    const { error: markError } = await admin
      .from("marketplace_purchases")
      .update({ installed_entity_id: installed.entityId, installed_at: new Date().toISOString() })
      .eq("id", purchase.id);
    if (markError) {
      logApiError("marketplace:fulfil", markError, { purchaseId, stage: "mark_installed" });
    }

    // The sales counter. Read-then-write rather than an RPC increment,
    // and safe here only because the claim above means exactly one
    // delivery reaches this line per purchase.
    const { error: countError } = await admin
      .from("marketplace_listings")
      .update({ purchase_count: (listing.purchase_count ?? 0) + 1 })
      .eq("id", purchase.listing_id);
    if (countError) {
      logApiError("marketplace:fulfil", countError, { purchaseId, stage: "increment_count" });
    }

    return { ok: true };
  } catch (err) {
    logApiError("marketplace:fulfil", err, { purchaseId });
    return { ok: false, reason: "unhandled" };
  }
}
