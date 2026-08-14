import type { Metadata } from "next";
import { pageTitleAndDescription } from "@/lib/page-title";
import { LoginForm } from "./login-form";

export function generateMetadata(): Promise<Metadata> {
  return pageTitleAndDescription("landing.logIn", "pageTitle.logInDescription");
}

export default function LoginPage() {
  return <LoginForm />;
}
