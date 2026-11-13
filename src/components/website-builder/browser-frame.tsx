import type { ReactNode } from "react";
import { Shield } from "lucide-react";

/**
 * The chrome around a generated site's preview (Site Κομμάτι 1,
 * "ΝΕΑ ΟΘΟΝΗ ΚΑΙ ΣΤΥΛ ΚΙΝΗΣΗΣ") — three decorative dots and an
 * address-shaped pill, so the iframe reads as a browser window showing
 * the site rather than a bare rectangle.
 *
 * The editor layout (the switch "editor-shell") draws the approved bar
 * instead: a shield and the address, and no dots (08-Site.png). The
 * address there is the site's real one once it is live, read from the
 * publish route, and its name until then.
 *
 * The pill shows the site's own name, never a fabricated domain: this
 * tool already refuses to invent a phone number or price on the page
 * itself (website-placeholders.ts, findUnfilledPlaceholders) and a made-up
 * address in the chrome around it would be the same mistake one level up.
 *
 * "Mobile" keeps the frame full width and narrows only the simulated
 * page inside it — the browser window itself does not shrink, matching
 * how a real desktop browser's responsive-design mode works.
 */
export function BrowserFrame({
  address,
  viewport,
  chrome = "dots",
  liveAddress = null,
  children,
}: {
  address: string;
  viewport: "desktop" | "mobile";
  /** "address": the editor layout's bar (the switch "editor-shell", 08-Site.png) — a shield and the address, no dots. */
  chrome?: "dots" | "address";
  /** The site's real address once it is live (the publish route's own `url`), shown in place of its name. */
  liveAddress?: string | null;
  children: ReactNode;
}) {
  return (
    <div data-testid="site-browser-frame" data-viewport={viewport} data-chrome={chrome} className="browser-frame">
      {chrome === "address" ? (
        <div className="browser-frame-address">
          <Shield className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span data-testid="site-browser-address" className="min-w-0 flex-1 truncate">
            {liveAddress ? shownAddress(liveAddress) : address}
          </span>
        </div>
      ) : (
      <div className="browser-frame-bar">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
        </span>
        <span data-testid="site-browser-address" className="min-w-0 flex-1 truncate rounded-full bg-paper px-3 py-1 text-center text-[11px] text-muted">
          {address}
        </span>
      </div>
      )}
      <div className={`flex min-h-0 flex-1 justify-center overflow-auto bg-panel ${viewport === "mobile" ? "p-3" : ""}`}>
        <div data-testid="site-browser-page" className={viewport === "mobile" ? "w-full max-w-[390px]" : "w-full"}>
          {children}
        </div>
      </div>
    </div>
  );
}

/** A live address as a browser's bar shows it: no scheme, no lone trailing slash. */
function shownAddress(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}
