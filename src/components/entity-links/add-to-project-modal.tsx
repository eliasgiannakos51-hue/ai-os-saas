"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FolderPlus, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/toast-context";
import { MAX_NAME_CHARS } from "@/lib/projects/project";

type ProjectOption = { id: string; name: string };

/**
 * THE PICKER: existing projects, or a new one — and then the one write
 * that matters, `/api/projects/{id}/members`.
 *
 * READS ITS OWN LIST THE WAY `LinkToModal` reads its search results: a
 * plain client-side Supabase call, RLS-scoped to the signed-in account,
 * no dedicated route needed because listing one's own projects carries no
 * credit cost or plan gate (the create below does, and goes through the
 * existing `/api/projects` route, which already enforces it).
 *
 * CREATING AND ADDING IS TWO REQUESTS, NOT A THIRD ROUTE: POST
 * `/api/projects` (the existing create, with its existing plan cap), then
 * POST `/api/projects/{id}/members` with the id it returns — exactly the
 * two calls a person would make by hand if the picker did not exist, so
 * there is nothing this modal can do that the two routes do not already
 * allow or refuse on their own.
 */
export function AddToProjectModal({
  open,
  onClose,
  sourceTable,
  sourceId,
  sourceHeadline,
}: {
  open: boolean;
  onClose: () => void;
  sourceTable: string;
  sourceId: string;
  sourceHeadline: string;
}) {
  const t = useTranslations("projects.addToProject");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { addToast } = useToast();
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [newName, setNewName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      setNewName("");
      setBusyId(null);
      setCreating(false);
      return;
    }
    let cancelled = false;
    setLoadError(false);
    const supabase = createClient();
    supabase
      .from("projects")
      .select("id, name")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setLoadError(true);
          setProjects([]);
          return;
        }
        setProjects((data ?? []).map((row) => ({ id: String(row.id), name: String(row.name ?? "") })));
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function addTo(projectId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table: sourceTable, id: sourceId }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function pickExisting(project: ProjectOption) {
    if (busyId || creating) return;
    setBusyId(project.id);
    const ok = await addTo(project.id);
    setBusyId(null);
    if (!ok) {
      addToast(t("failed"), "error");
      return;
    }
    addToast(t("added", { name: project.name || t("untitledProject") }));
    onClose();
    router.refresh();
  }

  async function createAndAdd() {
    const name = newName.trim();
    if (!name || creating || busyId) return;
    setCreating(true);
    try {
      const createRes = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const createBody = await createRes.json().catch(() => null);
      if (!createRes.ok || !createBody?.ok || !createBody?.project?.id) {
        addToast(
          createBody?.error === "project_limit_reached" ? t("limitReached") : t("failed"),
          "error"
        );
        return;
      }
      const ok = await addTo(String(createBody.project.id));
      if (!ok) {
        addToast(t("failed"), "error");
        return;
      }
      addToast(t("added", { name }));
      onClose();
      router.refresh();
    } catch {
      addToast(t("failed"), "error");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center px-4 pb-4 sm:items-center sm:pb-0">
      <div onClick={onClose} className="fixed inset-0 bg-background/60 backdrop-blur-sm" aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${t("title")}: ${sourceHeadline}`}
        className="modal-surface relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden"
      >
        <div className="modal-header flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-card bg-foreground/10 text-foreground"
              aria-hidden="true"
            >
              <FolderPlus className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="break-words text-sm font-semibold text-foreground">{t("title")}</h2>
              <p className="break-words text-xs text-muted">{sourceHeadline}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tCommon("close")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {projects === null ? (
            <p className="text-xs text-muted">{t("loading")}</p>
          ) : (
            <>
              {loadError && <p className="mb-3 text-xs text-danger">{t("failed")}</p>}
              {projects.length === 0 && !loadError ? (
                <p className="mb-3 text-xs text-muted">{t("empty")}</p>
              ) : (
                <div className="space-y-1.5" data-testid="add-to-project-list">
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => void pickExisting(project)}
                      disabled={busyId === project.id || creating}
                      className="block w-full rounded-item border border-border bg-input px-3 py-2 text-start text-sm text-foreground transition-colors duration-150 hover:border-foreground/60 hover:text-foreground disabled:opacity-50"
                    >
                      {project.name || t("untitledProject")}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-4 border-t border-border pt-4">
                <label htmlFor="add-to-project-new-name" className="text-xs font-semibold text-foreground">
                  {t("newProject")}
                </label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    id="add-to-project-new-name"
                    value={newName}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setNewName(e.target.value.slice(0, MAX_NAME_CHARS))}
                    placeholder={t("newProjectPlaceholder")}
                    className="input flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => void createAndAdd()}
                    disabled={!newName.trim() || creating || busyId !== null}
                    data-testid="add-to-project-create"
                    className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-item bg-button px-3 text-xs font-semibold text-button-ink hover:bg-button disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    {t("create")}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
