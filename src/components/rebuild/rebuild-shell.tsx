"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Check, Database, Download, Hammer, History, LayoutGrid, MousePointerClick, Palette, Pencil, ShieldCheck, Undo2 } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { HelpTip } from "@/components/ui/help-tip";
import { useCredits } from "@/components/credits/credits-context";
import { CostEstimateHint, useCostEstimate } from "@/components/credits/cost-estimate";
import type { ActionProfileKey } from "@/lib/billing/estimate";
import { ToolShell, ChosenBox, OPTION, ACTION, workIsBeside, type ShellTurn } from "@/components/shell/tool-shell";
import { ShellHistoryColumn } from "@/components/shell/shell-history-column";
import type { ChatComposerHandle } from "@/components/chat/chat-composer";
import { buildMessage, changeMessage, boxMessage, planMessage, planText, readPlan, type RebuildBoxKind, type RebuildPlan } from "@/lib/rebuild/rebuild-plan";
import { MAX_FEATURE_CHARS, featuresMessage } from "@/lib/rebuild/rebuild-features";
import { APP_SANDBOX, sealApp } from "@/lib/rebuild/rebuild-html";
import { readDefinition } from "@/lib/apps/app-plan";

/**
 * REBUILD (the final All tools grid), in the shell every tool shares: the
 * conversation on the left, the app on the right.
 *
 * Describe an app — or paste the address of a page of one you like — and
 * its plan comes back in four boxes. Press a box and say what to change in
 * it; only it changes. «Build the app» writes it, with its price on the
 * button, and it works right there, in an iframe with scripts and nothing
 * else (lib/rebuild/rebuild-html.ts APP_SANDBOX), so it cannot see the
 * account it runs in. Then say what to change, and the next version
 * replaces it; every version is kept, one press goes back, and the app
 * downloads as one file that works on its own.
 *
 * WHAT IT IS, IN WORDS ON THE SCREEN: «your own version, not a copy» — it
 * takes the idea and the kinds of screens, never the name, words, pictures
 * or code of the original (dashboard.rebuild.original, ten languages).
 *
 * KΟΜΜΆΤΙ 2 (2026-10-29): describing an app first derives the CAPABILITIES
 * such apps typically have (api/rebuild/features — lib/rebuild/rebuild-
 * features.ts), as selectable boxes shown before the four-box plan. Toggle
 * any off, or press ✎ to change a label's words by hand (no model call for
 * that — the words typed ARE the new label); «Use these features» folds
 * what is kept into the SAME plan call as additional context — the plan
 * itself is reached only through that button. A failed features call shows
 * its error and charges nothing, same as any other step; nothing is
 * created until the person presses that button.
 *
 * KΟΜΜΆΤΙ 3 (2026-10-29): a plan whose capabilities need it (has_app_phase,
 * decided once, at plan time, from what Κομμάτι 2 kept) gets a real second
 * phase — «App logic» first (Apps' own planner, lib/apps/app-plan.ts,
 * called as a library: lib/rebuild/rebuild-call.ts's planAppLogic), then
 * «Write the app» as before. Every other plan stays the one phase it
 * always was. «Approve plan» starts phase 1 ONLY; phase 2's own price is
 * shown only once phase 1 is done, and needs its own press — no phase is
 * charged before it runs, and a phase 2 failure never touches what phase 1
 * already saved (lib/rebuild/charge.ts's own hold/release, unchanged here).
 */
export type RebuildRow = {
  id: string;
  title: string;
  plan: unknown;
  reference: { url?: string; host?: string; rendered?: string } | null;
  html: string | null;
  versions: unknown;
  locale: string;
  has_app_phase: boolean;
  app_definition: unknown;
  updated_at: string;
};

type RebuildFeatureBox = { id: string; label: string; selected: boolean };

type Running = null | "features" | "plan" | "appLogic" | "box" | "build" | "change" | "restore";

