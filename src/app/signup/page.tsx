import type { Metadata } from "next";
import { SignupFlow } from "./signup-flow";
import { getEnabledOAuthProviders } from "@/lib/auth/oauth-providers";

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Choose a plan and create your Ionexa AI account.",
};

// See app/login/page.tsx for why this is dynamic: the enabled-provider list
// belongs to the Supabase project and changes without a deploy.
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const providers = await getEnabledOAuthProviders();
  return <SignupFlow oauthProviders={providers} />;
}
