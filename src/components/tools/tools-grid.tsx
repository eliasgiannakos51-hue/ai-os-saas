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
import { NEVER_RECENT } from "@/lib/nav/recent-tools";
import { useToast } from "@/components/toast/toast-context";
import { MY_STUFF_ICON } from "@/lib/module-icons";

/** The icon of a tool that has no sidebar row of its own. */
const ROWLESS_ICONS: Record<string, LucideIcon> = { "/dashboard/my-stuff": MY_STUFF_ICON };

/**
 * ALL TOOLS, THE FINAL GRID (the owner's message, 2026-10-23): square
 * tiles, five to six in a row on a computer and two on a phone, in five
 * groups — Record, Ask, Make, Run on its own, Organise — with a search on
 * top and no «beta» anywhere. Each tile: a 20px icon, the name and one
 * plain line.
 *
 * WHICH TOOLS, AND IN WHAT ORDER: lib/nav/all-tools.ts ALL_TOOLS, the
 * seventeen of the owner's list. The page hands this component the
 * addresses of the ones that work (`shown`, from availableTools): a tool
 * that does not work end to end has no tile at all.
 *
 * THE SAME SEARCH AS ⌘K: a tile answers to its name on screen, its English
 * name, lib/palette-aliases.ts and its one-line description, ranked by
 * lib/command-palette-match.ts.
 *
 * THE PIN is the only way to put a tool in the sidebar at once (the
 * Recent tools rule, ΣΥΣΤΗΜΑ DESIGN §3); it writes through the same
 * /api/nav/recent-tools the sidebar uses. Chat and Coding have rows of
 * their own and are never in Recent tools, and a tool with no visible
 * sidebar row cannot be pinned (the route takes only those), so those
 * tiles have no pin.
 */
export function ToolsGrid({ isOwner, pinned = [], shown = [] }: { isOwner: boolean; pinned?: string[]; shown?: string[] }) {
  const t = useTranslations("dashboard.tools");
  const tSidebar = useTranslations("sidebar");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const { addToast } = useToast();
  const [query, setQuery] = useState("");
  const [pins, setPins] = useState<string[]>(pinned);

  const mainRows = useMemo(
    () => new Map(sidebarGroups(MAIN_SIDEBAR_GROUPS, isOwner).flatMap((g) => g.items.map((i) => [i.href, i] as const))),
    [isOwner]
  );
  const groups = useMemo(() => {
    const everyItem = new Map(ALL_SIDEBAR_GROUPS.flatMap((g) => g.items.map((i) => [i.href, i] as const)));
    const rowless = (href: string): SidebarItem => ({ href, label: href, icon: ROWLESS_ICONS[href] ?? LayoutGrid });
    // Literal keys, so the message slicer can bound what this page needs
    // (lib/i18n/message-slices.ts): a template-literal key is unbounded.
    const headings: Record<AllToolsGroupKey, string> = {
      record: t("groups.record"),
      ask: t("groups.ask"),
      make: t("groups.make"),
      runAlone: t("groups.runAlone"),
      organise: t("groups.organise"),
    };
    return ALL_TOOLS_GROUP_ORDER.map((key) => ({
      key,
      heading: headings[key],
      items: ALL_TOOLS.filter((tool) => tool.group === key && shown.includes(tool.href)).map(
        (tool) => everyItem.get(tool.href) ?? rowless(tool.href)
      ),
    })).filter((g) => g.items.length > 0);
  }, [t, shown]);

  // THE NAMES, through literal keys for the same reason as the headings.
  const names: Record<AllToolsNameKey, string> = {
    myStuff: t("names.myStuff"),
    connect: t("names.connect"),
    analyze: t("names.analyze"),
    research: t("names.research"),
    rebuild: t("names.rebuild"),
    site: t("names.site"),
    document: t("names.document"),
    image: t("names.image"),
    video: t("names.video"),
    films: t("names.films"),
    editing: t("names.editing"),
    avatars: t("names.avatars"),
    coding: t("names.coding"),
    agents: t("names.agents"),
    automations: t("names.automations"),
    iowork: t("names.iowork"),
    projects: t("names.projects"),
    files: t("names.files"),
    slides: t("names.slides"),
    posts: t("names.posts"),
    goals: t("names.goals"),
    meetings: t("names.meetings"),
    library: t("names.library"),
    memory: t("names.memory"),
    finances: t("names.finances"),
    sales: t("names.sales"),
    trading: t("names.trading"),
    games: t("names.games"),
  };
  // THE ONE LINE UNDER EACH NAME, short enough that the tile stays square
  // on a phone.
  const lines: Record<AllToolsNameKey, string> = {
    myStuff: t("lines.myStuff"),
    connect: t("lines.connect"),
    analyze: t("lines.analyze"),
    research: t("lines.research"),
    rebuild: t("lines.rebuild"),
    site: t("lines.site"),
    document: t("lines.document"),
    image: t("lines.image"),
    video: t("lines.video"),
    films: t("lines.films"),
    editing: t("lines.editing"),
    avatars: t("lines.avatars"),
    coding: t("lines.coding"),
    agents: t("lines.agents"),
    automations: t("lines.automations"),
    iowork: t("lines.iowork"),
    projects: t("lines.projects"),
    files: t("lines.files"),
    slides: t("lines.slides"),
    posts: t("lines.posts"),
    goals: t("lines.goals"),
    meetings: t("lines.meetings"),
    library: t("lines.library"),
    memory: t("lines.memory"),
    finances: t("lines.finances"),
    sales: t("lines.sales"),
    trading: t("lines.trading"),
    games: t("lines.games"),
  };
  const nameKey = (href: string): AllToolsNameKey | undefined => ALL_TOOLS.find((tool) => tool.href === href)?.name;

  const label = (item: SidebarItem) => { const k = nameKey(item.href); return k ? names[k] : longLabel(item); };
  // The sidebar's longer name stays a search word: "Build a site" still
  // finds Site, and "παρουσ" still finds Slides in Greek.
  const longLabel = (item: SidebarItem) =>
    item.label === "Create Studio"
      ? tCommon("createStudio")
      : ITEM_LABEL_KEYS[item.label]
        ? tSidebar(`items.${ITEM_LABEL_KEYS[item.label]}`)
        : item.label;
  // The sidebar's longer hint stays a search word; the tile draws its line.
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
    // A PIN needs a visible row of the sidebar's main groups: Recent tools
    // (api/nav/recent-tools) takes only those, so a pin on any other tile
    // would be refused every time — a button that does nothing.
    const canPin =
      mainRows.has(item.href) && !NEVER_RECENT.includes(item.href) && !item.href.startsWith("/help") && item.href !== "/dashboard/settings";
    const isPinned = pins.includes(item.href);
    return (
      <li key={item.href} className="group relative">
        <Link
          href={item.href}
          data-testid="tool-tile"
          className="flex flex-col gap-1 rounded-card border border-border bg-panel p-3 transition-colors duration-150 hover:border-foreground focus-visible:border-foreground"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Icon className="h-5 w-5 shrink-0 text-foreground" aria-hidden="true" />
            <span className="min-w-0 break-words text-sm font-medium text-foreground">{name}</span>
          </span>
          {description && <span className="block break-words text-xs text-muted">{description}</span>}
        </Link>
        {canPin && (
          <button
            type="button"
            onClick={() => togglePin(item.href)}
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

  const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6";

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
