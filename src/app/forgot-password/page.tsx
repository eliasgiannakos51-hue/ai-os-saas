import type { Metadata } from "next";
import { pageTitleAndDescription } from "@/lib/page-title";
import { ForgotPasswordForm } from "./forgot-password-form";

export function generateMetadata(): Promise<Metadata> {
  return pageTitleAndDescription("pageTitle.forgotPassword", "pageTitle.forgotPasswordDescription");
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
