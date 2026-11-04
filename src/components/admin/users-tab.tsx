"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { CreditAdjustModal } from "./credit-adjust-modal";
import { RefundModal } from "./refund-modal";
import { SuspendModal } from "./suspend-modal";

type UserRow = {
  id: string;
  email: string;
  fullName: string;
  plan: string;
  planName: string;
  creditsRemaining: number;
  creditsTotal: number;
  monthlyPrice: number;
  costEur30d: number;
  calls30d: number;
  margin: number | null;
  createdAt: string;
  lastSignIn: string | null;
  suspended: boolean;
};

export function AdminUsersTab() {
  const t = useTranslations("adminDashboard.users");

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [adjustTarget, setAdjustTarget] = useState<UserRow | null>(null);
  const [refundTarget, setRefundTarget] = useState<UserRow | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<UserRow | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(id);
  }, [query]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("q", debouncedQuery);
      params.set("page", String(page));
      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data.users ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQuery]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          className="w-full rounded-item border border-border bg-panel py-2 pl-10 pr-3 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-foreground/20"
        />
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted">{t("loading")}</p>
      ) : users.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{t("noUsers")}</p>
      ) : (
        <div className="overflow-x-auto rounded-item border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-panel text-xs font-medium uppercase tracking-wide text-muted">
                <th className="px-3 py-2">{t("email")}</th>
                <th className="px-3 py-2">{t("name")}</th>
                <th className="px-3 py-2">{t("plan")}</th>
                <th className="px-3 py-2 text-right">{t("credits")}</th>
                <th className="px-3 py-2 text-right">{t("cost30d")}</th>
                <th className="px-3 py-2 text-right">{t("margin")}</th>
                <th className="px-3 py-2 text-right">{t("calls")}</th>
                <th className="px-3 py-2">{t("lastSignIn")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className={`border-b border-border last:border-0 ${u.suspended ? "opacity-50" : ""}`}
                >
                  <td className="px-3 py-2 font-mono text-xs">
                    {u.email}
                    {u.suspended && (
                      <span className="ml-1 rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                        {t("suspended")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted">{u.fullName || "—"}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                      {u.planName}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {u.creditsRemaining}/{u.creditsTotal}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {u.costEur30d > 0 ? `€${u.costEur30d.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {u.margin !== null ? (
                      <span className={u.margin < 4 ? "text-danger" : ""}>
                        {u.margin.toFixed(1)}x
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {u.calls30d > 0 ? u.calls30d : "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {u.lastSignIn
                      ? new Date(u.lastSignIn).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setAdjustTarget(u)}
                        className="rounded-item border border-border px-2 py-0.5 text-xs text-foreground hover:bg-panel-hover"
                      >
                        {t("adjust")}
                      </button>
                      <button
                        onClick={() => setRefundTarget(u)}
                        className="rounded-item border border-border px-2 py-0.5 text-xs text-foreground hover:bg-panel-hover"
                      >
                        {t("refundBtn")}
                      </button>
                      <button
                        onClick={() => setSuspendTarget(u)}
                        className={`rounded-item border px-2 py-0.5 text-xs ${
                          u.suspended
                            ? "border-success/40 text-success hover:bg-success/10"
                            : "border-danger/40 text-danger hover:bg-danger/10"
                        }`}
                      >
                        {u.suspended ? t("unsuspendBtn") : t("suspendBtn")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > 25 && (
        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            {total} users
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-item border border-border px-2 py-1 disabled:opacity-40"
            >
              &larr;
            </button>
            <span className="px-2 py-1">
              {page}
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * 25 >= total}
              className="rounded-item border border-border px-2 py-1 disabled:opacity-40"
            >
              &rarr;
            </button>
          </div>
        </div>
      )}

      {adjustTarget && (
        <CreditAdjustModal
          userId={adjustTarget.id}
          email={adjustTarget.email}
          creditsRemaining={adjustTarget.creditsRemaining}
          onClose={() => setAdjustTarget(null)}
          onDone={() => {
            setAdjustTarget(null);
            fetchUsers();
          }}
        />
      )}
      {refundTarget && (
        <RefundModal
          userId={refundTarget.id}
          email={refundTarget.email}
          onClose={() => setRefundTarget(null)}
          onDone={() => {
            setRefundTarget(null);
            fetchUsers();
          }}
        />
      )}
      {suspendTarget && (
        <SuspendModal
          userId={suspendTarget.id}
          email={suspendTarget.email}
          isSuspended={suspendTarget.suspended}
          onClose={() => setSuspendTarget(null)}
          onDone={() => {
            setSuspendTarget(null);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}
