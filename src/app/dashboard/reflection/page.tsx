import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ReflectionGenerator } from "@/components/reflection/reflection-generator";
import { REFLECTION_ICON } from "@/lib/module-icons";

export const metadata: Metadata = { title: "Weekly Reflection" };

// "Execution gap" tool: what actually got done this week vs what was
// planned, from real data only — no new table, nothing persisted. Every
// click of "Generate Weekly Reflection" (see reflection-generator.tsx)
// recomputes stats fresh (lib/reflection.ts) and asks the Reflection
// Agent (lib/reflection-agent.ts) for a short, honest synthesis.
export default async function ReflectionPage() {
  const t = await getTranslations("dashboard.reflection");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader icon={REFLECTION_ICON} title={t("title")} description={t("description")} />
        <ReflectionGenerator />
      </div>
    </main>
  );
}
