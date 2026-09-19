import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStripeClient } from "@/lib/stripe/server";
import { hashDeleteAccountToken } from "@/lib/delete-account-token";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

// @service-role-justified token-auth — the 256-bit single-use token from
// the emailed link IS the proof of identity (see the file comment below);
// there is no session on this path by design.

export const dynamic = "force-dynamic";

const DELETE_CONFIRM_MAX_ATTEMPTS = 10;
const DELETE_CONFIRM_WINDOW_MINUTES = 60;

// Step 2 of account deletion: the token from the emailed link IS the proof
// of authorization here — deliberately does not require an active session,
// since the link may be opened on a different device/browser than the one
// that requested it (same reasoning as password-reset links). The token
// itself is 256 bits of randomness (see lib/delete-account-token.ts), so
// brute-forcing it is already infeasible — this is defense-in-depth
// against scripted hammering of the endpoint, not a real brute-force gate.
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimit({
      scope: "delete_account_confirm",
      identifier: ip,
      maxAttempts: DELETE_CONFIRM_MAX_ATTEMPTS,
      windowMinutes: DELETE_CONFIRM_WINDOW_MINUTES,
    });
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    let token: string;
    try {
      const body = await request.json();
      token = typeof body?.token === "string" ? body.token : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
    }

    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing token." }, { status: 400 });
    }

    const admin = createAdminClient();
    const tokenHash = hashDeleteAccountToken(token);

    // Atomically claim the request: only succeeds once, and only while
    // unexpired — a second click (or a race between two tabs) on the same
    // link can't trigger two deletes.
    const { data: claimed, error: claimError } = await admin
      .from("account_deletion_requests")
      .update({ used_at: new Date().toISOString() })
      .eq("token_hash", tokenHash)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("user_id")
      .maybeSingle();

    if (claimError) {
      logApiError("/api/delete-account/confirm", claimError);
      return NextResponse.json(
        { ok: false, error: "Something went wrong. Please try again." },
        { status: 500 }
      );
    }

    if (!claimed) {
      return NextResponse.json(
        { ok: false, error: "This link is invalid or has expired." },
        { status: 400 }
      );
    }

    // The uploaded FILES first, and before the auth user, because
    // storage.objects has no foreign key to auth.users — nothing cascades
    // here. Deleting the user without this leaves their contracts and
    // payroll PDFs sitting in the bucket forever, which is not an
    // untidiness problem: it is the erasure right in Article 17 not being
    // honoured, on the most sensitive data this product holds.
    //
    // Done BEFORE deleteUser so a failure is still reportable against an
    // account that exists. A failure here stops the deletion rather than
    // proceeding, because "we deleted your account" must not be said
    // while the files are still there.
    // ALL THREE BUCKETS, not just user-files. delete_user_file_objects()
    // deleted from 'user-files' alone, so photographs attached to a Create
    // prompt or to a deck ('create-attachments') and reference images for
    // a generated site ('website-references', a PUBLIC bucket) survived
    // the account that uploaded them. See the migration
    // 20261005000000_delete_user_storage_objects_all_buckets.sql.
    const { error: objectsError } = await admin.rpc("delete_user_storage_objects", {
      target_user_id: claimed.user_id,
    });
    if (objectsError) {
      logApiError("/api/delete-account/confirm", objectsError, { stage: "delete_file_objects" });
      return NextResponse.json(
        { ok: false, error: "Could not delete the account. Please contact support." },
        { status: 500 }
      );
    }

    // The one table the cascade does not reach. production_errors.user_id
    // is a bare uuid with no foreign key, and affected_user_ids is a
    // uuid[] that no foreign key could cover — so deleteUser() leaves the
    // deleted account's id sitting in the error tracker indefinitely, on
    // a table the owner reads in System Health.
    //
    // Same ordering rule as the files above: before deleteUser, and a
    // failure stops the deletion. Saying "we deleted your account" while
    // an identifier for that person is still queryable is exactly the
    // claim Article 17 does not allow us to make loosely.
    const { error: forgetError } = await admin.rpc("forget_user_in_production_errors", {
      p_user_id: claimed.user_id,
    });
    if (forgetError) {
      logApiError("/api/delete-account/confirm", forgetError, {
        stage: "forget_production_errors",
        hint: "if this says the function was not found, apply supabase/migrations/20260808_gdpr_erasure_gaps.sql",
      });
      return NextResponse.json(
        { ok: false, error: "Could not delete the account. Please contact support." },
        { status: 500 }
      );
    }

    // THE SUBSCRIPTION, BEFORE THE ACCOUNT — because after deleteUser the
    // metadata that holds its id is gone with it.
    //
    // WHAT THIS FIXES. Deleting an account cancelled nothing at Stripe.
    // The rows cascaded, the files went, the auth user went — and the
    // subscription stayed live, charging a card every month for a product
    // the person no longer had and could no longer log in to cancel. The
    // relation this deletion did not clean was not in the database at
    // all; it was at a third party, which is why no foreign key and no
    // RLS policy was ever going to reach it.
    //
    // IMMEDIATELY, NOT AT PERIOD END. /api/billing/cancel sets
    // cancel_at_period_end because the account stays and the person keeps
    // what they have paid for. Here there is no account left to keep
    // anything for, so a paid-up period left running is one more invoice
    // against somebody who has gone.
    //
    // A FAILURE REFUSES THE DELETION AND GIVES THE LINK BACK. "We deleted
    // your account" must not be said while the card is still being
    // charged — the same sentence this route already makes about the
    // stored files. But the claim above is what makes the token
    // single-use, so refusing without releasing it would leave the person
    // unable to delete at all, which is a worse trap than the one being
    // fixed. used_at goes back to null on this path and only this one.
    const { data: authUser } = await admin.auth.admin.getUserById(claimed.user_id);
    const subscriptionId = authUser?.user?.user_metadata?.stripe_subscription_id;
    if (typeof subscriptionId === "string" && subscriptionId) {
      try {
        const stripe = createStripeClient();
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const customerId =
          typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
        // The same ownership check /api/billing/cancel makes: a stale or
        // tampered metadata value must not cancel somebody else's
        // subscription. Not fatal here — the account still has to go —
        // but it is recorded, because it means two accounts disagree
        // about who owns one Stripe customer.
        if (customerId !== authUser?.user?.user_metadata?.stripe_customer_id) {
          logApiError("/api/delete-account/confirm", new Error("subscription/customer mismatch"), {
            stage: "cancel_subscription",
            subscriptionId,
          });
        } else if (subscription.status !== "canceled") {
          await stripe.subscriptions.cancel(subscriptionId);
        }
      } catch (err) {
        logApiError("/api/delete-account/confirm", err, { stage: "cancel_subscription", subscriptionId });
        // THE SENTENCE BELOW IS ONLY TRUE IF THIS WRITE LANDS.
        //
        // "Your link still works" is a promise about a row, and the row
        // is this one: the claim above consumed the single-use token, and
        // only putting used_at back makes the emailed link usable a
        // second time. The write was unchecked, so the one failure that
        // matters — the give-back not happening — produced the reassuring
        // half of the message and none of the fact. The person is then
        // told to try again with a link that can never work again, on the
        // erasure path, where the alternative to self-service is
        // contacting support about an account they wanted deleted.
        const { error: giveBackError } = await admin
          .from("account_deletion_requests")
          .update({ used_at: null })
          .eq("token_hash", tokenHash);
        if (giveBackError) {
          logApiError("/api/delete-account/confirm", giveBackError, {
            stage: "release_deletion_token",
            hint: "the emailed link is now spent and the account was NOT deleted — this request needs a new deletion link or manual handling",
          });
          // THE SAME SENTENCE THE THREE OTHER DEAD ENDS IN THIS ROUTE
          // USE, deliberately, rather than a new one. This page renders
          // `data.error` verbatim (confirm-delete-account-form.tsx), so
          // every distinct string here is one more untranslated sentence
          // on a public page — and "contact support" is the whole of the
          // advice anyway once the token is spent. What is NOT reused is
          // the reassuring one below it.
          return NextResponse.json(
            { ok: false, error: "Could not delete the account. Please contact support." },
            { status: 500 }
          );
        }
        return NextResponse.json(
          {
            ok: false,
            error:
              "Could not cancel the subscription on this account, so nothing was deleted. Your link still works — please try again.",
          },
          { status: 500 }
        );
      }
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(claimed.user_id);

    if (deleteError) {
      logApiError("/api/delete-account/confirm", deleteError, { stage: "deleteUser" });
      return NextResponse.json(
        { ok: false, error: "Could not delete the account. Please contact support." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/delete-account/confirm", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
