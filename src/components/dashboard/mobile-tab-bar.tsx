"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Home, LayoutGrid, MessageCircle, UserRound, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { TABS, activeTab, type TabKey } from "@/lib/nav/tabs";
import { useCredits } from "@/components/credits/credits-context";
import { creditLevel, type CreditLevel } from "@/lib/billing/credit-level";
import { formatNumber } from "@/lib/format-number";

const ICONS: Record<TabKey, LucideIcon> = {
  home: Home,
  chat: MessageCircle,
  tools: LayoutGrid,
  you: UserRound,
};

// Status colours only for a state (docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN §1): a
// healthy balance is as quiet as the tab it sits in; low is a warning,
// nothing left an error. On a phone the number has no words beside it to
// say "low", so the colour has to — and the words are there for a screen
// reader (sidebar.tabs.balance* in messages/*.json).
const BALANCE_TONE: Record<Exclude<CreditLevel, "unknown">, string> = {
  ok: "text-muted",
  unlimited: "text-muted",
  low: "text-warning",
  empty: "text-danger",
};

/**
 * THE BALANCE ON A PHONE (owner's decision, 2026-10-09: «Υπόλοιπο credits
 * στο κινητό: να φαίνεται, μικρό και διακριτικό»).
 *
 * Below 640px the top bar shows no balance and no low-credits notice:
 * there is no room in it (components/dashboard/top-nav.tsx counts 344px
 * of 375 already used, and the notice that tried to fit pushed the
 * account button off the screen — components/credits/low-credits-banner.tsx).
 * So it lives here, beside «You»: the tab that opens Settings, where
 * credits are bought. It sits in the label's own line, so the four icons
 * and the four labels stay level with each other and it covers nothing;
 * where a narrow phone has no room beside the word, it wraps under it
 * rather than squeezing the word. It is part of a target that is already
 * 56px tall, so it needs no target of its own. The same lightning mark as
 * the desktop's balance, at 10px.
 *
 * The number is the credits context's (components/credits/credits-context.tsx):
 * seeded by the layout, refreshed by every action that spends — no
 * request of its own. scripts/tests/mobile-tabs.test.mjs holds both, and
 * scripts/tests/chat-attachments-edges.prodtest.mjs measures it on a
 * phone in all ten languages.
 */
function TabBalance() {
  const { credits, total, isAdmin } = useCredits();
  const locale = useLocale();
  const t = useTranslations("sidebar.tabs");
  const level = creditLevel({ credits, total, isAdmin });
  if (level === "unknown") return null;
  const amount = level === "unlimited" ? "∞" : formatNumber(credits ?? 0, locale);
  const spoken =
    level === "unlimited"
      ? t("balanceUnlimited")
      : level === "empty"
        ? t("balanceEmpty")
        : level === "low"
          ? t("balanceLow", { amount })
          : t("balance", { amount });
  // AND IT STOPS WHERE THE TOP BAR STARTS. This bar is itself hidden from
  // 768px up, while the top bar's low-credits notice appears from 640px
  // (components/credits/low-credits-banner.tsx), so between the two the
  // same number was said twice — once over the page and once under it.
  // Handing it over at 640px is exactly the width the owner named («κάτω
  // από 640px»), and the four tabs stay as they were.
  //
  // No class name is repeated in this comment on purpose: a mutation suite
  // anchors on those strings, and a comment that carries one makes the
  // mutant land in prose instead of code — which is how that suite went
  // green on a broken bar for one run (2026-10-14).
  return (
    <span
      data-testid="tab-balance"
      data-level={level}
      className={`inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[10px] font-medium tabular-nums sm:hidden ${BALANCE_TONE[level]}`}
    >
      <Zap className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
      <span aria-hidden="true">{amount}</span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

/**
 * THE PHONE'S BOTTOM BAR (docs/CONTEXT.md, ΣΥΣΤΗΜΑ DESIGN, «ΚΙΝΗΤΟ»):
 * Home, Chat, Tools, You, every target at least 44px. Below the md
 * breakpoint only; the sidebar is still one tap away behind the top
 * bar's menu, so nothing that was reachable stops being reachable.
 * Which tab a page belongs to is lib/nav/tabs.ts, so the gate runs it.
 *
 * The four icons hang from the same line (justify-start, pt-2), not from
 * each tab's middle: where the balance has to wrap under «You» on a
 * narrow phone (Japanese at 320px, measured 2026-10-14) that tab grows
 * by one line, and centring would have lifted its icon 8px above the
 * other three. The label line is leading-tight so that tab, grown, still
 * fits the 64px the page leaves free under its content (pb-16,
 * app/dashboard/layout.tsx): 64.5px without it, measured the same day.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const t = useTranslations("sidebar.tabs");
  const active = activeTab(pathname);
  return (
    <nav
      aria-label={t("label")}
      data-testid="mobile-tab-bar"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-divider bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-4">
        {TABS.map((tab) => {
          const Icon = ICONS[tab.key];
          const isActive = active === tab.key;
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex min-h-[56px] flex-col items-center justify-start gap-1 pt-2 text-[11px] transition-colors duration-150 ${
                  isActive ? "text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="flex max-w-full flex-wrap items-center justify-center gap-x-1 px-1 leading-tight">
                  <span className="break-words">{t(tab.key)}</span>
                  {tab.key === "you" && <TabBalance />}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
