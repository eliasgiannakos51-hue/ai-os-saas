import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";

/**
 * IONEXA PAYMENTS — ANALYTICS.
 *
 * Computes business metrics from the payments_transactions and
 * payments_subscriptions tables. All numbers are in cents.
 *
 * Metrics:
 * - Total revenue (all time, this month, last month)
 * - Transaction count and average order value
 * - MRR from active subscriptions
 * - Active subscribers and churn rate
 * - Revenue over time (daily for the last 30 days)
 * - Top products by revenue
 * - Platform fees earned
 */

export type PaymentsAnalytics = {
  totalRevenueCents: number;
  thisMonthRevenueCents: number;
  lastMonthRevenueCents: number;
  totalTransactions: number;
  thisMonthTransactions: number;
  averageOrderValueCents: number;
  totalFeesCents: number;
  thisMonthFeesCents: number;
  activeSubscriptions: number;
  mrrCents: number;
  churnedThisMonth: number;
  revenueByDay: { date: string; revenueCents: number; count: number }[];
  topProducts: { productId: string; productName: string; revenueCents: number; count: number }[];
};

export async function getPaymentsAnalytics(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<PaymentsAnalytics> {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Fetch all transactions.
    const { data: txns } = await admin
      .from("payments_transactions")
      .select("id, amount_cents, fee_cents, product_id, status, created_at")
      .eq("user_id", userId)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false });

    const transactions = txns ?? [];

    // Fetch subscriptions.
    const { data: subs } = await admin
      .from("payments_subscriptions")
      .select("id, product_id, status, updated_at")
      .eq("user_id", userId);
    const subscriptions = subs ?? [];

    // Fetch products for names.
    const { data: prods } = await admin
      .from("payments_products")
      .select("id, name, price_cents, is_recurring, recurring_interval")
      .eq("user_id", userId);
    const products = prods ?? [];
    const productMap = new Map(products.map((p: { id: string; name: string; price_cents: number }) => [p.id, p]));

    // Total revenue.
    const totalRevenueCents = transactions.reduce((sum: number, t: { amount_cents: number }) => sum + t.amount_cents, 0);
    const totalFeesCents = transactions.reduce((sum: number, t: { fee_cents: number }) => sum + t.fee_cents, 0);

    // This month.
    const thisMonthTxns = transactions.filter((t: { created_at: string }) => t.created_at >= thisMonthStart);
    const thisMonthRevenueCents = thisMonthTxns.reduce((sum: number, t: { amount_cents: number }) => sum + t.amount_cents, 0);
    const thisMonthFeesCents = thisMonthTxns.reduce((sum: number, t: { fee_cents: number }) => sum + t.fee_cents, 0);

    // Last month.
    const lastMonthTxns = transactions.filter(
      (t: { created_at: string }) => t.created_at >= lastMonthStart && t.created_at < thisMonthStart
    );
    const lastMonthRevenueCents = lastMonthTxns.reduce((sum: number, t: { amount_cents: number }) => sum + t.amount_cents, 0);

    // Average order value.
    const averageOrderValueCents = transactions.length > 0
      ? Math.round(totalRevenueCents / transactions.length)
      : 0;

    // Subscriptions.
    const activeSubs = subscriptions.filter(
      (s: { status: string }) => s.status === "active" || s.status === "trialing"
    );
    const churnedThisMonth = subscriptions.filter(
      (s: { status: string; updated_at: string }) => s.status === "canceled" && s.updated_at >= thisMonthStart
    ).length;

    // MRR: sum of product prices for active subs.
    let mrrCents = 0;
    for (const sub of activeSubs) {
      const prod = productMap.get((sub as { product_id: string }).product_id);
      if (prod) {
        const p = prod as { price_cents: number; is_recurring?: boolean; recurring_interval?: string };
        // Yearly subs → MRR = price / 12.
        if (p.recurring_interval === "year") {
          mrrCents += Math.round(p.price_cents / 12);
        } else {
          mrrCents += p.price_cents;
        }
      }
    }

    // Revenue by day (last 30 days).
    const dayMap = new Map<string, { revenueCents: number; count: number }>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, { revenueCents: 0, count: 0 });
    }
    const recentTxns = transactions.filter((t: { created_at: string }) => t.created_at >= thirtyDaysAgo);
    for (const t of recentTxns) {
      const key = (t as { created_at: string }).created_at.slice(0, 10);
      const entry = dayMap.get(key);
      if (entry) {
        entry.revenueCents += (t as { amount_cents: number }).amount_cents;
        entry.count += 1;
      }
    }
    const revenueByDay = [...dayMap.entries()]
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Top products by revenue.
    const prodRevenue = new Map<string, { revenueCents: number; count: number }>();
    for (const t of transactions) {
      const pid = (t as { product_id: string | null }).product_id;
      if (!pid) continue;
      const entry = prodRevenue.get(pid) ?? { revenueCents: 0, count: 0 };
      entry.revenueCents += (t as { amount_cents: number }).amount_cents;
      entry.count += 1;
      prodRevenue.set(pid, entry);
    }
    const topProducts = [...prodRevenue.entries()]
      .map(([productId, data]) => ({
        productId,
        productName: (productMap.get(productId) as { name: string } | undefined)?.name ?? "Unknown",
        ...data,
      }))
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 10);

    return {
      totalRevenueCents,
      thisMonthRevenueCents,
      lastMonthRevenueCents,
      totalTransactions: transactions.length,
      thisMonthTransactions: thisMonthTxns.length,
      averageOrderValueCents,
      totalFeesCents,
      thisMonthFeesCents,
      activeSubscriptions: activeSubs.length,
      mrrCents,
      churnedThisMonth,
      revenueByDay,
      topProducts,
    };
  } catch (err) {
    logApiError("payments:analytics", err, { userId });
    return {
      totalRevenueCents: 0,
      thisMonthRevenueCents: 0,
      lastMonthRevenueCents: 0,
      totalTransactions: 0,
      thisMonthTransactions: 0,
      averageOrderValueCents: 0,
      totalFeesCents: 0,
      thisMonthFeesCents: 0,
      activeSubscriptions: 0,
      mrrCents: 0,
      churnedThisMonth: 0,
      revenueByDay: [],
      topProducts: [],
    };
  }
}
