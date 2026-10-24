"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { LayoutGrid, Pin, PinOff, Search, type LucideIcon } from "lucide-react";
import { ALL_SIDEBAR_GROUPS, MAIN_SIDEBAR_GROUPS, sidebarGroups, type SidebarItem } from "@/lib/sidebar-nav";
import { ITEM_LABEL_KEYS } from "@/lib/sidebar-label-keys";
import { filterAndRankCandidates } from "@/lib/command-palette-match";
import { aliasesFor } from "@/lib/palette-aliases";
import { ALL_TOOLS, ALL_TOOLS_GROUP_ORDER, type AllToolsGroupKey, type AllToolsNameKey } from "@/lib/nav/all-tools";
import { QUICK_JOBS, quickJobHref, type QuickJob } from "@/lib/nav/quick-jobs";
import { NEVER_RECENT } from "@/lib/nav/recent-tools";
import { useToast } from "@/components/toast/toast-context";
import { MY_STUFF_ICON, CHAT_ICON } from "@/lib/module-icons";
import { Hammer, Languages, LayoutTemplate, Clapperboard, Scissors, UserRound, Music, Laptop } from "lucide-react";

/** The icon of a tool that has no sidebar row of its own — every new
 *  address this round (and the chat row, which quick jobs point to but
 *  which the search's OWN icon map never carried). */
const ROWLESS_ICONS: Record<string, LucideIcon> = {
  "/dashboard/my-stuff": MY_STUFF_ICON,
  "/dashboard/rebuild": Hammer,
  "/dashboard/translate": Languages,
  "/dashboard/app-builder": LayoutTemplate,
  "/dashboard/video-studio": Clapperboard,
  "/dashboard/films": Clapperboard,
  "/dashboard/editing": Scissors,
  "/dashboard/avatars": UserRound,
  "/dashboard/audio": Music,
  "/dashboard/iowork": Laptop,
  "/dashboard/chat": CHAT_ICON,
};

/**
 * ALL TOOLS, EVERY SQUARE (the owner's message, 2026-10-24): big square
 * tiles, five to six in a row on a computer and two on a phone, in six
 * groups — Record, Ask, Make, Run on its own, Organise, Learn — with a
 * search on top and no «beta» anywhere. Under each group's big tiles, a
 * row of smaller ready-made jobs (lib/nav/quick-jobs.ts): name and icon
 * only, opening an existing tool with its field already filled.
 *
 * EVERY BIG TILE IS DRAWN, even one that is not built yet — a small
 * «Σύντομα» mark, and its address is components/tools/coming-soon-shell.tsx
 * instead of the real tool (`live` says which addresses are real; every
 * other registry entry is still a tile, just not a live one).
 *
 * THE SAME SEARCH AS ⌘K: a tile or a job answers to its name on screen,
 * its English name, lib/palette-aliases.ts and its one-line description,
 * ranked by lib/command-palette-match.ts.
 *
 * THE PIN is the only way to put a tool in the sidebar at once (the
 * Recent tools rule, ΣΥΣΤΗΜΑ DESIGN §3); it writes through the same
 * /api/nav/recent-tools the sidebar uses. A tool with no visible sidebar
 * row cannot be pinned (the route takes only those), so those tiles —
 * and every small job, which never had a row of its own — have no pin.
 */
