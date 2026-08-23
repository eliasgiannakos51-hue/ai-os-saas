"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Trash2, Check, ShieldCheck } from "lucide-react";
import { formatNumber } from "@/lib/format-number";
import { useToast } from "@/components/toast/toast-context";
import { getErrorMessage } from "@/lib/get-error-message";
import { useTradingErrorText } from "@/components/trading/use-trading-error";
import { parseRulesFromText, type ParsedRule, type RuleParams } from "@/lib/trading/rules";
import type { ViolationSummary } from "@/lib/trading/guardian";

/**
 * THE STRATEGY GUARDIAN'S FRONT DOOR.
 *
 * The user writes their rules in their own words. The parse happens IN
 * THE BROWSER, instantly, with no model call — lib/trading/rules.ts is
 * pure — and what it found is shown BESIDE their sentence before
 * anything is saved.
 *
 * THAT ORDER IS THE WHOLE DESIGN. A rule the product misunderstood, saved
 * silently, then used to tell somebody they broke it eight times, is a
 * feature that destroys its own credibility on first contact. Showing the
 * parse first means a misreading is caught by the only person who knows
 * what they meant.
 *
 * "Save anyway" is deliberately NOT offered for a sentence that did not
 * parse. A rule with no checkable form would sit in the list looking
 * active and never fire once — worse than no rule, because the user
 * believes they are being watched.
 */
export function RuleEditor({
  rules,
  violations,
  accountId,
}: {
  rules: { id: string; originalText: string; kind: string; isActive: boolean }[];
  violations: ViolationSummary[];
  accountId: string | null;
}) {
  const t = useTranslations("dashboard.trading");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();
  const tradingError = useTradingErrorText();

  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const parsed: ParsedRule[] = parseRulesFromText(text);

  async function save() {
    if (parsed.length === 0) return;
    setSaving(true);
    try {
      const response = await fetch("/api/trading/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalText: text, accountId }),
      });
      const data = await response.json();
      if (!data.ok) {
        addToast(tradingError(data), "error");
        return;
      }
      setText("");
      addToast(t("rules.saved", { count: data.created ?? parsed.length }), "success");
      router.refresh();
    } catch (err) {
      addToast(getErrorMessage(err, t("rules.saveFailed")), "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      const response = await fetch(`/api/trading/rules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!data.ok) {
        addToast(tradingError(data), "error");
        return;
      }
      router.refresh();
    } catch (err) {
      addToast(getErrorMessage(err, t("rules.deleteFailed")), "error");
    }
  }

  const violationFor = (ruleText: string) => violations.find((v) => v.ruleText === ruleText);

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-panel/60 p-4">
      <div>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <ShieldCheck className="h-4 w-4 text-orange-400" aria-hidden="true" />
          {t("rules.title")}
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">{t("rules.explainer")}</p>
      </div>

      <div className="space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("rules.placeholder")}
          rows={3}
          maxLength={2000}
          className="input w-full resize-y"
          aria-label={t("rules.title")}
        />

        {/* WHAT WE UNDERSTOOD, BEFORE ANYTHING IS SAVED. */}
        {text.trim().length > 0 && (
          <div className="rounded-xl border border-border bg-input px-3 py-2">
            {parsed.length === 0 ? (
              <p className="text-[11px] leading-relaxed text-muted">{t("rules.couldNotParse")}</p>
            ) : (
              <>
                <p className="text-[10px] uppercase tracking-wide text-muted">{t("rules.understood")}</p>
                <ul className="mt-1.5 space-y-1">
                  {parsed.map((rule, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-foreground">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" aria-hidden="true" />
                      {describeRule(rule.params, t, locale)}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || parsed.length === 0}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-orange-500 px-4 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {t("rules.add")}
        </button>
      </div>

      {rules.length === 0 ? (
        <p className="text-[11px] text-muted">{t("rules.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => {
            const broken = violationFor(rule.originalText);
            return (
              <li key={rule.id} className="rounded-xl border border-border px-3 py-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  {/* THEIR OWN SENTENCE, verbatim, never rewritten. */}
                  <p className="min-w-0 flex-1 text-xs text-foreground">{rule.originalText}</p>
                  <button
                    type="button"
                    onClick={() => void remove(rule.id)}
                    aria-label={t("rules.delete")}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">
                  {t(`ruleKinds.${rule.kind}`)}
                </p>
                {/* THE COUNT. Arithmetic over their trades, not a model's
                    impression of them — see lib/trading/guardian.ts. */}
                {broken ? (
                  <p className="mt-1.5 text-xs font-medium text-amber-300">
                    {t("violations.count", { count: formatNumber(broken.count, locale) })}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-emerald-400/90">{t("violations.none")}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function describeRule(
  params: RuleParams,
  t: ReturnType<typeof useTranslations<"dashboard.trading">>,
  locale: string
): string {
  switch (params.kind) {
    case "max_risk_percent":
      return t("ruleSummary.max_risk_percent", { percent: formatNumber(params.percent, locale) });
    case "max_trades_per_day":
      return t("ruleSummary.max_trades_per_day", { count: formatNumber(params.count, locale) });
    case "min_risk_reward":
      return t("ruleSummary.min_risk_reward", { ratio: formatNumber(Math.round(params.ratio * 100) / 100, locale) });
    case "allowed_sessions":
      return t("ruleSummary.allowed_sessions", {
        sessions: params.sessions.map((s) => t(`sessions.${s}`)).join(", "),
      });
    case "allowed_instruments":
      return t("ruleSummary.allowed_instruments", { instruments: params.instruments.join(", ") });
    case "max_daily_loss":
      return t("ruleSummary.max_daily_loss", { amount: formatNumber(params.amount, locale) });
    case "no_trade_after_loss":
      return t("ruleSummary.no_trade_after_loss", { minutes: formatNumber(params.withinMinutes, locale) });
    case "max_position_size":
      return t("ruleSummary.max_position_size", { size: formatNumber(params.size, locale) });
    default:
      return "";
  }
}
