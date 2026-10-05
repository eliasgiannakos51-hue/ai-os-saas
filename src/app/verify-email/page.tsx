import type { Metadata } from "next";
import { pageTitleAndDescription } from "@/lib/page-title";
import { VerifyEmailPanel } from "./verify-email-panel";

export function generateMetadata(): Promise<Metadata> {
  return pageTitleAndDescription("pageTitle.verifyEmail", "pageTitle.verifyEmailDescription");
}

// Where an account whose address is not yet proved is sent instead of the
// dashboard (src/middleware.ts, lib/auth/confirm-email.ts), and where a used
// or expired confirmation link lands (?error=1).
export default function VerifyEmailPage() {
  return <VerifyEmailPanel />;
}
