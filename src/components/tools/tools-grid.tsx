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
import { ALL_TOOLS_GROUPS, ALL_TOOLS_NAMES, SWITCHED_SQUARES, SWITCH_ONLY_ITEMS, type AllToolsGroupKey, type AllToolsNameKey } from "@/lib/nav/all-tools";
import { NEVER_RECENT } from "@/lib/nav/recent-tools";
import { useToast } from "@/components/toast/toast-context";
import { GAMES_ICON } from "@/lib/module-icons";

/** The icon of each tool with no sidebar row (lib/nav/all-tools.ts SWITCH_ONLY_ITEMS). */
const SWITCH_ONLY_ICONS: Record<string, LucideIcon> = { "/dashboard/games": GAMES_ICON };

/**
 * ALL TOOLS (ΣΥΣΤΗΜΑ DESIGN §6, 2026-10-05): big square tiles, four in a
 * row on a computer and two on a phone, in four groups — Make, Ask,
 * Organise, Business — with a search on top and no «beta» anywhere. Each
 * square: a 28px icon top left, a pin top right, and at the bottom the
 * name with one plain line on what it does.
 *
 * WHICH TOOLS, AND WHERE: lib/nav/all-tools.ts, by the owner's rule of
 * 2026-10-05 (shown when it does its main job end to end; hidden when it
 * is only a screen, produces nothing, or its name promises more). Since
 * MASTER 14.1 (2026-10-07) only the tools it names, each under its
 * one-word name; Settings, Integrations, Help and Team are reached from
 * the Settings page (app/dashboard/settings/page.tsx).
 *
 * THE SAME SEARCH AS ⌘K: a tile answers to its name on screen, its English
 * name, lib/palette-aliases.ts and its one-line description, ranked by
 * lib/command-palette-match.ts — "slides" finds Presentations here as in
 * the palette.
 *
 * THE PIN is the only way to put a tool in the sidebar at once (the
 * Recent tools rule, ΣΥΣΤΗΜΑ DESIGN §3); it writes through the same
 * /api/nav/recent-tools the sidebar uses. Chat and Coding have rows of
 * their own and are never in Recent tools, so their squares have no pin.
 *
 * THE NEW TOOLS (MASTER 14.1, lib/nav/all-tools.ts SWITCHED_SQUARES) join
 * their group only for the hrefs the page found switched on for this
 * person (`switchedOn`). Neither is a row of the main groups the grid
 * draws from — Image's row is hidden, and Integrations sits in the
 * Settings group — so they are looked up in the whole list.
 */
