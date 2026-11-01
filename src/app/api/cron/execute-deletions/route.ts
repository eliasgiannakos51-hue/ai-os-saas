import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import { getActionableDeletions, markExecuted } from "@/lib/account/pending-deletion";
import { eraseUserStorage } from "@/lib/account/erase-storage";
import { createStripeClient } from "@/lib/stripe/server";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  const errors: { id: string; userId: string; stage: string; message: string }[] = [];

  for (const row of rows) {
    try {
      // 1. Storage files
      try {
        await eraseUserStorage(admin.storage, row.user_id);
      } catch (err) {
        logApiError("cron/execute-deletions", err, { stage: "erase_storage", userId: row.user_id });
        errors.push({ id: row.id, userId: row.user_id, stage: "erase_storage", message: String(err) });
        continue;
      }

      // 2. Production errors scrub
      const { error: forgetError } = await admin.rpc("forget_user_in_production_errors", {
        p_user_id: row.user_id,
      });
      if (forgetError) {
        logApiError("cron/execute-deletions", forgetError, { stage: "forget_production_errors", userId: row.user_id });
        errors.push({ id: row.id, userId: row.user_id, stage: "forget_production_errors", message: String(forgetError.message) });
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
          continue;
        }
      }

      // 4. Delete the auth user (cascades tables)
      const { error: deleteError } = await admin.auth.admin.deleteUser(row.user_id);
      if (deleteError) {
        logApiError("cron/execute-deletions", deleteError, { stage: "deleteUser", userId: row.user_id });
        errors.push({ id: row.id, userId: row.user_id, stage: "deleteUser", message: String(deleteError.message) });
        continue;
      }

      // 5. Mark the row as executed
      await markExecuted(admin, row.id);
      executed++;
    } catch (err) {
      logApiError("cron/execute-deletions", err, { userId: row.user_id, pendingId: row.id });
      errors.push({ id: row.id, userId: row.user_id, stage: "unhandled", message: String(err) });
    }
  }

  return NextResponse.json({ ok: true, found: rows.length, executed, errors: errors.length > 0 ? errors : undefined });
}
