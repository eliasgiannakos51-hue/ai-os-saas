import type { Metadata } from "next";
import { pageTitleAndDescription } from "@/lib/page-title";
import { ConfirmDeleteAccountForm } from "./confirm-delete-account-form";

export function generateMetadata(): Promise<Metadata> {
  return pageTitleAndDescription("pageTitle.confirmDeletion", "pageTitle.confirmDeletionDescription");
}

export default function ConfirmDeleteAccountPage() {
  return <ConfirmDeleteAccountForm />;
}
