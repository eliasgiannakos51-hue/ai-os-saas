import type { Metadata } from "next";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Set New Password",
  description: "Set a new password for your Nexa AI account.",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
