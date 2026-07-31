import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log In",
  description: "Log in to Veron AI.",
};

export default function LoginPage() {
  return <LoginForm />;
}
