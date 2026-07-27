import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";
import { AddIdeaForm } from "@/components/ideas/add-idea-form";
import { IdeasList } from "@/components/ideas/ideas-list";
import type { Idea } from "@/types/ideas";

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
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <p className="text-xs tracking-widest text-amber-500">AI_OS //</p>
          <h1 className="text-lg font-bold text-foreground">dashboard</h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-xs text-muted sm:inline">
            {user.email}
          </span>
          <LogoutButton />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-6">
          <h2 className="text-sm uppercase tracking-widest text-muted">
            module: ideas
          </h2>
        </div>

        <div className="mb-6">
          <AddIdeaForm />
        </div>

        {error && (
          <p className="mb-4 rounded border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-400">
            error loading ideas: {error.message}
          </p>
        )}

        <IdeasList ideas={(ideas as Idea[]) ?? []} />
      </div>
    </main>
  );
}
