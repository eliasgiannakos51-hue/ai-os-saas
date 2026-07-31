import type { Metadata } from "next";
import { ConfirmDeleteAccountForm } from "./confirm-delete-account-form";

export const metadata: Metadata = {
  title: "Confirm Account Deletion",
  description: "Confirm permanent deletion of your Ionexa AI account.",
};

export default function ConfirmDeleteAccountPage() {
  return <ConfirmDeleteAccountForm />;
}
