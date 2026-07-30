import type { ReactNode } from "react";

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-orange-500">{title}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-muted">
        {children}
      </div>
    </section>
  );
}
