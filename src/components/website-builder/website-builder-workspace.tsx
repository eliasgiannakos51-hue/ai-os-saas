"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Download, History, Image as ImageIcon, Layout, Loader2, Sparkles, Trash2, Wand2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatRelativeTime } from "@/lib/format-time";
import { useCredits } from "@/components/credits/credits-context";
import { useToast } from "@/components/toast/toast-context";
import { EmptyState } from "@/components/empty-state";
import { useSortAndPaginate } from "@/lib/use-sort-and-paginate";
import { PaginationControls } from "@/components/pagination-controls";
import {
  ACCEPTED_REFERENCE_IMAGE_TYPES,
  buildReferenceImagePath,
  MAX_REFERENCE_IMAGE_BYTES,
  REFERENCE_IMAGE_BUCKET,
} from "@/lib/website-reference-image";
import type { UserWebsite, WebsiteVersion } from "@/types/user-website";

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_CHANGE_REQUEST_LENGTH = 1000;

// Thumbnail preview for each list row — a real, live scaled-down render
// of the site's own html_content (not a fake icon), so visually distinct
// sites are actually recognizable at a glance without opening each one.
// Renders the iframe at a normal desktop viewport size, then scales the
// whole thing down with a CSS transform — the standard no-server-render
// way to get a thumbnail from HTML the browser can already render itself.
const THUMB_SOURCE_WIDTH = 1280;
const THUMB_SOURCE_HEIGHT = 800;
const THUMB_DISPLAY_WIDTH = 56;
const THUMB_DISPLAY_HEIGHT = 40;
const THUMB_SCALE = THUMB_DISPLAY_WIDTH / THUMB_SOURCE_WIDTH;

