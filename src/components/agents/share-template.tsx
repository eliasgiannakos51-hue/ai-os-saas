"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Share2, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  anonymiseTaskPrompt,
  SHARE_REFUSAL_REASONS,
  TEMPLATE_SLOT,
  TEMPLATE_LIMITS,
} from "@/lib/agents/agent-templates";

/**
 * OPT-IN SHARING, with the published text on screen before you agree.
 *
 * Collapsed by default and never pre-ticked: nothing here happens unless
 * somebody opens it, types the words that are theirs, and presses the
 * button. That is the "opt-in at create" requirement — an explicit act,
 * not a checkbox somebody scrolls past.
 *
 * THE PREVIEW IS THE POINT. anonymiseTaskPrompt runs in the browser as
 * the user types, so the exact sentence that would be published — with
 * their subject already replaced by {subject} — is visible BEFORE they
 * share it. The server runs the same function again on the way in,
 * because a check in a component is a convenience and never a boundary.
 */
export function ShareTemplate({ agentId, prompt }: { agentId: string; prompt: string }) {
  const t = useTranslations("dashboard.agents.share");
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState(false);

  const preview = useMemo(() => anonymiseTaskPrompt(prompt, subject), [prompt, subject]);

  async function share() {
    setBusy(true);
    try {
      const response = await fetch("/api/agents/templates/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, subject, title, description }),
      });
      const data = await response.json();
      if (!data.ok) {
        // TRANSLATED FROM THE CODE, not from the server's English. The
        // refusal is the sentence that tells somebody how to fix their
        // share, so it is the one that most needs to be in their own
        // language. The server's prose is the fallback for a code this
        // build does not know.
        const code = typeof data.code === "string" ? data.code : "";
        const known = (SHARE_REFUSAL_REASONS as readonly string[]).includes(code);
        addToast(known ? t(`refused.${code}`) : (data.error ?? t("failed")), "error");
        return;
      }
      setShared(true);
      addToast(t("shared"));
    } catch (err) {
      addToast(getErrorMessage(err, t("failed")), "error");
    } finally {
      setBusy(false);
    }
  }

  if (shared) {
    return (
      <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.05] p-3 text-xs text-emerald-300">
        {t("shared")}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-muted transition-colors hover:text-foreground"
      >
        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
        {t("open")}
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <p className="flex items-center gap-2 text-xs font-medium text-foreground">
        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
        {t("title")}
      </p>
      <p className="text-[11px] leading-relaxed text-muted">{t("explainer")}</p>

      <label className="block text-[11px] text-muted" htmlFor="share-subject">
        {t("subjectLabel")}
      </label>
      <input
        id="share-subject"
        className="input"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder={t("subjectPlaceholder")}
      />

      <label className="block text-[11px] text-muted" htmlFor="share-title">
        {t("titleLabel")}
      </label>
      <input
        id="share-title"
        className="input"
        maxLength={TEMPLATE_LIMITS.title}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <label className="block text-[11px] text-muted" htmlFor="share-description">
        {t("descriptionLabel")}
      </label>
      <input
        id="share-description"
        className="input"
        maxLength={TEMPLATE_LIMITS.description}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      {/* EXACTLY WHAT WOULD BE PUBLISHED, before agreeing to publish it. */}
      <div className="rounded-lg bg-black/20 p-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-muted">{t("previewLabel")}</p>
        {preview.ok ? (
          <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-foreground">
            {preview.pattern}
          </p>
        ) : (
          <p className="text-[11px] leading-relaxed text-amber-300">
            {t(`refused.${preview.reason}`)}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void share()}
          disabled={busy || !preview.ok || title.trim().length < 3 || description.trim().length < 3}
          className="min-h-[36px] rounded-lg bg-orange-500 px-3 text-xs font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? t("sharing") : t("shareButton")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-[36px] rounded-lg border border-border px-3 text-xs text-muted transition-colors hover:text-foreground"
        >
          {t("cancel")}
        </button>
      </div>
      <p className="text-[10px] leading-relaxed text-muted">
        {t("slotNote", { slot: TEMPLATE_SLOT })}
      </p>
    </div>
  );
}
