"use client";

import { useState, type FormEvent } from "react";
import { Download, Layout, Loader2, Sparkles, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatRelativeTime } from "@/lib/format-time";
import { useCredits } from "@/components/credits/credits-context";
import { useToast } from "@/components/toast/toast-context";
import { EmptyState } from "@/components/empty-state";
import type { UserWebsite } from "@/types/user-website";

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 2000;

function downloadHtml(website: UserWebsite) {
  const blob = new Blob([website.html_content], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${website.name || "website"}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

// Website Builder — real Claude generation (see api/websites/generate/route.ts
// + lib/website-builder.ts), saved to user_websites. All list/preview/
// generate/delete state lives here in one client component (same reasoning
// as chat-workspace.tsx: it's all one interaction, no benefit to splitting
// state across multiple components that'd just need to stay in sync).
export function WebsiteBuilderWorkspace({ initialWebsites }: { initialWebsites: UserWebsite[] }) {
  const t = useTranslations("dashboard.websiteBuilder");
  const supabase = createClient();
  const { refresh: refreshCredits } = useCredits();
  const { addToast } = useToast();

  const [websites, setWebsites] = useState<UserWebsite[]>(initialWebsites);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(initialWebsites[0]?.id ?? null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    if (!trimmedName || !trimmedDescription || generating) return;

    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/websites/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, description: trimmedDescription }),
      });
      const data = await res.json();
      void refreshCredits();

      if (!res.ok || !data.ok) {
        setError(getErrorMessage(data?.error, "Could not generate the website."));
        return;
      }
      if (!data.generated) {
        setError(data.message ?? "Could not generate the website.");
        return;
      }

      const record = data.record as UserWebsite;
      setWebsites((prev) => [record, ...prev]);
      setPreviewId(record.id);
      setName("");
      setDescription("");
      addToast(t("generated"));
    } catch {
      setError("Network error — please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    setDeletingId(id);
    const { error: deleteError } = await supabase.from("user_websites").delete().eq("id", id);
    setDeletingId(null);

    if (deleteError) {
      addToast(`✗ ${deleteError.message}`, "error");
      return;
    }

    setWebsites((prev) => prev.filter((w) => w.id !== id));
    setPreviewId((current) => (current === id ? null : current));
    addToast(t("deleted"));
  }

  const previewWebsite = websites.find((w) => w.id === previewId) ?? null;

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleGenerate}
        className="space-y-3 rounded-2xl border border-border bg-panel p-5"
      >
        <div>
          <label htmlFor="website-name" className="mb-1 block text-xs text-muted">
            {t("nameLabel")}
          </label>
          <input
            id="website-name"
            type="text"
            required
            maxLength={MAX_NAME_LENGTH}
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
            placeholder={t("namePlaceholder")}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="website-description" className="mb-1 block text-xs text-muted">
            {t("descriptionLabel")}
          </label>
          <textarea
            id="website-description"
            required
            maxLength={MAX_DESCRIPTION_LENGTH}
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
            placeholder={t("descriptionPlaceholder")}
            className="input min-h-24"
          />
        </div>

        {error && (
          <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={generating || !name.trim() || !description.trim()}
          className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          )}
          {generating ? t("generating") : t("generateButton")}
        </button>
      </form>

      {previewWebsite && (
        <div className="rounded-2xl border border-border bg-panel p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-semibold text-foreground">
              {previewWebsite.name}
            </p>
            <button
              type="button"
              onClick={() => downloadHtml(previewWebsite)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {t("downloadButton")}
            </button>
          </div>
          <iframe
            key={previewWebsite.id}
            srcDoc={previewWebsite.html_content}
            sandbox=""
            title={previewWebsite.name}
            className="mt-3 h-[500px] w-full rounded-xl border border-border bg-white"
          />
        </div>
      )}

      {websites.length === 0 ? (
        <EmptyState icon={Layout}>{t("emptyState")}</EmptyState>
      ) : (
        <ul className="space-y-2">
          {websites.map((website) => (
            <li
              key={website.id}
              className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 transition-colors duration-150 ${
                website.id === previewId
                  ? "border-orange-500/40 bg-orange-500/[0.03]"
                  : "border-border bg-input"
              }`}
            >
              <button
                type="button"
                onClick={() => setPreviewId(website.id)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm font-medium text-foreground">{website.name}</p>
                <p className="text-xs text-muted" title={new Date(website.created_at).toLocaleString()} suppressHydrationWarning>
                  {formatRelativeTime(website.created_at)}
                </p>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => downloadHtml(website)}
                  aria-label={t("downloadButton")}
                  title={t("downloadButton")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(website.id)}
                  disabled={deletingId === website.id}
                  aria-label={t("deleteButton")}
                  title={t("deleteButton")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-red-950/40 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