function WebsiteThumbnail({ website }: { website: UserWebsite }) {
  return (
    <div
      className="shrink-0 overflow-hidden rounded-md border border-border bg-white"
      style={{ width: THUMB_DISPLAY_WIDTH, height: THUMB_DISPLAY_HEIGHT }}
      aria-hidden="true"
    >
      <iframe
        srcDoc={website.html_content}
        sandbox=""
        tabIndex={-1}
        title=""
        style={{
          width: THUMB_SOURCE_WIDTH,
          height: THUMB_SOURCE_HEIGHT,
          transform: `scale(${THUMB_SCALE})`,
          transformOrigin: "top left",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

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

  // Optional reference image (logo/product photo/screenshot) — uploaded to
  // Supabase Storage right before generation, then sent to Claude's vision
  // input (see api/websites/generate/route.ts). Never embedded into the
  // generated HTML itself — only informs color palette/style.
  const [referenceImageFile, setReferenceImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Post-generation editing — a second, separate AI call that takes the
  // website's existing html_content as context (see api/websites/edit)
  // instead of generating from scratch.
  const [editText, setEditText] = useState("");
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Version history — lazy-loaded per website (only fetched once "History"
  // is opened for a given site), keyed by website_id.
  const [versionsByWebsite, setVersionsByWebsite] = useState<Record<string, WebsiteVersion[]>>({});
  const [loadingVersionsFor, setLoadingVersionsFor] = useState<string | null>(null);
  const [historyOpenFor, setHistoryOpenFor] = useState<string | null>(null);
  const [viewingVersion, setViewingVersion] = useState<WebsiteVersion | null>(null);

  function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = ""; // allow re-selecting the same file after removing it
    if (!file) return;

    if (!ACCEPTED_REFERENCE_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_REFERENCE_IMAGE_TYPES)[number])) {
      setImageError(t("imageInvalidType"));
      return;
    }
    if (file.size > MAX_REFERENCE_IMAGE_BYTES) {
      setImageError(t("imageTooLarge"));
      return;
    }
    setImageError(null);
    setReferenceImageFile(file);
  }

  function removeReferenceImage() {
    setReferenceImageFile(null);
    setImageError(null);
  }

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    if (!trimmedName || !trimmedDescription || generating) return;

    setGenerating(true);
    setError(null);
    try {
      let referenceImagePath: string | null = null;
      if (referenceImageFile) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setError("Not authenticated.");
          return;
        }
        const path = buildReferenceImagePath(user.id, referenceImageFile.name);
        const { error: uploadError } = await supabase.storage
          .from(REFERENCE_IMAGE_BUCKET)
          .upload(path, referenceImageFile, { contentType: referenceImageFile.type });
        if (uploadError) {
          setError(getErrorMessage(uploadError, "Could not upload the reference image."));
          return;
        }
        referenceImagePath = path;
      }

      const res = await fetch("/api/websites/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, description: trimmedDescription, referenceImagePath }),
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
      setReferenceImageFile(null);
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
    setVersionsByWebsite((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    addToast(t("deleted"));
  }

  function selectWebsite(id: string) {
    setPreviewId(id);
    setHistoryOpenFor(null);
    setViewingVersion(null);
    setEditText("");
    setEditError(null);
  }

  async function handleEdit(e: FormEvent) {
    e.preventDefault();
    const websiteId = previewId;
    const trimmedChangeRequest = editText.trim();
    if (!websiteId || !trimmedChangeRequest || editing) return;

    setEditing(true);
    setEditError(null);
    try {
      const res = await fetch("/api/websites/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteId, changeRequest: trimmedChangeRequest }),
      });
      const data = await res.json();
      void refreshCredits();

      if (!res.ok || !data.ok) {
        setEditError(getErrorMessage(data?.error, "Could not apply that change."));
        return;
      }
      if (!data.edited) {
        setEditError(data.message ?? "Could not apply that change.");
        return;
      }

      const record = data.record as UserWebsite;
      setWebsites((prev) => prev.map((w) => (w.id === record.id ? record : w)));
      setEditText("");
      setViewingVersion(null);
      // The new version is now newer than whatever's cached — drop it so
      // the next "History" open re-fetches instead of showing stale data.
      setVersionsByWebsite((prev) => {
        const next = { ...prev };
        delete next[record.id];
        return next;
      });
      addToast(t("editApplied"));
    } catch {
      setEditError("Network error — please try again.");
    } finally {
      setEditing(false);
    }
  }

  async function toggleHistory(websiteId: string) {
    if (historyOpenFor === websiteId) {
      setHistoryOpenFor(null);
      return;
    }
    setHistoryOpenFor(websiteId);
    setViewingVersion(null);
    if (versionsByWebsite[websiteId] || loadingVersionsFor === websiteId) return;

    setLoadingVersionsFor(websiteId);
    const { data, error: versionsError } = await supabase
      .from("website_versions")
      .select("*")
      .eq("website_id", websiteId)
      .order("version_number", { ascending: false });
    setLoadingVersionsFor(null);

    if (versionsError) {
      addToast(`✗ ${versionsError.message}`, "error");
      return;
    }
    setVersionsByWebsite((prev) => ({ ...prev, [websiteId]: (data as WebsiteVersion[]) ?? [] }));
  }

  const previewWebsite = websites.find((w) => w.id === previewId) ?? null;
  const activeVersions = previewWebsite ? versionsByWebsite[previewWebsite.id] : undefined;
  const displayedHtml = viewingVersion?.html_content ?? previewWebsite?.html_content ?? "";

  // Pagination — same shared pattern/page size as every module list
  // (lib/use-sort-and-paginate.ts), so a user with 10+ generated sites
  // gets a bounded, navigable list instead of an ever-growing one.
  const { page, setPage, totalPages, paginated: paginatedWebsites } = useSortAndPaginate(
    websites,
    websites.length
  );

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

        <div>
          <label htmlFor="website-reference-image" className="mb-1 block text-xs text-muted">
            {t("imageLabel")}
          </label>
          {referenceImageFile ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-input px-3 py-2">
              <ImageIcon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{referenceImageFile.name}</span>
              <button
                type="button"
                onClick={removeReferenceImage}
                aria-label={t("imageRemove")}
                title={t("imageRemove")}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <input
              id="website-reference-image"
              ref={imageInputRef}
              type="file"
              accept={ACCEPTED_REFERENCE_IMAGE_TYPES.join(",")}
              onChange={handleImageChange}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-border file:bg-input file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-foreground hover:file:border-orange-500 hover:file:text-orange-400"
            />
          )}
          <p className="mt-1 text-[11px] text-muted">{t("imageHelp")}</p>
          {imageError && <p className="mt-1 text-[11px] text-red-400">{imageError}</p>}
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
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => toggleHistory(previewWebsite.id)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400"
              >
                <History className="h-3.5 w-3.5" aria-hidden="true" />
                {t("historyButton")}
              </button>
              <button
                type="button"
                onClick={() => downloadHtml(previewWebsite)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                {t("downloadButton")}
              </button>
            </div>
          </div>

          {historyOpenFor === previewWebsite.id && (
            <div className="mt-3 rounded-xl border border-border bg-input p-3">
              {loadingVersionsFor === previewWebsite.id ? (
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  {t("historyLoading")}
                </p>
              ) : !activeVersions || activeVersions.length === 0 ? (
                <p className="text-xs text-muted">{t("historyEmpty")}</p>
              ) : (
                <ul className="space-y-1.5">
                  {activeVersions.map((version) => (
                    <li key={version.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setViewingVersion((current) => (current?.id === version.id ? null : version))
                        }
                        className={`w-full rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors duration-150 ${
                          viewingVersion?.id === version.id
                            ? "border-orange-500/40 bg-orange-500/[0.03] text-foreground"
                            : "border-transparent text-muted hover:bg-panel-hover"
                        }`}
                      >
                        <span className="font-medium text-foreground">
                          {t("versionLabel", { number: version.version_number })}
                        </span>
                        {" — "}
                        {version.change_description ?? t("versionOriginal")}
                        <span className="ml-1.5 text-muted" title={new Date(version.created_at).toLocaleString()} suppressHydrationWarning>
                          ({formatRelativeTime(version.created_at)})
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {viewingVersion && (
            <p className="mt-3 rounded-lg border border-orange-800 bg-orange-950/20 px-3 py-2 text-xs text-orange-300">
              {t("viewingOldVersion", { number: viewingVersion.version_number })}{" "}
              <button
                type="button"
                onClick={() => setViewingVersion(null)}
                className="font-semibold underline hover:no-underline"
              >
                {t("backToLatest")}
              </button>
            </p>
          )}

          <iframe
            key={`${previewWebsite.id}:${viewingVersion?.id ?? "latest"}`}
            srcDoc={displayedHtml}
            sandbox=""
            title={previewWebsite.name}
            className="mt-3 h-[500px] w-full rounded-xl border border-border bg-white"
          />

          {!viewingVersion && (
            <form onSubmit={handleEdit} className="mt-4 space-y-2 border-t border-border pt-4">
              <label htmlFor="website-edit" className="block text-xs text-muted">
                {t("editLabel")}
              </label>
              <textarea
                id="website-edit"
                maxLength={MAX_CHANGE_REQUEST_LENGTH}
                value={editText}
                onChange={(e) => setEditText(e.target.value.slice(0, MAX_CHANGE_REQUEST_LENGTH))}
                placeholder={t("editPlaceholder")}
                className="input min-h-16"
              />
              {editError && (
                <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
                  {editError}
                </p>
              )}
              <button
                type="submit"
                disabled={editing || !editText.trim()}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors duration-150 hover:border-orange-500 hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
              >
                {editing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {editing ? t("editApplying") : t("editButton")}
              </button>
            </form>
          )}
        </div>
      )}

      {websites.length === 0 ? (
        <EmptyState icon={Layout}>{t("emptyState")}</EmptyState>
      ) : (
        <>
          <ul className="space-y-2">
            {paginatedWebsites.map((website) => (
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
                  onClick={() => selectWebsite(website.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <WebsiteThumbnail website={website} />
                  <span className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{website.name}</p>
                    <p className="text-xs text-muted" title={new Date(website.created_at).toLocaleString()} suppressHydrationWarning>
                      {formatRelativeTime(website.created_at)}
                    </p>
                  </span>
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
          <PaginationControls page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
