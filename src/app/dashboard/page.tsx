import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { PageHeader } from "@/components/dashboard/page-header";
import { ErrorMessage } from "@/components/error-message";
import { AddIdeaForm } from "@/components/ideas/add-idea-form";
import { IdeasList } from "@/components/ideas/ideas-list";
import type { Idea } from "@/types/ideas";

export const metadata: Metadata = {
  title: "Ideas",
};

export default async function DashboardPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: ideas, error } = await supabase
    .from("ideas")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-background font-mono">
      <DashboardHeader email={user.email ?? ""} />

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader eyebrow="dashboard" title="Ideas" />

        <div className="mb-6">
          <AddIdeaForm />
        </div>

        {error && <ErrorMessage message={`loading ideas: ${error.message}`} />}

        <IdeasList ideas={(ideas as Idea[]) ?? []} />
      </div>
    </main>
  );
}
