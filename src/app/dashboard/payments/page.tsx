import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isFeatureOn } from "@/lib/flags/flags";
import { PaymentsDashboard } from "@/components/payments/payments-dashboard";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("payments.title");
}

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function PaymentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const on = await isFeatureOn("ionexa-payments", user);
  if (!on) {
    // Not available to this user — show nothing rather than a half-built
    // page, the same pattern as apps-tool, editing-tool, films-tool.
    const { notFound } = await import("next/navigation");
    notFound();
  }

  return <PaymentsDashboard />;
}
