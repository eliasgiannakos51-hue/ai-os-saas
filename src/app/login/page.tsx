import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { getEnabledOAuthProviders } from "@/lib/auth/oauth-providers";

export const metadata: Metadata = {
  title: "Log In",
  description: "Log in to Ionexa AI.",
};

// Dynamic because the social-button list is a live property of the Supabase
// project, not of this build. Prerendering it would bake "Google is off"
// into the HTML at build time and keep serving that after somebody turns
// the provider on — the mirror image of the bug being fixed. The probe
// itself is memoised for five minutes (lib/auth/oauth-providers.ts), so
// this costs at most one extra request per server instance per five
// minutes, not one per page view.
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const providers = await getEnabledOAuthProviders();
  return <LoginForm oauthProviders={providers} />;
}
