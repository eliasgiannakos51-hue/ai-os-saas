/**
 * RESEND'S SHARED TEST SENDER — the pure half, with NO `server-only`.
 *
 * WHY THIS FILE EXISTS, and it was a build failure that said so.
 *
 * This address started life in lib/websites/form-delivery.ts, which is
 * about website form submissions and had no business owning a fact about
 * email. When lib/email/resend-config.ts needed the same predicate there
 * were two spellings of one address in the tree — the drift that fails
 * OPEN, because the warning simply stops appearing while the mail keeps
 * not arriving.
 *
 * So it moved into resend-config.ts, and the build broke:
 *
 *     ./src/lib/email/resend-config.ts
 *     You're importing a component that needs server-only.
 *
 * form-delivery.ts is imported by components/websites/form-submissions-list.tsx,
 * which is a CLIENT component — it renders the stored email_status of each
 * submission, which is exactly what this predicate decides. Re-exporting
 * from a `server-only` module dragged that marker into the browser bundle.
 *
 * The lesson is a layering one and it is why this is a third file rather
 * than a bigger comment: the ADDRESS and the question "is this the test
 * sender" are pure string facts a browser may know. Whether THIS
 * DEPLOYMENT is configured is a fact about process.env, and belongs
 * behind `server-only`. They were one module because they are about one
 * subject, and one of them was not allowed to travel.
 */

/** The address Resend's shared sender uses. */
export const SHARED_TEST_SENDER = "onboarding@resend.dev";

// BUILT FROM THE CONSTANT ABOVE, not retyped: two spellings of the same
// address is a drift waiting to happen, and it would fail open.
const SHARED_SENDER_PATTERN = new RegExp(
  SHARED_TEST_SENDER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  "i"
);

/**
 * Is this From address Resend's shared test sender?
 *
 * It DOES send — to exactly one address, the one that owns the Resend
 * account. For every other recipient it is a refusal, which is why a
 * deployment that has never set RESEND_FROM_EMAIL looks configured and is
 * not.
 *
 * A case-insensitive REGEX rather than toLowerCase().includes(): that
 * shape is what scripts/tests/accent-search.test.mjs's section 4 bans
 * across all of src, because it is the exact comparison that made "καφε"
 * fail to match "Καφές" in nine components. This particular string is
 * pure ASCII and could not have that bug — but a ban with an exception
 * list is a ban that grows one, and the regex is no worse.
 */
export function usesSharedTestSender(fromAddress: string | undefined | null): boolean {
  if (!fromAddress) return false;
  return SHARED_SENDER_PATTERN.test(fromAddress);
}
