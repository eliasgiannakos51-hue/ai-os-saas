"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CREATE_NAV_ITEM } from "@/lib/modules";

export function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isModK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (!isModK) return;

      e.preventDefault();
      if (pathname !== CREATE_NAV_ITEM.href) {
        router.push(CREATE_NAV_ITEM.href);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pathname, router]);

  return null;
}
