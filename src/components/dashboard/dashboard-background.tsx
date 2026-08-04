"use client";

import { usePathname } from "next/navigation";
import { AuthBackground } from "@/components/auth/auth-background";
import { NetworkField } from "@/components/ui/network-field";

// Chat and Create Anything are full-height, content-dense layouts (a
// message thread + a fixed sidebar/composer) — most of the viewport is
// covered by opaque panels, so only a thin strip of the actual background
// is ever visible even though the globe's own opacity is identical to
// every other dashboard page. That reads as "dimmer" even though it isn't,
// so these two routes get a real opacity bump to compensate.
//
// These numbers deliberately track AuthBackground's own default (0.38).
// They were previously 0.18/0.30 and, because this component always
// passes an explicit value, they silently overrode the raised default
// everywhere in the dashboard — the auth pages got brighter and the
// dashboard did not.
const BRIGHTER_ROUTES = ["/dashboard/chat", "/dashboard/create"];
const BRIGHTER_OPACITY = 0.5;
const DEFAULT_OPACITY = 0.38;

// Network layer sits ABOVE the globe (both are z-0, later sibling wins)
// and is kept dimmer than it, so the globe stays the primary form and the
// constellation reads as depth on top of it rather than as a second,
// competing pattern.
const NETWORK_RATIO = 0.62;

export function DashboardBackground() {
  const pathname = usePathname();
  const opacity = BRIGHTER_ROUTES.some((route) => pathname?.startsWith(route))
    ? BRIGHTER_OPACITY
    : DEFAULT_OPACITY;

  return (
    <>
      <AuthBackground opacity={opacity} />
      <NetworkField opacity={opacity * NETWORK_RATIO} />
      {/* Soft radial pools in the four corners so they never read as dead
          black. Purely decorative, never interactive. */}
      <div aria-hidden="true" className="ambient-corners" />
    </>
  );
}
