"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatDate } from "@/lib/format-number";

type AuditLogEntry = {
  id: number;
  adminEmail: string;
  action: string;
  targetUserId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
};

export function AdminAuditLogTab() {
  const t = useTranslations("adminDashboard.auditLog");
  const locale = useLocale();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/audit-log?limit=100");
      if (!res.ok) return;
      const json = await res.json();
      if (json.ok) setEntries(json.entries ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLog();
  }, [fetchLog]);

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted">{t("loading")}</p>;
  }

  if (entries.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">{t("noEntries")}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-item border border-border">
      <table className="w-full text-start text-xs">
        <thead>
          <tr className="border-b border-border bg-panel text-[10px] font-medium uppercase tracking-wide text-muted">
            <th className="px-3 py-2">{t("time")}</th>
            <th className="px-3 py-2">{t("admin")}</th>
            <th className="px-3 py-2">{t("action")}</th>
            <th className="px-3 py-2">{t("target")}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-border last:border-0">
              <td className="px-3 py-1.5 font-mono text-muted">{formatDate(e.createdAt, locale)}</td>
              <td className="px-3 py-1.5 font-mono">{e.adminEmail}</td>
              <td className="px-3 py-1.5">{e.action}</td>
              <td className="px-3 py-1.5 font-mono text-muted">{e.targetUserId ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
