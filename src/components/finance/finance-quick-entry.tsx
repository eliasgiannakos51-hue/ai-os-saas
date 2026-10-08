"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { MAX_QUICK_CHARS } from "@/lib/finance/quick-entry";

/**
 * ONE SENTENCE, ONE ENTRY (MASTER 16, package 18), behind the switch
 * "finance-sales": «πλήρωσα 50 ευρώ ρεύμα» is written as an expense of 50
 * for «ρεύμα» by api/finance/quick, read by code. When the amount or the
 * direction is not clear the screen says which, and nothing is written.
 */
export function FinanceQuickEntry() {
  const t = useTranslations("dashboard.financeQuick");
  const locale = useLocale();
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ kind: "done" | "problem"; text: string; href?: string } | null>(null);

  async function save() {
    const sentence = text.trim();
    if (!sentence || busy) return;
    setBusy(true);
    setSaid(null);
    try {
      const res = await fetch("/api/finance/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sentence }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body?.ok) {
        const money = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(Number(body.entry.amount));
        setSaid({
          kind: "done",
          text: t(body.entry.type === "income" ? "doneIncome" : "doneExpense", { amount: money, description: String(body.entry.description) }),
          href: `/dashboard/finance?record=${encodeURIComponent(String(body.entry.id))}`,
        });
        setText("");
        router.refresh();
        return;
      }
      const missing: string[] = Array.isArray(body?.missing) ? body.missing : [];
      setSaid({
        kind: "problem",
        text: missing.includes("amount") && missing.includes("type") ? t("missingBoth") : missing.includes("amount") ? t("missingAmount") : missing.includes("type") ? t("missingType") : t("failed"),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-testid="finance-quick" className="surface mb-6 space-y-2">
      <label className="block text-sm font-semibold text-foreground" htmlFor="finance-quick-text">
        {t("title")}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="finance-quick-text"
          data-testid="finance-quick-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
          maxLength={MAX_QUICK_CHARS}
          placeholder={t("placeholder")}
          className="input w-full"
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !text.trim()}
          data-testid="finance-quick-save"
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-card bg-panel-hover px-4 text-sm font-semibold text-foreground disabled:opacity-50"
        >
          {t("save")}
        </button>
      </div>
      <p className="text-[11px] text-muted">{t("hint")}</p>
      {said ? (
        <p data-testid="finance-quick-said" role="status" className={`text-sm ${said.kind === "done" ? "text-foreground" : "text-warning"}`}>
          {said.text}
          {said.href ? (
            <>
              {" "}
              <a href={said.href} className="underline">
                {t("open")}
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