export function RebuildShell({
  initialProjects,
  initialOpenId = null,
  systemChars,
  appSystemChars,
}: {
  initialProjects: RebuildRow[];
  initialOpenId?: string | null;
  systemChars: number;
  appSystemChars: number;
}) {
  const t = useTranslations("dashboard.rebuild");
  const tNames = useTranslations("dashboard.tools.names");
  const locale = useLocale();
  const { refresh: refreshCredits } = useCredits();
  const composerRef = useRef<ChatComposerHandle>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [projects, setProjects] = useState<RebuildRow[]>(initialProjects);
  const [openId, setOpenId] = useState<string | null>(initialProjects.some((p) => p.id === initialOpenId) ? initialOpenId : null);
  const [pane, setPane] = useState<"app" | "features" | null>(openId ? "app" : null);
  const [box, setBox] = useState<RebuildBoxKind | null>(null);
  const [features, setFeatures] = useState<RebuildFeatureBox[] | null>(null);
  const [featuresDescription, setFeaturesDescription] = useState("");
  const [editingFeature, setEditingFeature] = useState<string | null>(null);
  const [running, setRunning] = useState<Running>(null);
  const [turns, setTurns] = useState<{ id: string; role: "user" | "tool"; text: string; projectId?: string }[]>([]);
  const [length, setLength] = useState(0);
  const say = (turn: { role: "user" | "tool"; text: string; projectId?: string }) => setTurns((prev) => [...prev, { ...turn, id: `${turn.role}${prev.length}` }]);

  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    try {
      setHistoryOpen(window.localStorage.getItem("ionexa.rebuildHistoryColumn") === "open");
    } catch {
      // private window or storage off: closed, which is the default
    }
  }, []);
  function toggleHistory() {
    setHistoryOpen((isOpen) => {
      const next = !isOpen;
      try {
        window.localStorage.setItem("ionexa.rebuildHistoryColumn", next ? "open" : "closed");
      } catch {
        // nothing to persist to; the toggle still works for this visit
      }
      return next;
    });
  }

  const open = projects.find((p) => p.id === openId) ?? null;
  const plan: RebuildPlan | null = open ? readPlan(open.plan) : null;
  const built = Boolean(open?.html);
  const versions = Array.isArray(open?.versions) ? (open!.versions as { at: string; note: string }[]) : [];

  // Κομμάτι 3: the second phase's own status, read back from the row —
  // never a separate piece of state to drift from what was actually saved.
  const appDefinition = open?.has_app_phase ? readDefinition(open.app_definition) : null;
  const appLogicDone = Boolean(appDefinition);

  // THE PRICE OF WHAT THE NEXT PRESS DOES, from what it will send. While no
  // project is open, the first real call is the features step (Κομμάτι 2),
  // never the plan directly — editing one feature's wording is free (no
  // call), so no price is shown for that.
  const words = "x".repeat(length);
  const nextAction: ActionProfileKey = !open ? "rebuildFeatures" : !built && box === null ? "rebuildPlan" : built ? "rebuildChange" : "rebuildBoxEdit";
  const nextChars = !open
    ? systemChars + featuresMessage(words, locale).length
    : !built && box === null
      ? systemChars + planMessage(words, locale).length
      : built
        ? systemChars + changeMessage(open.html ?? "", words, locale).length
        : plan
          ? systemChars + boxMessage(plan, box ?? "screens", words, locale).length
          : 0;
  const nextPrice = useCostEstimate(nextAction, { inputChars: nextChars });
  const buildPrice = useCostEstimate("rebuildBuild", { inputChars: plan ? systemChars + buildMessage(plan, locale, open?.reference?.rendered, appDefinition).length : 0 });
  const appLogicPrice = useCostEstimate("rebuildAppLogic", { inputChars: plan ? appSystemChars + planText(plan).length : 0 });
  const selectedFeatureLabels = features ? features.filter((f) => f.selected).map((f) => f.label) : [];
  const featuresPlanPrice = useCostEstimate("rebuildPlan", { inputChars: features ? systemChars + planMessage(featuresDescription, locale, undefined, selectedFeatureLabels).length : 0 });

  const BOX_LABEL: Record<RebuildBoxKind, string> = {
    screens: t("boxes.screens"),
    data: t("boxes.data"),
    actions: t("boxes.actions"),
    look: t("boxes.look"),
  };
  const BOX_ICON: Record<RebuildBoxKind, typeof LayoutGrid> = {
    screens: LayoutGrid,
    data: Database,
    actions: MousePointerClick,
    look: Palette,
  };

  function referenceError(reason: string): string {
    switch (reason) {
      case "not_https":
        return t("errors.reference.notHttps");
      case "blocked_host":
        return t("errors.reference.blocked");
      case "unreachable":
      case "timeout":
      case "too_many_redirects":
      case "http_error":
        return t("errors.reference.unreachable");
      case "not_html":
        return t("errors.reference.notHtml");
      case "too_large":
        return t("errors.reference.tooLarge");
      default:
        return t("errors.reference.invalid");
    }
  }

  function errorText(data: { code?: unknown; reason?: unknown; limit?: unknown } | null): string {
    const code = String(data?.code ?? "");
    if (code === "reference_failed") return referenceError(String(data?.reason ?? ""));
    if (code === "insufficient_credits") return t("errors.insufficient");
    if (code === "ai_unavailable" || code === "not_configured") return t("errors.unavailable");
    if (code === "unusable") return t("errors.unusable");
    if (code === "rate_limited") return t("errors.rateLimited");
    if (code === "limit_reached") return t("errors.limit", { limit: Number(data?.limit ?? 1) });
    if (code === "too_long") return t("errors.tooLong");
    if (code === "stopped") return t("errors.stopped");
    return t("errors.failed");
  }

  async function post(url: string, body: Record<string, unknown>, kind: NonNullable<Running>) {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(kind);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, locale }), signal: controller.signal });
      const data = await res.json().catch(() => null);
      refreshCredits();
      if (!res.ok || !data?.ok) {
        say({ role: "tool", text: errorText(data) });
        return null;
      }
      const project = data.project as RebuildRow;
      setProjects((prev) => [project, ...prev.filter((p) => p.id !== project.id)]);
      setOpenId(project.id);
      setPane("app");
      return project;
    } catch {
      say({ role: "tool", text: controller.signal.aborted ? t("errors.stopped") : t("errors.failed") });
      return null;
    } finally {
      abortRef.current = null;
      setRunning(null);
    }
  }

  function plannedMessage(project: RebuildRow): string {
    return project.reference?.host ? `${t("planned", { title: project.title })} ${t("referenceRead", { host: project.reference.host })}` : t("planned", { title: project.title });
  }

  async function postFeatures(description: string): Promise<boolean> {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning("features");
    try {
      const res = await fetch("/api/rebuild/features", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description, locale }), signal: controller.signal });
      const data = await res.json().catch(() => null);
      refreshCredits();
      if (!res.ok || !data?.ok) {
        say({ role: "tool", text: errorText(data) });
        return false;
      }
      const list = Array.isArray(data.features) ? (data.features as string[]) : [];
      const reference = data.reference as { host?: string } | null;
      setFeatures(list.map((label, i) => ({ id: `f${i}`, label, selected: true })));
      setFeaturesDescription(description);
      setPane("features");
      say({ role: "tool", text: reference?.host ? `${t("features.found")} ${t("referenceRead", { host: reference.host })}` : t("features.found") });
      return true;
    } catch {
      say({ role: "tool", text: controller.signal.aborted ? t("errors.stopped") : t("errors.failed") });
      return false;
    } finally {
      abortRef.current = null;
      setRunning(null);
    }
  }

  function toggleFeature(id: string) {
    setFeatures((prev) => (prev ? prev.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f)) : prev));
  }

  async function continueToPlan() {
    if (features === null) return;
    const project = await post("/api/rebuild", { description: featuresDescription, features: selectedFeatureLabels }, "plan");
    if (project) {
      setBox(null);
      setFeatures(null);
      setFeaturesDescription("");
      say({ role: "tool", text: plannedMessage(project), projectId: project.id });
    }
  }

  async function send(text: string) {
    say({ role: "user", text });

    // Κομμάτι 2: a feature pressed for editing takes the next words as its
    // new label, verbatim — client-side only, no model call, nothing charged.
    if (!open && editingFeature !== null) {
      const id = editingFeature;
      setFeatures((prev) => (prev ? prev.map((f) => (f.id === id ? { ...f, label: text.trim().slice(0, MAX_FEATURE_CHARS) } : f)) : prev));
      setEditingFeature(null);
      setPane("features");
      say({ role: "tool", text: t("features.changed") });
      return;
    }

    // Κομμάτι 2: before a project exists, every plain message (the first
    // one, or "actually, something else") derives the capabilities step —
    // the plan itself is reached only through «Use these features»
    // (continueToPlan). A failed call shows its error and charges nothing,
    // same as any other step; the next message tries again.
    if (!open) {
      await postFeatures(text);
      return;
    }

    if (!built && box === null) {
      const project = await post("/api/rebuild", { description: text }, "plan");
      if (project) {
        setBox(null);
        say({ role: "tool", text: plannedMessage(project), projectId: project.id });
      }
      return;
    }
    if (!built && box !== null) {
      const project = await post(`/api/rebuild/${open.id}`, { action: "box", kind: box, instruction: text }, "box");
      if (project) say({ role: "tool", text: t("boxChanged", { box: BOX_LABEL[box] }), projectId: project.id });
      return;
    }
    const project = await post(`/api/rebuild/${open.id}`, { action: "change", instruction: text }, "change");
    if (project) say({ role: "tool", text: t("changed"), projectId: project.id });
  }

  async function runAppLogic() {
    if (!open) return;
    const project = await post(`/api/rebuild/${open.id}`, { action: "appLogic" }, "appLogic");
    if (project) say({ role: "tool", text: t("phases.appLogicDone"), projectId: project.id });
  }

  async function build() {
    if (!open) return;
    const project = await post(`/api/rebuild/${open.id}`, { action: "build" }, "build");
    if (project) {
      setBox(null);
      say({ role: "tool", text: t("built"), projectId: project.id });
    }
  }

  async function restore(index: number, undo = false) {
    if (!open) return;
    const project = await post(`/api/rebuild/${open.id}`, { action: "restore", version: index }, "restore");
    if (project) say({ role: "tool", text: undo ? t("undone") : t("restored", { n: versions.length - index }), projectId: project.id });
  }

  async function removeProject(id: string) {
    const res = await fetch(`/api/rebuild/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) return;
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (openId === id) {
      setOpenId(null);
      setPane(null);
    }
  }

  const sealed = useMemo(() => (open?.html ? sealApp(open.html) : ""), [open?.html]);

  const shellTurns: ShellTurn[] = turns.map((turn) => {
    const project = turn.projectId ? projects.find((p) => p.id === turn.projectId) : undefined;
    return project
      ? { id: turn.id, role: turn.role, text: turn.text, card: { title: project.title, open: pane === "app" && openId === project.id, onOpen: () => { setOpenId(project.id); setPane("app"); } } }
      : { id: turn.id, role: turn.role, text: turn.text };
  });

  const work =
    pane === "app" && open && plan
      ? {
          title: open.title,
          actions: built ? (
            <>
              {versions.length > 1 && (
                <button type="button" onClick={() => void restore(1, true)} disabled={running !== null} aria-label={t("undo")} title={t("undo")} data-testid="rebuild-undo" className={ACTION}>
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              <a href={`/api/rebuild/${open.id}/download`} aria-label={t("download")} title={t("download")} data-testid="rebuild-download" className={ACTION}>
                <Download className="h-4 w-4" aria-hidden="true" />
              </a>
            </>
          ) : undefined,
          body: (
            <div className="flex h-full flex-col gap-3">
              {built ? (
                <>
                  <iframe title={t("preview")} data-testid="rebuild-frame" srcDoc={sealed} sandbox={APP_SANDBOX} className="min-h-[60vh] w-full flex-1 rounded-card bg-panel" />
                  <p className="text-xs text-muted">{t("sealed")}</p>
                  <div className="flex items-start gap-2.5 rounded-card bg-panel-hover px-3 py-2.5">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" aria-hidden="true" />
                    <p className="text-xs text-foreground" data-testid="rebuild-original">{t("original")}</p>
                  </div>
                  {versions.length > 1 && (
                    <details data-testid="rebuild-versions">
                      <summary className="flex min-h-[44px] cursor-pointer items-center gap-1.5 text-xs text-muted">
                        <History className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("versions", { count: versions.length })}
                      </summary>
                      <ul className="row-list">
                        {versions.map((v, i) => (
                          <li key={`${v.at}-${i}`} className="flex min-h-[44px] items-center gap-2 px-3 text-xs">
                            <span className="min-w-0 flex-1 truncate text-foreground">{t("version", { n: versions.length - i })} · {v.note === "build" ? t("first") : v.note === "restore" ? t("restoreNote") : v.note}</span>
                            {i > 0 && (
                              <button type="button" onClick={() => void restore(i)} disabled={running !== null} data-testid="rebuild-restore" className={OPTION}>
                                {t("restore")}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-start gap-2.5 rounded-card bg-panel-hover px-3 py-2.5">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" aria-hidden="true" />
                    <p className="text-xs text-foreground" data-testid="rebuild-original">{t("original")}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">{t("boxHint")}</p>
                    <ol className="mt-1.5 space-y-2" data-testid="rebuild-plan">
                      {plan.boxes.map((b) => {
                        const Icon = BOX_ICON[b.kind];
                        return (
                          <li key={b.kind}>
                            <button
                              type="button"
                              data-testid="rebuild-box"
                              aria-pressed={box === b.kind}
                              onClick={() => {
                                setBox((v) => (v === b.kind ? null : b.kind));
                                // On a phone the plan covers the field: close it, so the words can be written.
                                if (!workIsBeside()) setPane(null);
                                composerRef.current?.focus();
                              }}
                              className={`flex min-h-[44px] w-full items-start gap-2.5 rounded-item px-3 py-2 text-start text-sm ${box === b.kind ? "bg-panel-hover ring-1 ring-foreground" : "hover:bg-panel-hover"}`}
                            >
                              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" aria-hidden="true" />
                              <div className="min-w-0 flex-1">
                                <span className="block text-xs font-semibold text-foreground">{BOX_LABEL[b.kind]}</span>
                                <span className="block whitespace-pre-wrap text-foreground">{b.text}</span>
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                  <div>
                    <p className="text-xs text-muted">{t("phases.heading")}</p>
                    <ol className="mt-1.5 space-y-1.5" data-testid="rebuild-phases">
                      {open.has_app_phase && (
                        <li data-testid="rebuild-phase" className="rounded-item bg-panel px-3 py-2">
                          <div className="flex items-center gap-3">
                            <span className="w-5 shrink-0 text-xs text-muted">1</span>
                            <span className="min-w-0 flex-1 text-sm text-foreground">{t("phases.appLogic")}</span>
                            {appLogicDone && <Check className="h-4 w-4 shrink-0 text-foreground/70" aria-hidden="true" />}
                          </div>
                          {!appLogicDone && running === null && <CostEstimateHint credits={appLogicPrice.credits} />}
                        </li>
                      )}
                      <li data-testid="rebuild-phase" className="rounded-item bg-panel px-3 py-2">
                        <div className="flex items-center gap-3">
                          <span className="w-5 shrink-0 text-xs text-muted">{open.has_app_phase ? "2" : "1"}</span>
                          <span className="min-w-0 flex-1 text-sm text-foreground">{open.has_app_phase ? t("phases.writeApp") : t("build")}</span>
                        </div>
                        {(!open.has_app_phase || appLogicDone) && running === null && <CostEstimateHint credits={buildPrice.credits} />}
                      </li>
                    </ol>
                    <p className="mt-1.5 text-[11px] text-muted">{open.has_app_phase ? t("phases.noteTwo") : t("phases.note")}</p>
                    <div className="mt-2">
                      {open.has_app_phase && !appLogicDone ? (
                        <button type="button" onClick={() => void runAppLogic()} disabled={running !== null} data-testid="rebuild-approve-plan" className="btn-outline font-semibold">
                          {running === "appLogic" ? <ThinkingIndicator size="sm" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                          {running === "appLogic" ? t("phases.approving") : t("phases.approve")}
                        </button>
                      ) : (
                        <button type="button" onClick={() => void build()} disabled={running !== null} data-testid="rebuild-build" className="btn-outline font-semibold">
                          {running === "build" ? <ThinkingIndicator size="sm" /> : <Hammer className="h-4 w-4" aria-hidden="true" />}
                          {running === "build" ? t("building") : t("build")}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          ),
        }
      : pane === "features" && features
        ? {
            title: t("features.heading"),
            body: (
              <div className="flex h-full flex-col gap-3">
                <p className="text-xs text-muted">{t("features.hint")}</p>
                <ol className="space-y-2" data-testid="rebuild-features">
                  {features.map((f) => (
                    <li key={f.id}>
                      <div className={`flex w-full items-stretch gap-1 rounded-item ${f.selected ? "bg-panel-hover ring-1 ring-foreground" : "hover:bg-panel-hover"}`}>
                        <button
                          type="button"
                          data-testid="rebuild-feature"
                          aria-pressed={f.selected}
                          onClick={() => toggleFeature(f.id)}
                          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 rounded-item px-2 text-start text-sm"
                        >
                          {f.selected ? <Check className="h-4 w-4 shrink-0 text-foreground/70" aria-hidden="true" /> : <span className="h-4 w-4 shrink-0" aria-hidden="true" />}
                          <span className="min-w-0 flex-1 whitespace-pre-wrap text-foreground">{f.label}</span>
                        </button>
                        <button
                          type="button"
                          data-testid="rebuild-feature-edit"
                          aria-label={t("features.edit")}
                          title={t("features.edit")}
                          onClick={() => {
                            setEditingFeature(f.id);
                            // On a phone the list covers the field: close it, so the words can be written.
                            if (!workIsBeside()) setPane(null);
                            composerRef.current?.focus();
                          }}
                          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-item hover:bg-panel-hover"
                        >
                          <Pencil className="h-3.5 w-3.5 text-foreground/70" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
                <div>
                  <button type="button" onClick={() => void continueToPlan()} disabled={running !== null} data-testid="rebuild-features-continue" className="btn-outline font-semibold">
                    {running === "plan" ? <ThinkingIndicator size="sm" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                    {running === "plan" ? t("features.continuing") : t("features.continue")}
                  </button>
                  {running === null && <CostEstimateHint credits={featuresPlanPrice.credits} />}
                </div>
              </div>
            ),
          }
        : null;

  return (
    <ToolShell
      ref={composerRef}
      name={tNames("rebuild")}
      help={<HelpTip helpKey="help.rebuild" />}
      turns={shellTurns}
      working={running !== null && running !== "build" && running !== "appLogic" ? <ThinkingIndicator size="sm" /> : null}
      placeholder={!open ? (editingFeature !== null ? t("features.editPlaceholder") : t("placeholder")) : built ? t("placeholderChange") : box ? t("placeholderBox") : t("placeholder")}
      sending={running !== null}
      onSend={(text) => void send(text)}
      onStop={() => abortRef.current?.abort()}
      onLengthChange={setLength}
      footer={
        <>
          {open && !built && box !== null ? <ChosenBox label={BOX_LABEL[box]} onClear={() => setBox(null)} /> : null}
          {!open && editingFeature !== null ? (
            <ChosenBox label={features?.find((f) => f.id === editingFeature)?.label ?? ""} onClear={() => { setEditingFeature(null); setPane("features"); }} />
          ) : null}
          {running === null && length > 0 && !(!open && editingFeature !== null) ? <CostEstimateHint credits={nextPrice.credits} /> : null}
        </>
      }
      empty={{
        heading: t("empty.heading"),
        examples: [
          { key: "booking", label: t("empty.examples.booking") },
          { key: "habits", label: t("empty.examples.habits") },
          { key: "invoices", label: t("empty.examples.invoices") },
        ],
      }}
      history={{
        open: historyOpen,
        onToggle: toggleHistory,
        onNew: () => {
          setOpenId(null);
          setPane(null);
          setBox(null);
          setFeatures(null);
          setFeaturesDescription("");
          setEditingFeature(null);
        },
        newLabel: t("new"),
        column: (
          <ShellHistoryColumn
            rows={projects.map((p) => ({ id: p.id, title: p.title }))}
            activeId={openId}
            onOpen={(id) => {
              setOpenId(id);
              setPane("app");
              setBox(null);
              setFeatures(null);
              setFeaturesDescription("");
              setEditingFeature(null);
            }}
            onDelete={removeProject}
            onNavigate={() => {
              if (typeof window !== "undefined" && window.innerWidth < 768) toggleHistory();
            }}
          />
        ),
      }}
      work={work}
      onCloseWork={() => setPane(null)}
    />
  );
}
