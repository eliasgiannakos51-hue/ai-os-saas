"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";

// Google's brand mark, inline rather than an <img> from a CDN — the app
// blocks external resources elsewhere for the same reason (no extra
// request, no third-party dependency, works offline in dev). Colors are
// Google's official brand palette, required by their branding guidelines
// for a "Sign in with Google" button.
function GoogleIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}

// Shared by BOTH /login and /signup — social sign-in is inherently the
// same action either way (the provider decides whether this is a new
// account or an existing one), so there's deliberately no separate
// "sign up with Google" vs "log in with Google" path to drift apart.
// New accounts are bootstrapped with the same tier/credits/welcome email
// a normal signup gets — see app/auth/callback/route.ts.
//
// `providers` is the list the AUTH SERVER says it will accept, probed
// server-side in lib/auth/oauth-providers.ts and passed down. When Google
// is not in it this component renders NOTHING — not a disabled button, not
// an explanation. A provider that is switched off in the Supabase project
// answers every attempt with
//   {"code":400,"error_code":"validation_failed",
//    "msg":"Unsupported provider: provider is not enabled"}
// and a control whose only outcome is that error should not be on the
// page. The divider ("or continue with email") is inside this component
// for the same reason: with no social buttons above it, "or" is a sentence
// with nothing before it.
export function SocialAuthButtons({
  next,
  providers,
}: {
  next?: string;
  providers: readonly string[];
}) {
  const t = useTranslations("auth.social");
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const googleEnabled = providers.includes("google");

  async function handleGoogle() {
    if (loadingProvider) return;
    setError(null);
    setLoadingProvider("google");
    try {
      const supabase = createClient();
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      if (next) callbackUrl.searchParams.set("next", next);

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl.toString() },
      });

      // On success the browser is already navigating away to Google, so
      // the loading state is intentionally never cleared in that path.
      if (oauthError) {
        setError(getErrorMessage(oauthError, t("genericError")));
        setLoadingProvider(null);
      }
    } catch (err) {
      setError(getErrorMessage(err, t("genericError")));
      setLoadingProvider(null);
    }
  }

  if (!googleEnabled) return null;

  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={handleGoogle}
        disabled={loadingProvider !== null}
        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-panel px-4 py-2.5 text-sm font-semibold text-foreground transition-all duration-200 hover:border-orange-500/50 hover:bg-panel-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loadingProvider === "google" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <GoogleIcon />
        )}
        {t("continueWithGoogle")}
      </button>

      {error && (
        <p className="mt-2 rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      <div className="mt-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-[11px] uppercase tracking-wider text-muted">
          {t("orContinueWithEmail")}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
