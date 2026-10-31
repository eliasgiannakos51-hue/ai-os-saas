/*
 * THE PHONE SILHOUETTE around Apps' own live preview (owner, "APPS:
 * ΛΕΙΤΟΥΡΓΙΚΟ, ΜΕ ΤΗ ΝΕΑ ΟΘΟΝΗ", 2026-10-30, Κομμάτι 2: "ζωντανή εφαρμογή
 * σε κινητό στο κέντρο"). Chrome only — what goes inside is drawn by
 * app-builder-shell.tsx from the approved definition, never by this file.
 */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="phone-frame" data-testid="app-phone-frame">
      <div className="phone-frame-bar">
        <span className="phone-frame-notch" aria-hidden="true" />
      </div>
      <div className="phone-frame-body">{children}</div>
    </div>
  );
}
