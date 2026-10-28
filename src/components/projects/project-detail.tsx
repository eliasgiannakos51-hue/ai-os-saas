"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { MessageCircle, Wand2, X } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { MAX_GOAL_CHARS, MAX_NAME_CHARS, MAX_NOTES_CHARS, PROJECT_KIND_TABLES, PROJECT_STATUSES, isHexColour, projectKindCounts, type ProjectStatus } from "@/lib/projects/project";
import { LIBRARY_SOURCES } from "@/lib/library/sources";

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
  notes: string | null;
  status: ProjectStatus;
  primaryColour: string | null;
  secondaryColour: string | null;
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
const RESULT_TABLES = new Set([
  "ai_presentations",
  "generated_posts",
  "ai_websites",
  "ai_apps",
  "ai_images",
  "ai_videos",
  // What a flow makes (package 36).
  "user_websites",
  "generated_images",
  "research_reports",
  "data_analyses",
  // The owner's message 2026-10-22, point 6.
  "automation_flows",
  "code_sessions",
]);

/**
 * WHERE A MEMBER OPENS: in the tool that made it, at that row — the same
 * address the Library opens it at (lib/library/sources.ts hrefFor), and
 * the Image tool's own `?record=`. A row of a table with no such place
 * stays a line of text.
 */
