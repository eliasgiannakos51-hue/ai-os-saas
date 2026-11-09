/**
 * Which pre-submit price hint to say, given what the account's own
 * balance is (owner's own request, 2026-11-09, docs/QUEUE.md item 1.7's
 * «Λείπει»: "how much do you have left" shown before an expensive
 * action, not only its price).
 *
 * An admin account is never actually charged (components/credits/
 * credits-context.tsx's own comment on `isAdmin`), so a balance here
 * would be a number that means nothing for this account — "unlimited" is
 * said elsewhere, and this stays silent about the number rather than
 * repeat one that is never really spent. `null` is "the balance has not
 * been read yet" (the first render, before /api/credits/balance
 * answers), never "zero" — the same reason top-nav.tsx and
 * editor-shell.tsx both write `credits === null ? "…" : …` instead of
 * showing 0.
 *
 * NO REACT IMPORT ON PURPOSE: cost-estimate.tsx (the "use client"
 * component that calls this) pulls in react, next-intl and lucide-react,
 * none of which scripts/tests/load-ts.mjs's minimal bundler can resolve —
 * the same split this repo already uses elsewhere (billing/estimate.ts
 * vs. the component that renders it) so the decision itself stays
 * directly testable.
 */
export function creditsHintKey(remaining: number | null, isAdmin: boolean): "approx" | "approxWithRemaining" {
  return isAdmin || remaining === null ? "approx" : "approxWithRemaining";
}
