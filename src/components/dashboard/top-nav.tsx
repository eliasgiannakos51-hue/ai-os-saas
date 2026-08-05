"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, Bell, Plus, Zap } from "lucide-react";
import { CREATE_NAV_ITEM, OVERVIEW_NAV_ITEM } from "@/lib/modules";
import { MenuButton } from "@/components/dashboard/menu-button";
import { LogoutButton } from "@/components/logout-button";
import { Logo } from "@/components/logo";
import { useCommandPalette } from "@/components/dashboard/command-palette-context";
import { useCredits } from "@/components/credits/credits-context";
import { LowCreditsBanner } from "@/components/credits/low-credits-banner";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LanguageSelector } from "@/components/i18n/language-selector";

export function TopNav({ email }: { email: string }) {
  const router = useRouter();
  const t = useTranslations("common");
  const { setOpen: setCommandPaletteOpen } = useCommandPalette();
  const { credits, isAdmin } = useCredits();
  const [notifOpen, setNotifOpen] = useState(false);
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
        className="flex shrink-0 items-center gap-2"
      >
        <Logo iconOnly className="h-6 w-6" />
        <span className="text-base font-bold tracking-tight text-foreground">
          IONEXA
        </span>
      </Link>

      <button
        type="button"
        onClick={() => setCommandPaletteOpen(true)}
        className="mx-auto hidden max-w-md flex-1 items-center gap-2 rounded-full border border-border bg-panel px-4 py-2 text-sm text-muted transition-colors duration-150 hover:border-orange-500/50 hover:text-foreground sm:flex"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left">{t("search")}</span>
        <kbd className="rounded border border-border bg-input px-1.5 py-0.5 text-[10px] font-medium text-muted">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-3">
        <LanguageSelector />
        <ThemeToggle />

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setNotifOpen((v) => !v);
              setUserMenuOpen(false);
            }}
            aria-label={t("notifications")}
            aria-expanded={notifOpen}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel hover:text-foreground"
          >
            <Bell className="h-[18px] w-[18px]" />
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-11 w-56 rounded-xl border border-border bg-panel p-3 text-xs text-muted shadow-lg">
              {t("noNotifications")}
            </div>
          )}
        </div>

        <Link
          href="/dashboard/settings#buy-credits"
          className="hidden items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted transition-colors duration-150 hover:border-orange-500/50 hover:text-orange-400 sm:inline-flex"
          title={isAdmin ? "Owner access — unlimited credits" : "Credits remaining — buy more in Settings"}
        >
          <Zap className="h-3.5 w-3.5 text-orange-400" aria-hidden="true" />
          {isAdmin ? "Unlimited" : credits === null ? "…" : credits.toLocaleString()}
        </Link>

        {/* Only renders below 20% of the monthly allowance — see
            LowCreditsBanner. Sits next to the raw number because the number
            alone carries no sense of scale: 200 left is nearly everything on
            Free and nearly nothing on Ultimate. */}
        <LowCreditsBanner variant="inline" />

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] sm:px-3.5"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{t("newProject")}</span>
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setUserMenuOpen((v) => !v);
              setNotifOpen(false);
            }}
            aria-label="Account menu"
            aria-expanded={userMenuOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500/15 text-sm font-semibold text-orange-400 transition-colors duration-150 hover:bg-orange-500/25"
          >
            {initial}
          </button>
          {userMenuOpen && (
            <div className="absolute right-0 top-11 w-56 rounded-xl border border-border bg-panel p-3 shadow-lg">
              <p className="truncate text-xs text-muted">{email}</p>
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
