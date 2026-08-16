import { Inbox, CornerDownRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// The pulsing ring + gently bobbing icon are pure CSS animation — both
// collapse to a static state automatically under the "reduce motion"
// accessibility setting (globals.css's html[data-motion="reduce"] rule
// zeroes every animation-duration), so this needs no extra logic here to
// stay accessible.
//
// THREE PARTS, NOT ONE SENTENCE.
//
// This used to take `children` alone, and every module passed the same
// string through it: "No entries yet — use the button above to log your
// first one." A person looking at an empty page can already see that it
// is empty. What they cannot see is what the page is for, or what an
// entry is supposed to look like.
//
//   title   — what this page is
//   children— why it is worth typing into
//   example — one real entry
//
// All three are optional so the search-result case (`<EmptyState
// icon={SearchX}>No matches for 'x'</EmptyState>`) stays a single
// sentence: "nothing matched your search" genuinely IS the whole message
// there, and giving it a heading and a worked example would be padding.
//
// onExample is what makes the example more than illustration. With it,
// the example renders as a button that fills the create form with that
// text (generic-list.tsx -> generic-add-form.tsx), so the fastest way to
// understand the module is also the fastest way to have used it. Without
// it — a surface with no form to fill — it renders as quiet italic text
// rather than as a control that does nothing when pressed.
export function EmptyState({
  icon: Icon = Inbox,
  title,
  example,
  onExample,
  children,
}: {
  icon?: LucideIcon;
  title?: string;
  example?: string;
  onExample?: (text: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(249,115,22,0.18) 0%, rgba(220,38,38,0.06) 50%, transparent 75%)",
        }}
      />
      <span className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-orange-500/10" />
        <span className="absolute inset-2 rounded-full border border-orange-500/15" />
        <span className="relative flex h-20 w-20 animate-[float_3s_ease-in-out_infinite] items-center justify-center rounded-full bg-orange-500/10">
          <Icon className="h-9 w-9 text-orange-400/80" aria-hidden="true" />
        </span>
      </span>
      <div className="relative">
        {title && (
          <p data-testid="empty-title" className="mb-2 text-base font-semibold text-foreground">
            {title}
          </p>
        )}
        <div className="mx-auto max-w-md leading-relaxed">{children}</div>
        {example &&
          (onExample ? (
            <button
              type="button"
              data-testid="empty-example"
              onClick={() => onExample(example)}
              // The quotes are typographic, not content: an example has to
              // read as a specimen rather than as the app addressing the
              // user, and it has to do so in every locale, so they are
              // drawn here instead of being baked into 210 strings.
              className="mx-auto mt-5 inline-flex max-w-full items-center gap-2 rounded-full border border-orange-500/40 bg-orange-500/10 px-4 py-2 text-left text-xs font-medium text-orange-300 transition-colors duration-150 hover:border-orange-500 hover:bg-orange-500/20 hover:text-orange-200"
            >
              <CornerDownRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">&ldquo;{example}&rdquo;</span>
            </button>
          ) : (
            <p
              data-testid="empty-example"
              className="mx-auto mt-4 max-w-md text-xs italic leading-relaxed text-muted/80"
            >
              &ldquo;{example}&rdquo;
            </p>
          ))}
      </div>
    </div>
  );
}
