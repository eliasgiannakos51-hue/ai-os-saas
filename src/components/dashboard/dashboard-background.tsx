"use client";

import { usePathname } from "next/navigation";
import { AuthBackground } from "@/components/auth/auth-background";

// Chat and Create Anything are full-height, content-dense layouts (a
// message thread + a fixed sidebar/composer) — most of the viewport is
// covered by opaque panels, so only a thin strip of the actual background
// is ever visible even though the globe's own opacity is identical to
// every other dashboard page. That reads as "dimmer" even though it isn't,
// so these two routes get a real opacity bump to compensate and look as
// bright as pages with more open background area (Home, module lists,
// Settings) at the standard 0.18.
const BRIGHTER_ROUTES = ["/dashboard/chat", "/dashboard/create"];
const BRIGHTER_OPACITY = 0.3;
const DEFAULT_OPACITY = 0.18;

export function DashboardBackground() {
  const pathname = usePathname();
  const opacity = BRIGHTER_ROUTES.some((route) => pathname?.startsWith(route))
    ? BRIGHTER_OPACITY
    : DEFAULT_OPACITY;

  return <AuthBackground opacity={opacity} />;
}
