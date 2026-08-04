"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, MessageCircle, FileText } from "lucide-react";
import { ALL_SIDEBAR_GROUPS, type SidebarItem } from "@/lib/sidebar-nav";
import { ITEM_LABEL_KEYS } from "@/lib/sidebar-label-keys";
import { useCommandPalette } from "@/components/dashboard/command-palette-context";

// Every sidebar link (including Create Anything, part of the Workspace
// group — see lib/sidebar-nav.ts) is searchable here too, flattened out of
// its groups.
const PALETTE_ITEMS: SidebarItem[] = ALL_SIDEBAR_GROUPS.flatMap((group) => group.items);

type ContentResult = {
  id: string;
  type: "module" | "chat";
  title: string;
  subtitle: string;
  href: string;
};

// One shape both page-nav items and content search results render as, so
// keyboard nav (arrow up/down, enter) walks a single flat list regardless
// of which section an entry came from.
type PaletteEntry = {
  key: string;
  href: string;
  label: string;
  sublabel?: string;
  badge?: string;
  render: (active: boolean) => React.ReactNode;
};

// Subsequence match — every character of the query appears in the target,
// in order, not necessarily contiguous. A plain substring match is just a
// contiguous special case of this, so "fin" matches "Finance" either way.
function isFuzzyMatch(query: string, target: string): boolean {
  let qi = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) qi++;
  }
  return qi === query.length;
}

function filterAndRankItems(items: SidebarItem[], rawQuery: string): SidebarItem[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return items;

  const substringMatches: { item: SidebarItem; index: number }[] = [];
  const fuzzyOnlyMatches: SidebarItem[] = [];

  for (const item of items) {
    const label = item.label.toLowerCase();
    const index = label.indexOf(query);
    if (index !== -1) {
      substringMatches.push({ item, index });
    } else if (isFuzzyMatch(query, label)) {
      fuzzyOnlyMatches.push(item);
    }
  }

  substringMatches.sort((a, b) => a.index - b.index);
  return [...substringMatches.map((m) => m.item), ...fuzzyOnlyMatches];
}

// True when the keystroke landed somewhere the user is composing text, in
// which case a printable shortcut like "/" must be left alone. Covers
// <input>/<textarea>/<select>, anything with contentEditable (the
// Documents editor), and any explicit role="textbox".
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return target.getAttribute("role") === "textbox";
}

export function CommandPalette() {
  const router = useRouter();
  const tCommon = useTranslations("common");
  const tSidebar = useTranslations("sidebar");
  const { open, setOpen } = useCommandPalette();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [contentResults, setContentResults] = useState<ContentResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTokenRef = useRef(0);

  function translatedLabel(label: string): string {
    if (label === "Create Anything") return tCommon("createAnything");
    const key = ITEM_LABEL_KEYS[label];
    return key ? tSidebar(`items.${key}`) : label;
  }

  const pageResults = useMemo(() => filterAndRankItems(PALETTE_ITEMS, query), [query]);

  // Content search (entries inside modules + chat conversation titles) —
  // debounced so it doesn't fire a request per keystroke, and only once
  // the query is long enough to be worth a round trip.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setContentResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const token = ++searchTokenRef.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        if (token !== searchTokenRef.current) return;
        setContentResults(res.ok && data.ok ? data.results : []);
      } catch {
        if (token === searchTokenRef.current) setContentResults([]);
      } finally {
        if (token === searchTokenRef.current) setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  function close() {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
    setContentResults([]);
  }

  function goTo(href: string) {
    close();
    router.push(href);
  }

  const entries: PaletteEntry[] = useMemo(() => {
    const pageEntries: PaletteEntry[] = pageResults.map((item) => ({
      key: `page-${item.href}`,
      href: item.href,
      label: translatedLabel(item.label),
      render: (active) => {
        const Icon = item.icon;
        return (
          <>
            <Icon
              className={`h-4 w-4 shrink-0 ${active ? "text-orange-400" : "text-orange-500/40"}`}
              aria-hidden="true"
            />
            {translatedLabel(item.label)}
          </>
        );
      },
    }));

    const contentEntries: PaletteEntry[] = contentResults.map((result) => ({
      key: `content-${result.id}`,
      href: result.href,
      label: result.title,
      render: () => {
        const Icon = result.type === "chat" ? MessageCircle : FileText;
        return (
          <>
            <Icon className="h-4 w-4 shrink-0 text-orange-500/40" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{result.title}</span>
            <span className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted">
              {result.subtitle}
            </span>
          </>
        );
      },
    }));

    return [...pageEntries, ...contentEntries];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageResults, contentResults]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isModK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isModK) {
        e.preventDefault();
        setOpen(!open);
        return;
      }

      // "/" opens search too — the convention users bring from GitHub,
      // Slack, Linear et al. Unlike Cmd+K it's a printable character, so
      // it must be ignored whenever the user is actually typing, or it
      // would hijack every forward slash in a note, a URL, or a date.
      // That means: any field-like element, and anything contentEditable
      // (the Documents editor), plus the palette's own input when open.
      if (e.key === "/" && !open && !isTypingTarget(e.target)) {
        e.preventDefault();
        setOpen(true);
        return;
      }

      if (e.key === "Escape" && open) {
        e.preventDefault();
        close();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Wait a tick for the modal to mount before focusing.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, entries.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = entries[activeIndex];
      if (selected) goTo(selected.href);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]">
      <div
        onClick={close}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-panel shadow-[0_0_0_1px_rgba(249,115,22,0.05)]"
      >
        <div className="relative border-b border-border">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={tCommon("jumpToPage")}
            className="w-full bg-transparent py-4 pl-11 pr-4 text-sm text-foreground outline-none placeholder:text-muted"
          />
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {entries.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">
              {searching ? tCommon("loading") : tCommon("noMatches", { query })}
            </p>
          ) : (
            entries.map((entry, index) => {
              const active = index === activeIndex;
              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => goTo(entry.href)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors duration-150 ${
                    active
                      ? "bg-orange-500/10 text-orange-400"
                      : "text-foreground hover:bg-panel-hover"
                  }`}
                >
                  {entry.render(active)}
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[11px] text-muted">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
