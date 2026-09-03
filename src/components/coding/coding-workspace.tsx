"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Play, Square } from "lucide-react";
import { useToast } from "@/components/toast/toast-context";
import { CodeBlock } from "@/components/coding/code-block";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import {
  CODE_LANGUAGES,
  CODE_LIMITS,
  CODE_OPERATIONS,
  MAX_INPUT_CHARS,
  OPERATION_SPECS,
  type CodeOperation,
} from "@/lib/coding/operations";
import { guessLanguage } from "@/lib/coding/highlight";
import { matchesSearch } from "@/lib/text/search-match";

export type CodeSession = {
  id: string;
  operation: string;
  title: string;
  input: string;
  language: string | null;
  targetLanguage: string | null;
  output: string | null;
  folder: string | null;
  status: string;
  source: string;
  createdAt: string;
};

export function CodingWorkspace({ sessions, folders }: { sessions: CodeSession[]; folders: string[] }) {
  const t = useTranslations("coding");
  const tSteps = useTranslations("aiSteps");
  const router = useRouter();
  const { addToast } = useToast();

  const [operation, setOperation] = useState<CodeOperation>("generate");
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<string>("typescript");
  const [targetLanguage, setTargetLanguage] = useState<string>("python");
  const [useWorkspace, setUseWorkspace] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ output: string; kind: "code" | "prose" } | null>(null);
  const [folderFilter, setFolderFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const spec = OPERATION_SPECS[operation];

  // THROUGH THE SHARED MATCHER, not toLowerCase().includes(). A Greek
  // developer searching "ΣΥΝΑΡΤΗΣΗ" has to find a snippet titled
  // "συνάρτηση", and lower-casing alone leaves the accents and the final
  // sigma in place. lib/text/search-match.ts is the one implementation of
  // that, and accent-search.test.mjs exists to stop a second one.
  const visible = useMemo(
    () =>
      sessions.filter((session) => {
        if (folderFilter && session.folder !== folderFilter) return false;
        if (!search.trim()) return true;
        return (
          matchesSearch(session.title, search) ||
          matchesSearch(session.output, search) ||
          matchesSearch(session.input, search)
        );
      }),
    [sessions, folderFilter, search]
  );

  // THE STOP BUTTON — V4.6. One controller per run; Stop aborts the fetch,
  // the route aborts the provider call and releases the hold, nothing is
  // charged and nothing is recorded as failed.
  const abortRef = useRef<AbortController | null>(null);
  function stopRun() {
    abortRef.current?.abort();
  }

  async function run() {
    if (!input.trim()) return;
    setRunning(true);
    setResult(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/coding/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          operation,
          input,
          // codeLanguage: this is typescript/python, not the language the
          // reply is written in. See the route for why the two must not
          // share a field name.
          codeLanguage: spec.inputKind === "code" ? language : null,
          targetCodeLanguage: spec.needsTargetLanguage ? targetLanguage : null,
          useWorkspace,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        addToast(
          body?.error === "too_long"
            ? t("errors.tooLong", { limit: MAX_INPUT_CHARS })
            : body?.error === "ai_unavailable"
              ? t("errors.unavailable")
              : t("errors.failed"),
          "error"
        );
        return;
      }
      setResult({ output: String(body.output ?? ""), kind: body.outputKind === "prose" ? "prose" : "code" });
      router.refresh();
    } catch (err) {
      // An aborted fetch rejects; that is the stop button, not a fault.
      if (!controller.signal.aborted) {
        addToast(t("errors.failed"), "error");
      } else {
        addToast(tSteps("stopped"));
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* WHAT IT DOES NOT DO, ON THE SCREEN. The previous version of this
          page was a form that looked like a code generator and was not;
          the fix for that is not a better name, it is saying the four
          absences out loud where somebody about to rely on them reads
          them. */}
      <div className="rounded-2xl border border-border bg-panel p-5">
        <h2 className="text-sm font-semibold text-foreground">{t("limits.title")}</h2>
        <ul className="mt-2 space-y-1">
          {CODE_LIMITS.map((limit) => (
            <li key={limit} className="text-xs text-muted">
              — {t(`limits.${limit}`)}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">{t("limits.later")}</p>
      </div>

      {/* ---- the five operations ---- */}
      <div className="rounded-2xl border border-border bg-panel p-5">
        <div className="flex flex-wrap gap-2">
          {CODE_OPERATIONS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => setOperation(candidate)}
              className={`rounded-lg border px-3 py-1.5 text-xs ${
                operation === candidate
                  ? "border-orange-500 bg-orange-500/10 text-foreground"
                  : "border-border text-muted"
              }`}
            >
              {t(`operations.${candidate}.label`)}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">{t(`operations.${operation}.description`)}</p>

        <div className="mt-3 flex flex-wrap gap-3">
          {spec.inputKind === "code" && (
            <label className="text-xs text-muted">
              <span className="mb-1 block">{t("language")}</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="rounded-lg border border-border bg-panel-hover px-3 py-2 text-sm text-foreground"
              >
                {CODE_LANGUAGES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          )}
          {spec.needsTargetLanguage && (
            <label className="text-xs text-muted">
              <span className="mb-1 block">{t("targetLanguage")}</span>
              <select
                value={targetLanguage}
                onChange={(e) => setTargetLanguage(e.target.value)}
                className="rounded-lg border border-border bg-panel-hover px-3 py-2 text-sm text-foreground"
              >
                {CODE_LANGUAGES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <textarea
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            // A GUESS, ONLY WHEN IT IS CONFIDENT, and only for a paste
            // the user has not already labelled. guessLanguage returns
            // null unless something is distinctive — a wrong guess
            // colours Python as SQL, which is worse than grey.
            if (spec.inputKind === "code") {
              const guessed = guessLanguage(e.target.value);
              if (guessed) setLanguage(guessed);
            }
          }}
          rows={10}
          maxLength={MAX_INPUT_CHARS}
          placeholder={t(`operations.${operation}.placeholder`)}
          aria-label={t(`operations.${operation}.label`)}
          className="mt-3 w-full rounded-xl border border-border bg-panel-hover px-3 py-2 font-mono text-xs text-foreground"
        />
        <p className="mt-1 text-right text-[11px] text-muted">
          {input.length} / {MAX_INPUT_CHARS}
        </p>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={useWorkspace}
              onChange={(e) => setUseWorkspace(e.target.checked)}
              className="h-4 w-4 accent-orange-500"
            />
            {t("useWorkspace")}
          </label>
          {running && (
            <button
              type="button"
              onClick={stopRun}
              data-testid="coding-stop"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-orange-500/60 px-3 text-sm font-medium text-orange-300 transition-colors duration-150 hover:bg-orange-500/10"
            >
              <Square className="h-3 w-3 fill-current" aria-hidden="true" />
              {tSteps("stop")}
            </button>
          )}
          <button
            type="button"
            onClick={() => void run()}
            disabled={running || !input.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-xs font-semibold text-black disabled:opacity-50"
          >
            {/* THE GLOBE, NOT A SPINNER. Running an operation is the
                model thinking, which is the one wait this product marks
                with its own signature; a generic ring would spend the
                mark on nothing and make the mark mean nothing. The
                mechanical waits on this page — there are none — would
                get the ring. */}
            {running ? <ThinkingIndicator size="sm" tone="inherit" /> : <Play className="h-4 w-4" />}
            {running ? t("running") : t("run")}
          </button>
        </div>
      </div>

      {result && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">{t("result")}</h2>
          {result.kind === "code" ? (
            <CodeBlock code={result.output} language={spec.needsTargetLanguage ? targetLanguage : language} />
          ) : (
            <div className="whitespace-pre-wrap rounded-xl border border-border bg-panel p-4 text-sm text-muted">
              {result.output}
            </div>
          )}
        </div>
      )}

      {/* ---- history ---- */}
      <div className="rounded-2xl border border-border bg-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">{t("history.title")}</h2>
          <div className="flex flex-wrap gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("history.search")}
              aria-label={t("history.search")}
              className="rounded-lg border border-border bg-panel-hover px-3 py-1.5 text-xs text-foreground"
            />
            {folders.length > 0 && (
              <select
                value={folderFilter}
                onChange={(e) => setFolderFilter(e.target.value)}
                aria-label={t("history.folder")}
                className="rounded-lg border border-border bg-panel-hover px-3 py-1.5 text-xs text-foreground"
              >
                <option value="">{t("history.allFolders")}</option>
                {folders.map((folder) => (
                  <option key={folder} value={folder}>
                    {folder}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="mt-3 text-xs text-muted">{t("history.empty")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {visible.map((session) => (
              <li key={session.id} className="border-t border-border pt-2">
                <details>
                  <summary className="cursor-pointer text-sm text-foreground">
                    {session.title}
                    <span className="ml-2 text-[11px] text-muted">
                      {t(`operations.${session.operation}.label`)}
                      {session.folder ? ` · ${session.folder}` : ""}
                      {/* A ROW IMPORTED FROM THE OLD TRACKER SAYS SO. It
                          has no output and never had one; letting it sit
                          unmarked among real runs would make the history
                          claim the tool produced things it did not. */}
                      {session.source === "note" ? ` · ${t("history.importedNote")}` : ""}
                      {session.status === "failed" ? ` · ${t("history.failed")}` : ""}
                    </span>
                  </summary>
                  <div className="mt-2 space-y-2">
                    <CodeBlock code={session.input} language={session.language} label={t("history.input")} />
                    {session.output ? (
                      <CodeBlock
                        code={session.output}
                        language={session.targetLanguage ?? session.language}
                        label={t("history.output")}
                      />
                    ) : null}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
