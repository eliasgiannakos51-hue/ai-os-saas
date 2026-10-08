"use client";

import { useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Clock, Download, Gamepad2, History } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { useCredits } from "@/components/credits/credits-context";
import { CostEstimateHint, useCostEstimate } from "@/components/credits/cost-estimate";
import { ToolShell, ChosenBox, OPTION, ACTION, workIsBeside, type ShellTurn } from "@/components/shell/tool-shell";
import type { ChatComposerHandle } from "@/components/chat/chat-composer";
import { buildMessage, changeMessage, boxMessage, planMessage, readPlan, type GameBoxKind, type GamePlan } from "@/lib/games/game-plan";
import { GAME_SANDBOX, sealGame } from "@/lib/games/game-html";

/**
 * GAMES (MASTER 16, package 26), in the shell every tool shares: the
 * conversation on the left, the game on the right.
 *
 * Describe a game and its plan comes back in five boxes. Press a box and
 * say what to change in it; only it changes. «Φτιάξε το παιχνίδι» writes
 * it, and it is played right there — in an iframe with scripts and
 * nothing else (lib/games/game-html.ts GAME_SANDBOX), so it cannot see the
 * account it runs in. Then say what to change, and the next version
 * replaces it; every version is kept and one press brings one back.
 */
export type GameRow = { id: string; title: string; plan: unknown; html: string | null; versions: unknown; locale: string; updated_at: string };

/**
 * `systemChars` is the length of the system prompt every call sends
 * (lib/games/game-system.ts, server-only), handed down by the page so the
 * price on screen counts what the route's hold counts.
 */
