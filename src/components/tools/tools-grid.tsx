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
import { Hammer, Languages, LayoutTemplate, Clapperboard, Scissors, UserRound, Music, Laptop, Box } from "lucide-react";

/** The icon of a tool that has no sidebar row of its own — every new
 *  address this round (and the chat row, which quick jobs point to but
 *  which the search's OWN icon map never carried). */
const ROWLESS_ICONS: Record<string, LucideIcon> = {
  "/dashboard/my-stuff": MY_STUFF_ICON,
  "/dashboard/rebuild": Hammer,
  "/dashboard/3d": Box,
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
 * ALL TOOLS, ONLY THE REGULAR SQUARES, CLEANLY ALIGNED (the owner's
 * message "ALL TOOLS: ΜΟΝΟ ΤΑ ΚΑΝΟΝΙΚΑ ΤΕΤΡΑΓΩΝΑ, ΚΑΘΑΡΑ ΣΤΟΙΧΙΣΜΕΝΑ",
 * 2026-10-24): the page draws ONLY the 24 big tiles, five to a row on a
 * computer and two on a phone, same width and same height, left-aligned,
 * no gaps in the middle. Each group is its own full-width row — no more
 * sharing a row with another group — so nothing sits beside anything
 * else at a width that does not fit.
 *
 * THE SMALL READY-MADE JOBS (lib/nav/quick-jobs.ts) ARE NOT DRAWN ON THIS
 * PAGE ANY MORE, and the Learn group — which carries nothing else — goes
 * with them. NEITHER IS DELETED FROM THE REGISTRY: both are still found
 * by this page's own search, by ⌘K (the same ranking, lib/command-
 * palette-match.ts) and by Chat (asking for what a job promises, e.g.
 * "make me a CV", opens the same tool the job would have opened).
 *
 * EVERY BIG TILE IS DRAWN, even one that is not built yet — a small
 * «Σύντομα» mark in the tile's own top-right corner, decoupled from the
 * name so a long name never has to make room for it, and its address is
 * components/tools/coming-soon-shell.tsx instead of the real tool
 * (`live` says which addresses are real; every other registry entry is
 * still a tile, just not a live one).
 *
 * A NAME NEVER WRAPS AND NEVER IS CUT: one line, in full
 * (`whitespace-nowrap`, no truncate). The line under it is the one
 * exception allowed to truncate — it is what keeps every tile the same
 * height regardless of how long that language's description runs.
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
    threeD: t("names.threeD"),
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
    threeD: t("lines.threeD"),
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

  // ONLY BIG TILES REACH THE PAGE NOW: a group with none — Learn, which
  // carries only small ready-made jobs — never gets a row of its own
  // here. The small jobs stay fully real (lib/nav/quick-jobs.ts), just
  // reachable only through the search below, ⌘K and Chat.
  const groups = useMemo(
    () =>
      ALL_TOOLS_GROUP_ORDER.map((key) => ({
        key,
        heading: headings[key],
        big: ALL_TOOLS.filter((tool) => tool.group === key),
      })).filter((g) => g.big.length > 0),
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
          item: { href: job.id, label: jobLabel(job), candidates: [jobLabel(job), bigLabel(job.href), ...(job.aliases?.[locale] ?? [])] },
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
      <li key={tool.href} className="group relative h-full">
        <Link
          href={tool.href}
          data-testid="tool-tile"
          data-ready={isLive}
          // h-full + a fixed min-height: every tile the same height
          // regardless of language or whether it carries a badge — the
          // owner's "ΙΔΙΟ ΜΕΓΕΘΟΣ". The name never wraps and is never cut
          // (whitespace-nowrap, no truncate); the line below it is the
          // one allowed to truncate, which is what keeps the height fixed
          // even when a language's description runs long.
          className="flex h-full min-h-[88px] flex-col gap-1 rounded-card border border-border bg-panel p-3 pe-8 transition-colors duration-150 hover:border-foreground focus-visible:border-foreground"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon className="h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
            <span className="min-w-0 overflow-visible whitespace-nowrap text-sm font-medium text-foreground">{name}</span>
          </span>
          {description && <span className="block truncate text-xs text-muted">{description}</span>}
        </Link>
        {!isLive && (
          // Its own corner, decoupled from the name row, so a long name
          // never has to make room for it (the owner's "ποτέ δίπλα στο
          // όνομα αν δεν χωρά").
          <span
            data-testid="tool-tile-badge"
            className="pointer-events-none absolute end-2 top-2 shrink-0 rounded-item border border-border bg-panel-hover px-1.5 py-0.5 text-[10px] text-muted"
          >
            {t("comingSoonBadge")}
          </span>
        )}
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

  // ONE fixed grid for every row on this page — search results, and
  // every group's own row — so a tile is the same width wherever it is
  // drawn: five to a row on a computer, two on a phone (the owner's
  // "5 ανά σειρά σε υπολογιστή, 2 σε κινητό"). `items-stretch` (the grid
  // default) is what makes every tile in a row the same height.
  const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5";

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
        // EVERY GROUP IS ITS OWN FULL-WIDTH ROW now (the owner's "ΚΑΘΕ
        // ΟΜΑΔΑ ΣΕ ΔΙΚΗ ΤΗΣ ΓΡΑΜΜΗ") — no more sharing a row with another
        // group at a width that does not fit. A plain vertical stack of
        // sections, each with the one fixed tile grid.
        <div className="mt-5 flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`tools-${group.key}`}>
              <h2 id={`tools-${group.key}`} className="mb-2 text-xs text-muted">
                {group.heading}
              </h2>
              <ul data-testid="tools-big-row" className={GRID}>
                {group.big.map(bigTile)}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
