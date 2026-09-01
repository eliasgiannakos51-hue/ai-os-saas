import "server-only";
import { Resend } from "resend";
import { requireResendKey } from "@/lib/email/resend-config";

export { ResendNotConfiguredError, resendIsConfigured } from "@/lib/email/resend-config";

/**
 * Server-only Resend client. Import this ONLY from server-only code (Route
 * Handlers, Server Components/Actions) — the `server-only` import above
 * makes any accidental client-component import fail at build time instead
 * of leaking the key to the browser.
 *
 * THE MISSING KEY IS AN ERROR WITH A NAME, and the reason is written out
 * in lib/email/resend-config.ts. Short version: this already threw when
 * RESEND_API_KEY was unset, because `new Resend(undefined)` throws from
 * the SDK's own constructor — but eleven of the fourteen call sites
 * logged that as `stage: "unhandled"`, which tells an operator that the
 * welcome email is broken and not that a variable is missing.
 *
 * NO SIGNATURE CHANGED. This still returns a client or throws, in the
 * same place, at the same moment. Only the sentence in the log is
 * different, and it is different at all fourteen call sites at once.
 */
export function createResendClient(): Resend {
  return new Resend(requireResendKey());
}