export function GamesShell({ initialGames, initialOpenId = null, systemChars }: { initialGames: GameRow[]; initialOpenId?: string | null; systemChars: number }) {
  const t = useTranslations("dashboard.games");
  const tNames = useTranslations("dashboard.tools.names");
  const locale = useLocale();
  const { refresh: refreshCredits } = useCredits();
  const composerRef = useRef<ChatComposerHandle>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [games, setGames] = useState<GameRow[]>(initialGames);
  const [openId, setOpenId] = useState<string | null>(initialGames.some((g) => g.id === initialOpenId) ? initialOpenId : null);
  const [pane, setPane] = useState<"game" | "recent" | null>(openId ? "game" : null);
  const [box, setBox] = useState<GameBoxKind | null>(null);
  const [running, setRunning] = useState<null | "plan" | "box" | "build" | "change" | "restore">(null);
  const [turns, setTurns] = useState<{ id: string; role: "user" | "tool"; text: string; gameId?: string }[]>([]);
  const [length, setLength] = useState(0);
  const say = (turn: { role: "user" | "tool"; text: string; gameId?: string }) => setTurns((prev) => [...prev, { ...turn, id: `${turn.role}${prev.length}` }]);

  const open = games.find((g) => g.id === openId) ?? null;
  const plan: GamePlan | null = open ? readPlan(open.plan) : null;
  const built = Boolean(open?.html);
  const versions = Array.isArray(open?.versions) ? (open!.versions as { at: string; note: string }[]) : [];

  // THE PRICE OF WHAT THE NEXT PRESS DOES, from what it will send.
  const words = "x".repeat(length);
  const nextAction = !open ? "gamePlan" : built ? "gameChange" : "gameBoxEdit";
  const nextChars = !open
    ? systemChars + planMessage(words, locale).length
    : built
      ? systemChars + changeMessage(open.html ?? "", words, locale).length
      : plan
        ? systemChars + boxMessage(plan, box ?? "rules", words, locale).length
        : 0;
  const nextPrice = useCostEstimate(nextAction, { inputChars: nextChars });
  const buildPrice = useCostEstimate("gameWrite", { inputChars: plan ? systemChars + buildMessage(plan, locale).length : 0 });

  const BOX_LABEL: Record<GameBoxKind, string> = {
    rules: t("boxes.rules"),
    levels: t("boxes.levels"),
    characters: t("boxes.characters"),
    controls: t("boxes.controls"),
    win: t("boxes.win"),
  };

  function errorText(code: string): string {
    if (code === "insufficient_credits") return t("errors.insufficient");
    if (code === "ai_unavailable" || code === "not_configured") return t("errors.unavailable");
    if (code === "unusable") return t("errors.unusable");
    if (code === "rate_limited") return t("errors.rateLimited");
    if (code === "not_included") return t("errors.notIncluded");
    if (code === "too_long") return t("errors.tooLong");
    if (code === "stopped") return t("errors.stopped");
    return t("errors.failed");
  }

  async function post(url: string, body: Record<string, unknown>, kind: NonNullable<typeof running>) {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(kind);
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, locale }), signal: controller.signal });
      const data = await res.json().catch(() => null);
      refreshCredits();
      if (!res.ok || !data?.ok) {
        say({ role: "tool", text: errorText(String(data?.code ?? "")) });
        return null;
      }
      const game = data.game as GameRow;
      setGames((prev) => [game, ...prev.filter((g) => g.id !== game.id)]);
      setOpenId(game.id);
      setPane("game");
      return game;
    } catch {
      say({ role: "tool", text: controller.signal.aborted ? t("errors.stopped") : t("errors.failed") });
      return null;
    } finally {
      abortRef.current = null;
      setRunning(null);
    }
  }

  async function send(text: string) {
    say({ role: "user", text });
    if (!open || (!built && box === null)) {
      const game = await post("/api/games", { description: text }, "plan");
      if (game) say({ role: "tool", text: t("planned", { title: game.title }), gameId: game.id });
      return;
    }
    if (!built && box !== null) {
      const game = await post(`/api/games/${open.id}`, { action: "box", kind: box, instruction: text }, "box");
      if (game) say({ role: "tool", text: t("boxChanged", { box: BOX_LABEL[box] }), gameId: game.id });
      return;
    }
    const game = await post(`/api/games/${open.id}`, { action: "change", instruction: text }, "change");
    if (game) say({ role: "tool", text: t("changed"), gameId: game.id });
  }

  async function build() {
    if (!open) return;
    const game = await post(`/api/games/${open.id}`, { action: "build" }, "build");
    if (game) {
      setBox(null);
      say({ role: "tool", text: t("built"), gameId: game.id });
    }
  }

  async function restore(index: number) {
    if (!open) return;
    const game = await post(`/api/games/${open.id}`, { action: "restore", version: index }, "restore");
    if (game) say({ role: "tool", text: t("restored", { n: versions.length - index }), gameId: game.id });
  }

  const sealed = useMemo(() => (open?.html ? sealGame(open.html) : ""), [open?.html]);

  const shellTurns: ShellTurn[] = turns.map((turn) => {
    const game = turn.gameId ? games.find((g) => g.id === turn.gameId) : undefined;
    return game
      ? { id: turn.id, role: turn.role, text: turn.text, card: { title: game.title, open: pane === "game" && openId === game.id, onOpen: () => { setOpenId(game.id); setPane("game"); } } }
      : { id: turn.id, role: turn.role, text: turn.text };
  });

  const work =
    pane === "recent"
      ? {
          title: t("recent"),
          body:
            games.length === 0 ? (
              <p className="text-sm text-muted">{t("noneYet")}</p>
            ) : (
              <ul className="row-list" data-testid="games-recent">
                {games.map((g) => (
                  <li key={g.id}>
                    <button type="button" onClick={() => { setOpenId(g.id); setPane("game"); setBox(null); }} className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground">
                      <Gamepad2 className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{g.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ),
        }
      : pane === "game" && open && plan
        ? {
            title: open.title,
            actions: built ? (
              <a href={`/api/games/${open.id}/download`} aria-label={t("download")} title={t("download")} data-testid="game-download" className={ACTION}>
                <Download className="h-4 w-4" aria-hidden="true" />
              </a>
            ) : undefined,
            body: (
              <div className="flex h-full flex-col gap-3">
                {built ? (
                  <>
                    <iframe
                      title={t("play")}
                      data-testid="game-frame"
                      srcDoc={sealed}
                      sandbox={GAME_SANDBOX}
                      className="min-h-[60vh] w-full flex-1 rounded-card bg-panel"
                    />
                    <p className="text-xs text-muted">{t("sealed")}</p>
                    {versions.length > 1 && (
                      <details data-testid="game-versions">
                        <summary className="flex min-h-[44px] cursor-pointer items-center gap-1.5 text-xs text-muted">
                          <History className="h-3.5 w-3.5" aria-hidden="true" />
                          {t("versions", { count: versions.length })}
                        </summary>
                        <ul className="row-list">
                          {versions.map((v, i) => (
                            <li key={`${v.at}-${i}`} className="flex min-h-[44px] items-center gap-2 px-3 text-xs">
                              <span className="min-w-0 flex-1 truncate text-foreground">{t("version", { n: versions.length - i })} · {v.note === "build" ? t("first") : v.note}</span>
                              {i > 0 && (
                                <button type="button" onClick={() => void restore(i)} disabled={running !== null} data-testid="game-restore" className={OPTION}>
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
                    <p className="text-xs text-muted">{t("boxHint")}</p>
                    <ol className="space-y-2" data-testid="game-plan">
                      {plan.boxes.map((b) => (
                        <li key={b.kind}>
                          <button
                            type="button"
                            data-testid="game-box"
                            aria-pressed={box === b.kind}
                            onClick={() => {
                              setBox((v) => (v === b.kind ? null : b.kind));
                              // On a phone the plan covers the field: close it, so the words can be written.
                              if (!workIsBeside()) setPane(null);
                              composerRef.current?.focus();
                            }}
                            className={`block min-h-[44px] w-full rounded-item px-3 py-2 text-start text-sm ${box === b.kind ? "bg-panel-hover ring-1 ring-foreground" : "hover:bg-panel-hover"}`}
                          >
                            <span className="block text-xs font-semibold text-foreground">{BOX_LABEL[b.kind]}</span>
                            <span className="block whitespace-pre-wrap text-foreground">{b.text}</span>
                          </button>
                        </li>
                      ))}
                    </ol>
                    <div>
                      <button type="button" onClick={() => void build()} disabled={running !== null} data-testid="game-build" className="btn-outline font-semibold">
                        {running === "build" ? <ThinkingIndicator size="sm" /> : <Gamepad2 className="h-4 w-4" aria-hidden="true" />}
                        {running === "build" ? t("building") : t("build")}
                      </button>
                      {running === null && <CostEstimateHint credits={buildPrice.credits} />}
                    </div>
                  </>
                )}
              </div>
            ),
          }
        : null;

  const options = [
    <button key="recent" type="button" onClick={() => setPane("recent")} data-testid="games-recent-open" className={OPTION}>
      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
      {t("recent")}
    </button>,
  ];

  return (
    <ToolShell
      ref={composerRef}
      name={tNames("games")}
      turns={shellTurns}
      working={running !== null && running !== "build" ? <ThinkingIndicator size="sm" /> : null}
      placeholder={!open ? t("placeholder") : built ? t("placeholderChange") : box ? t("placeholderBox") : t("placeholder")}
      sending={running !== null}
      onSend={(text) => void send(text)}
      onStop={() => abortRef.current?.abort()}
      onLengthChange={setLength}
      options={options}
      footer={
        <>
          {open && !built && box !== null ? <ChosenBox label={BOX_LABEL[box]} onClear={() => setBox(null)} /> : null}
          {running === null && length > 0 ? <CostEstimateHint credits={nextPrice.credits} /> : null}
        </>
      }
      work={work}
      onCloseWork={() => setPane(null)}
    />
  );
}
