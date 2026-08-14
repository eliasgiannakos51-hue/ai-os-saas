import type { Metadata } from "next";
import { pageTitleAndDescription } from "@/lib/page-title";
import { SignupFlow } from "./signup-flow";

export function generateMetadata(): Promise<Metadata> {
  return pageTitleAndDescription("landing.signUp", "pageTitle.signUpDescription");
}

export default function SignupPage() {
  return <SignupFlow />;
}
