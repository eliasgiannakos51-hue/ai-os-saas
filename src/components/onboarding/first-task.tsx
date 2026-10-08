"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, FileSpreadsheet, ListChecks, Lightbulb, PenLine } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { GreetingHeader } from "@/components/overview/greeting-header";
import { FIRST_TASKS, firstTaskHref, goalFor, type FirstTaskId } from "@/lib/onboarding/first-tasks";
import { MAX_EXAMPLE_CHARS } from "@/lib/overview/first-screen-examples";

/**
 * THE FIRST SCREEN A NEW ACCOUNT MEETS (MASTER 16, package 39), behind the
 * switch "first-task", on /onboarding.
 *
 * Three tasks, each a whole sentence and one press: the press records
 * which one began the account and opens Chat with it already sent, so the
 * first thing a new person sees after it is an answer
 * (lib/onboarding/first-tasks.ts says why each finishes on the Free
 * plan). Their own sentence goes the same way. The data import that used
 * to be this screen is one press away, unchanged, and «Παράλειψη» goes to
 * Home as it always did.
 */
const ICON: Record<FirstTaskId, typeof PenLine> = { write: PenLine, plan: ListChecks, explain: Lightbulb };

export function FirstTask({ name }: { name: string | null }) {
  const t = useTranslations("dashboard.firstTask");
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [own, setOwn] = useState("");

  const text: Record<FirstTaskId, string> = {
    write: t("tasks.write.text"),
    plan: t("tasks.plan.text"),
    explain: t("tasks.explain.text"),
  };
  const label: Record<FirstTaskId, string> = {
    write: t("tasks.write.label"),
    plan: t("tasks.plan.label"),
    explain: t("tasks.explain.label"),
  };

  /** Records what began the account, then goes to the answer — whether or not the record was kept. */
  async function begin(key: string, goal: string, href: string) {
    if (busy) return;
    setBusy(key);
    try {
      await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true, goal }),
      });
    } catch {
      // The task matters more than the record of it: a lost record only
      // means this screen is offered once more, from Home.
    }
    router.push(href);
  }

  async function skip() {
    if (busy) return;
    setBusy("skip");
    try {
      await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skipped: true }) });
    } catch {
      // Home sends them back here once more; nothing else is lost.
    }
    router.push("/dashboard/overview");
  }

  const ownText = own.trim();

  return (
    <div data-testid="first-task" className="space-y-6">
      <GreetingHeader name={name} />
      <p className="text-center text-sm text-muted">{t("lead")}</p>

      <ul className="space-y-2">
        {FIRST_TASKS.map((task) => {
          const Icon = ICON[task.id];
          return (
            <li key={task.id}>
              <button
                type="button"
                data-testid="first-task-option"
                data-task={task.id}
                disabled={busy !== null}
                onClick={() => void begin(task.id, goalFor(task.id), firstTaskHref(text[task.id], task.mode))}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-card bg-panel px-4 py-3 text-start transition-colors duration-150 hover:bg-panel-hover disabled:opacity-60"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-muted">{label[task.id]}</span>
                  <span className="block text-sm text-foreground">{text[task.id]}</span>
                </span>
                {busy === task.id ? <ThinkingIndicator size="sm" /> : <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-center text-[11px] text-muted">{t("cost")}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ownText) void begin("own", goalFor("own"), firstTaskHref(ownText, null));
        }}
        className="flex items-end gap-2 rounded-card bg-panel p-2"
      >
        <label className="sr-only" htmlFor="first-task-own">
          {t("ownLabel")}
        </label>
        <textarea
          id="first-task-own"
          data-testid="first-task-own"
          value={own}
          maxLength={MAX_EXAMPLE_CHARS}
          rows={2}
          disabled={busy !== null}
          onChange={(e) => setOwn(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (ownText) void begin("own", goalFor("own"), firstTaskHref(ownText, null));
            }
          }}
          placeholder={t("ownPlaceholder")}
          className="min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-foreground placeholder:text-muted focus:outline-none"
        />
        <button
          type="submit"
          data-testid="first-task-send"
          disabled={!ownText || busy !== null}
          aria-label={t("send")}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-item bg-button text-button-ink disabled:opacity-40"
        >
          {busy === "own" ? <ThinkingIndicator size="sm" tone="inherit" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted">
        <Link href="/onboarding?classic=1" data-testid="first-task-import" className="inline-flex min-h-[44px] items-center gap-1.5 underline decoration-dotted hover:text-foreground">
          <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
          {t("import")}
        </Link>
        <button
          type="button"
          onClick={() => void skip()}
          disabled={busy !== null}
          data-testid="first-task-skip"
          className="inline-flex min-h-[44px] items-center px-2 underline decoration-dotted hover:text-foreground"
        >
          {t("skip")}
        </button>
      </div>
    </div>
  );
}
