import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import {
  getActionableDeletions,
  claimExecution,
  releaseExecution,
  type ActionableDeletion,
} from "@/lib/account/pending-deletion";
import { eraseUserStorage } from "@/lib/account/erase-storage";
import { createStripeClient } from "@/lib/stripe/server";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // @function-limit 300

// A claimed row whose erase stopped part way is put back, so the person's
// cancel link works again and the next daily run retries it. If even that
// write fails, the row still says executed while the account exists —
// which getActionableDeletions picks up again, so it is finished tomorrow
// rather than lost.
// Never throws: it runs inside the loop's own catch, and one account's
// failure must not stop the run for the rest.
async function giveBack(admin: ReturnType<typeof createAdminClient>, row: ActionableDeletion) {
  let released = false;
  try {
    released = await releaseExecution(admin, row.id);
  } catch {
    released = false;
  }
  if (!released) {
    logApiError("cron/execute-deletions", new Error("could not release the claim"), {
      stage: "release_claim",
      pendingId: row.id,
    });
  }
}

export async function GET(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const admin = createAdminClient();
  const rows = await getActionableDeletions(admin);

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, executed: 0 });
  }

  let executed = 0;
  let skipped = 0;
  const errors: { id: string; userId: string; stage: string; message: string }[] = [];

  for (const row of rows) {
    try {
      // 0. The record, FIRST. executed_at is written before anything is
      // erased, because the auth user's deletion sets this row's user_id
      // to null (20261112000000_pending_deletions_one_open.sql) and the
      // row is then the only trace that a deletion was asked for and
      // carried out (GDPR Art. 5(2)). Conditional: a person who cancelled
      // after this run read its list is left alone ("not_open").
      const claim = await claimExecution(admin, row.id);
      if (claim === "not_open") {
        skipped++;
        continue;
      }
      if (claim === "error") {
        errors.push({ id: row.id, userId: row.user_id, stage: "claim", message: "could not write executed_at" });
        continue;
      }

      // 1. Storage files
      try {
        await eraseUserStorage(admin.storage, row.user_id);
      } catch (err) {
        logApiError("cron/execute-deletions", err, { stage: "erase_storage", userId: row.user_id });
        errors.push({ id: row.id, userId: row.user_id, stage: "erase_storage", message: String(err) });
        await giveBack(admin, row);
        continue;
      }

      // 2. Production errors scrub
      const { error: forgetError } = await admin.rpc("forget_user_in_production_errors", {
        p_user_id: row.user_id,
      });
      if (forgetError) {
        logApiError("cron/execute-deletions", forgetError, { stage: "forget_production_errors", userId: row.user_id });
        errors.push({ id: row.id, userId: row.user_id, stage: "forget_production_errors", message: String(forgetError.message) });
        await giveBack(admin, row);
        continue;
      }

      // 3. Stripe subscription
      const { data: authUser } = await admin.auth.admin.getUserById(row.user_id);
      const subscriptionId = authUser?.user?.user_metadata?.stripe_subscription_id;
      if (typeof subscriptionId === "string" && subscriptionId) {
        try {
          const stripe = createStripeClient();
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const customerId =
            typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
          if (customerId !== authUser?.user?.user_metadata?.stripe_customer_id) {
            logApiError("cron/execute-deletions", new Error("subscription/customer mismatch"), {
              stage: "cancel_subscription",
              userId: row.user_id,
              subscriptionId,
            });
          } else if (subscription.status !== "canceled") {
            await stripe.subscriptions.cancel(subscriptionId);
          }
        } catch (err) {
          logApiError("cron/execute-deletions", err, { stage: "cancel_subscription", userId: row.user_id });
          errors.push({ id: row.id, userId: row.user_id, stage: "cancel_subscription", message: String(err) });
          await giveBack(admin, row);
          continue;
        }
      }

      // 4. Delete the auth user. Its tables cascade; this row does not —
      // it stays, with user_id null and its link digests emptied by the
      // trigger in the same update.
      const { error: deleteError } = await admin.auth.admin.deleteUser(row.user_id);
      if (deleteError) {
        // releaseExecution only reopens a row that still has its account,
        // so an error reported after the user was in fact deleted leaves
        // the record saying executed, which it was.
        logApiError("cron/execute-deletions", deleteError, { stage: "deleteUser", userId: row.user_id });
        errors.push({ id: row.id, userId: row.user_id, stage: "deleteUser", message: String(deleteError.message) });
        await giveBack(admin, row);
        continue;
      }

      executed++;
    } catch (err) {
      logApiError("cron/execute-deletions", err, { userId: row.user_id, pendingId: row.id });
      errors.push({ id: row.id, userId: row.user_id, stage: "unhandled", message: String(err) });
      await giveBack(admin, row);
    }
  }

  return NextResponse.json({
    ok: true,
    found: rows.length,
    executed,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  });
}
