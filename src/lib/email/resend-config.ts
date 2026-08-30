import "server-only";

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
