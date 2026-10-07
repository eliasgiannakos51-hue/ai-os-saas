"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { FlaskConical, Lightbulb, ListChecks, Pause, Play, Power, Trash2, Undo2, Zap } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { LargeActionConfirm } from "@/components/credits/cost-estimate";
import { useCredits } from "@/components/credits/credits-context";
import { ToolShell, ACTION, ChosenBox, OPTION, type ShellTurn } from "@/components/shell/tool-shell";
import type { ChatComposerHandle } from "@/components/chat/chat-composer";
import { AutomationActiveList } from "@/components/automation/automation-active-list";
import { BoxEditor, BoxRow, CONNECTION_NAME, CostLimitForm, RunHistory, useBoxLabel, type Connected } from "@/components/automations/flow-boxes";
import { needsLargeActionConfirmation } from "@/lib/billing/credit-formula";
import { DEFAULTS } from "@/lib/billing/pricing-config";
import { aiBoxCount, type Box } from "@/lib/automations/boxes";
import type { FlowPrices } from "@/lib/automations/flow-pricing";
import { readShownFlow, readShownRun, type ShownFlow, type ShownRun } from "@/lib/automations/flow-view";
import { resolveBrowserTimeZone } from "@/lib/agents/cron-expression";
import type { UserAutomation } from "@/types/user-automation";

/**
 * AUTOMATIONS AS BOXES (MASTER 16, package 30), behind the switch
 * "automations": «γράφω "όταν ανεβάζω αρχείο, κάνε σύνοψη και βάλ' τη στη
 * Βιβλιοθήκη", βλέπω τα κουτιά, αλλάζω ένα με λόγια, και τρέχει μόνο του».
 *
 * The field makes an automation from a sentence; when the sentence leaves
 * out WHEN or WHAT, the answer is one question, and what is typed next is
 * sent with the sentence. The boxes open on the right. Pressing a box
 * CHOOSES it: the field then changes that box alone, and its hand editor
 * opens under the row. «Δοκιμή» runs it without sending anything and
 * shows what it would have sent; «Ενεργοποίηση» lets it run by itself.
 * The history under the boxes is every run, box by box, with its result
 * and its credits; a run waiting at an approval box shows what it made
 * and the press that sends it.
 *
 * Every price is on the screen before anything is spent (lib/automations/
 * flow-pricing.ts, the numbers the routes hold). Every refusal is a code
 * from the routes, said here in the reader's language. Held by
 * scripts/tests/automations.test.mjs.
 */
type Turn = { id: string; role: "user" | "tool"; text: string; flow?: string };
type Running = "build" | "change" | "try" | "run" | "save" | "approve" | null;
type Open = "flow" | "list" | "examples" | null;

