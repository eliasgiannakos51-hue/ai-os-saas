import "server-only";
// The pure half — the address and the predicate — lives in a module with
// NO `server-only`, because a CLIENT component reads it: see the header
// of lib/email/shared-sender.ts for the build failure that established
// the boundary.
export { SHARED_TEST_SENDER, usesSharedTestSender } from "@/lib/email/shared-sender";
import { usesSharedTestSender } from "@/lib/email/shared-sender";

/**
 * WHETHER EMAIL CAN BE SENT AT ALL — the pure half, so it can be tested.
 *
 * ------------------------------------------------------------------
 * THE SILENCE THIS CLOSES
 * ------------------------------------------------------------------
 *
 * `new Resend(undefined)` throws from the SDK's own constructor, so a
 * deployment with no RESEND_API_KEY already failed at the right moment.
 * It failed with the wrong SENTENCE. Fourteen call sites construct a
 * client inside a try block and log whatever comes out, and for eleven of
 * them what came out was an SDK internal logged as `stage: "unhandled"`.
 * The operator reading that log learns that the welcome email is broken;
 * they do not learn that a variable is missing.
 *
 * Three call sites had noticed and written their own
 * `if (!process.env.RESEND_API_KEY)` guard to get a usable sentence —
 * lib/websites/form-delivery.ts, send-weekly-digest-email.ts and
 * notify/dispatch.ts. Those three are the ones somebody was already
 * debugging. The eleven that had not are the ones nobody would: the error
 * alert and the cost alert among them, which means THE MAIL THAT WOULD
 * HAVE REPORTED THE PROBLEM IS PART OF THE PROBLEM.
 *
 * ------------------------------------------------------------------
 * WHY THIS FILE EXISTS SEPARATELY FROM lib/resend.ts
 * ------------------------------------------------------------------
 *
 * lib/resend.ts imports the `resend` package, and scripts/tests/load-ts.mjs
 * cannot load a module with an external import — so a gate could only ever
 * make claims about lib/resend.ts's TEXT. The decision itself has no
 * dependencies, so it lives here, takes its environment as an ARGUMENT,
 * and scripts/tests/email-silence.test.mjs calls it on both branches
 * rather than asserting that a regex matched.
 */
export class ResendNotConfiguredError extends Error {
  constructor() {
    super("RESEND_API_KEY is not set on this deployment, so no email can be sent.");
    this.name = "ResendNotConfiguredError";
  }
}

/** True when email can be sent. For a caller that wants to RECORD "not
 *  configured" as a status rather than catch a throw — which is the
 *  better shape wherever there is a row to record it on. */
export function resendIsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return typeof env.RESEND_API_KEY === "string" && env.RESEND_API_KEY.trim().length > 0;
}

/**
 * The key, or a named throw.
 *
 * A WHITESPACE-ONLY VALUE COUNTS AS UNSET, and that is not pedantry: a
 * variable pasted into a dashboard with a trailing newline is set as far
 * as `Boolean(env.X)` is concerned, and the SDK then fails on the wire
 * with an authentication error instead of at the door with a
 * configuration one.
 */
export function requireResendKey(env: NodeJS.ProcessEnv = process.env): string {
  if (!resendIsConfigured(env)) throw new ResendNotConfiguredError();
  return (env.RESEND_API_KEY as string).trim();
}

/**
 * The shared Resend test sender.
 *
 * FOURTEEN FILES HAD THIS STRING, each as its own
 * `const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL || "..."`. That is
 * a duplicated constant with a fallback in it, which is the worst kind:
 * changing the address means finding all fourteen, and the FALLBACK is
 * the part that decides whether mail reaches anybody.
 */
export const RESEND_TEST_SENDER = "Ionexa AI <onboarding@resend.dev>";


export type SenderStatus =
  /** A key, and a From address of this deployment's own. */
  | "ok"
  /** No RESEND_API_KEY. Nothing can be sent at all. */
  | "no_key"
  /** A key, but no RESEND_FROM_EMAIL — so the From address is Resend's
   *  shared test sender, which delivers ONLY to the Resend account
   *  owner's own address and refuses every other recipient. */
  | "test_sender";

/**
 * WHY "test_sender" IS ITS OWN STATE AND NOT A KIND OF "ok".
 *
 * This is the worst default in the product and it is worth being precise
 * about why. With a key and no From address:
 *
 *   the OPERATOR's own mail arrives, because Resend allows the account
 *   owner's address — so the deployment looks configured to the one
 *   person checking;
 *   EVERY CUSTOMER's mail is refused, one API call at a time, and each
 *   refusal is recorded as a provider sentence in a column nobody
 *   aggregates.
 *
 * So the failure is invisible from the only seat that would notice it.
 * Treating it as a first-class status means the decision can be made
 * ONCE, before the call, and reported as a reason code rather than as
 * fourteen different English strings from a third party.
 */
export function senderStatus(env: NodeJS.ProcessEnv = process.env): SenderStatus {
  if (!resendIsConfigured(env)) return "no_key";
  const from = (env.RESEND_FROM_EMAIL ?? "").trim();
  if (!from) return "test_sender";
  // A From address that IS the test sender, written out by hand, is the
  // same situation — the check is about the ADDRESS, not about whether
  // the variable happens to be set. Through the one predicate, so this
  // cannot drift from the one form-delivery uses to decide a stored
  // email_status.
  if (usesSharedTestSender(from)) return "test_sender";
  return "ok";
}

/** The From address every sender uses. One definition, not fourteen. */
export function senderAddress(env: NodeJS.ProcessEnv = process.env): string {
  const from = (env.RESEND_FROM_EMAIL ?? "").trim();
  return from || RESEND_TEST_SENDER;
}

/**
 * Can this deployment deliver mail to somebody who is not the operator?
 *
 * The reason code is deliberately short and machine-shaped: it is written
 * into notification_events.reason and read back by a query, and an
 * English sentence there is prose nobody translates in a column nobody
 * reads as prose.
 */
export function emailIsDeliverable(env: NodeJS.ProcessEnv = process.env): boolean {
  return senderStatus(env) === "ok";
}
