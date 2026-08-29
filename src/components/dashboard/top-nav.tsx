"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import { Search, Plus, Zap } from "lucide-react";
import { CREATE_NAV_ITEM, OVERVIEW_NAV_ITEM } from "@/lib/modules";
import { MenuButton } from "@/components/dashboard/menu-button";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { LogoutButton } from "@/components/logout-button";
import { Logo } from "@/components/logo";
import { useCommandPalette } from "@/components/dashboard/command-palette-context";
import { useCredits } from "@/components/credits/credits-context";
import { LowCreditsBanner } from "@/components/credits/low-credits-banner";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LanguageSelector } from "@/components/i18n/language-selector";
import { formatNumber } from "@/lib/format-number";

export function TopNav({ email }: { email: string }) {
  const router = useRouter();
  const t = useTranslations("common");
  const locale = useLocale();
  const { setOpen: setCommandPaletteOpen } = useCommandPalette();
  const { credits, isAdmin } = useCredits();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  function openCreate() {
    router.push(CREATE_NAV_ITEM.href);
  }

  const initial = (email?.[0] ?? "?").toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
      <MenuButton />

      <Link
        href={OVERVIEW_NAV_ITEM.href}
        // Height only — the bar has 64px of it and no spare width.
        className="flex min-h-[44px] shrink-0 items-center gap-2"
      >
        <Logo iconOnly className="h-6 w-6" />
        <span className="hidden text-base font-bold tracking-tight text-foreground min-[400px]:inline">
          IONEXA
        </span>
      </Link>

      <button
        type="button"
        onClick={() => setCommandPaletteOpen(true)}
        // min-w-0 is load-bearing, not tidiness. `flex-1` sets the basis to
        // 0, but a flex item's default `min-width: auto` refuses to shrink
        // below its content — so this button held 161px it did not have and
        // pushed the whole header past the viewport. Measured at 640px:
        // 92 (logo) + 161 (this) + 416 (controls) + gaps + padding = 765
        // inside 640, i.e. 125px of horizontal page scroll.
        className="mx-auto hidden min-w-0 max-w-md flex-1 items-center gap-2 rounded-full border border-border bg-panel px-4 py-2 text-sm text-muted transition-colors duration-150 hover:border-orange-500/50 hover:text-foreground sm:flex"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left">{t("search")}</span>
        <kbd className="rounded border border-border bg-input px-1.5 py-0.5 text-[10px] font-medium text-muted">
          ⌘K
        </kbd>
      </button>

      {/* WHY THIS ROW IS NOT `shrink-0` ANY MORE.
​
          Reported three times as "the Publish bar is squeezed to the left".
          The publish dialog was rebuilt twice on that report and was never
          the cause: measured across twelve viewport widths it is centred to
          within 0px at every one of them. What was actually wrong is here.

          This row is 416px of controls. `shrink-0` told it never to give
          any of that back. Between 768px and 1023px the sidebar takes 240px,
          leaving the header 528px for a 92px logo, a search field and these
          416px — so the row's right edge landed at 958px on a 768px screen
          and THE WHOLE PAGE scrolled sideways by 190px. Everything on it,
          including the Publish toolbar, sat shifted and cut off. On a tablet
          or a half-width desktop window the dashboard was simply broken, and
          a centred dialog on a page that is 190px too wide still reads as
          "squeezed to the side".

          Now it may shrink, and the two widest optional items below reveal
          at `lg` (1024px) — the first width where there is genuinely room
          for them next to the sidebar — instead of at `sm` (640px). */}
      <div className="ml-auto flex min-w-0 items-center gap-1.5 lg:gap-3">
        {/* HIDDEN ON PHONES, and moved into the account menu below.
            Every control in this header is now a 44px tap target, which is
            the size a finger actually needs — and five of them plus the
            logo do not fit across 375px, which is why raising them pushed
            the header 15px past the viewport on every dashboard route.
            Language and theme are the two a person changes once and then
            never again, so they are the two that belong one tap deeper
            rather than the two that get to stay small. */}
        <span className="hidden sm:contents">
          <LanguageSelector />
          <ThemeToggle />
        </span>

        {/* Was a hard-coded "No notifications" with no table behind it —
            see components/dashboard/notification-bell.tsx. */}
        <NotificationBell locale={locale} />

        <Link
          href="/dashboard/settings#buy-credits"
          className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted transition-colors duration-150 hover:border-orange-500/50 hover:text-orange-400 lg:inline-flex"
          title={isAdmin ? t("ownerAccessTooltip") : t("creditsTooltip")}
        >
          <Zap className="h-3.5 w-3.5 text-orange-400" aria-hidden="true" />
          {isAdmin ? t("creditsUnlimited") : credits === null ? "…" : formatNumber(credits, locale)}
        </Link>

        {/* Only renders below 20% of the monthly allowance — see
            LowCreditsBanner. Sits next to the raw number because the number
            alone carries no sense of scale: 200 left is nearly everything on
            Free and nearly nothing on Ultimate. */}
        <LowCreditsBanner variant="inline" />

        <button
          type="button"
          onClick={openCreate}
          // Below `lg` this is the icon alone, which `px-3 py-2` sized at
          // 40x40 — the one control in the header that stayed under 44px
          // after everything else was raised.
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] lg:px-3.5"
        >
          <Plus className="h-4 w-4" />
          {/* THE BUTTON AND THE PAGE IT OPENS SAY THE SAME WORD.
              It said "New Project" — Title Case, and a promise of a
              thing this app has no concept of. It opens Create Studio,
              which the sidebar, the command palette and the page's own
              heading all call "Make anything" / "Φτιάξε κάτι". Four
              surfaces, one destination, and the loudest of them had a
              fifth name for it. `common.createStudio` is that one name;
              `common.newProject` had this as its only reader and is
              gone. */}
          <span className="hidden lg:inline">{t("createStudio")}</span>
        </button>

        <div className="relative shrink-0">
          <button
            type="button"
            // NotificationBell owns its own open state now, so there is
            // no sibling popover left here to close.
            onClick={() => setUserMenuOpen((v) => !v)}
            aria-label={t("accountMenu")}
            aria-expanded={userMenuOpen}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-500/15 text-sm font-semibold text-orange-400 transition-colors duration-150 hover:bg-orange-500/25"
          >
            {initial}
          </button>
          {userMenuOpen && (
            <div className="absolute right-0 top-11 w-56 rounded-xl border border-border bg-panel p-3 shadow-lg">
              <p className="truncate text-xs text-muted">{email}</p>
              {/* The phone-width home for the two controls the header no
                  longer has room for. `sm:hidden` mirrors the `hidden
                  sm:contents` above exactly, so they appear in one place
                  and never in both. */}
              <div className="mt-3 flex items-center gap-1 border-t border-border pt-3 sm:hidden">
                <LanguageSelector />
                <ThemeToggle />
              </div>
              <div className="mt-3">
                <LogoutButton />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
