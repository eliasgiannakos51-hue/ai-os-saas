import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { CreateChat } from "@/components/create/create-chat";

export const metadata: Metadata = {
  title: "Create Anything",
};

export default async function CreatePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-background font-mono">
      <DashboardHeader email={user.email ?? ""} />

      <div className="flex min-h-[calc(100vh-73px)] items-center justify-center px-4 py-12 sm:px-6">
        <CreateChat />
      </div>
    </main>
  );
}
