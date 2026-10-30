"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, Download, Film, Globe, Maximize2, Megaphone, Plus, Trash2, X, Zap } from "lucide-react";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { LargeActionConfirm } from "@/components/credits/cost-estimate";
import { useCredits } from "@/components/credits/credits-context";
import { ToolShell, ACTION, ChosenBox, OPTION, type ShellTurn } from "@/components/shell/tool-shell";
import { ShellHistoryColumn } from "@/components/shell/shell-history-column";
import type { ChatComposerHandle } from "@/components/chat/chat-composer";
import { needsLargeActionConfirmation } from "@/lib/billing/credit-formula";
import { DEFAULTS } from "@/lib/billing/pricing-config";
import { HelpTip } from "@/components/ui/help-tip";
import { ALL_TOOLS } from "@/lib/nav/all-tools";
import type { ImagePrices } from "@/lib/images/image-pricing";
import {
  IMAGE_ASPECTS,
  IMAGE_VARIANTS,
  MAX_IMAGE_DESCRIPTION_CHARS,
  MAX_IMAGE_INSTRUCTION_CHARS,
  MAX_SAME_PRODUCT_IMAGES,
  type ImageAspect,
  type ShownImage,
} from "@/lib/images/image-studio";

/**
 * THE IMAGE TOOL (MASTER 16, package 19), behind the switch
 * "image-studio": «παίρνω 4 παραλλαγές, αλλάζω μία με λόγια, και την
 * κατεβάζω στην υψηλότερη ανάλυση».
 *
 * What is said in the field is the description; four pictures open on the
 * right. Pressing one CHOOSES it: the field then changes that picture
 * alone, and under it are its two downloads — the picture as it is, and
 * the largest size, with its price on the button. Every price is on the
 * screen before anything is spent (lib/images/image-pricing.ts, the same
 * numbers the routes hold), and a large one asks once more.
 *
 * Every refusal is a code from the routes, said here in the reader's
 * language. Held by scripts/tests/image-studio.test.mjs.
 *
 * THE WORK PANEL'S THREE COLUMNS (owner, 2026-10-30, Κομμάτι 2 of "16.
 * IMAGE: ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΤΗ ΝΕΑ ΟΘΟΝΗ ΚΑΙ ΤΑ ΝΕΑ ΚΟΥΜΠΙΑ" — the owner's
 * own stop-gate: the screen only, nothing wired further until "εγκρίνω").
 * A tools rail on the left (Product ad, Animate — both chrome only
 * today, no route calls), the existing grid+actions unchanged in the
 * center, and a panel on the right (Same product's up-to-four reference
 * images, Search the web first). Animate's enabled state is read from
 * ALL_TOOLS so it switches on by itself once Video and Editing are
 * ready, with no code change here — the owner's own words for it.
 */
type Turn = { id: string; role: "user" | "tool"; text: string; image?: string };
type Running = "variants" | "edit" | "full" | null;


const ASPECT_CLASS: Record<ImageAspect, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "16:9": "aspect-video",
  "9:16": "aspect-[9/16]",
};

