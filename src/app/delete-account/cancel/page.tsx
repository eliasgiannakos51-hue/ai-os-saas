import type { Metadata } from "next";
import { pageTitleAndDescription } from "@/lib/page-title";
import { CancelDeletionForm } from "./cancel-deletion-form";

export function generateMetadata(): Promise<Metadata> {
  return pageTitleAndDescription("pageTitle.cancelDeletion", "pageTitle.cancelDeletionDescription");
}

export default function CancelDeletionPage() {
  return <CancelDeletionForm />;
}
