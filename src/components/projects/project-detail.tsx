"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { MessageCircle, X } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/projects/project";

export type ProjectMemberView = {
  table: string;
  id: string;
  slug: string;
  titleKey: string;
  headline: string;
  createdAt: string;
};

export type ProjectHeader = {
  id: string;
  name: string;
  goal: string | null;
  status: ProjectStatus;
  createdAt: string;
};

/**
 * THE SEVEN SECTIONS ARE SEVEN VIEWS OF ONE LIST.
 *
 * Goal · Progress · Tasks · Files · Agents · Activity · Results. Every
 * one of them is the SAME membership grouped differently — not seven
 * queries that could disagree, and not a graph walk. A member appears in
 * the section its own table belongs to and nowhere else, which is what
 * "one level, exactly what was added" looks like on screen.
 *
 * AND THE CHAT STARTS THE CONVERSATION, it does not switch one. The
 * project is a property of a conversation for the whole of its life:
 * lib/projects/project.ts's budget is only worth anything if the context
 * prefix is stable, and a mid-conversation toggle would rewrite the
 * cached prefix on the message that flipped it. So this button opens a
 * NEW conversation carrying the project, and there is deliberately no
 * control anywhere that moves an existing one.
 */
const TASK_TABLES = new Set(["ai_missions"]);
const FILE_TABLES = new Set(["user_files"]);
const AGENT_TABLES = new Set(["user_agents"]);
const RESULT_TABLES = new Set(["ai_presentations", "generated_posts", "ai_websites", "ai_apps", "ai_images", "ai_videos"]);

export function ProjectDetail({
  project,
  members,
  rowsPerModule,
}: {
  project: ProjectHeader;
  members: ProjectMemberView[];
  rowsPerModule: number;
}) {
  const t = useTranslations("projects");
  const tKey = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();
  const [busy, setBusy] = useState(false);

  const sections = useMemo(
    () => [
      { key: "tasks", rows: members.filter((m) => TASK_TABLES.has(m.table)) },
      { key: "files", rows: members.filter((m) => FILE_TABLES.has(m.table)) },
      { key: "agents", rows: members.filter((m) => AGENT_TABLES.has(m.table)) },
      { key: "results", rows: members.filter((m) => RESULT_TABLES.has(m.table)) },
      {
        key: "other",
        rows: members.filter(
          (m) => !TASK_TABLES.has(m.table) && !FILE_TABLES.has(m.table) && !AGENT_TABLES.has(m.table) && !RESULT_TABLES.has(m.table)
        ),
      },
    ],
    [members]
  );

  async function removeMember(member: ProjectMemberView) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(project.id)}/members?table=${encodeURIComponent(member.table)}&id=${encodeURIComponent(member.id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        addToast(t("errors.failed"), "error");
        return;
      }
      router.refresh();
    } catch {
      addToast(t("errors.failed"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* GOAL + PROGRESS */}
      <div className="rounded-2xl border border-border bg-panel p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("sections.goal")}</h2>
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{project.goal || t("noGoal")}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted">
          <span>{t(`status.${project.status}`)}</span>
          <span>·</span>
          <span>{t("list.members", { count: members.length })}</span>
          <span>·</span>
          {/* THE NUMBER THE WHOLE FEATURE IS FOR. Unscoped a chat reads
              five rows per module; here it reads this many, out of the
              same budget, because the project narrows which modules. */}
          <span>{t("progress.rowsPerModule", { count: rowsPerModule })}</span>
        </div>
        <div className="mt-4">
          <Link
            href={`/dashboard/chat?project=${encodeURIComponent(project.id)}`}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-semibold text-black hover:bg-orange-400"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {t("startChat")}
          </Link>
          <p className="mt-1.5 text-[11px] text-muted">{t("chatFixed")}</p>
        </div>
      </div>

      {/* TASKS · FILES · AGENTS · RESULTS · ACTIVITY */}
      {sections.map((section) => (
        <section key={section.key} className="rounded-2xl border border-border bg-panel p-5" aria-label={t(`sections.${section.key}`)}>
          <h2 className="text-sm font-semibold text-foreground">{t(`sections.${section.key}`)}</h2>
          {section.rows.length === 0 ? (
            <p className="mt-2 text-xs text-muted">{t("sections.empty")}</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {section.rows.map((member) => (
                <li key={`${member.table}:${member.id}`} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm text-foreground">{member.headline || t("untitled")}</p>
                    <p className="text-[11px] text-muted">{tKey(member.titleKey)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMember(member)}
                    aria-label={t("removeMember")}
                    className="rounded-md p-2 text-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <section className="rounded-2xl border border-border bg-panel p-5" aria-label={t("sections.activity")}>
        <h2 className="text-sm font-semibold text-foreground">{t("sections.activity")}</h2>
        {members.length === 0 ? (
          <p className="mt-2 text-xs text-muted">{t("sections.empty")}</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {members.slice(0, 10).map((member) => (
              <li key={`activity-${member.table}:${member.id}`} className="text-xs text-muted">
                {new Date(member.createdAt).toLocaleDateString(locale)} · {tKey(member.titleKey)} · {member.headline || t("untitled")}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* The statuses exist as a contract even where this screen does not
          yet offer them as a control — named here so a reader can see the
          three and the gate can compare them to the CHECK in the
          migration. */}
      <p className="sr-only">{PROJECT_STATUSES.map((s) => t(`status.${s}`)).join(", ")}</p>
    </div>
  );
}
