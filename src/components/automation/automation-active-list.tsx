"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Repeat, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SecurityCheckedBadge } from "@/components/security/security-checked-badge";
import type { UserAutomation } from "@/types/user-automation";
import { formatDate } from "@/lib/format-number";

// "Active Automations" — every user_automations row, regardless of
// is_active, so a toggled-off automation stays visible (and re-toggleable)
// instead of disappearing. Toggle/delete go straight through the RLS-scoped
// client, same direct-Supabase-call pattern as scheduled-runs-list.tsx's
// cancel button — no dedicated API route needed since RLS already
// restricts both to the owning user.
export function AutomationActiveList({ automations }: { automations: UserAutomation[] }) {
  const t = useTranslations("dashboard.automation");
  const locale = useLocale();
  const router = useRouter();
  const supabase = createClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  // DEEP LINK FOR ?automation=<id> — V4.6 #11.3.
  //
  // WHAT THIS IS AND WHAT IT IS NOT. Every other surface Create Studio
  // creates into has something to OPEN — a detail panel, a project, a
  // document. An automation has no detail view at all: this list is the
  // whole of it, four lines and two controls per row. So the honest
  // equivalent of "open the thing you just made" here is to scroll to it
  // and mark it, and that is exactly what this does. Claiming a detail
  // route that does not exist would be the worse answer.
  //
  // The mark is left in place rather than timed out. A highlight that
  // fades is a highlight somebody who looked away has already missed,
  // and it survives to the next navigation either way.
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("automation");
    if (requested && automations.some((a) => a.id === requested)) setHighlightId(requested);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!highlightId) return;
    highlightRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightId]);

  if (automations.length === 0) return null;

  async function toggleActive(automation: UserAutomation) {
    if (busyId) return;
    setBusyId(automation.id);
    const { error } = await supabase
      .from("user_automations")
      .update({ is_active: !automation.is_active })
      .eq("id", automation.id);
    setBusyId(null);
    if (!error) {
      router.refresh();
    }
  }

  async function deleteAutomation(id: string) {
    if (busyId) return;
    if (!window.confirm(t("confirmDelete"))) return;
    setBusyId(id);
    const { error } = await supabase.from("user_automations").delete().eq("id", id);
    setBusyId(null);
    if (!error) {
      router.refresh();
    }
  }

  function frequencyLabel(automation: UserAutomation): string {
    if (automation.frequency === "daily") return t("frequencyDaily");
    if (automation.frequency === "weekly") return t("frequencyWeekly");
    return t("frequencyMonthly");
  }

  return (
    <div className="mb-6 rounded-2xl border border-border bg-panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <Repeat className="h-4 w-4 text-orange-400" aria-hidden="true" />
        <p className="text-sm font-semibold text-foreground">{t("activeSectionTitle")}</p>
      </div>
      <ul className="space-y-2">
        {automations.map((automation) => (
          <li
            key={automation.id}
            ref={automation.id === highlightId ? highlightRef : undefined}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
              automation.id === highlightId
                ? "border-orange-500 bg-orange-500/[0.07]"
                : "border-border bg-input"
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">{automation.description}</p>
              <p className="mt-0.5 text-[11px] text-muted">
                {frequencyLabel(automation)} · {t("nextRun", { date: formatDate(automation.next_run_at, locale) })}
              </p>
              <div className="mt-1">
                <SecurityCheckedBadge resourceType="automation" resourceId={automation.id} />
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={automation.is_active}
              aria-label={t("toggleActive")}
              title={t("toggleActive")}
              onClick={() => toggleActive(automation)}
              disabled={busyId === automation.id}
              className={`relative -my-2.5 inline-flex h-11 w-11 shrink-0 items-center rounded-full bg-clip-content py-2.5 transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
                automation.is_active ? "bg-orange-500" : "bg-panel-hover"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 ${
                  automation.is_active ? "translate-x-[22px]" : "translate-x-0.5"
                }`}
              />
            </button>
            <button
              type="button"
              onClick={() => deleteAutomation(automation.id)}
              disabled={busyId === automation.id}
              aria-label={t("deleteAutomation")}
              title={t("deleteAutomation")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
