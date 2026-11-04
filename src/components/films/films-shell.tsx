"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Camera, Clapperboard, LayoutGrid, MapPin, RotateCcw, Sun, Video, Users, type LucideIcon } from "lucide-react";
import { ACTION, OPTION, ToolShell, type ShellTurn } from "@/components/shell/tool-shell";

type Turn = { id: string; role: "user" | "tool"; text: string };

type StageKey = "script" | "characters" | "storyboard" | "shooting" | "edit";
const STAGES: StageKey[] = ["script", "characters", "storyboard", "shooting", "edit"];
// Five stages, traced straight to the directive's own pieces: 3 (script),
// 4 (characters & places), 5 (storyboard), 8 (shooting), 9 (voice+music+
// Editing hand-off, one "edit" stage). Every one reads "waiting" today —
// nothing past this screen is wired, so nothing earns "working"/"done" yet.
type StageStatus = "waiting" | "working" | "done";
const STAGE_STATUS: Record<StageKey, StageStatus> = {
  script: "waiting",
  characters: "waiting",
  storyboard: "waiting",
  shooting: "waiting",
  edit: "waiting",
};
const STAGE_STATUS_CLASS: Record<StageStatus, string> = {
  waiting: "text-muted",
  working: "text-warning",
  done: "text-success",
};

type Angle = "wide" | "medium" | "closeUp" | "fromAbove" | "low";
const ANGLES: Angle[] = ["wide", "medium", "closeUp", "fromAbove", "low"];
type Light = "day" | "goldenHour" | "night" | "warmInside";
const LIGHTS: Light[] = ["day", "goldenHour", "night", "warmInside"];
type CameraMove = "still" | "slowPush" | "pan" | "handheld";
const MOVES: CameraMove[] = ["still", "slowPush", "pan", "handheld"];

type ShotSettings = { angle: Angle; light: Light; move: CameraMove; continueFromPrevious: boolean };
const DEFAULT_SHOT_SETTINGS: ShotSettings = { angle: "medium", light: "day", move: "still", continueFromPrevious: false };

// Three placeholder frames, not real output — piece 3 (the AI-written
// script) is what turns these into real shots. Clicking one still opens
// the real inspector panel, which is all this stop-gated piece asks for.
const SAMPLE_SHOT_IDS = ["1", "2", "3"];

