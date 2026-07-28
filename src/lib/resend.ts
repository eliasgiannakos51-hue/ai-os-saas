import "server-only";
import { Resend } from "resend";

// Server-only Resend client. Import this ONLY from server-only code (Route
// Handlers, Server Components/Actions) — the `server-only` import above
// makes any accidental client-component import fail at build time instead
// of leaking the key to the browser.
export function createResendClient() {
  return new Resend(process.env.RESEND_API_KEY);
}
