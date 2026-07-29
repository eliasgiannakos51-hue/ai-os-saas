import type { Metadata } from "next";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot Password",
  description: "Reset your AI_OS account password.",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
