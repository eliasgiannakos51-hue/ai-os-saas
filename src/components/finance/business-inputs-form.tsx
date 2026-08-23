"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/toast/toast-context";

// The three numbers only the owner knows. Every field may be left EMPTY,
// and empty is a real value here: it means "not entered", which makes the
// metrics that depend on it say so rather than compute from a zero. A
// form that coerced blanks to 0 would turn "I have not filled this in"
// into "our acquisition is free".
export function BusinessInputsForm({
  month,
  initial,
}: {
  month: string;
  initial: { marketingSpendEur: number | null; fixedCostsEur: number | null; cashBalanceEur: number | null };
}) {
  const t = useTranslations("finance.form");
  const router = useRouter();
  const { addToast } = useToast();

  const [marketing, setMarketing] = useState(initial.marketingSpendEur?.toString() ?? "");
  const [fixed, setFixed] = useState(initial.fixedCostsEur?.toString() ?? "");
  const [cash, setCash] = useState(initial.cashBalanceEur?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/billing/business-inputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month,
          // Sent as the empty string when blank, which the route reads as
          // null. Sending 0 would be a different claim.
          marketingSpendEur: marketing.trim(),
          fixedCostsEur: fixed.trim(),
          cashBalanceEur: cash.trim(),
        }),
      });
      if (!response.ok) {
        addToast(t("saveError"), "error");
        return;
      }
      addToast(t("saved"));
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const field = (
    label: string,
    hint: string,
    value: string,
    setValue: (v: string) => void
  ) => (
    <label className="text-xs text-muted">
      <span className="mb-1 block text-foreground">{label}</span>
      <input
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label={label}
        className="w-full rounded-lg border border-border bg-panel-hover px-3 py-2 text-sm text-foreground"
      />
      <span className="mt-1 block text-[11px] text-muted">{hint}</span>
    </label>
  );

  return (
    <div className="rounded-2xl border border-border bg-panel p-5">
      <h2 className="text-sm font-semibold text-foreground">{t("title", { month })}</h2>
      <p className="mt-1 text-xs text-muted">{t("description")}</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {field(t("marketing"), t("marketingHint"), marketing, setMarketing)}
        {field(t("fixed"), t("fixedHint"), fixed, setFixed)}
        {field(t("cash"), t("cashHint"), cash, setCash)}
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="mt-3 rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-black disabled:opacity-50"
      >
        {saving ? t("saving") : t("save")}
      </button>
    </div>
  );
}
