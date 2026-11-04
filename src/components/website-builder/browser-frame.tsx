import type { ReactNode } from "react";

/**
 * The chrome around a generated site's preview (Site Κομμάτι 1,
 * "ΝΕΑ ΟΘΟΝΗ ΚΑΙ ΣΤΥΛ ΚΙΝΗΣΗΣ") — three decorative dots and an
 * address-shaped pill, so the iframe reads as a browser window showing
 * the site rather than a bare rectangle.
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
export function BrowserFrame({ address, viewport, children }: { address: string; viewport: "desktop" | "mobile"; children: ReactNode }) {
  return (
    <div data-testid="site-browser-frame" data-viewport={viewport} className="browser-frame">
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
      <div className={`flex min-h-0 flex-1 justify-center overflow-auto bg-panel ${viewport === "mobile" ? "p-3" : ""}`}>
        <div data-testid="site-browser-page" className={viewport === "mobile" ? "w-full max-w-[390px]" : "w-full"}>
          {children}
        </div>
      </div>
    </div>
  );
}
