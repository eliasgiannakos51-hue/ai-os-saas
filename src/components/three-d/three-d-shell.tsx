"use client";

import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useTranslations } from "next-intl";
import { Download, Ruler, RotateCcw, Smartphone, X, ZoomIn, ZoomOut, type LucideIcon } from "lucide-react";
import { ACTION, ToolShell, type ShellTurn } from "@/components/shell/tool-shell";

type Turn = { id: string; role: "user" | "tool"; text: string };
type Photo = { id: string; url: string };

const MAX_PHOTOS = 4;

type ModelType = "product" | "furniture" | "object";
const TYPES: ModelType[] = ["product", "furniture", "object"];
type Quality = "draft" | "final";
const QUALITIES: Quality[] = ["draft", "final"];
type Format = "glb" | "usdz" | "stl";
const FORMATS: Format[] = ["glb", "usdz", "stl"];
type Background = "white" | "transparent";
const BACKGROUNDS: Background[] = ["white", "transparent"];

const DEFAULT_ROTATION = { x: -18, y: 35 };
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.2;
const ZOOM_STEP = 0.2;

function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  labels,
  testId,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  labels: Record<T, string>;
  testId: string;
}) {
  return (
    <fieldset data-testid={testId}>
      <legend className="mb-1.5 text-xs font-medium text-foreground">{label}</legend>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={value === option}
            data-testid={`${testId}-option`}
            data-value={option}
            onClick={() => onChange(option)}
            className={`chip-link ${value === option ? "bg-panel-hover" : ""}`}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** One face of the placeholder box — a box with a label, exactly what
 *  the directive's own piece 2 allows at this stage ("στην αρχή το
 *  μοντέλο μπορεί να είναι κουτί με ετικέτα"). Piece 3 replaces this
 *  with a real generated model; piece 4 replaces THAT with the real
 *  <model-viewer>. */
function BoxFace({ transform, children }: { transform: string; children?: React.ReactNode }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center border border-border bg-panel text-xs font-semibold text-muted"
      style={{ transform, backfaceVisibility: "hidden" }}
    >
      {children}
    </div>
  );
}

/**
 * 3D (owner, "23. 3D: ΝΕΟ ΕΡΓΑΛΕΙΟ", 2026-10-31), Κομμάτι 2 ONLY — the
 * owner's own stop-gate: the screen, nothing wired further until
 * "εγκρίνω". Brand new tool, same common shell and layout as Image
 * (the owner's own words: "ίδιο κοινό κέλυφος, ίδια διάταξη") — empty
 * landing first (globe, heading, 3 examples, the shared composer's own
 * "+" attach for photos), then a work screen once photos exist.
 *
 * THE PHOTO "+" IS THE SHARED COMPOSER'S OWN `attach` PROP
 * (components/shell/tool-shell.tsx → chat-composer.tsx), the exact
 * mechanism Chat already uses behind "chat-attachments" — not a new
 * field, not a second typable element, already built.
 *
 * THE CENTRAL MODEL is a real, interactive placeholder box (drag to
 * rotate, +/- to zoom, a reset button) — not a static picture — because
 * "γυρίζει με σύρσιμο, με zoom και επαναφορά" is this piece's own ask,
 * even though the box ITSELF stays a labelled placeholder until piece
 * 3 (a real model) and piece 4 (the real <model-viewer>, open-source,
 * for 360°+AR) exist.
 *
 * View in AR / Download / Make final / Real size: all inert today,
 * same "real call, no pipeline yet" rule as every other stop-gated
 * piece this session (Reshoot, Product ad, Zoom/Graphics) — no credit
 * number is invented for Make final, matching docs/3D-PROVIDERS.md's
 * own honesty about pricing not existing without a real provider call.
 * Type/Quality/Format/Background ARE real, local-only chrome (the same
 * category as Films' Camera angle/Light/Move this session) since
 * picking one needs no provider call to render.
 */
export function ThreeDShell() {
  const t = useTranslations("dashboard.threeD");
  const tNames = useTranslations("dashboard.tools.names");
  const tExamples = useTranslations("dashboard.comingSoon.examples.threeD");

  const [turns, setTurns] = useState<Turn[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [rotation, setRotation] = useState(DEFAULT_ROTATION);
  const [zoom, setZoom] = useState(1);
  const [type, setType] = useState<ModelType>("product");
  const [quality, setQuality] = useState<Quality>("draft");
  const [format, setFormat] = useState<Format>("glb");
  const [background, setBackground] = useState<Background>("white");
  const dragRef = useRef<{ x: number; y: number; rotX: number; rotY: number } | null>(null);

  const say = (role: Turn["role"], text: string) => setTurns((prev) => [...prev, { id: `${role}${prev.length}`, role, text }]);
  function send(text: string) {
    say("user", text);
    say("tool", t("notBuilt"));
  }
  const shellTurns: ShellTurn[] = turns.map((turn) => ({ id: turn.id, role: turn.role, text: turn.text }));

  function addPhotos(files: File[]) {
    setPhotos((prev) => {
      const room = MAX_PHOTOS - prev.length;
      const picked = files.filter((f) => f.type.startsWith("image/")).slice(0, Math.max(0, room));
      const added = picked.map((f, i) => ({ id: `${Date.now()}-${f.name}-${prev.length + i}`, url: URL.createObjectURL(f) }));
      return [...prev, ...added];
    });
  }
  function removePhoto(id: string) {
    setPhotos((prev) => {
      const gone = prev.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, rotX: rotation.x, rotY: rotation.y };
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    const nextX = Math.max(-89, Math.min(89, dragRef.current.rotX - dy * 0.5));
    setRotation({ x: nextX, y: dragRef.current.rotY + dx * 0.5 });
  }
  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current) e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
  }
  function resetView() {
    setRotation(DEFAULT_ROTATION);
    setZoom(1);
  }
  function closeWork() {
    for (const photo of photos) URL.revokeObjectURL(photo.url);
    setPhotos([]);
    resetView();
  }

  const typeLabels: Record<ModelType, string> = { product: t("panel.typeOptions.product"), furniture: t("panel.typeOptions.furniture"), object: t("panel.typeOptions.object") };
  const qualityLabels: Record<Quality, string> = { draft: t("panel.qualityOptions.draft"), final: t("panel.qualityOptions.final") };
  const formatLabels: Record<Format, string> = { glb: t("panel.formatOptions.glb"), usdz: t("panel.formatOptions.usdz"), stl: t("panel.formatOptions.stl") };
  const backgroundLabels: Record<Background, string> = { white: t("panel.backgroundOptions.white"), transparent: t("panel.backgroundOptions.transparent") };

  const INERT_BAR: Array<{ testId: string; icon: LucideIcon; label: string }> = [
    { testId: "threeD-view-ar", icon: Smartphone, label: t("bar.viewInAr") },
    { testId: "threeD-download", icon: Download, label: t("bar.download") },
  ];

  const work =
    photos.length > 0
      ? {
          title: t("workspaceTitle"),
          body: (
            <div className="flex h-full flex-col gap-4 lg:flex-row">
              <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto">
                <div className="flex flex-wrap items-center gap-2" data-testid="threeD-top-bar">
                  {INERT_BAR.map(({ testId, icon: Icon, label }) => (
                    <button key={testId} type="button" disabled data-testid={testId} aria-label={label} title={label} className={`${ACTION} relative w-auto gap-1.5 px-3 opacity-60`}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      <span className="text-xs">{label}</span>
                      <span className="absolute end-1 top-1 h-1.5 w-1.5 rounded-full bg-muted" aria-hidden="true" />
                    </button>
                  ))}
                  <button type="button" disabled data-testid="threeD-make-final" className="btn-outline relative min-h-[44px] gap-1.5 px-4 text-sm opacity-60">
                    {t("bar.makeFinal")}
                    <span className="absolute end-1 top-1 h-1.5 w-1.5 rounded-full bg-muted" aria-hidden="true" />
                  </button>
                </div>

                <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-item bg-panel-hover py-10" data-testid="threeD-viewer">
                  {/* THE DRAG SURFACE IS JUST THE BOX, NOT THE BUTTON ROW
                      BELOW IT. setPointerCapture redirects every further
                      pointer event (including the one that would fire a
                      button's own click) to whichever element called it —
                      wrapping the zoom/reset buttons in the same handlers
                      broke their own clicks on press (found 2026-10-31,
                      the first prodtest run of this piece). */}
                  <div
                    className="touch-none select-none"
                    style={{ perspective: 600 }}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                  >
                    <div
                      data-testid="threeD-model-placeholder"
                      data-rotation-x={rotation.x.toFixed(1)}
                      data-rotation-y={rotation.y.toFixed(1)}
                      data-zoom={zoom.toFixed(2)}
                      className="relative h-24 w-24"
                      style={{ transformStyle: "preserve-3d", transform: `scale(${zoom}) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)` }}
                    >
                      <BoxFace transform="translateZ(48px)">{t("viewer.placeholderLabel")}</BoxFace>
                      <BoxFace transform="rotateY(180deg) translateZ(48px)" />
                      <BoxFace transform="rotateY(90deg) translateZ(48px)" />
                      <BoxFace transform="rotateY(-90deg) translateZ(48px)" />
                      <BoxFace transform="rotateX(90deg) translateZ(48px)" />
                      <BoxFace transform="rotateX(-90deg) translateZ(48px)" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - ZOOM_STEP).toFixed(2)))} aria-label={t("viewer.zoomOut")} title={t("viewer.zoomOut")} data-testid="threeD-zoom-out" className={ACTION}>
                      <ZoomOut className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + ZOOM_STEP).toFixed(2)))} aria-label={t("viewer.zoomIn")} title={t("viewer.zoomIn")} data-testid="threeD-zoom-in" className={ACTION}>
                      <ZoomIn className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button type="button" onClick={resetView} aria-label={t("viewer.reset")} title={t("viewer.reset")} data-testid="threeD-reset" className={ACTION}>
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div data-testid="threeD-photos" className="space-y-2">
                  <p className="text-xs font-medium text-foreground">{t("photos.heading")}</p>
                  <ul className="flex flex-wrap gap-2">
                    {photos.map((photo) => (
                      <li key={photo.id} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived local object URL, never uploaded */}
                        <img src={photo.url} alt="" className="h-16 w-16 rounded-item object-cover" />
                        <button type="button" onClick={() => removePhoto(photo.id)} aria-label={t("photos.remove")} data-testid="threeD-photo-remove" className="absolute -end-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-background text-foreground">
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="w-full shrink-0 space-y-4 overflow-y-auto lg:w-64" data-testid="threeD-settings-panel">
                <OptionGroup label={t("panel.type")} options={TYPES} value={type} onChange={setType} labels={typeLabels} testId="threeD-panel-type" />
                <OptionGroup label={t("panel.quality")} options={QUALITIES} value={quality} onChange={setQuality} labels={qualityLabels} testId="threeD-panel-quality" />

                <div data-testid="threeD-real-size">
                  <p className="mb-1.5 text-xs font-medium text-foreground">{t("panel.realSize")}</p>
                  <button type="button" disabled aria-label={t("panel.realSize")} className={`${ACTION} relative w-auto gap-1.5 px-3 opacity-60`}>
                    <Ruler className="h-4 w-4" aria-hidden="true" />
                    <span className="text-xs">{t("panel.realSizeUnknown")}</span>
                    <span className="absolute end-1 top-1 h-1.5 w-1.5 rounded-full bg-muted" aria-hidden="true" />
                  </button>
                </div>

                <OptionGroup label={t("panel.format")} options={FORMATS} value={format} onChange={setFormat} labels={formatLabels} testId="threeD-panel-format" />
                <OptionGroup label={t("panel.background")} options={BACKGROUNDS} value={background} onChange={setBackground} labels={backgroundLabels} testId="threeD-panel-background" />

                <p data-testid="threeD-price" className="text-xs text-muted">
                  {t("panel.price")}: <span className="text-foreground">—</span>
                </p>
              </div>
            </div>
          ),
        }
      : null;

  return (
    <ToolShell
      name={tNames("threeD")}
      turns={shellTurns}
      placeholder={t("placeholder")}
      sending={false}
      onSend={send}
      attach={{ accept: "image/*", label: t("attachPhotos"), onFiles: addPhotos }}
      empty={{
        heading: t("empty.heading"),
        examples: [
          { key: "a", label: tExamples("a") },
          { key: "b", label: tExamples("b") },
          { key: "c", label: tExamples("c") },
        ],
      }}
      work={work}
      onCloseWork={closeWork}
    />
  );
}