export function ImageShell({
  initialImages,
  initialOpenId = null,
  prices,
  configured,
  initialText,
}: {
  initialImages: ShownImage[];
  /** An image to open on arrival — `?record=` from the Library. */
  initialOpenId?: string | null;
  prices: ImagePrices;
  /** Whether the provider's key is set; without it nothing can be made, and nothing is charged. */
  configured: boolean;
  /** A quick-job tile's example text, dropped into the field unsent (lib/nav/quick-jobs.ts). */
  initialText?: string;
}) {
  const t = useTranslations("dashboard.images");
  const tSteps = useTranslations("aiSteps");
  const tSoon = useTranslations("dashboard.comingSoon");
  const router = useRouter();
  const { refresh: refreshCredits } = useCredits();
  const composerRef = useRef<ChatComposerHandle>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [images, setImages] = useState<ShownImage[]>(initialImages);
  const asked = initialOpenId ? initialImages.find((image) => image.id === initialOpenId) : undefined;
  const [shownId, setShownId] = useState<string | null>(asked?.id ?? null);
  const [open, setOpen] = useState<"image" | null>(asked ? "image" : null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [aspect, setAspect] = useState<ImageAspect>(IMAGE_ASPECTS[0]);
  const [choosingAspect, setChoosingAspect] = useState(false);
  const [running, setRunning] = useState<Running>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [confirming, setConfirming] = useState<{ credits: number; go: () => void } | null>(null);

  // SAME PRODUCT + SEARCH THE WEB FIRST — chrome only this round (the
  // owner's stop-gate on Κομμάτι 2): local state, never sent to a route.
  const [sameProductImages, setSameProductImages] = useState<{ id: string; url: string }[]>([]);
  const [searchWebFirst, setSearchWebFirst] = useState(false);
  const sameProductInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Revoke on unmount only — removing one slot revokes its own URL
    // immediately (removeSameProductImage), this is the whole-list sweep.
    return () => {
      for (const image of sameProductImages) URL.revokeObjectURL(image.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only
  }, []);
  function addSameProductImages(files: FileList | null) {
    if (!files) return;
    setSameProductImages((prev) => {
      const room = MAX_SAME_PRODUCT_IMAGES - prev.length;
      const picked = Array.from(files)
        .filter((f) => f.type.startsWith("image/"))
        .slice(0, Math.max(0, room));
      const added = picked.map((f) => ({ id: `${Date.now()}-${f.name}-${prev.length + picked.indexOf(f)}`, url: URL.createObjectURL(f) }));
      return [...prev, ...added];
    });
  }
  function removeSameProductImage(id: string) {
    setSameProductImages((prev) => {
      const gone = prev.find((image) => image.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((image) => image.id !== id);
    });
  }

  // ANIMATE TURNS ON BY ITSELF, no code change here, once both are ready
  // (the owner's own words, piece 10) — read from the one registry both
  // tiles already use, never a local flag that could drift from it.
  const animateReady = ALL_TOOLS.find((tool) => tool.name === "video")?.ready === true && ALL_TOOLS.find((tool) => tool.name === "editing")?.ready === true;

  // THE [◧] COLUMN, remembered per device — same key shape as Chat's own
  // (components/chat/chat-workspace.tsx, components/chat/conversation-column.tsx).
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    try {
      setHistoryOpen(window.localStorage.getItem("ionexa.imageHistoryColumn") === "open");
    } catch {
      // private window or storage off: closed, which is the default
    }
  }, []);
  function toggleHistory() {
    setHistoryOpen((isOpen) => {
      const next = !isOpen;
      try {
        window.localStorage.setItem("ionexa.imageHistoryColumn", next ? "open" : "closed");
      } catch {
        // nothing to persist to; the toggle still works for this visit
      }
      return next;
    });
  }

  // LITERAL KEYS, so the message slicer can see every word this screen uses.
  const aspectLabel: Record<ImageAspect, string> = {
    "1:1": t("aspects.square"),
    "4:5": t("aspects.portrait"),
    "16:9": t("aspects.wide"),
    "9:16": t("aspects.story"),
  };
  const shown = images.find((image) => image.id === shownId) ?? null;
  // THE CHOICE OUTLIVES THE PANE. On a phone the pictures cover the
  // conversation, so choosing one and going back to type is the only way
  // to change it: closing the pane must not forget which one was chosen.
  // It is cleared by its own ✕ (ChosenBox), or by opening another image.
  const editing = shown !== null && chosen !== null;

  function say(role: Turn["role"], text: string, image?: string) {
    setTurns((prev) => [...prev, { id: `${role}${prev.length}`, role, text, image }]);
  }

  /** A route's refusal, in words. */
  function refusal(code: string, limit?: number): string {
    switch (code) {
      case "too_short":
        return t("errors.tooShort");
      case "too_long":
        return t("errors.tooLong", { limit: limit ?? 0 });
      case "insufficient_credits":
      case "reserve_failed":
        return t("errors.insufficient");
      case "rate_limited":
      case "bypass_ceiling":
        return t("errors.rateLimited");
      case "not_configured":
        return t("notConfigured");
      case "refused":
        return t("errors.refused");
      case "busy":
        return t("errors.busy");
      case "not_found":
      case "no_such_picture":
        return t("errors.gone");
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

  function place(image: ShownImage) {
    setImages((prev) => [image, ...prev.filter((p) => p.id !== image.id)]);
    setShownId(image.id);
    setOpen("image");
  }

  async function call(url: string, body: Record<string, unknown>, kind: Exclude<Running, null>): Promise<Record<string, unknown> | null> {
    setRunning(kind);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      void refreshCredits();
      if (!response.ok || !data?.ok) {
        say("tool", refusal(String(data?.code ?? ""), typeof data?.limit === "number" ? data.limit : undefined));
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

  async function make(description: string) {
    const data = await call("/api/images/generate", { description, aspect }, "variants");
    if (!data) return;
    const image = data.image as ShownImage;
    place(image);
    setChosen(null);
    say("tool", t("made", { made: Number(data.made ?? 0), asked: IMAGE_VARIANTS }), image.id);
    router.refresh();
  }

  async function change(instruction: string, image: ShownImage, index: number) {
    const data = await call(`/api/images/${image.id}/edit`, { variant: index, instruction }, "edit");
    if (!data) return;
    place(data.image as ShownImage);
    say("tool", t("changed", { n: index + 1 }), image.id);
  }

  async function full(image: ShownImage, index: number) {
    const data = await call(`/api/images/${image.id}/full`, { variant: index }, "full");
    if (!data || typeof data.url !== "string") return;
    setImages((prev) =>
      prev.map((p) => (p.id === image.id ? { ...p, variants: p.variants.map((v) => (v.index === index ? { ...v, full: true } : v)) } : p))
    );
    say("tool", t("fullReady", { n: index + 1 }));
    // The address saves the file (Content-Disposition), so the page stays.
    window.location.assign(data.url);
  }

  // BARE DELETE, no confirm of its own — the work panel's trash button
  // confirms before calling this, and the [◧] column (ShellHistoryColumn)
  // confirms its own way; neither should ask twice.
  async function removeImage(image: ShownImage) {
    try {
      const response = await fetch(`/api/images/${image.id}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        say("tool", refusal(String(data?.code ?? "")));
        return;
      }
      setImages((prev) => prev.filter((p) => p.id !== image.id));
      if (shownId === image.id) {
        setShownId(null);
        setChosen(null);
        setOpen(null);
      }
      router.refresh();
    } catch {
      say("tool", t("errors.offline"));
    }
  }

  function send(text: string) {
    if (running) return;
    say("user", text);
    if (!configured) {
      say("tool", t("notConfigured"));
      return;
    }
    if (editing && shown && chosen !== null) {
      const target = shown;
      const index = chosen;
      withConfirm(prices.edit, () => void change(text.slice(0, MAX_IMAGE_INSTRUCTION_CHARS), target, index));
    } else {
      withConfirm(prices.variants, () => void make(text.slice(0, MAX_IMAGE_DESCRIPTION_CHARS)));
    }
  }

  const shellTurns: ShellTurn[] = turns.map((turn) => {
    const image = turn.image ? images.find((i) => i.id === turn.image) : undefined;
    return image
      ? {
          id: turn.id,
          role: turn.role,
          text: turn.text,
          card: {
            title: image.prompt,
            open: open === "image" && shownId === image.id,
            onOpen: () => {
              setShownId(image.id);
              setChosen(null);
              setOpen("image");
            },
          },
        }
      : { id: turn.id, role: turn.role, text: turn.text };
  });

  const chosenVariant = shown && chosen !== null ? shown.variants.find((v) => v.index === chosen) ?? null : null;

  const work =
    open === "image" && shown
      ? {
          title: shown.prompt,
          actions: (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(t("deleteConfirm"))) void removeImage(shown);
              }}
              aria-label={t("delete")}
              title={t("delete")}
              data-testid="image-delete"
              className={ACTION}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ),
          body: (
            <div className="flex h-full flex-col gap-4 lg:flex-row">
              <div className="flex shrink-0 flex-row gap-1 lg:w-12 lg:flex-col" data-testid="image-tools-rail">
                <button
                  type="button"
                  disabled
                  data-testid="image-tool-product-ad"
                  aria-label={`${t("tools.productAd")} — ${tSoon("badge")}`}
                  title={`${t("tools.productAd")} — ${tSoon("badge")}`}
                  className={`${ACTION} relative opacity-60`}
                >
                  <Megaphone className="h-4 w-4" aria-hidden="true" />
                  <span className="absolute end-1 top-1 h-1.5 w-1.5 rounded-full bg-muted" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={!animateReady}
                  data-testid="image-tool-animate"
                  aria-label={animateReady ? t("tools.animate") : `${t("tools.animate")} — ${tSoon("badge")}`}
                  title={animateReady ? t("tools.animate") : `${t("tools.animate")} — ${tSoon("badge")}`}
                  className={`${ACTION} relative ${animateReady ? "" : "opacity-60"}`}
                >
                  <Film className="h-4 w-4" aria-hidden="true" />
                  {!animateReady && <span className="absolute end-1 top-1 h-1.5 w-1.5 rounded-full bg-muted" aria-hidden="true" />}
                </button>
              </div>

              <div className="min-w-0 flex-1 space-y-3">
                {shown.variants.length < IMAGE_VARIANTS && <p className="text-xs text-muted">{t("made", { made: shown.variants.length, asked: IMAGE_VARIANTS })}</p>}
                <ul data-testid="image-grid" className="grid grid-cols-2 gap-2">
                  {shown.variants.map((variant) => (
                    <li key={`${variant.index}-${variant.url}`}>
                      <button
                        type="button"
                        onClick={() => setChosen((current) => (current === variant.index ? null : variant.index))}
                        aria-pressed={chosen === variant.index}
                        aria-label={t("picture", { n: variant.index + 1 })}
                        data-testid="image-variant"
                        className={`relative block w-full overflow-hidden rounded-item bg-panel ${ASPECT_CLASS[shown.aspect]} ${chosen === variant.index ? "ring-2 ring-foreground" : ""}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- a short signed address to a private bucket; next/image would proxy and cache it */}
                        <img src={variant.url} alt={t("picture", { n: variant.index + 1 })} className="h-full w-full object-cover" />
                        <span className="absolute start-1.5 top-1.5 rounded-item bg-background/80 px-1.5 text-[11px] text-foreground">{variant.index + 1}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {chosenVariant ? (
                  <div data-testid="image-chosen" className="flex flex-wrap items-center gap-2">
                    <a
                      href={`/api/images/${shown.id}/download?variant=${chosenVariant.index}`}
                      data-testid="image-download"
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-item bg-panel px-3 text-xs text-foreground hover:bg-panel-hover"
                    >
                      <Download className="h-3.5 w-3.5" aria-hidden="true" />
                      {t("download")}
                    </a>
                    {chosenVariant.full ? (
                      <a
                        href={`/api/images/${shown.id}/download?variant=${chosenVariant.index}&size=full`}
                        data-testid="image-full"
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-item bg-panel px-3 text-xs text-foreground hover:bg-panel-hover"
                      >
                        <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {t("fullDownload")}
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled={running !== null || !configured}
                        onClick={() => withConfirm(prices.full, () => void full(shown, chosenVariant.index))}
                        data-testid="image-full"
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-item bg-panel px-3 text-xs text-foreground hover:bg-panel-hover disabled:opacity-60"
                      >
                        {running === "full" ? <ThinkingIndicator size="sm" /> : <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />}
                        {t("fullMake")}
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-muted">
                          <Zap className="h-3 w-3" aria-hidden="true" />
                          {t("price", { count: prices.full })}
                        </span>
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted">{t("choose")}</p>
                )}
              </div>

              <div className="shrink-0 space-y-4 lg:w-56" data-testid="image-settings-panel">
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-foreground">
                    {t("tools.sameProduct")} <span className="font-normal text-muted">({sameProductImages.length}/{MAX_SAME_PRODUCT_IMAGES})</span>
                  </p>
                  <div className="grid grid-cols-4 gap-1.5" data-testid="image-same-product">
                    {Array.from({ length: MAX_SAME_PRODUCT_IMAGES }).map((_, i) => {
                      const ref = sameProductImages[i];
                      if (ref) {
                        return (
                          <div key={ref.id} className="relative aspect-square overflow-hidden rounded-item bg-panel" data-testid="image-same-product-slot">
                            {/* eslint-disable-next-line @next/next/no-img-element -- a local object URL preview, never uploaded anywhere yet */}
                            <img src={ref.url} alt="" className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => removeSameProductImage(ref.id)}
                              aria-label={t("tools.removeReference")}
                              className="absolute end-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-background/80 text-foreground"
                            >
                              <X className="h-3 w-3" aria-hidden="true" />
                            </button>
                          </div>
                        );
                      }
                      return (
                        <button
                          key={`empty-${i}`}
                          type="button"
                          onClick={() => sameProductInputRef.current?.click()}
                          aria-label={t("tools.addReference")}
                          data-testid="image-same-product-slot"
                          className="flex aspect-square items-center justify-center rounded-item bg-panel-hover text-muted hover:text-foreground"
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                        </button>
                      );
                    })}
                  </div>
                  <input
                    ref={sameProductInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      addSameProductImages(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={searchWebFirst}
                  aria-label={t("tools.searchWeb")}
                  onClick={() => setSearchWebFirst((v) => !v)}
                  data-testid="image-search-web"
                  className="flex w-full items-center justify-between gap-2"
                >
                  <span className="flex items-center gap-1.5 text-sm text-foreground">
                    <Globe className="h-4 w-4 text-muted" aria-hidden="true" />
                    {t("tools.searchWeb")}
                  </span>
                  <span className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors duration-200 ${searchWebFirst ? "bg-foreground" : "bg-panel-hover"}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full transition-transform duration-200 ${searchWebFirst ? "translate-x-[18px] bg-panel" : "translate-x-1 bg-paper"}`} />
                  </span>
                </button>
              </div>
            </div>
          ),
        }
      : null;

  const working =
    running === "variants" ? t("working.variants") : running === "edit" ? t("working.edit", { n: (chosen ?? 0) + 1 }) : running === "full" ? t("working.full") : null;

  return (
    <>
      <ToolShell
        ref={composerRef}
        name={t("name")}
        help={<HelpTip helpKey="help.images" />}
        initialText={initialText}
        turns={shellTurns}
        working={
          working ? (
            <span className="inline-flex items-center gap-2 text-xs text-muted">
              <ThinkingIndicator size="sm" />
              {working}
            </span>
          ) : null
        }
        placeholder={editing && chosen !== null ? t("placeholderEdit", { n: chosen + 1 }) : t("placeholder")}
        sending={running !== null}
        onSend={send}
        onStop={() => abortRef.current?.abort()}
        options={[
          <span key="aspect" className="relative">
            <button type="button" onClick={() => setChoosingAspect((v) => !v)} aria-expanded={choosingAspect} data-testid="image-aspect" className={OPTION}>
              {aspectLabel[aspect]}
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {choosingAspect && (
              <fieldset className="surface absolute bottom-full start-0 z-10 mb-2 w-56 space-y-1">
                <legend className="sr-only">{t("aspect")}</legend>
                {IMAGE_ASPECTS.map((a) => (
                  <label key={a} className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-foreground">
                    <input
                      type="radio"
                      name="image-aspect"
                      checked={aspect === a}
                      onChange={() => {
                        setAspect(a);
                        setChoosingAspect(false);
                      }}
                    />
                    <span className="flex-1">{aspectLabel[a]}</span>
                  </label>
                ))}
              </fieldset>
            )}
          </span>,
        ]}
        footer={
          <>
            {editing && chosen !== null && <ChosenBox label={t("chosen", { n: chosen + 1 })} onClear={() => setChosen(null)} />}
            {turns.length === 0 && !editing && <p className="mt-1.5 text-[11px] text-muted">{t("help")}</p>}
            {configured ? (
              <p data-testid="image-price" className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
                <Zap className="h-3 w-3 text-foreground/70" aria-hidden="true" />
                {editing ? t("priceEdit", { count: prices.edit }) : t("priceVariants", { count: prices.variants, n: IMAGE_VARIANTS })}
              </p>
            ) : (
              <p data-testid="image-not-configured" className="mt-1.5 text-[11px] text-warning">
                {t("notConfigured")}
              </p>
            )}
          </>
        }
        empty={{
          heading: t("empty.heading"),
          examples: [
            { key: "logo", label: t("empty.examples.logo") },
            { key: "poster", label: t("empty.examples.poster") },
            { key: "avatar", label: t("empty.examples.avatar") },
          ],
        }}
        history={{
          open: historyOpen,
          onToggle: toggleHistory,
          onNew: () => {
            setTurns([]);
            setShownId(null);
            setChosen(null);
            setOpen(null);
          },
          newLabel: t("new"),
          column: (
            <ShellHistoryColumn
              rows={images.map((image) => ({ id: image.id, title: image.prompt }))}
              activeId={open === "image" ? shownId : null}
              onOpen={(id) => {
                setShownId(id);
                setChosen(null);
                setOpen("image");
              }}
              onDelete={async (id) => {
                const image = images.find((i) => i.id === id);
                if (image) await removeImage(image);
              }}
              onNavigate={() => {
                if (typeof window !== "undefined" && window.innerWidth < 768) toggleHistory();
              }}
            />
          ),
        }}
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
