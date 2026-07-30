import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AssistantChat } from "@/components/create/assistant-chat";

export const metadata: Metadata = {
  title: "AI Assistant",
};

export default async function CreatePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userInitial = (user.email?.[0] ?? "?").toUpperCase();

  return (
    <main className="h-[calc(100vh-4rem)] bg-background">
      <AssistantChat userInitial={userInitial} />
    </main>
  );
}