function openHref(member: ProjectMemberView): string | null {
  if (member.table === "generated_images") return `/dashboard/images?record=${encodeURIComponent(member.id)}`;
  // THE "automation_flows" ROW OPENS AT THE EXACT ROW: `/dashboard/automation`
  // reads `?flow=` and verifies it is the caller's own before opening it
  // (added alongside this, same round) — the same `?record=`-shaped
  // contract every other result here has.
  if (member.table === "automation_flows") return `/dashboard/automation?flow=${encodeURIComponent(member.id)}`;
  // THE "code_sessions" ROW HAS NO SUCH READER YET. Today's separate
  // redesign of `/dashboard/coding` (the owner's critical message, same
  // day) rebuilt it around one running conversation with no
  // deep-link-by-id at all, for any caller — so this opens the tool, not
  // the specific session, which is honest about what the page can
  // actually do rather than a link that silently lands on nothing.
  if (member.table === "code_sessions") return "/dashboard/coding";
  const source = LIBRARY_SOURCES.find((s) => s.table === member.table);
  return source ? source.hrefFor(member.id) : null;
}

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
  const [savingColour, setSavingColour] = useState<"primaryColour" | "secondaryColour" | null>(null);
  const [colours, setColours] = useState({
    primaryColour: project.primaryColour,
    secondaryColour: project.secondaryColour,
  });
  // Κομμάτι 2 ("title + goal, hand-editable, persisting after refresh").
  // name/goal are the project's own, so this mirrors saveColour's
  // optimistic-update-then-revert shape exactly, not a new pattern.
  const [name, setName] = useState(project.name);
  const [goal, setGoal] = useState(project.goal ?? "");
  // Κομμάτι 4 («What Ionexa knows») — same shape as goal, one field
  // longer: free text, hand-written, saved on blur. The limit per field
  // (used only for the too_long toast; clampNotes on the server never
  // rejects, it truncates, same as clampGoal already does for goal).
  const [notes, setNotes] = useState(project.notes ?? "");
  const [savingText, setSavingText] = useState<"name" | "goal" | "notes" | null>(null);
  const TEXT_FIELD_LIMIT: Record<"name" | "goal" | "notes", number> = {
    name: MAX_NAME_CHARS,
    goal: MAX_GOAL_CHARS,
    notes: MAX_NOTES_CHARS,
  };

  function originalOf(field: "name" | "goal" | "notes"): string {
    if (field === "name") return project.name;
    if (field === "goal") return project.goal ?? "";
    return project.notes ?? "";
  }

  async function saveText(field: "name" | "goal" | "notes", value: string) {
    const original = originalOf(field);
    if (value === original) return; // nothing changed — no round trip
    setSavingText(field);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        const code = String(body?.error ?? "");
        addToast(
          code === "too_short"
            ? t("errors.tooShort")
            : code === "too_long"
              ? t("errors.tooLong", { limit: TEXT_FIELD_LIMIT[field] })
              : t("errors.failed"),
          "error"
        );
        if (field === "name") setName(original);
        else if (field === "goal") setGoal(original);
        else setNotes(original);
        return;
      }
      // THE SIDEBAR LIST ALSO SHOWS THE NAME (ProjectsShell's own rows),
      // a separate component with its own server-fetched props — a
      // renamed project only looks renamed there after this. The goal
      // and notes appear nowhere else on screen, so they skip the round
      // trip.
      if (field === "name") router.refresh();
    } catch {
      addToast(t("errors.failed"), "error");
      if (field === "name") setName(original);
      else if (field === "goal") setGoal(original);
      else setNotes(original);
    } finally {
      setSavingText(null);
    }
  }

  // Κομμάτι 3's own kind→label pairing. images/video/documents reuse the
  // EXACT words dashboard.myStuff.filters already uses for the same three
  // buckets — "ίδιοι αριθμοί με το My Stuff" doubled as "ίδιες λέξεις",
  // not a coincidence. site/posts have no My Stuff filter chip of their
  // own (My Stuff groups sites with apps), so they fall back to each
  // tool's own canonical name, already translated everywhere else.
  const KIND_LABEL_KEYS: Record<string, string> = {
    site: "dashboard.tools.names.site",
    posts: "dashboard.tools.names.posts",
    images: "dashboard.myStuff.filters.images",
    video: "dashboard.myStuff.filters.video",
    documents: "dashboard.myStuff.filters.documents",
  };
  const kindCounts = useMemo(() => projectKindCounts(members), [members]);

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

  async function saveColour(field: "primaryColour" | "secondaryColour", value: string) {
    if (savingColour) return;
    if (!isHexColour(value)) return;
    setSavingColour(field);
    setColours((c) => ({ ...c, [field]: value }));
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field === "primaryColour" ? "primaryColour" : "secondaryColour"]: value }),
      });
      if (!res.ok) {
        addToast(t("errors.failed"), "error");
        setColours((c) => ({ ...c, [field]: field === "primaryColour" ? project.primaryColour : project.secondaryColour }));
      }
    } catch {
      addToast(t("errors.failed"), "error");
    } finally {
      setSavingColour(null);
    }
  }

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
      {/* THE NAME, HAND-EDITABLE. An <input> styled as a heading, not a
          separate view/edit toggle — the same always-live shape as the
          colour pickers above and the create form in ProjectsShell,
          saved on blur (or Enter, which blurs) so a reload never catches
          an unsaved keystroke. */}
      <input
        data-testid="projects-detail-name"
        aria-label={t("form.name")}
        value={name}
        disabled={savingText === "name"}
        onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_CHARS))}
        onBlur={() => void saveText("name", name.trim())}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className="w-full min-w-0 rounded-item border border-transparent bg-transparent px-1 text-lg font-semibold text-foreground outline-none placeholder:text-muted hover:border-border focus:border-border disabled:opacity-50"
      />

      {/* Κομμάτι 3's own five count boxes — Site/Posts/Images/Video/
          Documents, one per PROJECT_KIND_TABLES entry above. Grid, not a
          row that could wrap: five equal boxes stay five equal boxes on
          a phone (narrower, never fewer per row — ProjectsShell's detail
          pane is full-width there already). */}
      <div className="grid grid-cols-5 gap-2" data-testid="project-kind-counts">
        {PROJECT_KIND_TABLES.map(({ kind }) => (
          <div key={kind} className="surface-tight text-center" data-testid={`project-kind-count-${kind}`}>
            <p className="text-lg font-semibold text-foreground">{kindCounts[kind]}</p>
            <p className="text-[11px] text-muted">{tKey(KIND_LABEL_KEYS[kind])}</p>
          </div>
        ))}
      </div>

      {/* GOAL + PROGRESS */}
      <div className="surface">
        <h2 className="text-sm font-semibold text-foreground">{t("sections.goal")}</h2>
        <textarea
          data-testid="projects-detail-goal"
          aria-label={t("form.goal")}
          value={goal}
          placeholder={t("noGoal")}
          rows={3}
          disabled={savingText === "goal"}
          onChange={(e) => setGoal(e.target.value.slice(0, MAX_GOAL_CHARS))}
          onBlur={() => void saveText("goal", goal.trim())}
          className="mt-1 w-full min-w-0 resize-y rounded-item border border-transparent bg-transparent px-1 py-0.5 text-sm text-muted outline-none placeholder:text-muted hover:border-border focus:border-border disabled:opacity-50"
        />
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
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-muted">
            {t("colours.primary")}
            <input
              type="color"
              value={colours.primaryColour ?? "#1d4ed8"}
              disabled={savingColour !== null}
              onChange={(e) => void saveColour("primaryColour", e.target.value)}
              aria-label={t("colours.primary")}
              className="h-8 w-8 cursor-pointer rounded-item border border-border bg-transparent p-0 disabled:opacity-50"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted">
            {t("colours.secondary")}
            <input
              type="color"
              value={colours.secondaryColour ?? "#dce2ee"}
              disabled={savingColour !== null}
              onChange={(e) => void saveColour("secondaryColour", e.target.value)}
              aria-label={t("colours.secondary")}
              className="h-8 w-8 cursor-pointer rounded-item border border-border bg-transparent p-0 disabled:opacity-50"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href={`/dashboard/chat?project=${encodeURIComponent(project.id)}`}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-item bg-button px-4 text-sm font-semibold text-button-ink hover:bg-button"
          >
            <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
            {t("startChat")}
          </Link>
          <Link
            href={`/dashboard/automation?projectId=${encodeURIComponent(project.id)}${project.goal ? `&said=${encodeURIComponent(project.goal)}` : ""}`}
            data-testid="project-automate-it"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-item border border-border px-4 text-sm font-semibold text-foreground hover:border-foreground/40"
          >
            <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t("automateIt.button")}
          </Link>
        </div>
        <p className="mt-1.5 text-[11px] text-muted">{t("chatFixed")}</p>
        <p className="mt-1 text-[11px] text-muted">{t("automateIt.hint")}</p>
      </div>

      {/* Κομμάτι 4 («What Ionexa knows») — hand-written, project-scoped
          memory. Same always-editable textarea shape as the Goal above
          (saveText's own third field), rendered as its own card so it
          reads as a distinct, named thing rather than a longer goal.
          lib/user-context.ts's loadProjectScope reads this column and
          buildUserContextPromptAddition* renders it into the prompt
          ONLY for a conversation/create/mission-plan/agent-build scoped
          to this project — nothing outside this project reads it. */}
      <div className="surface">
        <h2 className="text-sm font-semibold text-foreground">{t("notes.heading")}</h2>
        <textarea
          data-testid="projects-detail-notes"
          aria-label={t("notes.heading")}
          value={notes}
          placeholder={t("notes.placeholder")}
          rows={4}
          disabled={savingText === "notes"}
          onChange={(e) => setNotes(e.target.value.slice(0, MAX_NOTES_CHARS))}
          onBlur={() => void saveText("notes", notes.trim())}
          className="mt-1 w-full min-w-0 resize-y rounded-item border border-transparent bg-transparent px-1 py-0.5 text-sm text-muted outline-none placeholder:text-muted hover:border-border focus:border-border disabled:opacity-50"
        />
        <p className="mt-1.5 text-[11px] text-muted">{t("notes.hint")}</p>
      </div>

      {/* TASKS · FILES · AGENTS · RESULTS · ACTIVITY */}
      {sections.map((section) => (
        <section key={section.key} className="surface" aria-label={t(`sections.${section.key}`)}>
          <h2 className="text-sm font-semibold text-foreground">{t(`sections.${section.key}`)}</h2>
          {section.rows.length === 0 ? (
            <p className="mt-2 text-xs text-muted">{t("sections.empty")}</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {section.rows.map((member) => (
                <li key={`${member.table}:${member.id}`} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    {openHref(member) ? (
                      <Link href={openHref(member)!} data-testid="project-member-open" className="break-words text-sm text-foreground underline-offset-2 hover:underline">
                        {member.headline || t("untitled")}
                      </Link>
                    ) : (
                      <p className="break-words text-sm text-foreground">{member.headline || t("untitled")}</p>
                    )}
                    <p className="text-[11px] text-muted">{tKey(member.titleKey)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeMember(member)}
                    aria-label={t("removeMember")}
                    className="rounded-item p-2 text-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {/* Κομμάτι 5 ("Recent, τελευταία δουλειά, πατήσιμη") — this IS the
          "Activity" section below, not a second list: `members` is
          already sorted newest-first (load-project-detail.ts's own
          sort), so the ten it slices off the top already ARE the
          project's most recent work. What was missing was "πατήσιμη" —
          each row now opens through the SAME `openHref()` the Tasks/
          Files/Agents/Results sections above already use, falling back
          to plain text for a table openHref has no address for, exactly
          like those sections do. */}
      <section className="surface" aria-label={t("sections.activity")}>
        <h2 className="text-sm font-semibold text-foreground">{t("sections.activity")}</h2>
        {members.length === 0 ? (
          <p className="mt-2 text-xs text-muted">{t("sections.empty")}</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {members.slice(0, 10).map((member) => {
              const href = openHref(member);
              const line = (
                <>
                  {new Date(member.createdAt).toLocaleDateString(locale)} · {tKey(member.titleKey)} · {member.headline || t("untitled")}
                </>
              );
              return (
                <li key={`activity-${member.table}:${member.id}`} className="text-xs text-muted">
                  {href ? (
                    <Link href={href} data-testid="project-recent-open" className="underline-offset-2 hover:underline hover:text-foreground">
                      {line}
                    </Link>
                  ) : (
                    line
                  )}
                </li>
              );
            })}
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
