import type { Metadata } from "next";
import { pageTitleAndDescription } from "@/lib/page-title";
import { ResetPasswordForm } from "./reset-password-form";

export function generateMetadata(): Promise<Metadata> {
  return pageTitleAndDescription("pageTitle.resetPassword", "pageTitle.resetPasswordDescription");
}

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
