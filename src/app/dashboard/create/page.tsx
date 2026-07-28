import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/logout-button";
import { CreateChat } from "@/components/create/create-chat";

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

      <div className="flex min-h-[calc(100vh-73px)] items-center justify-center px-6 py-12">
        <CreateChat />
      </div>
    </main>
  );
}
