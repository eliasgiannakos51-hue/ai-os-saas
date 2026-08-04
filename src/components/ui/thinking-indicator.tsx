// Three staggered dots plus a label, for moments when the app is really
// waiting on an AI call that is in flight right now.
//
// Deliberately NOT decorative: every place this renders is gated on a
// state that only exists while a request is actually open (Mission
// Control's buildingIndex, the Website Builder's polling loop). Showing
// it on a card whose content was computed synchronously on the server
// would be theatre — it would tell the user work is happening when
// nothing is.
//
// The dot animation comes from globals.css's .thinking-dot, so it
// collapses to static under the app's reduce-motion switch like every
// other animation here.
export function ThinkingIndicator({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-xs text-orange-300 ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="flex items-end gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="thinking-dot h-1.5 w-1.5 rounded-full bg-orange-400 shadow-[0_0_6px_rgba(249,115,22,0.9)]"
            style={{ animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </span>
      {label}
    </span>
  );
}
