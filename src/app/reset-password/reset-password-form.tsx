"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/get-error-message";
import { isPasswordStrong } from "@/lib/password-strength";
import { PasswordInput } from "@/components/ui/password-input";
import { PasswordStrengthChecklist } from "@/components/auth/password-strength-checklist";
import { GeneratePasswordButton } from "@/components/auth/generate-password-button";
import { Logo } from "@/components/logo";

type Status = "checking" | "ready" | "invalid";

// detectSessionInUrl is turned off for this client so it never races the
// explicit verification below for the same one-time-use recovery token — see
// the verifyRecoveryLink() comment. isSingleton: false guarantees that
// override actually takes effect: createBrowserClient() caches and reuses
// the FIRST client ever created in the browser tab regardless of the
// options passed to later calls, so if any other page (login,
// forgot-password) already created the default singleton earlier in this
// tab's session, a plain createClient() call here would silently get that
// cached instance back — with detectSessionInUrl still on — instead of
// this one.
function createResetPasswordClient() {
  return createClient({
    auth: { detectSessionInUrl: false },
    isSingleton: false,
  });
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [supabase] = useState(createResetPasswordClient);

  const [status, setStatus] = useState<Status>("checking");
  const [invalidReason, setInvalidReason] = useState(
    "This reset link is invalid or has expired."
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Guards against React 18 Strict Mode's development-only double-invoke of
  // effects (mount -> cleanup -> mount again). Without this, the verification
  // below — which consumes a single-use recovery token — would run twice: the
  // first (real) call succeeds and consumes the token, but Strict Mode's
  // simulated "unmount" discards that result before it reaches state; the
  // second run then retries with the now-already-used token and legitimately
  // fails, which is what actually renders. A ref (not a plain closure
  // variable) is required because it survives that cleanup+rerun cycle.
  // reactStrictMode isn't set in next.config.mjs, so the App Router enables
  // it by default in development — see Next.js's define-env-plugin.
  const hasVerifiedRef = useRef(false);

  useEffect(() => {
    if (hasVerifiedRef.current) return;
    hasVerifiedRef.current = true;

    // Supabase's reset-password email links can land here in a few shapes:
    //   - token_hash: /reset-password?token_hash=xxxxx&type=recovery
    //     Verified via verifyOtp(), which checks the token server-side with
    //     no dependency on local browser storage — this is the only shape
    //     that works cross-device (e.g. request on a laptop, open on a
    //     phone), so it's tried first. Requires the Supabase email template
    //     to link with {{ .TokenHash }} instead of {{ .ConfirmationURL }}.
    //   - PKCE:     /reset-password?code=xxxxx
    //     Requires a code_verifier stored by the SAME browser that made the
    //     request, so this fails with "code challenge does not match" if
    //     opened on a different device/browser. Kept as a fallback for
    //     projects still using the default email template.
    //   - implicit: /reset-password#access_token=xxx&refresh_token=yyy&type=recovery
    // Either way, we read it out of the URL ourselves and turn it into a
    // session before allowing a password change — the Supabase client's own
    // automatic URL detection is disabled above specifically so there's only
    // ever one consumer of the (single-use) token/code.
    async function verifyRecoveryLink() {
      try {
        const url = new URL(window.location.href);
        const hashParams = new URLSearchParams(
          url.hash.startsWith("#") ? url.hash.slice(1) : ""
        );

        const errorDescription =
          url.searchParams.get("error_description") ||
          hashParams.get("error_description");
        if (errorDescription) {
          setInvalidReason(errorDescription);
          setStatus("invalid");
          return;
        }

        const tokenHash = url.searchParams.get("token_hash");
        const otpType = url.searchParams.get("type") || hashParams.get("type");
        if (tokenHash && otpType === "recovery") {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });
          if (error) {
            setInvalidReason(getErrorMessage(error));
            setStatus("invalid");
          } else {
            setStatus("ready");
          }
          return;
        }

        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setInvalidReason(getErrorMessage(error));
            setStatus("invalid");
          } else {
            setStatus("ready");
          }
          return;
        }

        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken && refreshToken && otpType === "recovery") {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            setInvalidReason(getErrorMessage(error));
            setStatus("invalid");
          } else {
            setStatus("ready");
          }
          return;
        }

        // No recognizable reset token in the URL at all — most likely the
        // redirectTo passed to resetPasswordForEmail() isn't on this
        // Supabase project's allowed redirect list, so Supabase sent the
        // user to the default Site URL instead of here.
        setInvalidReason(
          "No reset token was found in this link. It may have already been used, or the link may be malformed."
        );
        setStatus("invalid");
      } catch (err) {
        setInvalidReason(getErrorMessage(err));
        setStatus("invalid");
      }
    }

    verifyRecoveryLink();
  }, [supabase]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setError(getErrorMessage(error));
        return;
      }

      await supabase.auth.signOut();
      router.push("/login?reset=success");
      router.refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center overflow-x-hidden bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center">
            <Logo className="h-14 w-auto" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            Set new password
          </h1>
        </div>

        <div className="rounded-2xl border border-border bg-panel p-6 shadow-[0_0_0_1px_rgba(249,115,22,0.05)]">
          {status === "checking" && (
            <p className="animate-pulse text-center text-sm text-muted">
              Verifying reset link...
            </p>
          )}

          {status === "invalid" && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-red-400">{invalidReason}</p>
              <Link
                href="/forgot-password"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] sm:min-h-0"
              >
                Request a new link
              </Link>
            </div>
          )}

          {status === "ready" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label htmlFor="password" className="block text-xs text-muted">
                    New password
                  </label>
                  <GeneratePasswordButton
                    onGenerate={(generated) => {
                      setPassword(generated);
                      setConfirmPassword(generated);
                    }}
                  />
                </div>
                <PasswordInput
                  id="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-border bg-black/40 px-3 py-2.5 text-sm text-foreground outline-none transition-colors duration-150 focus:border-orange-500"
                  placeholder="••••••••"
                />
                <div className="mt-2">
                  <PasswordStrengthChecklist password={password} />
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="mb-1 block text-xs text-muted">
                  Confirm password
                </label>
                <PasswordInput
                  id="confirmPassword"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-border bg-black/40 px-3 py-2.5 text-sm text-foreground outline-none transition-colors duration-150 focus:border-orange-500"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p className="rounded-xl border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading || !isPasswordStrong(password)}
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-black transition-all duration-200 hover:opacity-90 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)] disabled:opacity-50"
              >
                {loading ? "Saving..." : "Save new password"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
