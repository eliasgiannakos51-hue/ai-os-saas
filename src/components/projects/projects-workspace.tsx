"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { MAX_GOAL_CHARS, MAX_NAME_CHARS, type ProjectStatus } from "@/lib/projects/project";

export type ProjectRow = {
  id: string;
  name: string;
  goal: string | null;
  status: ProjectStatus;
  createdAt: string;
  /** Edges, which IS the membership: one level, exactly what was added. */
  memberCount: number;
};

/**
 * THE FOLDERS, AND WHAT DELETING ONE DOES.
 *
 * The confirmation says it in words rather than leaving it to be
 * discovered: the project goes, the things in it stay. That is what the
 * database does (the prune_project_links trigger removes the membership
 * edges and nothing else), and a person deciding whether to press Delete
 * should not have to take the schema's word for it.
 */
export function ProjectsWorkspace({ projects }: { projects: ProjectRow[] }) {
  const t = useTranslations("projects");
  const router = useRouter();
  const { addToast } = useToast();
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
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
        addToast(code === "too_short" ? t("errors.tooShort") : code === "too_long" ? t("errors.tooLong", { limit: MAX_NAME_CHARS }) : t("errors.failed"), "error");
        return;
      }
      setName("");
      setGoal("");
      router.refresh();
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
      router.refresh();
    } catch {
      addToast(t("errors.failed"), "error");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-panel p-5">
        <label htmlFor="project-name" className="text-sm font-semibold text-foreground">
          {t("form.name")}
        </label>
        <input
          id="project-name"
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_CHARS))}
          placeholder={t("form.namePlaceholder")}
          className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-orange-500/40"
        />
        <label htmlFor="project-goal" className="mt-3 block text-sm font-semibold text-foreground">
          {t("form.goal")}
        </label>
        <textarea
          id="project-goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value.slice(0, MAX_GOAL_CHARS))}
          placeholder={t("form.goalPlaceholder")}
          rows={2}
          className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-orange-500/40"
        />
        <div className="mt-4">
          <button
            type="button"
            onClick={create}
            disabled={!name.trim() || busy}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t("form.create")}
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-panel p-5" aria-label={t("list.title")}>
        <h2 className="text-sm font-semibold text-foreground">{t("list.title")}</h2>
        {projects.length === 0 ? (
          <p className="mt-2 text-xs text-muted">{t("list.empty")}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {projects.map((project) => (
              <li key={project.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/dashboard/projects/${project.id}`} className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-sm text-foreground">{project.name}</p>
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
                  className="rounded-md p-2 text-muted hover:text-foreground"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
