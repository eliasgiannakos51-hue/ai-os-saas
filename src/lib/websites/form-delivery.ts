/**
 * DID THE EMAIL ACTUALLY GO OUT, AND IF NOT, WHY.
 *
 * Pure. The senders in lib/email/ all follow the same shape — try, catch,
 * logApiError, return — which is right for a welcome email and wrong for
 * this one: a form submission that never reaches the owner is a lost
 * customer, and the owner is the only person who can fix the cause.
 *
 * THE TWO FAILURES THAT LOOK IDENTICAL FROM A SERVER LOG:
 *
 *   NO API KEY. `new Resend(undefined)` THROWS — "Missing API key" — from
 *   the constructor, before any request is made. Every sender in this app
 *   calls createResendClient() inside its try block, so on a deployment
 *   without RESEND_API_KEY every email in the product fails at
 *   construction and the only trace is a server log nobody reads. That is
 *   why the key is checked here, by name, before a client is built.
 *
 *   NO VERIFIED DOMAIN. Resend accepts the call and refuses the message:
 *   an unverified From domain, or the shared onboarding@resend.dev sender
 *   that only ever delivers to the Resend account's OWN address. A site
 *   owner in this state sees a contact form that works, a dashboard that
 *   fills up, and an inbox that stays empty.
 *
 * Both end up on the submission row, and the dashboard says so.
 */

export const FORM_EMAIL_STATUSES = [
  "pending",
  "sent",
  "no_key",
  "unverified_domain",
  "opted_out",
  "daily_cap",
  "failed",
] as const;

export type FormEmailStatus = (typeof FORM_EMAIL_STATUSES)[number];

export function isFormEmailStatus(value: unknown): value is FormEmailStatus {
  return typeof value === "string" && (FORM_EMAIL_STATUSES as readonly string[]).includes(value);
}

/** The statuses that mean the owner did NOT get the email and should do
 *  something about it. 'opted_out' and 'daily_cap' are their own choice
 *  and their own limit, so they are not faults — but they are also not
 *  'sent', which is why 'sent' is not simply the negation of this. */
export const DELIVERY_FAULTS: readonly FormEmailStatus[] = [
  "no_key",
  "unverified_domain",
  "failed",
];

export function isDeliveryFault(status: unknown): boolean {
  return isFormEmailStatus(status) && (DELIVERY_FAULTS as readonly string[]).includes(status);
}

/**
 * Resend's shared test sender.
 *
 * It is the default in lib/email/*.ts's FROM_ADDRESS and it DOES send —
 * to exactly one address, the one that owns the Resend account. For every
 * other recipient it is a 403, which is why a deployment that has never
 * set RESEND_FROM_EMAIL looks configured and is not.
 */
export const SHARED_TEST_SENDER = "onboarding@resend.dev";

export function usesSharedTestSender(fromAddress: string | undefined | null): boolean {
  if (!fromAddress) return false;
  // A case-insensitive REGEX rather than toLowerCase().includes(): that
  // shape is what scripts/tests/accent-search.test.mjs's section 4 bans
  // across all of src, because it is the exact comparison that made
  // "καφε" fail to match "Καφές" in nine components. This particular
  // string is pure ASCII and could not have that bug — but a ban with an
  // exception list is a ban that grows one, and the regex is no worse.
  return SHARED_SENDER_PATTERN.test(fromAddress);
}

// BUILT FROM THE CONSTANT ABOVE, not retyped: two spellings of the same
// address is a drift waiting to happen, and it would fail open — the
// warning simply stops appearing while the emails keep not arriving.
const SHARED_SENDER_PATTERN = new RegExp(
  SHARED_TEST_SENDER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  "i"
);

/**
 * Turn whatever Resend gave back into a status and a short detail.
 *
 * MATCHED ON THE MESSAGE TEXT, which is a real weakness and is stated
 * rather than hidden: Resend's error `name` is "validation_error" for
 * several unrelated problems, so the domain case can only be told apart
 * by what it says. If they reword it, this degrades to 'failed' WITH the
 * message attached — the owner still sees the reason, it just is not
 * categorised. That is the right way round; the alternative is a
 * confident wrong label.
 */
export function classifySendFailure(error: unknown): {
  status: FormEmailStatus;
  detail: string;
} {
  const message =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message ?? "")
        : String(error ?? "");
  const detail = message.trim().slice(0, 500) || "Unknown email error.";

  if (NO_KEY_PATTERN.test(message)) return { status: "no_key", detail };
  if (UNVERIFIED_PATTERN.test(message)) return { status: "unverified_domain", detail };
  return { status: "failed", detail };
}

const NO_KEY_PATTERN = /missing api key|api key is invalid/i;
// "The example.com domain is not verified", and the shared-sender 403:
// "You can only send testing emails to your own email address".
const UNVERIFIED_PATTERN = /not verified|domain is not|testing emails to your own/i;

export type DeliveryCounts = Partial<Record<FormEmailStatus, number>>;

/**
 * What to tell the owner at the top of the submissions page.
 *
 * Returns the single most actionable fault, not a tally: somebody whose
 * email is broken needs one sentence and one thing to change, and a
 * breakdown of four statuses is a breakdown they will scroll past.
 * `no_key` outranks `unverified_domain` outranks `failed` because that is
 * the order they have to be fixed in — a verified domain does nothing
 * without a key.
 */
export function worstDeliveryFault(counts: DeliveryCounts): FormEmailStatus | null {
  for (const status of DELIVERY_FAULTS) {
    if ((counts[status] ?? 0) > 0) return status;
  }
  return null;
}

/** How many submissions did not reach the owner's inbox because
 *  something is broken (not because they turned it off). */
export function faultCount(counts: DeliveryCounts): number {
  return DELIVERY_FAULTS.reduce((total, status) => total + (counts[status] ?? 0), 0);
}
