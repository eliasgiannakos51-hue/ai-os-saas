"use client";

import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSidebar } from "@/components/dashboard/sidebar-context";

export function MenuButton() {
  const { toggle } = useSidebar();
  const t = useTranslations("common");

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t("toggleMenu")}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-panel-hover hover:text-foreground md:hidden"
    >
      <Menu className="h-[18px] w-[18px]" />
    </button>
  );
}
