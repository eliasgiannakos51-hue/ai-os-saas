"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { HelpTip } from "@/components/ui/help-tip";
import { useToast } from "@/components/toast/toast-context";
import { MAX_GOAL_CHARS, MAX_NAME_CHARS, type ProjectStatus } from "@/lib/projects/project";
import { ProjectDetail, type ProjectHeader, type ProjectMemberView } from "@/components/projects/project-detail";

export type ProjectRow = {
  id: string;
  name: string;
  goal: string | null;
  status: ProjectStatus;
  createdAt: string;
  /** Edges, which IS the membership: one level, exactly what was added. */
  memberCount: number;
};

export type ProjectDetailData = {
  header: ProjectHeader;
  members: ProjectMemberView[];
  rowsPerModule: number;
};

/**
 * «2. PROJECTS: ΝΕΑ ΟΘΟΝΗ» Κομμάτι 1 — THE LAYOUT: the list on the left,
 * the selected project's detail on the right, one screen. Replaces
 * projects-workspace.tsx (gone — its create form and its list are both
 * folded in here) and the flow-shell.tsx this route used to mount.
 *
 * SELECTION IS THE URL, NOT LOCAL STATE: ?id= is what the server reads to
 * decide which detail to fetch (member headlines need per-table queries
 * only the server can run), so a row here is a <Link>, not an onClick —
 * the same project opens the same way for a fresh visit, a bookmark, or
 * meetings-workspace.tsx's old-style href. Next's own router makes that
 * feel like a selection, not a page load.
 *
 * ON A PHONE the list and the detail are never both on screen at once —
 * mirrors my-stuff-workspace.tsx's own choice for the identical reason:
 * there is no room for a second column at 390px, so a selected project
 * covers the list instead of squeezing beside it, with a back arrow
 * (?id= cleared) rather than a column that reappears on its own.
 */
export function ProjectsShell({
  projects,
  selectedId,
  detail,
  initialGoal,
}: {
  projects: ProjectRow[];
  selectedId: string | null;
  detail: ProjectDetailData | null;
  initialGoal?: string;
}) {
  const t = useTranslations("projects");
  const router = useRouter();
  const { addToast } = useToast();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState(initialGoal ?? "");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, goal }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        const code = String(body?.error ?? "");
        const limitReached = code === "project_limit_reached";
        addToast(
          limitReached
            ? t("errors.limitReached", { limit: Number(body?.limit ?? 0) })
            : code === "too_short"
              ? t("errors.tooShort")
              : code === "too_long"
                ? t("errors.tooLong", { limit: MAX_NAME_CHARS })
                : t("errors.failed"),
          "error"
        );
        return;
      }
      setName("");
      setGoal("");
      const newId = String(body.project?.id ?? "");
      router.push(newId ? `/dashboard/projects?id=${encodeURIComponent(newId)}` : "/dashboard/projects");
    } catch {
      addToast(t("errors.failed"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm(t("deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/projects?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        addToast(t("errors.failed"), "error");
        return;
      }
      if (id === selectedId) router.push("/dashboard/projects");
      else router.refresh();
    } catch {
      addToast(t("errors.failed"), "error");
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden" data-testid="projects-shell">
      <div className="flex items-center gap-2 px-4 py-2">
        <h1 className="min-w-0 break-words text-sm font-semibold text-foreground">{t("title")}</h1>
        <HelpTip helpKey="help.projects" />
      </div>
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* LIST: full width on a phone, 360px on a computer. Hidden on a
            phone once a project is selected. */}
        <div
          className={`h-full min-h-0 w-full shrink-0 overflow-y-auto border-e border-divider lg:w-[360px] ${selectedId ? "hidden lg:block" : ""}`}
          data-testid="projects-list-pane"
        >
          <div className="border-b border-divider p-3">
            <label htmlFor="project-name" className="text-sm font-semibold text-foreground">
              {t("form.name")}
            </label>
            <input
              id="project-name"
              data-testid="projects-new-name"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_CHARS))}
              placeholder={t("form.namePlaceholder")}
              className="mt-2 min-h-[44px] w-full rounded-card border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/40"
            />
            <label htmlFor="project-goal" className="mt-3 block text-sm font-semibold text-foreground">
              {t("form.goal")}
            </label>
            <textarea
              id="project-goal"
              data-testid="projects-new-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value.slice(0, MAX_GOAL_CHARS))}
              placeholder={t("form.goalPlaceholder")}
              rows={2}
              className="mt-2 w-full rounded-card border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-foreground/40"
            />
            <div className="mt-3">
              <button
                type="button"
                data-testid="projects-new-create"
                onClick={create}
                disabled={!name.trim() || busy}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-item bg-button px-4 text-sm font-semibold text-button-ink hover:bg-button disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {t("form.create")}
              </button>
            </div>
          </div>

          <ul className="divide-y divide-border" aria-label={t("list.title")} data-testid="projects-list">
            {projects.length === 0 ? (
              <li className="p-3 text-xs text-muted">{t("list.empty")}</li>
            ) : (
              projects.map((project) => (
                <li key={project.id} data-testid="projects-list-item" className="flex items-center gap-1 px-3">
                  <Link
                    href={`/dashboard/projects?id=${encodeURIComponent(project.id)}`}
                    data-testid="projects-list-row"
                    aria-current={project.id === selectedId ? "true" : undefined}
                    className={`min-w-0 flex-1 rounded-item px-2 py-2 ${project.id === selectedId ? "bg-panel-hover" : "hover:bg-panel-hover"}`}
                  >
                    <p className="break-words text-sm text-foreground">{project.name}</p>
                    <p className="text-[11px] text-muted">
                      {t(`status.${project.status}`)}
                      {" · "}
                      {t("list.members", { count: project.memberCount })}
                    </p>
                  </Link>
                  <button
                    type="button"
                    onClick={() => remove(project.id)}
                    aria-label={t("delete")}
                    data-testid="projects-list-delete"
                    className="shrink-0 rounded-item p-2 text-muted hover:text-foreground"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* DETAIL: the rest of the width on a computer; on a phone, only
            drawn once a project is selected, full-screen with a back arrow. */}
        <div className={`h-full min-h-0 flex-1 overflow-y-auto ${selectedId ? "" : "hidden lg:block"}`} data-testid="projects-detail-pane">
          {selectedId && (
            <Link
              href="/dashboard/projects"
              aria-label={t("back")}
              data-testid="projects-detail-back"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-item text-muted hover:bg-panel-hover hover:text-foreground lg:hidden"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
          <div className="mx-auto w-full max-w-5xl px-4 py-6">
            {detail ? (
              <>
                <h1 className="mb-4 text-lg font-semibold text-foreground" data-testid="projects-detail-name">
                  {detail.header.name}
                </h1>
                <ProjectDetail project={detail.header} members={detail.members} rowsPerModule={detail.rowsPerModule} />
              </>
            ) : projects.length > 0 ? (
              <div className="surface" data-testid="projects-select-prompt">
                <h2 className="text-sm font-semibold text-foreground">{t("selectPrompt")}</h2>
              </div>
            ) : (
              <div className="surface" data-testid="projects-empty-state">
                <h2 className="text-sm font-semibold text-foreground">{t("empty.title")}</h2>
                <p className="mt-2 text-xs text-muted">{t("empty.description")}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