export function ToolsGrid({ isOwner, pinned = [], switchedOn = [] }: { isOwner: boolean; pinned?: string[]; switchedOn?: string[] }) {
  const t = useTranslations("dashboard.tools");
  const tSidebar = useTranslations("sidebar");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();
  const [query, setQuery] = useState("");
  const [pins, setPins] = useState<string[]>(pinned);

  const groups = useMemo(() => {
    const byHref = new Map(
      sidebarGroups(MAIN_SIDEBAR_GROUPS, isOwner).flatMap((g) => g.items.map((i) => [i.href, i] as const))
    );
    const everyItem = new Map(ALL_SIDEBAR_GROUPS.flatMap((g) => g.items.map((i) => [i.href, i] as const)));
    // A tool with no sidebar row at all (lib/nav/all-tools.ts
    // SWITCH_ONLY_ITEMS): drawn only through SWITCHED_SQUARES below, so only
    // when its switch is on.
    const switchOnly = (href: string): SidebarItem | undefined =>
      SWITCH_ONLY_ITEMS[href] ? { href, ...SWITCH_ONLY_ITEMS[href], icon: SWITCH_ONLY_ICONS[href] ?? LayoutGrid } : undefined;
    // Literal keys, so the message slicer can bound what this page needs
    // (lib/i18n/message-slices.ts): a template-literal key is unbounded.
    const headings: Record<AllToolsGroupKey, string> = {
      make: t("groups.make"),
      ask: t("groups.ask"),
      organise: t("groups.organise"),
      business: t("groups.business"),
    };
    // ONLY THE TOOLS (MASTER 14.1): Settings, Integrations and the Help
    // Centre are in Settings, and the sidebar's Settings row opens it.
    return ALL_TOOLS_GROUPS.map((g) => ({
      key: g.key,
      heading: headings[g.key],
      items: [
        ...g.hrefs.map((h) => byHref.get(h)),
        ...SWITCHED_SQUARES.filter((s) => s.group === g.key && switchedOn.includes(s.href)).map((s) => everyItem.get(s.href) ?? switchOnly(s.href)),
      ].filter((i): i is SidebarItem => Boolean(i)),
    })).filter((g) => g.items.length > 0);
  }, [isOwner, t, switchedOn]);

  // THE ONE-WORD NAMES (MASTER 14.1), through literal keys for the same
  // reason as the headings above.
  const names: Record<AllToolsNameKey, string> = {
    site: t("names.site"),
    slides: t("names.slides"),
    posts: t("names.posts"),
    research: t("names.research"),
    analyze: t("names.analyze"),
    files: t("names.files"),
    automations: t("names.automations"),
    projects: t("names.projects"),
    goals: t("names.goals"),
    meetings: t("names.meetings"),
    library: t("names.library"),
    memory: t("names.memory"),
    finances: t("names.finances"),
    sales: t("names.sales"),
    trading: t("names.trading"),
    image: t("names.image"),
    connections: t("names.connections"),
    document: t("names.document"),
    games: t("names.games"),
  };
  // THE ONE LINE UNDER EACH NAME (MASTER 14.1: «όνομα μίας λέξης, μία
  // γραμμή»), short enough that the square stays square on a phone.
  const lines: Record<AllToolsNameKey, string> = {
    site: t("lines.site"),
    slides: t("lines.slides"),
    posts: t("lines.posts"),
    research: t("lines.research"),
    analyze: t("lines.analyze"),
    files: t("lines.files"),
    automations: t("lines.automations"),
    projects: t("lines.projects"),
    goals: t("lines.goals"),
    meetings: t("lines.meetings"),
    library: t("lines.library"),
    memory: t("lines.memory"),
    finances: t("lines.finances"),
    sales: t("lines.sales"),
    trading: t("lines.trading"),
    image: t("lines.image"),
    connections: t("lines.connections"),
    document: t("lines.document"),
    games: t("lines.games"),
  };
  const nameKey = (href: string): AllToolsNameKey | undefined =>
    ALL_TOOLS_NAMES[href] ?? SWITCHED_SQUARES.find((s) => s.href === href)?.name;

  const label = (item: SidebarItem) => { const k = nameKey(item.href); return k ? names[k] : longLabel(item); };
  // The sidebar's longer name stays a search word: "Build a site" still
  // finds Site, and "παρουσ" still finds Slides in Greek.
  const longLabel = (item: SidebarItem) =>
    item.label === "Create Studio"
      ? tCommon("createStudio")
      : ITEM_LABEL_KEYS[item.label]
        ? tSidebar(`items.${ITEM_LABEL_KEYS[item.label]}`)
        : item.label;
  // The sidebar's longer hint stays a search word; the square draws its line.
  const sidebarHint = (item: SidebarItem) => (item.hintKey ? tSidebar(`hints.${item.hintKey}`) : "");
  const hint = (item: SidebarItem) => { const k = nameKey(item.href); return k ? lines[k] : sidebarHint(item); };

  const results = query.trim()
    ? filterAndRankCandidates(
        groups
          .flatMap((g) => g.items)
          .map((item) => ({
            item,
            candidates: [label(item), longLabel(item), item.label, ...aliasesFor(ITEM_LABEL_KEYS[item.label] ?? "", locale), hint(item), sidebarHint(item)],
          })),
        query
      )
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

  const tile = (item: SidebarItem) => {
    const Icon = item.icon;
    const name = label(item);
    const description = hint(item);
    // NO PIN ON A SWITCHED SQUARE: Recent tools (api/nav/recent-tools)
    // takes only the visible rows of the main groups, and neither of these
    // is one (Image's row is hidden, Integrations is in the Settings
    // group), so a pin would be refused every time — a button that does
    // nothing.
    const canPin =
      !NEVER_RECENT.includes(item.href) && !item.href.startsWith("/help") && item.href !== "/dashboard/settings" &&
      !SWITCHED_SQUARES.some((s) => s.href === item.href);
    const isPinned = pins.includes(item.href);
    return (
      <li key={item.href} className="relative">
        <Link
          href={item.href}
          data-testid="tool-tile"
          className="flex aspect-square flex-col justify-between rounded-card border border-border bg-panel p-4 transition-colors duration-150 hover:border-foreground focus-visible:border-foreground"
        >
          <Icon className="h-7 w-7 text-foreground" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block break-words text-sm font-medium text-foreground">{name}</span>
            {description && <span className="mt-1 block break-words text-xs text-muted">{description}</span>}
          </span>
        </Link>
        {canPin && (
          <button
            type="button"
            onClick={() => togglePin(item.href)}
            aria-pressed={isPinned}
            aria-label={tSidebar(isPinned ? "rail.unpin" : "rail.pin", { tool: name })}
            data-testid="tool-pin"
            className={`absolute end-1 top-1 flex h-11 w-11 items-center justify-center rounded-item hover:bg-panel-hover hover:text-foreground ${
              isPinned ? "text-foreground" : "text-muted"
            }`}
          >
            {isPinned ? <PinOff className="h-4 w-4" aria-hidden="true" /> : <Pin className="h-4 w-4" aria-hidden="true" />}
          </button>
        )}
      </li>
    );
  };

  const GRID = "grid grid-cols-2 gap-3 lg:grid-cols-4";

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
          <ul className={`mt-4 ${GRID}`}>{results.map(tile)}</ul>
        ) : (
          <p className="mt-6 text-sm text-muted">{t("noMatch", { query: query.trim() })}</p>
        )
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`tools-${group.key}`}>
              <h2 id={`tools-${group.key}`} className="mb-3 text-xs text-muted">
                {group.heading}
              </h2>
              <ul className={GRID}>{group.items.map(tile)}</ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