export function ToolsGrid({ isOwner, pinned = [], live = [] }: { isOwner: boolean; pinned?: string[]; live?: string[] }) {
  const t = useTranslations("dashboard.tools");
  const tJobs = useTranslations("dashboard.quickJobs");
  const tSidebar = useTranslations("sidebar");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();
  const [query, setQuery] = useState("");
  const [pins, setPins] = useState<string[]>(pinned);
  const liveSet = useMemo(() => new Set(live), [live]);

  const everyItem = useMemo(() => new Map(ALL_SIDEBAR_GROUPS.flatMap((g) => g.items.map((i) => [i.href, i] as const))), []);
  const mainRows = useMemo(
    () => new Map(sidebarGroups(MAIN_SIDEBAR_GROUPS, isOwner).flatMap((g) => g.items.map((i) => [i.href, i] as const))),
    [isOwner]
  );
  const iconFor = (href: string): LucideIcon => everyItem.get(href)?.icon ?? ROWLESS_ICONS[href] ?? LayoutGrid;

  // THE NAMES, through literal keys so the message slicer can bound what
  // this page needs (lib/i18n/message-slices.ts) — a template-literal key
  // is unbounded.
  const names: Record<AllToolsNameKey, string> = {
    myStuff: t("names.myStuff"),
    connect: t("names.connect"),
    meetings: t("names.meetings"),
    analyze: t("names.analyze"),
    research: t("names.research"),
    translate: t("names.translate"),
    rebuild: t("names.rebuild"),
    site: t("names.site"),
    apps: t("names.apps"),
    games: t("names.games"),
    document: t("names.document"),
    slides: t("names.slides"),
    posts: t("names.posts"),
    image: t("names.image"),
    video: t("names.video"),
    films: t("names.films"),
    editing: t("names.editing"),
    avatars: t("names.avatars"),
    audio: t("names.audio"),
    coding: t("names.coding"),
    agents: t("names.agents"),
    automations: t("names.automations"),
    iowork: t("names.iowork"),
    projects: t("names.projects"),
    files: t("names.files"),
    goals: t("names.goals"),
    library: t("names.library"),
    memory: t("names.memory"),
    finances: t("names.finances"),
    sales: t("names.sales"),
    trading: t("names.trading"),
  };
  // THE ONE LINE UNDER EACH NAME, short enough that the tile stays square
  // on a phone.
  const lines: Record<AllToolsNameKey, string> = {
    myStuff: t("lines.myStuff"),
    connect: t("lines.connect"),
    meetings: t("lines.meetings"),
    analyze: t("lines.analyze"),
    research: t("lines.research"),
    translate: t("lines.translate"),
    rebuild: t("lines.rebuild"),
    site: t("lines.site"),
    apps: t("lines.apps"),
    games: t("lines.games"),
    document: t("lines.document"),
    slides: t("lines.slides"),
    posts: t("lines.posts"),
    image: t("lines.image"),
    video: t("lines.video"),
    films: t("lines.films"),
    editing: t("lines.editing"),
    avatars: t("lines.avatars"),
    audio: t("lines.audio"),
    coding: t("lines.coding"),
    agents: t("lines.agents"),
    automations: t("lines.automations"),
    iowork: t("lines.iowork"),
    projects: t("lines.projects"),
    files: t("lines.files"),
    goals: t("lines.goals"),
    library: t("lines.library"),
    memory: t("lines.memory"),
    finances: t("lines.finances"),
    sales: t("lines.sales"),
    trading: t("lines.trading"),
  };
  // Literal headings, same reason.
  const headings: Record<AllToolsGroupKey, string> = {
    record: t("groups.record"),
    ask: t("groups.ask"),
    make: t("groups.make"),
    runAlone: t("groups.runAlone"),
    organise: t("groups.organise"),
    learn: t("groups.learn"),
  };

  const nameKey = (href: string): AllToolsNameKey | undefined => ALL_TOOLS.find((tool) => tool.href === href)?.name;
  // The sidebar's longer name stays a search word: "Build a site" still
  // finds Site, and "παρουσ" still finds Slides in Greek.
  const longLabel = (item: SidebarItem) =>
    item.label === "Create Studio"
      ? tCommon("createStudio")
      : ITEM_LABEL_KEYS[item.label]
        ? tSidebar(`items.${ITEM_LABEL_KEYS[item.label]}`)
        : item.label;
  const sidebarHint = (item: SidebarItem) => (item.hintKey ? tSidebar(`hints.${item.hintKey}`) : "");
  const bigLabel = (href: string) => { const k = nameKey(href); const item = everyItem.get(href); return k ? names[k] : item ? longLabel(item) : href; };
  const bigHint = (href: string) => { const k = nameKey(href); const item = everyItem.get(href); return k ? lines[k] : item ? sidebarHint(item) : ""; };

  const groups = useMemo(
    () =>
      ALL_TOOLS_GROUP_ORDER.map((key) => ({
        key,
        heading: headings[key],
        big: ALL_TOOLS.filter((tool) => tool.group === key),
        small: QUICK_JOBS.filter((job) => job.group === key),
      })).filter((g) => g.big.length > 0 || g.small.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale]
  );

  const jobText = (job: QuickJob) => (job.param ? tJobs(`${job.id}.text`) : undefined);
  const jobLabel = (job: QuickJob) => tJobs(`${job.id}.label`);

  const results = query.trim()
    ? (() => {
        const bigCandidates = ALL_TOOLS.map((tool) => ({
          kind: "big" as const,
          tool,
          item: {
            href: tool.href,
            label: bigLabel(tool.href),
            candidates: [
              bigLabel(tool.href),
              everyItem.get(tool.href) ? longLabel(everyItem.get(tool.href)!) : "",
              ...aliasesFor(ITEM_LABEL_KEYS[everyItem.get(tool.href)?.label ?? ""] ?? "", locale),
              bigHint(tool.href),
              sidebarHint(everyItem.get(tool.href) ?? ({ href: tool.href, label: "", icon: LayoutGrid } as SidebarItem)),
            ],
          },
        }));
        const smallCandidates = QUICK_JOBS.map((job) => ({
          kind: "small" as const,
          job,
          item: { href: job.id, label: jobLabel(job), candidates: [jobLabel(job), bigLabel(job.href)] },
        }));
        return filterAndRankCandidates([...bigCandidates, ...smallCandidates].map((c) => ({ item: c, candidates: c.item.candidates })), query);
      })()
    : null;

  const togglePin = async (href: string) => {
    const action = pins.includes(href) ? "unpin" : "pin";
    const before = pins;
    setPins((p) => (action === "pin" ? [...p, href] : p.filter((h) => h !== href)));
    try {
      const res = await fetch("/api/nav/recent-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, href }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setPins(before);
      addToast(tSidebar("rail.saveFailed"), "error");
    }
  };

  const bigTile = (tool: (typeof ALL_TOOLS)[number]) => {
    const Icon = iconFor(tool.href);
    const name = bigLabel(tool.href);
    const description = bigHint(tool.href);
    const isLive = liveSet.has(tool.href);
    // A PIN needs a visible row of the sidebar's main groups: Recent tools
    // (api/nav/recent-tools) takes only those, so a pin on any other tile
    // would be refused every time — a button that does nothing.
    const canPin = mainRows.has(tool.href) && !NEVER_RECENT.includes(tool.href) && !tool.href.startsWith("/help") && tool.href !== "/dashboard/settings";
    const isPinned = pins.includes(tool.href);
    return (
      <li key={tool.href} className="group relative">
        <Link
          href={tool.href}
          data-testid="tool-tile"
          data-ready={isLive}
          className="flex flex-col gap-1 rounded-card border border-border bg-panel p-3 transition-colors duration-150 hover:border-foreground focus-visible:border-foreground"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon className="h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
            <span className="min-w-0 break-words text-sm font-medium text-foreground">{name}</span>
            {!isLive && (
              <span data-testid="tool-tile-badge" className="ms-auto shrink-0 rounded-item border border-border bg-panel-hover px-1.5 py-0.5 text-[10px] text-muted">
                {t("comingSoonBadge")}
              </span>
            )}
          </span>
          {description && <span className="block break-words text-xs text-muted">{description}</span>}
        </Link>
        {canPin && (
          <button
            type="button"
            onClick={() => togglePin(tool.href)}
            aria-pressed={isPinned}
            aria-label={tSidebar(isPinned ? "rail.unpin" : "rail.pin", { tool: name })}
            data-testid="tool-pin"
            // HOVER-ONLY ON A COMPUTER, ALWAYS THERE ON TOUCH — the same
            // `md:opacity-0 ... md:group-hover:opacity-100` split
            // components/dashboard/conversation-rows.tsx already uses for
            // its own per-row buttons, so a phone or tablet (no real
            // hover) never loses the only way to pin a tool. A tile
            // that IS pinned keeps its pin visible on a computer too —
            // the same "already set stays shown" rule the favourite
            // star on that same file uses — so unpinning never requires
            // hunting for a hover target first.
            className={`absolute end-1 top-1 flex h-11 w-11 items-center justify-center rounded-item hover:bg-panel-hover hover:text-foreground md:transition-opacity md:duration-150 md:focus-visible:opacity-100 md:group-hover:opacity-100 ${
              isPinned ? "text-foreground" : "text-muted md:opacity-0"
            }`}
          >
            {isPinned ? <PinOff className="h-4 w-4" aria-hidden="true" /> : <Pin className="h-4 w-4" aria-hidden="true" />}
          </button>
        )}
      </li>
    );
  };

  const smallTile = (job: QuickJob) => {
    const Icon = iconFor(job.href);
    const live = liveSet.has(job.href) || job.href === "/dashboard/chat" || job.href === "/dashboard/meetings" || job.href === "/dashboard/translate";
    const href = quickJobHref(job, live ? jobText(job) : undefined);
    return (
      <li key={job.id}>
        <Link
          href={href}
          data-testid="quick-job-tile"
          className="flex min-h-[44px] items-center gap-2 rounded-item border border-border bg-panel px-3 py-2 transition-colors duration-150 hover:border-foreground focus-visible:border-foreground"
        >
          <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
          <span className="min-w-0 truncate text-xs text-foreground">{jobLabel(job)}</span>
        </Link>
      </li>
    );
  };

  const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6";
  // How many of the grid's columns a group of N tiles spans on a wide screen.
  // Literal class names, so Tailwind can see every one of them.
  const SPAN: Record<number, string> = {
    1: "lg:col-span-1 xl:col-span-1",
    2: "lg:col-span-2 xl:col-span-2",
    3: "lg:col-span-3 xl:col-span-3",
    4: "lg:col-span-4 xl:col-span-4",
    5: "lg:col-span-5 xl:col-span-5",
    6: "lg:col-span-5 xl:col-span-6",
  };

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">{t("searchLabel")}</span>
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search")}
          data-testid="tools-search"
          className="min-h-[44px] w-full rounded-field border border-border bg-panel py-2 pe-3 ps-9 text-sm text-foreground outline-none placeholder:text-muted focus:border-foreground/60"
        />
      </label>

      {results ? (
        results.length > 0 ? (
          <ul className={`mt-4 ${GRID}`}>
            {results.map((r) => (r.kind === "big" ? bigTile(r.tool) : smallTile(r.job)))}
          </ul>
        ) : (
          <p className="mt-6 text-sm text-muted">{t("noMatch", { query: query.trim() })}</p>
        )
      ) : (
        // THE GROUPS SHARE ROWS where they fit (the owner's "όλα σε μία
        // οθόνη αν χωράνε"): on a wide screen each group spans as many of the
        // grid's columns as it has tiles, so Record and Ask sit side by side
        // and Make sits beside Run on its own; on a phone every group is a
        // full-width block. The order is the owner's either way.
        <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {groups.map((group) => (
            <section
              key={group.key}
              aria-labelledby={`tools-${group.key}`}
              className={`col-span-2 sm:col-span-3 ${SPAN[Math.min(group.big.length || group.small.length, 6)]}`}
            >
              <h2 id={`tools-${group.key}`} className="mb-2 text-xs text-muted">
                {group.heading}
              </h2>
              {group.big.length > 0 && (
                <ul
                  data-testid="tools-big-row"
                  className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]"
                  style={{ "--n": Math.min(group.big.length, 5) } as React.CSSProperties}
                >
                  {group.big.map(bigTile)}
                </ul>
              )}
              {group.small.length > 0 && (
                <ul data-testid="quick-jobs-row" className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${group.big.length > 0 ? "mt-2" : ""}`}>
                  {group.small.map(smallTile)}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
