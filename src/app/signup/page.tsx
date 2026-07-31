import type { Metadata } from "next";
import { SignupFlow } from "./signup-flow";

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Choose a plan and create your Veron AI account.",
};

export default function SignupPage() {
  return <SignupFlow />;
}