export function AutomationShell({
  initialFlows,
  initialRuns,
  initialOpenId = null,
  initialRunId = null,
  prices,
  configured,
  connected,
  older,
}: {
  initialFlows: Record<string, unknown>[];
  /** The runs of the automation opened on arrival. */
  initialRuns: Record<string, unknown>[];
  initialOpenId?: string | null;
  /** A run a notification pointed at (`?run=`). */
  initialRunId?: string | null;
  prices: FlowPrices;
  /** Whether the model's key is set; without it nothing can be made or run, and nothing is charged. */
  configured: boolean;
  connected: Connected;
  /** The one-sentence automations from before: still running, shown as they were. */
  older: UserAutomation[];
}) {
  const t = useTranslations("dashboard.automations");
  const tSteps = useTranslations("aiSteps");
  const locale = useLocale();
  const router = useRouter();
  const { refresh: refreshCredits } = useCredits();
  const composerRef = useRef<ChatComposerHandle>(null);
  const abortRef = useRef<AbortController | null>(null);
  const boxLabel = useBoxLabel();

  const [flows, setFlows] = useState<ShownFlow[]>(() => initialFlows.map(readShownFlow));
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [open, setOpen] = useState<Open>(initialOpenId ? "flow" : null);
  const [runs, setRuns] = useState<ShownRun[]>(() => initialRuns.map(readShownRun));
  const [chosen, setChosen] = useState<string | null>(null);
  const [running, setRunning] = useState<Running>(null);
  const [busyRun, setBusyRun] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState<{ said: string; question: string } | null>(null);
  const [confirming, setConfirming] = useState<{ credits: number; go: () => void } | null>(null);

  const shown = flows.find((f) => f.id === openId) ?? null;
  const chosenBox = shown && chosen ? shown.boxes.find((b) => b.id === chosen) ?? null : null;
  const runPrice = shown ? prices.step * aiBoxCount(shown.boxes) : 0;
  const names = CONNECTION_NAME;

  function say(role: Turn["role"], text: string, flow?: string) {
    setTurns((prev) => [...prev, { id: `${role}${prev.length}`, role, text, flow }]);
  }

  /** A route's refusal, in words. */
  function refusal(data: Record<string, unknown> | null): string {
    const code = String(data?.code ?? "");
    const limit = typeof data?.limit === "number" ? data.limit : 0;
    switch (code) {
      case "empty":
        return t("errors.empty");
      case "too_long":
        return t("errors.tooLong", { limit });
      case "insufficient_credits":
      case "reserve_failed":
        return t("errors.insufficient");
      case "rate_limited":
      case "bypass_ceiling":
        return t("errors.rateLimited");
      case "not_configured":
        return t("notConfigured");
      case "busy":
        return t("errors.busy");
      case "not_found":
      case "no_such_box":
        return t("errors.gone");
      case "unusable":
        return t("errors.unusable");
      case "too_many":
        return t("errors.tooMany", { limit });
      case "too_many_active":
        return t("errors.tooManyActive", { limit });
      case "needs_connection": {
        const missing = Array.isArray(data?.missing) ? (data.missing as (keyof Connected)[]) : [];
        return t("errors.needsConnection", { names: missing.map((m) => names[m] ?? m).join(", ") });
      }
      case "nothing_to_undo":
        return t("errors.nothingToUndo");
      case "no_file":
        return t("errors.noFile");
      case "bad_limit":
        return t("errors.badLimit", { min: Number(data?.min ?? 1), max: Number(data?.max ?? 5000) });
      case "not_waiting":
        return t("errors.notWaiting");
      case "expired":
        return t("errors.expired");
      case "stopped":
        return tSteps("stopped");
      case "ai_unavailable":
        return t("errors.unavailable");
      default:
        return t("errors.failed");
    }
  }

  /** Large amounts ask once more, as every large action in the app does. */
  function withConfirm(credits: number, go: () => void) {
    if (needsLargeActionConfirmation(credits, DEFAULTS)) setConfirming({ credits, go });
    else go();
  }

  async function call(url: string, method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown> | null, kind: Exclude<Running, null>): Promise<Record<string, unknown> | null> {
    setRunning(kind);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        signal: controller.signal,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (kind !== "save") void refreshCredits();
      if (!response.ok || !data?.ok) {
        say("tool", refusal(data));
        return null;
      }
      return data;
    } catch {
      say("tool", controller.signal.aborted ? tSteps("stopped") : t("errors.offline"));
      return null;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(null);
    }
  }

  function placeFlow(row: unknown): ShownFlow | null {
    if (!row || typeof row !== "object") return null;
    const flow = readShownFlow(row as Record<string, unknown>);
    setFlows((prev) => [flow, ...prev.filter((f) => f.id !== flow.id)]);
    return flow;
  }

  function pausedNote(data: Record<string, unknown>) {
    const paused = Array.isArray(data.paused) ? (data.paused as (keyof Connected)[]) : [];
    if (paused.length > 0) say("tool", t("paused", { names: paused.map((m) => names[m] ?? m).join(", ") }));
  }

  async function openFlow(id: string) {
    setOpenId(id);
    setChosen(null);
    setOpen("flow");
    setRuns([]);
    try {
      const response = await fetch(`/api/automations/flows/${id}/runs`);
      const data = (await response.json().catch(() => null)) as { ok?: boolean; runs?: Record<string, unknown>[] } | null;
      if (data?.ok && Array.isArray(data.runs)) setRuns(data.runs.map(readShownRun));
    } catch {
      /* the history stays empty; the boxes are already on the screen */
    }
  }

  async function build(said: string) {
    const data = await call("/api/automations/flows", "POST", { said, timeZone: resolveBrowserTimeZone() }, "build");
    if (!data) return;
    if (typeof data.question === "string") {
      setPending({ said, question: data.question });
      say("tool", data.question);
      return;
    }
    setPending(null);
    const flow = placeFlow(data.flow);
    if (!flow) return;
    say("tool", t("made", { name: flow.name }), flow.id);
    if (typeof data.unsupported === "string" && data.unsupported) say("tool", t("unsupported", { text: data.unsupported }));
    setOpenId(flow.id);
    setChosen(null);
    setRuns([]);
    setOpen("flow");
    router.refresh();
  }

  async function changeWithWords(flow: ShownFlow, box: Box, instruction: string) {
    const data = await call(`/api/automations/flows/${flow.id}/change`, "POST", { box: box.id, instruction }, "change");
    if (!data) return;
    placeFlow(data.flow);
    say("tool", t("changed", { box: boxLabel(box) }), flow.id);
    pausedNote(data);
  }

  async function saveByHand(flow: ShownFlow, next: Box) {
    const boxes = flow.boxes.map((b) => (b.id === next.id ? next : b));
    const data = await call(`/api/automations/flows/${flow.id}`, "PATCH", { boxes }, "save");
    if (!data) return;
    placeFlow(data.flow);
    say("tool", t("changed", { box: boxLabel(next) }), flow.id);
    pausedNote(data);
  }

  async function saveLimit(flow: ShownFlow, limit: number) {
    const data = await call(`/api/automations/flows/${flow.id}`, "PATCH", { cost_limit: limit }, "save");
    if (data) placeFlow(data.flow);
  }

  async function undo(flow: ShownFlow) {
    const data = await call(`/api/automations/flows/${flow.id}/undo`, "POST", null, "save");
    if (!data) return;
    placeFlow(data.flow);
    setChosen(null);
    say("tool", t("undone"), flow.id);
    pausedNote(data);
  }

  async function toggle(flow: ShownFlow) {
    const data = await call(`/api/automations/flows/${flow.id}/active`, "POST", { on: !flow.isActive }, "save");
    if (!data) return;
    const next = placeFlow(data.flow);
    if (next) say("tool", next.isActive ? t("turnedOn", { name: next.name }) : t("turnedOff", { name: next.name }), next.id);
  }

  async function runIt(flow: ShownFlow, dry: boolean) {
    const data = await call(`/api/automations/flows/${flow.id}/run`, "POST", { dry }, dry ? "try" : "run");
    if (!data || !data.run) return;
    const run = readShownRun(data.run as Record<string, unknown>);
    setRuns((prev) => [run, ...prev.filter((r) => r.id !== run.id)]);
    say("tool", dry ? t("tried") : t("ran"), flow.id);
  }

  async function decide(run: ShownRun, approve: boolean) {
    setBusyRun(run.id);
    try {
      const data = await call(`/api/automations/runs/${run.id}/${approve ? "approve" : "cancel"}`, "POST", null, approve ? "approve" : "save");
      if (!data || !data.run) return;
      const next = readShownRun(data.run as Record<string, unknown>);
      setRuns((prev) => prev.map((r) => (r.id === next.id ? next : r)));
    } finally {
      setBusyRun(null);
    }
  }

  async function remove(flow: ShownFlow) {
    if (!window.confirm(t("deleteConfirm"))) return;
    const data = await call(`/api/automations/flows/${flow.id}`, "DELETE", null, "save");
    if (!data) return;
    setFlows((prev) => prev.filter((f) => f.id !== flow.id));
    setOpenId(null);
    setChosen(null);
    setOpen(null);
    router.refresh();
  }

  function send(text: string) {
    if (running) return;
    say("user", text);
    if (!configured) {
      say("tool", t("notConfigured"));
      return;
    }
    if (shown && chosenBox) {
      const flow = shown;
      const box = chosenBox;
      withConfirm(prices.build, () => void changeWithWords(flow, box, text));
      return;
    }
    // The answer to the one question goes back WITH the sentence it was about.
    const said = pending ? `${pending.said}\n${pending.question}\n${text}` : text;
    withConfirm(prices.build, () => void build(said));
  }

  const shellTurns: ShellTurn[] = turns.map((turn) => {
    const flow = turn.flow ? flows.find((f) => f.id === turn.flow) : undefined;
    return flow
      ? {
          id: turn.id,
          role: turn.role,
          text: turn.text,
          card: { title: flow.name, open: open === "flow" && openId === flow.id, onOpen: () => void openFlow(flow.id) },
        }
      : { id: turn.id, role: turn.role, text: turn.text };
  });

  const when = (iso: string, timeZone: string) => {
    try {
      return new Intl.DateTimeFormat(locale, { timeZone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
    } catch {
      return iso.slice(0, 16).replace("T", " ");
    }
  };

  const examples = [t("example.calendar"), t("example.finance"), t("example.file")];
  const buttonClass = "inline-flex min-h-[44px] items-center gap-1.5 rounded-item bg-panel px-3 text-xs text-foreground hover:bg-panel-hover disabled:opacity-60";

  const work =
    open === "flow" && shown
      ? {
          title: shown.name,
          actions: (
            <>
              <button type="button" disabled={running !== null || shown.version <= 1} onClick={() => void undo(shown)} aria-label={t("undo")} title={t("undo")} data-testid="flow-undo" className={`${ACTION} disabled:opacity-40`}>
                <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button type="button" disabled={running !== null} onClick={() => void remove(shown)} aria-label={t("delete")} title={t("delete")} data-testid="flow-delete" className={ACTION}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </>
          ),
          body: (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <span data-testid="flow-state" data-active={shown.isActive} className={`text-xs ${shown.isActive ? "text-foreground" : "text-muted"}`}>
                  {shown.isActive ? t("status.on") : t("status.off")}
                  {shown.isActive && shown.nextRunAt ? ` · ${t("status.next", { when: when(shown.nextRunAt, shown.timeZone) })}` : ""}
                  {shown.isActive && shown.boxes[0]?.kind === "start" && shown.boxes[0].when === "file_uploaded" ? ` · ${t("status.onFile")}` : ""}
                </span>
                <button type="button" disabled={running !== null || shown.boxes.length === 0} onClick={() => void toggle(shown)} data-testid="flow-toggle" className={`${buttonClass} ms-auto`}>
                  {shown.isActive ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Power className="h-3.5 w-3.5" aria-hidden="true" />}
                  {shown.isActive ? t("turnOff") : t("turnOn")}
                </button>
              </div>

              {shown.boxes.length === 0 ? (
                <p className="text-xs text-warning">{t("errors.broken")}</p>
              ) : (
                <BoxRow boxes={shown.boxes} chosen={chosen} onChoose={(id) => setChosen((c) => (c === id ? null : id))} connected={connected} />
              )}
              {chosenBox ? (
                <BoxEditor key={`${shown.id}-${shown.version}-${chosenBox.id}`} box={chosenBox} saving={running === "save"} onSave={(next) => void saveByHand(shown, next)} />
              ) : (
                shown.boxes.length > 0 && <p className="text-xs text-muted">{t("choose")}</p>
              )}

              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={running !== null || !configured || shown.boxes.length === 0}
                    onClick={() => withConfirm(runPrice, () => void runIt(shown, true))}
                    data-testid="flow-try"
                    className={buttonClass}
                  >
                    {running === "try" ? <ThinkingIndicator size="sm" /> : <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />}
                    {t("try")}
                  </button>
                  <button
                    type="button"
                    disabled={running !== null || !configured || shown.boxes.length === 0}
                    onClick={() => withConfirm(runPrice, () => void runIt(shown, false))}
                    data-testid="flow-run-now"
                    className={buttonClass}
                  >
                    {running === "run" ? <ThinkingIndicator size="sm" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
                    {t("runNow")}
                  </button>
                </div>
                <p data-testid="flow-run-price" className="flex items-center gap-1.5 text-[11px] text-muted">
                  <Zap className="h-3 w-3 text-foreground/70" aria-hidden="true" />
                  {runPrice > 0 ? t("priceRun", { count: runPrice }) : t("priceRunFree")}
                </p>
                <p className="text-[11px] text-muted">{t("tryHelp")}</p>
              </div>

              <CostLimitForm key={`${shown.id}-${shown.costLimit}`} limit={shown.costLimit} saving={running !== null} onSave={(limit) => void saveLimit(shown, limit)} />

              <section aria-labelledby="flow-history-title" className="space-y-2">
                <h2 id="flow-history-title" className="text-xs font-medium text-foreground">
                  {t("history")}
                </h2>
                <RunHistory
                  key={shown.id}
                  runs={runs.filter((r) => r.flowId === shown.id)}
                  boxes={shown.boxes}
                  locale={locale}
                  timeZone={shown.timeZone}
                  busy={busyRun}
                  onApprove={(run) => void decide(run, true)}
                  onCancel={(run) => void decide(run, false)}
                  openId={initialRunId}
                />
              </section>
            </div>
          ),
        }
      : open === "list"
        ? {
            title: t("mine"),
            body: (
              <div className="space-y-5">
                {flows.length === 0 ? (
                  <p className="text-xs text-muted">{t("mineEmpty")}</p>
                ) : (
                  <ul data-testid="flow-list" className="space-y-2">
                    {flows.map((flow) => (
                      <li key={flow.id}>
                        <button type="button" onClick={() => void openFlow(flow.id)} className="flex min-h-[44px] w-full items-center gap-3 rounded-item bg-panel px-3 py-2 text-start hover:bg-panel-hover">
                          <span className="min-w-0 flex-1 break-words text-sm text-foreground">{flow.name}</span>
                          <span className={`shrink-0 text-xs ${flow.isActive ? "text-foreground" : "text-muted"}`}>{flow.isActive ? t("status.on") : t("status.off")}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {older.length > 0 && (
                  <div data-testid="flow-older" className="space-y-2">
                    <p className="text-xs text-muted">{t("older", { count: older.length })}</p>
                    <AutomationActiveList automations={older} />
                  </div>
                )}
              </div>
            ),
          }
        : open === "examples"
          ? {
              title: t("examples"),
              body: (
                <ul data-testid="flow-examples" className="space-y-2">
                  {examples.map((example) => (
                    <li key={example}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(null);
                          setChosen(null);
                          setPending(null);
                          composerRef.current?.setText(example);
                          composerRef.current?.focus();
                        }}
                        className="flex min-h-[44px] w-full items-center rounded-item bg-panel px-3 py-2 text-start text-sm text-foreground hover:bg-panel-hover"
                      >
                        {example}
                      </button>
                    </li>
                  ))}
                </ul>
              ),
            }
          : null;

  const working =
    running === "build"
      ? t("working.build")
      : running === "change"
        ? t("working.change")
        : running === "try"
          ? t("working.try")
          : running === "run" || running === "approve"
            ? t("working.run")
            : null;

  return (
    <>
      <ToolShell
        ref={composerRef}
        name={t("name")}
        turns={shellTurns}
        working={
          working ? (
            <span className="inline-flex items-center gap-2 text-xs text-muted">
              <ThinkingIndicator size="sm" />
              {working}
            </span>
          ) : null
        }
        placeholder={chosenBox ? t("placeholderBox") : pending ? t("placeholderAnswer") : t("placeholder")}
        sending={running !== null}
        onSend={send}
        onStop={() => abortRef.current?.abort()}
        options={[
          <button key="mine" type="button" onClick={() => setOpen((v) => (v === "list" ? null : "list"))} aria-pressed={open === "list"} data-testid="flow-mine" className={OPTION}>
            <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
            {t("mineCount", { count: flows.length })}
          </button>,
          <button key="examples" type="button" onClick={() => setOpen((v) => (v === "examples" ? null : "examples"))} aria-pressed={open === "examples"} data-testid="flow-examples-open" className={OPTION}>
            <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
            {t("examples")}
          </button>,
        ]}
        footer={
          <>
            {shown && chosenBox && <ChosenBox label={boxLabel(chosenBox)} onClear={() => setChosen(null)} />}
            {turns.length === 0 && !chosenBox && <p className="mt-1.5 text-[11px] text-muted">{t("help")}</p>}
            {configured ? (
              <p data-testid="flow-price" className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
                <Zap className="h-3 w-3 text-foreground/70" aria-hidden="true" />
                {t("priceBuild", { count: prices.build })}
              </p>
            ) : (
              <p data-testid="flow-not-configured" className="mt-1.5 text-[11px] text-warning">
                {t("notConfigured")}
              </p>
            )}
          </>
        }
        work={work}
        onCloseWork={() => setOpen(null)}
      />
      {confirming && (
        <LargeActionConfirm
          credits={confirming.credits}
          onConfirm={() => {
            const go = confirming.go;
            setConfirming(null);
            go();
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </>
  );
}
