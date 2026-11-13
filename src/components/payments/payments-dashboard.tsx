"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  CreditCard,
  Plus,
  ArrowDownToLine,
  ExternalLink,
  Copy,
  Check,
  Package,
  ArrowUpRight,
  Wallet,
  LinkIcon,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/components/toast/toast-context";

type AccountStatus = {
  connected: boolean;
  account: {
    id: string;
    businessName: string | null;
    payoutsEnabled: boolean;
    chargesEnabled: boolean;
    detailsSubmitted: boolean;
    country: string | null;
    defaultCurrency: string;
  } | null;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  is_active: boolean;
  is_recurring: boolean;
  recurring_interval: string | null;
  created_at: string;
};

type Transaction = {
  id: string;
  amount_cents: number;
  currency: string;
  fee_cents: number;
  net_cents: number;
  status: string;
  customer_email: string | null;
  customer_name: string | null;
  description: string | null;
  created_at: string;
};

type Payout = {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  arrival_date: string | null;
  created_at: string;
};

type BalanceData = {
  balance: { totalAvailableCents: number; totalPendingCents: number } | null;
  transactions: Transaction[];
  transactionCount: number;
  payouts: Payout[];
};

type Tab = "overview" | "products" | "subscriptions" | "coupons" | "invoices" | "transactions" | "payouts";

