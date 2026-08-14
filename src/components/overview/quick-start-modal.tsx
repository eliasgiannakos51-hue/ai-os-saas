"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Rocket, Check } from "lucide-react";
import { WORKSPACE_TEMPLATES } from "@/lib/workspace-templates";
import { useToast } from "@/components/toast/toast-context";
import { getErrorMessage } from "@/lib/get-error-message";
import { useTranslations } from "next-intl";

export function QuickStartModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { addToast } = useToast();
  const t = useTranslations("dashboard.overview");
  const tCommon = useTranslations("common");
  const [applyingId, setApplyingId] = useState<string | null>(null);

  async function apply(templateId: string) {
    setApplyingId(templateId);
    try {
      const res = await fetch("/api/templates/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        addToast(`✗ ${getErrorMessage(data?.error, "Could not apply template.")}`, "error");
        return;
      }

      addToast(`✓ added ${data.appliedCount} example ${data.appliedCount === 1 ? "entry" : "entries"}`);
      onClose();
      router.refresh();
    } catch {
      addToast(tCommon("networkError"), "error");
    } finally {
      setApplyingId(null);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div onClick={onClose} className="fixed inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("quickStartTemplates")}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-panel shadow-[0_0_0_1px_rgba(249,115,22,0.05)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
              <Rocket className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Quick Start</h2>
              <p className="text-xs text-muted">
                Add a few example entries so you can see what a filled-in workspace looks like.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tCommon("close")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-3">
          {WORKSPACE_TEMPLATES.map((template) => (
            <div
              key={template.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-input p-3.5 transition-colors duration-150 hover:border-orange-500/30"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{template.name}</p>
                <p className="mt-0.5 text-xs text-muted">{template.description}</p>
              </div>
              <button
                type="button"
                onClick={() => apply(template.id)}
                disabled={applyingId !== null}
                className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {applyingId === template.id ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Add
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
