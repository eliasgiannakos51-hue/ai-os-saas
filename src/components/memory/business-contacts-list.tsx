// THE BUSINESS'S OWN NETWORK — A VISIBLE, GROWING LIST (the 2026-11-07
// market round, docs/QUEUE.md «ΤΟ MOAT»).
//
// A server component, not a client one: unlike AiMemoryList there is
// nothing to edit here (business_contacts has no update policy, same as
// chat_memory — see the migration), so the only state is what the page
// already fetched. The point of the list is to be SEEN growing, which is
// the part of memory that compounds with use rather than being learned
// once (brand.ts's name and colours).
import type { ContactRole } from "@/lib/memory/contacts";

export type BusinessContactRow = {
  id: string;
  name: string;
  role: ContactRole;
  detail: string | null;
  /** Already rendered by the page, from t("contacts.mentions", { count }) — this component does no i18n of its own. */
  mentionsText: string;
  /** Already rendered by the page, from t("contacts.knownSince", { date }). */
  knownSinceText: string;
};

export function BusinessContactsList({
  rows,
  roleLabels,
}: {
  rows: readonly BusinessContactRow[];
  roleLabels: Record<ContactRole, string>;
}) {
  return (
    <ul className="divide-y divide-divider rounded-card bg-panel">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium text-foreground">{row.name}</span>
              <span className="shrink-0 rounded-full bg-tag px-2 py-0.5 text-xs text-muted">
                {roleLabels[row.role]}
              </span>
            </div>
            {row.detail ? <p className="truncate text-sm text-muted">{row.detail}</p> : null}
          </div>
          <div className="shrink-0 text-end text-xs text-muted">
            <p>{row.mentionsText}</p>
            <p>{row.knownSinceText}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
