"use client";

import { useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Clock, LayoutGrid } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { useCredits } from "@/components/credits/credits-context";
import { CostEstimateHint } from "@/components/credits/cost-estimate";
import { ToolShell, ChosenBox, OPTION, workIsBeside, type ShellTurn } from "@/components/shell/tool-shell";
import type { ChatComposerHandle } from "@/components/chat/chat-composer";
import { estimateForAction } from "@/lib/billing/estimate";
import { DEFAULTS } from "@/lib/billing/pricing-config";
import {
  APP_BOX_KINDS,
  APP_MODEL,
  boxInputChars,
  planInputChars,
  readDefinition,
  type AppBoxKind,
  type AppDefinition,
  type AppFieldType,
} from "@/lib/apps/app-plan";

/**
 * THE APP BUILDER (the owner's "APPS: ΛΕΙΤΟΥΡΓΙΚΟ, ΚΟΜΜΑΤΙ ΚΟΜΜΑΤΙ",
 * 2026-10-24, κομμάτι 2), in the shell every tool shares: the
 * conversation on the left, the plan on the right.
 *
 * Describe a business and the plan comes back in four boxes — the data
 * it keeps, the screens that use it, who sees what, what gets told to
 * whom. Press a box and say what to change in it; only that box
 * changes, because the model is asked for that box's slice and the rest
 * is carried across in code (lib/apps/app-plan.ts spliceBox). Then
 * approve it.
 *
 * NOTHING IS BUILT HERE YET. Approving records that the person said
 * yes; what is built from it is the next piece.
 */
export type AppRow = { id: string; title: string; definition: unknown; status: string; versions: unknown; locale: string; updated_at: string };

/**
 * `systemChars` is the length of the system prompt every call sends
 * (lib/apps/app-system.ts, server-only), handed down by the page so the
 * price on screen counts what the route's hold counts.
 */
