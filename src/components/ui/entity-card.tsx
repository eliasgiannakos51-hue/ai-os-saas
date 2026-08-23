"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { moduleAccent } from "@/lib/module-colors";
import { CardMenu, type CardMenuAction } from "@/components/ui/card-menu";

export type EntityCardTag = {
  key: string;
  label: string;
  /** "accent" tints the tag with the card's own module colour. */
  tone?: "default" | "accent";
};

export type EntityCardStatusTone = "neutral" | "active" | "success" | "warning" | "danger";

export type EntityCardStatus = {
  label: string;
  tone: EntityCardStatusTone;
  /** Adds the shared pulse to the dot — for "something is running now". */
  pulse?: boolean;
};

const STATUS_TONE: Record<EntityCardStatusTone, { dot: string; text: string }> = {
  neutral: { dot: "bg-muted", text: "text-muted" },
  active: { dot: "bg-orange-400", text: "text-orange-400" },
  success: { dot: "bg-emerald-400", text: "text-emerald-400" },
  warning: { dot: "bg-amber-400", text: "text-amber-400" },
  danger: { dot: "bg-red-400", text: "text-red-400" },
};

/**
 * The one card every list in the app renders.
 *
 * Fixed internal structure, in this order, so two cards from two
 * unrelated modules are recognisably the same object:
 *
 *   1. icon in a small tinted rounded-square, top-left
 *   2. the star and the "..." menu, top-right
 *   3. title
 *   4. one- or two-line description (clamped, never taller)
 *   5. optional extra body (`children`)
 *   6. tags along the bottom-left, status indicator bottom-right
 *
 * A slot is deliberately NOT provided for "an arbitrary row of buttons":
 * per-card actions belong in the "..." menu, which is what keeps the
 * bottom edge of every card looking the same. `children` exists for
 * content (linked entities, a step list), not for controls.
 *
 * Clicking the card body selects it. That's implemented as a stretched
 * title link/button covering the card rather than an onClick on the root,
 * so the primary action is a real focusable control with a real
 * accessible name, and the star/menu — which sit above it on the z axis —
 * stay independently clickable.
 */
export function EntityCard({
  icon: Icon,
  accentSlug,
  media,
  title,
  description,
  tags = [],
  status,
  menu = [],
  menuLabel,
  menuExtra,
  corner,
  href,
  onSelect,
  selected = false,
  children,
  index,
  "data-testid": testId,
}: {
  icon: LucideIcon;
  /** Module slug — picks the icon tile's colour (lib/module-colors.ts). */
  accentSlug: string;
  /** Replaces the icon tile entirely (e.g. a real website thumbnail). */
  media?: ReactNode;
  title: string;
  description?: string | null;
  tags?: EntityCardTag[];
  status?: EntityCardStatus | null;
  menu?: CardMenuAction[];
  menuLabel?: string;
  menuExtra?: (close: () => void) => ReactNode;
  /** Rendered next to the menu — in practice always the FavoriteButton. */
  corner?: ReactNode;
  href?: string;
  onSelect?: () => void;
  selected?: boolean;
  children?: ReactNode;
  /** Position in the list — drives the staggered entrance animation. */
  index?: number;
  "data-testid"?: string;
}) {
  const accent = moduleAccent(accentSlug);
  const tone = status ? STATUS_TONE[status.tone] : null;
  const interactive = Boolean(href || onSelect);

  // The corner controls sit in their own flex row rather than absolutely
  // positioned, so the icon tile and they can never overlap on a narrow
  // (375px) card no matter how the two are sized.
  const cornerControls = (corner || menu.length > 0 || menuExtra) && (
    <div className="flex shrink-0 items-center gap-1.5">
      {corner}
      {(menu.length > 0 || menuExtra) && (
        <CardMenu actions={menu} label={menuLabel ?? title} extra={menuExtra} />
      )}
    </div>
  );

  return (
    <div
      data-row
      data-testid={testId}
      // Exposed as an attribute as well as a class so "is this row
      // selected" can be asserted without matching on styling — the
      // highlight is a design decision and may change; the state may not.
      data-selected={selected ? "true" : undefined}
      style={index === undefined ? undefined : ({ "--i": index } as CSSProperties)}
      className={[
        "card-lift group relative flex flex-col rounded-2xl border p-4 transition-colors duration-200",
        index === undefined ? "" : "list-slide-in",
        selected
          ? "border-orange-500/50 bg-[linear-gradient(160deg,rgb(var(--panel))_0%,rgb(var(--panel))_60%,rgba(249,115,22,0.07)_100%)]"
          : "border-border bg-[linear-gradient(160deg,rgb(var(--panel))_0%,rgb(var(--panel))_65%,rgba(249,115,22,0.035)_100%)] hover:border-orange-500/40",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        {media ?? (
          <span
            aria-hidden="true"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${accent}`}
          >
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
        {cornerControls}
      </div>

      <h3 className="mt-3 text-[15px] font-semibold leading-snug tracking-tight text-foreground">
        {interactive ? (
          href ? (
            <Link
              href={href}
              className="line-clamp-2 outline-none after:absolute after:inset-0 after:rounded-2xl group-hover:text-orange-400 focus-visible:after:ring-2 focus-visible:after:ring-orange-500/60"
            >
              {title}
            </Link>
          ) : (
            <button
              type="button"
              onClick={onSelect}
              className="line-clamp-2 text-left outline-none after:absolute after:inset-0 after:rounded-2xl group-hover:text-orange-400 focus-visible:after:ring-2 focus-visible:after:ring-orange-500/60"
            >
              {title}
            </button>
          )
        ) : (
          <span className="line-clamp-2">{title}</span>
        )}
      </h3>

      {description ? (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{description}</p>
      ) : null}

      {/* Positioned, so the children slot paints above the title's
          stretched ::after overlay — it can hold real controls
          (LinkedEntities' unlink buttons) and those must stay clickable
          rather than being swallowed into "select this card". */}
      {children ? <div className="relative z-[1] mt-3">{children}</div> : null}

      {(tags.length > 0 || status) && (
        <>
          {/* Grows to absorb the height difference between two cards whose
              descriptions are different lengths, so the tag/status strip
              below lands on the same line across a whole row instead of
              floating right under whatever text happens to be there. */}
          <div aria-hidden="true" className="min-h-[12px] grow" />
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border/70 pt-3">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag.key}
                className={`inline-flex max-w-[12rem] items-center truncate rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                  tag.tone === "accent" ? accent : "border-border bg-input text-muted"
                }`}
              >
                {tag.label}
              </span>
            ))}
          </div>
          {status && tone && (
            // `shrink-0` with no width cap is what made this the widest
            // element on the page: with a real record whose status label
            // ran to 74 characters, the badge refused to shrink AND had
            // nowhere to wrap, so it pushed /dashboard/trading-workflow to
            // 1135px inside a 1024px window — sideways scroll on a laptop.
            // Capped and truncated like the tags directly above it, which
            // already had exactly this treatment.
            <span
              className={`inline-flex min-w-0 max-w-[12rem] shrink-0 items-center gap-1.5 truncate text-[11px] font-medium ${tone.text}`}
              title={status.label}
            >
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${tone.dot} ${status.pulse ? "stat-pulse" : ""}`}
              />
              {status.label}
            </span>
          )}
          </div>
        </>
      )}
    </div>
  );
}

/** The grid every EntityCard list sits in — one column on phones, two from `sm`. */
export function CardGrid({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {children}
    </div>
  );
}