function ShotOptionGroup<T extends string>({
  label,
  icon: Icon,
  options,
  value,
  onChange,
  labels,
  testId,
}: {
  label: string;
  icon: LucideIcon;
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  labels: Record<T, string>;
  testId: string;
}) {
  return (
    <fieldset data-testid={testId}>
      <legend className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Icon className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
        {label}
      </legend>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            data-testid={`${testId}-option`}
            data-value={option}
            onClick={() => onChange(option)}
            className={`${OPTION} ${value === option ? "bg-panel-hover" : ""}`}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * FILMS (owner, "20. FILMS: ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΕΛΕΓΧΟ ΑΝΑ ΠΛΑΝΟ",
 * 2026-10-30), Κομμάτι 2 ONLY — the owner's own stop-gate: the screen,
 * nothing wired further until "εγκρίνω".
 *
 * Same deliberate shape as Editing (this session, Κομμάτι 2): a
 * filmmaking workspace opens straight in, not a "describe what you
 * want" wait, but stays closeable/reopenable on every device so the
 * composer piece 3 will use never becomes a dead end.
 *
 * Stage bar + credits + Characters & places + storyboard grid are all
 * REAL structure, honestly empty or sample-labeled where the pipeline
 * behind them (pieces 3-9, and Video/Audio/Editing's own generators)
 * does not exist yet: no credit number is invented (docs/FILMS-HONESTY.md
 * already says why a full number needs a script first), Characters &
 * places stays two inert add-buttons (piece 4 needs real upload +
 * approval), and the storyboard grid shows three labeled SAMPLE frames
 * so the one interaction this piece must demonstrate — press a shot,
 * get a white ring, open the inspector — has something to press.
 *
 * The inspector itself (Camera angle/Light/Camera move/Continue toggle)
 * is real, per-shot, local-only state — the same category as Image's
 * "Same product"/"Search the web" chrome (Κομμάτι 2, this session):
 * nothing here calls a provider. Reshoot stays inert like every other
 * button this session that would trigger a real paid generation call
 * with no pipeline behind it yet (Product ad, Animate, Zoom, Graphics)
 * — its own credit number is exactly the thing piece 1 says cannot be
 * invented before a real router/provider call exists.
 */
export function FilmsShell() {
  const t = useTranslations("dashboard.films");
  const tNames = useTranslations("dashboard.tools.names");
  const tExamples = useTranslations("dashboard.comingSoon.examples.films");

  const [turns, setTurns] = useState<Turn[]>([]);
  const [pane, setPane] = useState<"workspace" | null>("workspace");
  const [selectedShot, setSelectedShot] = useState<string | null>(null);
  const [shotSettings, setShotSettings] = useState<Record<string, ShotSettings>>({});

  // EVERY t() CALL HERE USES A STATIC STRING KEY, on purpose — a
  // template key is the "unbounded component" shape
  // scripts/tests/message-slices.test.mjs holds at a recorded count
  // (the same rule src/components/shell/motion-button.tsx follows).
  const stageLabels: Record<StageKey, string> = {
    script: t("stages.script"),
    characters: t("stages.characters"),
    storyboard: t("stages.storyboard"),
    shooting: t("stages.shooting"),
    edit: t("stages.edit"),
  };
  const stageStatusLabels: Record<StageStatus, string> = {
    waiting: t("stageStatus.waiting"),
    working: t("stageStatus.working"),
    done: t("stageStatus.done"),
  };
  const angleLabels: Record<Angle, string> = {
    wide: t("panel.angleOptions.wide"),
    medium: t("panel.angleOptions.medium"),
    closeUp: t("panel.angleOptions.closeUp"),
    fromAbove: t("panel.angleOptions.fromAbove"),
    low: t("panel.angleOptions.low"),
  };
  const lightLabels: Record<Light, string> = {
    day: t("panel.lightOptions.day"),
    goldenHour: t("panel.lightOptions.goldenHour"),
    night: t("panel.lightOptions.night"),
    warmInside: t("panel.lightOptions.warmInside"),
  };
  const moveLabels: Record<CameraMove, string> = {
    still: t("panel.moveOptions.still"),
    slowPush: t("panel.moveOptions.slowPush"),
    pan: t("panel.moveOptions.pan"),
    handheld: t("panel.moveOptions.handheld"),
  };

  const say = (role: Turn["role"], text: string) => setTurns((prev) => [...prev, { id: `${role}${prev.length}`, role, text }]);
  function send(text: string) {
    say("user", text);
    say("tool", t("notBuilt"));
  }
  const shellTurns: ShellTurn[] = turns.map((turn) => ({ id: turn.id, role: turn.role, text: turn.text }));

  function settingsFor(shotId: string): ShotSettings {
    return shotSettings[shotId] ?? DEFAULT_SHOT_SETTINGS;
  }
  function updateShot(shotId: string, patch: Partial<ShotSettings>) {
    setShotSettings((prev) => ({ ...prev, [shotId]: { ...settingsFor(shotId), ...patch } }));
  }
  const current = selectedShot ? settingsFor(selectedShot) : null;

  const work =
    pane === "workspace"
      ? {
          title: t("workspaceTitle"),
          body: (
            <div className="flex h-full flex-col gap-4 lg:flex-row">
              <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
                <div className="flex flex-wrap items-center justify-between gap-3" data-testid="films-stage-bar">
                  <ul className="flex flex-wrap items-center gap-2">
                    {STAGES.map((stage) => (
                      <li key={stage} data-testid="films-stage" data-stage={stage} data-stage-status={STAGE_STATUS[stage]} className="chip-link gap-1.5">
                        <span className="text-foreground">{stageLabels[stage]}</span>
                        <span className={STAGE_STATUS_CLASS[STAGE_STATUS[stage]]}>{stageStatusLabels[STAGE_STATUS[stage]]}</span>
                      </li>
                    ))}
                  </ul>
                  <p data-testid="films-credits" className="text-xs text-muted">
                    {t("credits.label")}: <span className="text-foreground">—</span> ({t("credits.unknown")})
                  </p>
                </div>

                <div data-testid="films-characters-places" className="space-y-2">
                  <p className="text-xs font-medium text-foreground">{t("charactersPlaces.heading")}</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled data-testid="films-add-character" aria-label={t("charactersPlaces.addCharacter")} title={t("charactersPlaces.addCharacter")} className={`${ACTION} relative opacity-60`}>
                      <Users className="h-4 w-4" aria-hidden="true" />
                      <span className="absolute end-1 top-1 h-1.5 w-1.5 rounded-full bg-muted" aria-hidden="true" />
                    </button>
                    <button type="button" disabled data-testid="films-add-place" aria-label={t("charactersPlaces.addPlace")} title={t("charactersPlaces.addPlace")} className={`${ACTION} relative opacity-60`}>
                      <MapPin className="h-4 w-4" aria-hidden="true" />
                      <span className="absolute end-1 top-1 h-1.5 w-1.5 rounded-full bg-muted" aria-hidden="true" />
                    </button>
                  </div>
                  <p className="text-xs text-muted">{t("charactersPlaces.empty")}</p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground">{t("storyboard.heading")}</p>
                  <ul data-testid="films-storyboard-grid" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {SAMPLE_SHOT_IDS.map((id) => (
                      <li key={id}>
                        <button
                          type="button"
                          aria-pressed={selectedShot === id}
                          data-testid="films-shot"
                          data-shot-id={id}
                          onClick={() => setSelectedShot((prev) => (prev === id ? null : id))}
                          className={`flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-item bg-panel text-xs text-muted ${selectedShot === id ? "ring-2 ring-foreground" : ""}`}
                        >
                          <Clapperboard className="h-4 w-4" aria-hidden="true" />
                          {t("storyboard.shot", { n: id })}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted">{t("storyboard.sampleCaption")}</p>
                </div>
              </div>

              {current && selectedShot && (
                <div className="w-full shrink-0 space-y-4 overflow-y-auto lg:w-64" data-testid="films-shot-panel">
                  <ShotOptionGroup label={t("panel.cameraAngle")} icon={Camera} options={ANGLES} value={current.angle} onChange={(angle) => updateShot(selectedShot, { angle })} labels={angleLabels} testId="films-panel-angle" />
                  <ShotOptionGroup label={t("panel.light")} icon={Sun} options={LIGHTS} value={current.light} onChange={(light) => updateShot(selectedShot, { light })} labels={lightLabels} testId="films-panel-light" />
                  <ShotOptionGroup label={t("panel.cameraMove")} icon={Video} options={MOVES} value={current.move} onChange={(move) => updateShot(selectedShot, { move })} labels={moveLabels} testId="films-panel-move" />

                  <button
                    type="button"
                    role="switch"
                    aria-checked={current.continueFromPrevious}
                    aria-label={t("panel.continueFromPrevious")}
                    onClick={() => updateShot(selectedShot, { continueFromPrevious: !current.continueFromPrevious })}
                    data-testid="films-panel-continue"
                    className="flex w-full items-center justify-between gap-2"
                  >
                    <span className="text-sm text-foreground">{t("panel.continueFromPrevious")}</span>
                    <span className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-200 ${current.continueFromPrevious ? "bg-foreground" : "bg-panel-hover"}`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full transition-transform duration-200 ${current.continueFromPrevious ? "translate-x-[18px] bg-panel" : "translate-x-1 bg-paper"}`} />
                    </span>
                  </button>

                  <button type="button" disabled data-testid="films-panel-reshoot" aria-label={t("panel.reshoot")} title={t("panel.reshoot")} className={`${ACTION} relative w-full justify-center opacity-60`}>
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    {t("panel.reshoot")}
                    <span className="absolute end-1 top-1 h-1.5 w-1.5 rounded-full bg-muted" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          ),
        }
      : null;

  return (
    <ToolShell
      name={tNames("films")}
      turns={shellTurns}
      placeholder={t("placeholder")}
      sending={false}
      onSend={send}
      options={[
        <button key="workspace" type="button" onClick={() => setPane("workspace")} data-testid="films-workspace-open" className={OPTION}>
          <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
          {t("workspaceTitle")}
        </button>,
      ]}
      empty={{
        heading: t("empty.heading"),
        examples: [
          { key: "a", label: tExamples("a") },
          { key: "b", label: tExamples("b") },
        ],
      }}
      work={work}
      onCloseWork={() => setPane(null)}
    />
  );
}
