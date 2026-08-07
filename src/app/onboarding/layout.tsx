import type { ReactNode } from "react";
import { ToastProvider } from "@/components/toast/toast-context";

/**
 * The onboarding flow's own layout.
 *
 * THIS FILE EXISTS BECAUSE OF A REAL BUG. /onboarding lives outside
 * /dashboard on purpose — no sidebar, no widgets, nothing to wander off
 * into — and app/dashboard/layout.tsx is where ToastProvider is mounted.
 * Without this, `useToast()` inside the flow threw
 * "useToast must be used within a ToastProvider", and the FIRST page a
 * new account ever sees returned a 500.
 *
 * It was caught by the production route smoke test hitting the real page
 * in a real browser against `next start`. Nothing in typecheck, lint or
 * the build says a word about it: the provider is a runtime context, and
 * the component tree is only wrong once it is actually rendered. This is
 * exactly why the smoke test navigates real routes rather than mounting
 * components in a harness that supplies the providers itself — a harness
 * would have supplied this one and reported the page as healthy.
 *
 * Only ToastProvider is here, not the rest of the dashboard's stack. The
 * flow shows toasts and nothing else: no sidebar state, no command
 * palette, no credits meter. Mounting providers a page does not use is
 * how a deliberately bare screen slowly grows the chrome it was built to
 * avoid.
 */
export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