function formatCurrency(cents: number, currency = "eur", locale?: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(iso: string, locale?: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function PaymentsDashboard() {
  const t = useTranslations("payments");
  const locale = useLocale();
  const fmt = (cents: number, currency = "eur") => formatCurrency(cents, currency, locale);
  const fmtDate = (iso: string) => formatDate(iso, locale);
  const [tab, setTab] = useState<Tab>("overview");
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [balanceData, setBalanceData] = useState<BalanceData | null>(null);
  type Analytics = {
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
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  // — Create product form state —
  const [showCreateProduct, setShowCreateProduct] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductDescription, setNewProductDescription] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [newProductRecurring, setNewProductRecurring] = useState(false);
  const [newProductInterval, setNewProductInterval] = useState<"month" | "year">("month");
  const [creatingProduct, setCreatingProduct] = useState(false);

  // — Payout form state —
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [requestingPayout, setRequestingPayout] = useState(false);

  // — Subscriptions state —
  type Subscription = {
    id: string;
    product_id: string;
    stripe_subscription_id: string;
    customer_email: string | null;
    customer_name: string | null;
    status: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
    created_at: string;
  };
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [subsMetrics, setSubsMetrics] = useState<{ activeCount: number; churnedThisMonth: number }>({ activeCount: 0, churnedThisMonth: 0 });
  const [cancellingSubId, setCancellingSubId] = useState<string | null>(null);

  // — Coupons state —
  type Coupon = { id: string; code: string; percent_off: number | null; amount_off_cents: number | null; currency: string; duration: string; is_active: boolean; times_redeemed: number; max_redemptions: number | null; created_at: string };
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponForm, setCouponForm] = useState({ code: "", percentOff: "", duration: "once" as "once" | "repeating" | "forever" });
  const [creatingCoupon, setCreatingCoupon] = useState(false);

  // — Invoices state —
  type Invoice = { id: string; number: string | null; customer_email: string | null; amount_due: number; currency: string; status: string; due_date: number | null; hosted_invoice_url: string | null; created: number };
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceForm, setInvoiceForm] = useState({ customerEmail: "", description: "", amountCents: "" });
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  // — Copied link state —
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { addToast } = useToast();

  const loadAccount = useCallback(async () => {
    try {
      const res = await fetch("/api/payments/connect");
      if (res.ok) setAccount(await res.json());
    } catch { /* toast on connect, not on poll */ }
  }, []);

  const loadProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/payments/products");
      if (res.ok) {
        const data = await res.json();
        setProducts(data.products ?? []);
      }
    } catch { /* silent */ }
  }, []);

  const loadBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/payments/balance");
      if (res.ok) setBalanceData(await res.json());
    } catch { /* silent */ }
  }, []);

  const loadCoupons = useCallback(async () => {
    try {
      const res = await fetch("/api/payments/coupons");
      if (res.ok) { const data = await res.json(); setCoupons(data.coupons ?? []); }
    } catch { /* silent */ }
  }, []);

  const loadInvoices = useCallback(async () => {
    try {
      const res = await fetch("/api/payments/invoices");
      if (res.ok) { const data = await res.json(); setInvoices(data.invoices ?? []); }
    } catch { /* silent */ }
  }, []);

  const loadAnalytics = useCallback(async () => {
    try {
      const res = await fetch("/api/payments/analytics");
      if (res.ok) setAnalytics(await res.json());
    } catch { /* silent */ }
  }, []);

  const loadSubscriptions = useCallback(async () => {
    try {
      const res = await fetch("/api/payments/subscriptions");
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(data.subscriptions ?? []);
        setSubsMetrics(data.metrics ?? { activeCount: 0, churnedThisMonth: 0 });
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadAccount();
      setLoading(false);
    })();
  }, [loadAccount]);

  useEffect(() => {
    if (account?.connected) {
      loadProducts();
      loadBalance();
      loadSubscriptions();
      loadCoupons();
      loadInvoices();
      loadAnalytics();
    }
  }, [account?.connected, loadProducts, loadBalance, loadSubscriptions, loadCoupons, loadInvoices, loadAnalytics]);

  // — Handlers —
  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/payments/connect", { method: "POST" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        addToast(t(`errors.${data.error}` as never) || data.error, "error");
      }
    } catch {
      addToast(t("errors.notConfigured"), "error");
    } finally {
      setConnecting(false);
    }
  }

  async function handleCreateProduct() {
    const priceCents = Math.round(parseFloat(newProductPrice) * 100);
    if (!newProductName.trim()) {
      addToast(t("errors.nameRequired"), "error");
      return;
    }
    if (isNaN(priceCents) || priceCents < 100 || priceCents > 99_999_900) {
      addToast(t("errors.invalidPrice"), "error");
      return;
    }
    setCreatingProduct(true);
    try {
      const res = await fetch("/api/payments/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newProductName.trim(),
          description: newProductDescription.trim() || undefined,
          priceCents,
          isRecurring: newProductRecurring,
          recurringInterval: newProductRecurring ? newProductInterval : undefined,
        }),
      });
      const data = await res.json();
      if (data.product) {
        setProducts((prev) => [data.product, ...prev]);
        setShowCreateProduct(false);
        setNewProductName("");
        setNewProductDescription("");
        setNewProductPrice("");
        setNewProductRecurring(false);
      } else {
        addToast(data.error, "error");
      }
    } catch {
      addToast(t("errors.notConfigured"), "error");
    } finally {
      setCreatingProduct(false);
    }
  }

  async function handleCopyLink(productId: string) {
    const url = `${window.location.origin}/pay/${productId}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(productId);
    addToast(t("products.linkCopied"), "success");
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleDeactivate(productId: string) {
    try {
      const res = await fetch("/api/payments/products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      if (res.ok) {
        setProducts((prev) => prev.map((p) => (p.id === productId ? { ...p, is_active: false } : p)));
      }
    } catch { /* silent */ }
  }

  async function handleRequestPayout() {
    const cents = Math.round(parseFloat(payoutAmount) * 100);
    if (isNaN(cents) || cents <= 0) return;
    setRequestingPayout(true);
    try {
      const res = await fetch("/api/payments/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents: cents }),
      });
      const data = await res.json();
      if (data.payoutId) {
        setShowPayoutForm(false);
        setPayoutAmount("");
        loadBalance();
        addToast(t("payouts.title") + " ✓", "success");
      } else {
        addToast(t(`errors.${data.error}` as never) || data.error, "error");
      }
    } catch {
      addToast(t("errors.notConfigured"), "error");
    } finally {
      setRequestingPayout(false);
    }
  }

  async function handleOpenStripeDashboard() {
    try {
      const res = await fetch("/api/payments/dashboard-link", { method: "POST" });
      const data = await res.json();
      if (data.url) window.open(data.url, "_blank");
    } catch { /* silent */ }
  }

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <div className="animate-pulse text-muted">{t("title")}…</div>
      </div>
    );
  }

  // — Not connected yet —
  if (!account?.connected) {
    return (
      <div className="min-h-full">
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
          <div className="rounded-card border border-divider bg-panel p-8 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-workspace">
              <CreditCard className="h-8 w-8 text-foreground" />
            </div>
            <h1 className="mb-2 text-xl font-semibold text-foreground">{t("connect.title")}</h1>
            <p className="mb-6 text-sm text-muted leading-relaxed">{t("connect.description")}</p>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="inline-flex items-center gap-2 rounded-item bg-button px-6 py-3 text-sm font-medium text-button-ink hover:opacity-90 disabled:opacity-50"
            >
              {connecting ? "…" : t("connect.button")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const acct = account.account!;

  // — Pending verification —
  if (!acct.detailsSubmitted) {
    return (
      <div className="min-h-full">
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
          <div className="rounded-card border border-divider bg-panel p-8 text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-workspace">
              <CreditCard className="h-8 w-8 text-foreground" />
            </div>
            <h1 className="mb-2 text-xl font-semibold text-foreground">{t("connect.pendingVerification")}</h1>
            <p className="mb-6 text-sm text-muted">{t("connect.description")}</p>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="inline-flex items-center gap-2 rounded-item bg-button px-6 py-3 text-sm font-medium text-button-ink hover:opacity-90 disabled:opacity-50"
            >
              {connecting ? "…" : t("connect.resumeButton")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // — Connected: full dashboard —
  const TABS: { key: Tab; label: string }[] = [
    { key: "overview", label: t("dashboard.overview") },
    { key: "products", label: t("dashboard.productsTab") },
    { key: "subscriptions", label: t("dashboard.subscriptionsTab") },
    { key: "coupons", label: t("dashboard.couponsTab") },
    { key: "invoices", label: t("dashboard.invoicesTab") },
    { key: "transactions", label: t("dashboard.transactionsTab") },
    { key: "payouts", label: t("dashboard.payoutsTab") },
  ];

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{t("title")}</h1>
            <p className="text-sm text-muted">
              {acct.businessName || t("subtitle")}
              {acct.chargesEnabled && (
                <span className="ms-2 inline-flex items-center rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
                  {t("connect.connected")}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={handleOpenStripeDashboard}
            className="inline-flex items-center gap-1.5 rounded-item border border-divider bg-panel px-3 py-2 text-xs text-muted hover:text-foreground hover:bg-panel-hover"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t("dashboard.openStripeDashboard")}
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-item border border-divider bg-workspace p-1">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 rounded-item px-3 py-2 text-sm font-medium transition-colors ${
                tab === key
                  ? "bg-panel text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "overview" && (
          <div className="space-y-6">
            {/* Balance + revenue cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-card border border-divider bg-panel p-5">
                <div className="mb-1 text-xs text-muted">{t("balance.available")}</div>
                <div className="text-2xl font-semibold text-foreground">
                  {balanceData?.balance
                    ? fmt(balanceData.balance.totalAvailableCents, acct.defaultCurrency)
                    : "—"}
                </div>
              </div>
              <div className="rounded-card border border-divider bg-panel p-5">
                <div className="mb-1 text-xs text-muted">{t("analytics.thisMonthRevenue")}</div>
                <div className="text-2xl font-semibold text-foreground">
                  {analytics ? fmt(analytics.thisMonthRevenueCents, acct.defaultCurrency) : "—"}
                </div>
                {analytics && analytics.lastMonthRevenueCents > 0 && (
                  <div className="mt-1 text-xs text-muted">
                    {analytics.thisMonthRevenueCents >= analytics.lastMonthRevenueCents ? "↑" : "↓"}{" "}
                    {t("analytics.vsLastMonth")}
                  </div>
                )}
              </div>
              <div className="rounded-card border border-divider bg-panel p-5">
                <div className="mb-1 text-xs text-muted">{t("analytics.mrr")}</div>
                <div className="text-2xl font-semibold text-foreground">
                  {analytics ? fmt(analytics.mrrCents, acct.defaultCurrency) : "—"}
                </div>
                {analytics && analytics.activeSubscriptions > 0 && (
                  <div className="mt-1 text-xs text-muted">
                    {analytics.activeSubscriptions} {t("subscriptions.active").toLowerCase()}
                  </div>
                )}
              </div>
            </div>
            {/* Secondary metrics */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-card border border-divider bg-panel p-4">
                <div className="mb-1 text-xs text-muted">{t("analytics.totalRevenue")}</div>
                <div className="text-lg font-semibold text-foreground">
                  {analytics ? fmt(analytics.totalRevenueCents, acct.defaultCurrency) : "—"}
                </div>
              </div>
              <div className="rounded-card border border-divider bg-panel p-4">
                <div className="mb-1 text-xs text-muted">{t("analytics.transactions")}</div>
                <div className="text-lg font-semibold text-foreground">
                  {analytics?.totalTransactions ?? 0}
                </div>
              </div>
              <div className="rounded-card border border-divider bg-panel p-4">
                <div className="mb-1 text-xs text-muted">{t("analytics.avgOrderValue")}</div>
                <div className="text-lg font-semibold text-foreground">
                  {analytics ? fmt(analytics.averageOrderValueCents, acct.defaultCurrency) : "—"}
                </div>
              </div>
              <div className="rounded-card border border-divider bg-panel p-4">
                <div className="mb-1 text-xs text-muted">{t("analytics.platformFees")}</div>
                <div className="text-lg font-semibold text-foreground">
                  {analytics ? fmt(analytics.thisMonthFeesCents, acct.defaultCurrency) : "—"}
                </div>
              </div>
            </div>
            {/* Top products */}
            {analytics && analytics.topProducts.length > 0 && (
              <div className="rounded-card border border-divider bg-panel p-5">
                <div className="mb-3 text-xs font-medium text-foreground">{t("analytics.topProducts")}</div>
                <div className="space-y-2">
                  {analytics.topProducts.slice(0, 5).map((p) => (
                    <div key={p.productId} className="flex items-center justify-between text-sm">
                      <span className="text-foreground">{p.productName}</span>
                      <span className="text-muted">
                        {fmt(p.revenueCents, acct.defaultCurrency)} · {p.count} {t("analytics.sales")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <button
                onClick={() => { setTab("products"); setShowCreateProduct(true); }}
                className="flex items-center gap-3 rounded-card border border-divider bg-panel p-4 text-start hover:bg-panel-hover"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-item bg-workspace">
                  <Plus className="h-5 w-5 text-foreground" />
                </div>
                <div>
                  <div className="text-sm font-medium text-foreground">{t("products.create")}</div>
                  <div className="text-xs text-muted">{t("subtitle")}</div>
                </div>
              </button>

              {balanceData?.balance && balanceData.balance.totalAvailableCents > 0 && (
                <button
                  onClick={() => { setTab("payouts"); setShowPayoutForm(true); }}
                  className="flex items-center gap-3 rounded-card border border-divider bg-panel p-4 text-start hover:bg-panel-hover"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-item bg-workspace">
                    <ArrowDownToLine className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">{t("payouts.cashout")}</div>
                    <div className="text-xs text-muted">
                      {fmt(balanceData.balance.totalAvailableCents, acct.defaultCurrency)}
                    </div>
                  </div>
                </button>
              )}
            </div>

            {/* Recent transactions */}
            {balanceData && balanceData.transactions.length > 0 && (
              <div>
                <h2 className="mb-3 text-sm font-medium text-foreground">{t("transactions.title")}</h2>
                <div className="space-y-2">
                  {balanceData.transactions.slice(0, 5).map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between rounded-item border border-divider bg-panel px-4 py-3">
                      <div>
                        <div className="text-sm text-foreground">{tx.customer_name || tx.customer_email || "—"}</div>
                        <div className="text-xs text-muted">{fmtDate(tx.created_at)}</div>
                      </div>
                      <div className="text-end">
                        <div className="text-sm font-medium text-foreground">
                          {fmt(tx.net_cents, tx.currency)}
                        </div>
                        <div className={`text-xs ${tx.status === "succeeded" ? "text-success" : "text-muted"}`}>
                          {t(`transactions.${tx.status}` as never)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "products" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-foreground">{t("products.title")}</h2>
              <button
                onClick={() => setShowCreateProduct(true)}
                className="inline-flex items-center gap-1.5 rounded-item border border-divider px-3 py-2 text-xs font-medium text-foreground hover:bg-panel-hover"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("products.create")}
              </button>
            </div>

            {/* Create product form */}
            {showCreateProduct && (
              <div className="rounded-card border border-divider bg-panel p-5 space-y-4">
                <div>
                  <label className="block text-xs text-muted mb-1">{t("products.name")}</label>
                  <input
                    type="text"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    className="input w-full"
                    placeholder={t("products.name")}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1">{t("products.description")}</label>
                  <input
                    type="text"
                    value={newProductDescription}
                    onChange={(e) => setNewProductDescription(e.target.value)}
                    className="input w-full"
                    placeholder={t("products.description")}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted mb-1">{t("products.price")} (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      value={newProductPrice}
                      onChange={(e) => setNewProductPrice(e.target.value)}
                      className="input w-full"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-1">{t("products.recurring")}</label>
                    <div className="flex items-center gap-3 pt-2">
                      <label className="flex items-center gap-1.5 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={newProductRecurring}
                          onChange={(e) => setNewProductRecurring(e.target.checked)}
                          className="rounded-item"
                        />
                        {newProductRecurring ? t("products.monthly") : t("products.oneTime")}
                      </label>
                      {newProductRecurring && (
                        <select
                          value={newProductInterval}
                          onChange={(e) => setNewProductInterval(e.target.value as "month" | "year")}
                          className="input text-xs"
                        >
                          <option value="month">{t("products.monthly")}</option>
                          <option value="year">{t("products.yearly")}</option>
                        </select>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleCreateProduct}
                    disabled={creatingProduct}
                    className="rounded-item border border-divider bg-panel px-4 py-2 text-sm font-medium text-foreground hover:bg-panel-hover disabled:opacity-50"
                  >
                    {creatingProduct ? "…" : t("products.create")}
                  </button>
                  <button
                    onClick={() => setShowCreateProduct(false)}
                    className="rounded-item border border-divider px-4 py-2 text-sm text-muted hover:text-foreground"
                  >
                    {t("cancel")}
                  </button>
                </div>
              </div>
            )}

            {/* Product list */}
            {products.length === 0 && !showCreateProduct && (
              <div className="rounded-card border border-divider bg-panel p-8 text-center">
                <Package className="mx-auto mb-3 h-8 w-8 text-muted" />
                <p className="text-sm text-muted">{t("products.noProducts")}</p>
              </div>
            )}

            {products.map((product) => (
              <div
                key={product.id}
                className={`rounded-card border border-divider bg-panel p-4 ${!product.is_active ? "opacity-50" : ""}`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{product.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${
                        product.is_active ? "bg-success/10 text-success" : "bg-workspace text-muted"
                      }`}>
                        {product.is_active ? t("products.active") : t("products.inactive")}
                      </span>
                      {product.is_recurring && (
                        <span className="rounded-full bg-workspace px-2 py-0.5 text-xs text-muted">
                          {product.recurring_interval === "year" ? t("products.yearly") : t("products.monthly")}
                        </span>
                      )}
                    </div>
                    {product.description && (
                      <p className="mt-1 text-xs text-muted">{product.description}</p>
                    )}
                    <div className="mt-2 text-lg font-semibold text-foreground">
                      {fmt(product.price_cents, product.currency)}
                      {product.is_recurring && (
                        <span className="text-xs text-muted font-normal">
                          /{product.recurring_interval === "year" ? t("products.yearly").toLowerCase() : t("products.monthly").toLowerCase()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {product.is_active && (
                      <>
                        <button
                          onClick={() => handleCopyLink(product.id)}
                          className="inline-flex items-center gap-1 rounded-item border border-divider px-2.5 py-1.5 text-xs text-muted hover:text-foreground"
                          title={t("products.copyLink")}
                        >
                          {copiedId === product.id ? (
                            <Check className="h-3.5 w-3.5 text-success" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                          <LinkIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeactivate(product.id)}
                          className="rounded-item border border-divider px-2.5 py-1.5 text-xs text-muted hover:text-danger"
                        >
                          {t("products.deactivate")}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "transactions" && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-foreground">{t("transactions.title")}</h2>
            {(!balanceData || balanceData.transactions.length === 0) && (
              <div className="rounded-card border border-divider bg-panel p-8 text-center">
                <ArrowUpRight className="mx-auto mb-3 h-8 w-8 text-muted" />
                <p className="text-sm text-muted">{t("transactions.noTransactions")}</p>
              </div>
            )}
            {balanceData?.transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between rounded-item border border-divider bg-panel px-4 py-3">
                <div>
                  <div className="text-sm text-foreground">{tx.customer_name || tx.customer_email || tx.description || "—"}</div>
                  <div className="text-xs text-muted">{fmtDate(tx.created_at)}</div>
                </div>
                <div className="text-end">
                  <div className="text-sm font-medium text-foreground">{fmt(tx.amount_cents, tx.currency)}</div>
                  <div className="text-xs text-muted">
                    {t("balance.available")}: {fmt(tx.net_cents, tx.currency)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "payouts" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-foreground">{t("payouts.title")}</h2>
              {balanceData?.balance && balanceData.balance.totalAvailableCents > 0 && (
                <button
                  onClick={() => setShowPayoutForm(true)}
                  className="inline-flex items-center gap-1.5 rounded-item border border-divider px-3 py-2 text-xs font-medium text-foreground hover:bg-panel-hover"
                >
                  <Wallet className="h-3.5 w-3.5" />
                  {t("payouts.cashout")}
                </button>
              )}
            </div>

            {/* Payout form */}
            {showPayoutForm && (
              <div className="rounded-card border border-divider bg-panel p-5 space-y-4">
                <div>
                  <label className="block text-xs text-muted mb-1">{t("payouts.amount")} (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    max={balanceData?.balance ? balanceData.balance.totalAvailableCents / 100 : undefined}
                    value={payoutAmount}
                    onChange={(e) => setPayoutAmount(e.target.value)}
                    className="input w-full"
                    placeholder="0.00"
                  />
                  {balanceData?.balance && (
                    <p className="mt-1 text-xs text-muted">
                      {t("balance.available")}: {fmt(balanceData.balance.totalAvailableCents, acct.defaultCurrency)}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleRequestPayout}
                    disabled={requestingPayout}
                    className="rounded-item border border-divider bg-panel px-4 py-2 text-sm font-medium text-foreground hover:bg-panel-hover disabled:opacity-50"
                  >
                    {requestingPayout ? "…" : t("payouts.requestPayout")}
                  </button>
                  <button
                    onClick={() => setShowPayoutForm(false)}
                    className="rounded-item border border-divider px-4 py-2 text-sm text-muted hover:text-foreground"
                  >
                    {t("cancel")}
                  </button>
                </div>
              </div>
            )}

            {/* Payout list */}
            {(!balanceData || balanceData.payouts.length === 0) && !showPayoutForm && (
              <div className="rounded-card border border-divider bg-panel p-8 text-center">
                <ArrowDownToLine className="mx-auto mb-3 h-8 w-8 text-muted" />
                <p className="text-sm text-muted">{t("payouts.noPayouts")}</p>
              </div>
            )}
            {balanceData?.payouts.map((po) => (
              <div key={po.id} className="flex items-center justify-between rounded-item border border-divider bg-panel px-4 py-3">
                <div>
                  <div className="text-sm text-foreground">{fmt(po.amount_cents, po.currency)}</div>
                  <div className="text-xs text-muted">{fmtDate(po.created_at)}</div>
                </div>
                <div className="text-end">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    po.status === "paid" ? "bg-success/10 text-success" :
                    po.status === "in_transit" ? "bg-workspace text-foreground" :
                    po.status === "failed" ? "bg-danger/10 text-danger" :
                    "bg-workspace text-muted"
                  }`}>
                    {t(`payouts.${po.status === "in_transit" ? "inTransit" : po.status}` as never)}
                  </span>
                  {po.arrival_date && (
                    <div className="text-xs text-muted mt-0.5">{fmtDate(po.arrival_date)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Subscriptions tab */}
        {tab === "subscriptions" && (
          <div className="space-y-4">
            {/* Metrics */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-card border border-divider bg-panel p-5">
                <div className="mb-1 text-xs text-muted">{t("subscriptions.active")}</div>
                <div className="text-2xl font-semibold text-foreground">{subsMetrics.activeCount}</div>
              </div>
              <div className="rounded-card border border-divider bg-panel p-5">
                <div className="mb-1 text-xs text-muted">{t("subscriptions.churnedThisMonth")}</div>
                <div className="text-2xl font-semibold text-foreground">{subsMetrics.churnedThisMonth}</div>
              </div>
              <div className="rounded-card border border-divider bg-panel p-5">
                <div className="mb-1 text-xs text-muted">{t("subscriptions.total")}</div>
                <div className="text-2xl font-semibold text-foreground">{subscriptions.length}</div>
              </div>
            </div>

            {/* Subscription list */}
            {subscriptions.length === 0 && (
              <div className="rounded-card border border-divider bg-panel p-8 text-center">
                <RefreshCw className="mx-auto mb-3 h-8 w-8 text-muted" />
                <p className="text-sm text-muted">{t("subscriptions.noSubscriptions")}</p>
                <p className="mt-1 text-xs text-muted">{t("subscriptions.hint")}</p>
              </div>
            )}
            {subscriptions.map((sub) => {
              const product = products.find((p) => p.id === sub.product_id);
              return (
                <div key={sub.id} className="flex items-center justify-between rounded-item border border-divider bg-panel px-4 py-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {product?.name ?? t("subscriptions.unknownProduct")}
                    </div>
                    <div className="text-xs text-muted">
                      {sub.customer_email ?? sub.customer_name ?? "—"}
                      {" · "}
                      {t("subscriptions.renewsOn", { date: fmtDate(sub.current_period_end) })}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-end">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      sub.status === "active" ? "bg-success/10 text-success" :
                      sub.status === "trialing" ? "bg-workspace text-foreground" :
                      sub.status === "past_due" ? "bg-warning/10 text-warning" :
                      sub.status === "canceled" ? "bg-danger/10 text-danger" :
                      "bg-workspace text-muted"
                    }`}>
                      {sub.cancel_at_period_end
                        ? t("subscriptions.cancelling")
                        : t(`subscriptions.status.${sub.status}` as never)}
                    </span>
                    {sub.status === "active" && !sub.cancel_at_period_end && (
                      <button
                        disabled={cancellingSubId === sub.stripe_subscription_id}
                        onClick={async () => {
                          setCancellingSubId(sub.stripe_subscription_id);
                          try {
                            const res = await fetch(
                              `/api/payments/subscriptions?id=${sub.stripe_subscription_id}`,
                              { method: "DELETE" }
                            );
                            if (res.ok) {
                              addToast(t("subscriptions.cancelledOk"), "success");
                              loadSubscriptions();
                            }
                          } catch { /* silent */ }
                          setCancellingSubId(null);
                        }}
                        className="rounded-item px-2 py-1 text-xs text-danger hover:bg-danger/10"
                      >
                        {cancellingSubId === sub.stripe_subscription_id ? "…" : t("subscriptions.cancel")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Coupons tab */}
        {tab === "coupons" && (
          <div className="space-y-4">
            {/* Create coupon form */}
            <div className="rounded-card border border-divider bg-panel p-5">
              <p className="mb-3 text-xs font-medium text-foreground">{t("coupons.createTitle")}</p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex-1">
                  <span className="text-xs text-muted">{t("coupons.code")}</span>
                  <input
                    type="text"
                    placeholder="SUMMER25"
                    value={couponForm.code}
                    onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
                    className="mt-1 h-8 w-full rounded-item border border-border bg-input px-2 text-xs text-foreground"
                  />
                </label>
                <label className="w-24">
                  <span className="text-xs text-muted">{t("coupons.percentOff")}</span>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    placeholder="25"
                    value={couponForm.percentOff}
                    onChange={(e) => setCouponForm({ ...couponForm, percentOff: e.target.value })}
                    className="mt-1 h-8 w-full rounded-item border border-border bg-input px-2 text-xs text-foreground"
                  />
                </label>
                <select
                  value={couponForm.duration}
                  onChange={(e) => setCouponForm({ ...couponForm, duration: e.target.value as "once" | "repeating" | "forever" })}
                  className="h-8 rounded-item border border-border bg-input px-2 text-xs text-foreground"
                >
                  <option value="once">{t("coupons.once")}</option>
                  <option value="repeating">{t("coupons.repeating")}</option>
                  <option value="forever">{t("coupons.forever")}</option>
                </select>
                <button
                  disabled={creatingCoupon || !couponForm.code || !couponForm.percentOff}
                  onClick={async () => {
                    setCreatingCoupon(true);
                    try {
                      const res = await fetch("/api/payments/coupons", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ code: couponForm.code, percentOff: Number(couponForm.percentOff), duration: couponForm.duration }),
                      });
                      if (res.ok) {
                        addToast(t("coupons.created"), "success");
                        setCouponForm({ code: "", percentOff: "", duration: "once" });
                        loadCoupons();
                      }
                    } catch { /* silent */ }
                    setCreatingCoupon(false);
                  }}
                  className="h-8 rounded-item bg-foreground px-4 text-xs font-medium text-background"
                >
                  {creatingCoupon ? "…" : t("coupons.create")}
                </button>
              </div>
            </div>
            {/* Coupon list */}
            {coupons.length === 0 && (
              <p className="text-center text-xs text-muted">{t("coupons.none")}</p>
            )}
            {coupons.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-item border border-divider bg-panel px-4 py-3">
                <div>
                  <span className="font-mono text-sm font-semibold text-foreground">{c.code}</span>
                  <span className="ms-2 text-xs text-muted">
                    {c.percent_off ? `${c.percent_off}% off` : c.amount_off_cents ? `${(c.amount_off_cents / 100).toFixed(2)} off` : ""}
                    {" · "}{c.duration}
                    {c.max_redemptions ? ` · max ${c.max_redemptions}` : ""}
                    {" · "}{c.times_redeemed} {t("coupons.used")}
                  </span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${c.is_active ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
                  {c.is_active ? t("coupons.active") : t("coupons.inactive")}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Invoices tab */}
        {tab === "invoices" && (
          <div className="space-y-4">
            {/* Create invoice form */}
            <div className="rounded-card border border-divider bg-panel p-5">
              <p className="mb-3 text-xs font-medium text-foreground">{t("invoices.createTitle")}</p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex-1">
                  <span className="text-xs text-muted">{t("invoices.customerEmail")}</span>
                  <input
                    type="email"
                    placeholder="customer@example.com"
                    value={invoiceForm.customerEmail}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, customerEmail: e.target.value })}
                    className="mt-1 h-8 w-full rounded-item border border-border bg-input px-2 text-xs text-foreground"
                  />
                </label>
                <label className="flex-1">
                  <span className="text-xs text-muted">{t("invoices.description")}</span>
                  <input
                    type="text"
                    placeholder={t("invoices.descriptionPlaceholder")}
                    value={invoiceForm.description}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })}
                    className="mt-1 h-8 w-full rounded-item border border-border bg-input px-2 text-xs text-foreground"
                  />
                </label>
                <label className="w-28">
                  <span className="text-xs text-muted">{t("invoices.amount")}</span>
                  <input
                    type="number"
                    min={1}
                    step={0.01}
                    placeholder="100.00"
                    value={invoiceForm.amountCents}
                    onChange={(e) => setInvoiceForm({ ...invoiceForm, amountCents: e.target.value })}
                    className="mt-1 h-8 w-full rounded-item border border-border bg-input px-2 text-xs text-foreground"
                  />
                </label>
                <button
                  disabled={creatingInvoice || !invoiceForm.customerEmail || !invoiceForm.amountCents}
                  onClick={async () => {
                    setCreatingInvoice(true);
                    try {
                      const res = await fetch("/api/payments/invoices", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          customerEmail: invoiceForm.customerEmail,
                          items: [{ description: invoiceForm.description || "Service", amountCents: Math.round(Number(invoiceForm.amountCents) * 100) }],
                        }),
                      });
                      if (res.ok) {
                        addToast(t("invoices.sent"), "success");
                        setInvoiceForm({ customerEmail: "", description: "", amountCents: "" });
                        loadInvoices();
                      }
                    } catch { /* silent */ }
                    setCreatingInvoice(false);
                  }}
                  className="h-8 rounded-item bg-foreground px-4 text-xs font-medium text-background"
                >
                  {creatingInvoice ? "…" : t("invoices.sendInvoice")}
                </button>
              </div>
            </div>
            {/* Invoice list */}
            {invoices.length === 0 && (
              <p className="text-center text-xs text-muted">{t("invoices.none")}</p>
            )}
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-item border border-divider bg-panel px-4 py-3">
                <div>
                  <span className="text-sm font-medium text-foreground">{inv.number ?? inv.id.slice(0, 8)}</span>
                  <span className="ms-2 text-xs text-muted">
                    {inv.customer_email ?? "—"} · {(inv.amount_due / 100).toFixed(2)} {inv.currency.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${
                    inv.status === "paid" ? "bg-success/10 text-success" :
                    inv.status === "open" ? "bg-workspace text-foreground" :
                    inv.status === "void" ? "bg-danger/10 text-danger" :
                    "bg-workspace text-muted"
                  }`}>
                    {inv.status}
                  </span>
                  {inv.hosted_invoice_url && (
                    <a
                      href={inv.hosted_invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-foreground hover:underline"
                    >
                      {t("invoices.view")}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Platform fee note */}
        <div className="mt-8 text-center text-xs text-muted">
          {t("platformFee", { fee: "2.5" })}
        </div>
      </div>
    </div>
  );
}
