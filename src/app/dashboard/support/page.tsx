import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LifeBuoy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { SupportChat } from "@/components/support/support-chat";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("support");

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader icon={LifeBuoy} title={t("title")} description={t("description")} />
        <SupportChat />
      </div>
    </main>
  );
}