export function AppBuilderShell({ initialApps, systemChars, initialText }: { initialApps: AppRow[]; systemChars: number; initialText?: string }) {
  const t = useTranslations("dashboard.appBuilder");
  const tNames = useTranslations("dashboard.tools.names");
  const tSteps = useTranslations("aiSteps");
  const locale = useLocale();
  const { accountCreditPriceEur, planSlug, refresh: refreshCredits } = useCredits();
  const composerRef = useRef<ChatComposerHandle>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [apps, setApps] = useState<AppRow[]>(initialApps);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pane, setPane] = useState<"app" | "recent" | null>(null);
  const [box, setBox] = useState<AppBoxKind | null>(null);
  const [running, setRunning] = useState<null | "plan" | "box" | "approve">(null);
  const [turns, setTurns] = useState<{ id: string; role: "user" | "tool"; text: string; appId?: string }[]>([]);
  const [length, setLength] = useState(0);
  const say = (turn: { role: "user" | "tool"; text: string; appId?: string }) => setTurns((prev) => [...prev, { ...turn, id: `${turn.role}${prev.length}` }]);

  // Literal keys, so the message-slices gate can bound this component:
  // `t(\`box.${kind}\`)` is an unbounded key the same way the Translate
  // tool's style names were (components/translate/translate-shell.tsx).
  const boxNames: Record<AppBoxKind, string> = {
    data: t("box.data"),
    screens: t("box.screens"),
    access: t("box.access"),
    notifications: t("box.notifications"),
  };
  const typeNames: Record<AppFieldType, string> = {
    text: t("type.text"),
    longText: t("type.longText"),
    number: t("type.number"),
    date: t("type.date"),
    time: t("type.time"),
    choice: t("type.choice"),
    email: t("type.email"),
    phone: t("type.phone"),
    checkbox: t("type.checkbox"),
  };

  const open = apps.find((a) => a.id === openId) ?? null;
  const definition: AppDefinition | null = open ? readDefinition(open.definition) : null;
  const approved = open?.status === "approved";

  // THE PRICE OF WHAT THE NEXT PRESS DOES, from what it will send — the
  // same two helpers the routes use to size their hold.
  const estimate = useMemo(() => {
    const action = open && box ? "appBoxEdit" : "appPlan";
    const inputChars = open && box && definition ? boxInputChars(systemChars, definition, length) : planInputChars(systemChars, length);
    return estimateForAction(action, { model: APP_MODEL, inputChars, planSlug }, DEFAULTS, accountCreditPriceEur ?? undefined);
  }, [open, box, definition, length, systemChars, planSlug, accountCreditPriceEur]);

  function refusal(code: string, detail?: { limit?: number }): string {
    switch (code) {
      case "empty": return t("errors.empty");
      case "too_long": return t("errors.tooLong", { limit: detail?.limit ?? 0 });
      case "insufficient_credits": return t("errors.insufficient");
      case "rate_limited": return t("errors.rateLimited");
      case "not_included": return t("errors.notIncluded");
      case "not_enabled":
      case "not_configured":
      case "ai_unavailable": return t("errors.unavailable");
      case "unusable": return t("errors.unusable");
      case "not_saved": return t("errors.notSaved");
      case "stopped": return tSteps("stopped");
      default: return t("errors.failed");
    }
  }

  async function post(url: string, body: Record<string, unknown>, step: "plan" | "box" | "approve"): Promise<{ app: AppRow; dropped?: string[] } | null> {
    if (running) return null;
    setRunning(step);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(url, { method: step === "plan" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify(body) });
      const answer = await res.json().catch(() => null);
      refreshCredits();
      if (!res.ok || !answer?.ok) {
        say({ role: "tool", text: refusal(String(answer?.code ?? ""), answer) });
        return null;
      }
      const app = answer.app as AppRow;
      setApps((prev) => [app, ...prev.filter((a) => a.id !== app.id)]);
      setOpenId(app.id);
      setPane("app");
      return { app, dropped: Array.isArray(answer.dropped) ? (answer.dropped as string[]) : [] };
    } catch {
      say({ role: "tool", text: controller.signal.aborted ? tSteps("stopped") : t("errors.failed") });
      return null;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setRunning(null);
    }
  }

  async function send(text: string) {
    const words = text.trim();
    if (!words) return;
    say({ role: "user", text: words });
    if (open && box) {
      const done = await post(`/api/apps/${open.id}`, { action: "box", box, instruction: words }, "box");
      if (done) {
        setBox(null);
        say({
          role: "tool",
          text: done.dropped && done.dropped.length > 0 ? t("boxChangedAndDropped", { box: boxNames[box], what: done.dropped.join(", ") }) : t("boxChanged", { box: boxNames[box] }),
          appId: done.app.id,
        });
      }
      return;
    }
    const made = await post("/api/apps", { description: words, locale }, "plan");
    if (made) say({ role: "tool", text: t("planned"), appId: made.app.id });
  }

  async function approve() {
    if (!open) return;
    const done = await post(`/api/apps/${open.id}`, { action: "approve" }, "approve");
    if (done) say({ role: "tool", text: t("approved"), appId: done.app.id });
  }

  function chooseBox(kind: AppBoxKind) {
    setBox((v) => (v === kind ? null : kind));
    // On a phone the plan covers the field: close it, so the words can be written.
    if (!workIsBeside()) setPane(null);
    composerRef.current?.focus();
  }

  const shellTurns: ShellTurn[] = turns.map((turn) => {
    const app = turn.appId ? apps.find((a) => a.id === turn.appId) : undefined;
    return app
      ? {
          id: turn.id,
          role: turn.role,
          text: turn.text,
          card: { title: app.title, open: pane === "app" && openId === app.id, onOpen: () => { setOpenId(app.id); setPane("app"); } },
        }
      : { id: turn.id, role: turn.role, text: turn.text };
  });

  const boxBody: Record<AppBoxKind, React.ReactNode> = {
    data: (
      <ul className="space-y-1.5">
        {definition?.collections.map((c) => (
          <li key={c.key}>
            <span className="block text-foreground">{c.label}</span>
            <span className="block text-xs text-muted">{c.fields.map((f) => `${f.label} (${typeNames[f.type]})`).join(" · ")}</span>
          </li>
        ))}
      </ul>
    ),
    screens: (
      <ul className="space-y-1">
        {definition?.screens.map((s) => (
          <li key={s.key} className="text-foreground">
            {s.label} <span className="text-xs text-muted">{s.kind === "form" ? t("kindForm") : t("kindList")}</span>
          </li>
        ))}
      </ul>
    ),
    access: (
      <ul className="space-y-1">
        {definition?.collections.map((c) => (
          <li key={c.key} className="text-foreground">
            {c.label}: <span className="text-xs text-muted">{c.visibility === "own" ? t("seesOwn") : t("seesOwner")}</span>
          </li>
        ))}
      </ul>
    ),
    notifications:
      definition && definition.notifications.length > 0 ? (
        <ul className="space-y-1">
          {definition.notifications.map((n) => (
            <li key={n.key} className="text-foreground">
              {n.label} <span className="text-xs text-muted">{n.to === "customer" ? t("toCustomer") : t("toOwner")}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">{t("noNotifications")}</p>
      ),
  };

  const work =
    pane === "recent"
      ? {
          title: t("recent"),
          body:
            apps.length === 0 ? (
              <p className="text-sm text-muted">{t("noneYet")}</p>
            ) : (
              <ul className="row-list" data-testid="apps-recent">
                {apps.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => { setOpenId(a.id); setPane("app"); setBox(null); }}
                      className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground"
                    >
                      <LayoutGrid className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{a.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ),
        }
      : pane === "app" && open && definition
        ? {
            title: open.title,
            body: (
              <div className="flex h-full flex-col gap-3">
                <p className="text-xs text-muted">{t("boxHint")}</p>
                <ol className="space-y-2" data-testid="app-plan">
                  {APP_BOX_KINDS.map((kind) => (
                    <li key={kind}>
                      <button
                        type="button"
                        data-testid="app-box"
                        data-box={kind}
                        aria-pressed={box === kind}
                        onClick={() => chooseBox(kind)}
                        className={`block min-h-[44px] w-full rounded-item px-3 py-2 text-start text-sm ${box === kind ? "bg-panel-hover ring-1 ring-foreground" : "hover:bg-panel-hover"}`}
                      >
                        <span className="block text-xs font-semibold text-foreground">{boxNames[kind]}</span>
                        {boxBody[kind]}
                      </button>
                    </li>
                  ))}
                </ol>
                <div>
                  {approved ? (
                    <p className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-foreground" data-testid="app-approved">
                      <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {t("approvedNote")}
                    </p>
                  ) : (
                    <button type="button" onClick={() => void approve()} disabled={running !== null} data-testid="app-approve" className="btn-outline font-semibold">
                      {running === "approve" ? <ThinkingIndicator size="sm" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                      {t("approve")}
                    </button>
                  )}
                </div>
              </div>
            ),
          }
        : null;

  return (
    <ToolShell
      ref={composerRef}
      name={tNames("apps")}
      turns={shellTurns}
      working={running !== null ? <ThinkingIndicator size="sm" /> : null}
      placeholder={box ? t("placeholderBox") : open ? t("placeholderAnother") : t("placeholder")}
      sending={running !== null}
      initialText={initialText}
      onSend={(text) => void send(text)}
      onStop={() => abortRef.current?.abort()}
      onLengthChange={setLength}
      options={[
        <button key="recent" type="button" onClick={() => setPane("recent")} data-testid="apps-recent-open" className={OPTION}>
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {t("recent")}
        </button>,
      ]}
      empty={{
        heading: t("empty.heading"),
        examples: [
          { key: "a", label: t("empty.examples.a") },
          { key: "b", label: t("empty.examples.b") },
          { key: "c", label: t("empty.examples.c") },
        ],
      }}
      footer={
        <>
          {box !== null ? <ChosenBox label={boxNames[box]} onClear={() => setBox(null)} /> : null}
          {running === null && length > 0 ? <CostEstimateHint credits={estimate.estimatedCredits} /> : null}
        </>
      }
      work={work}
      onCloseWork={() => setPane(null)}
    />
  );
}
