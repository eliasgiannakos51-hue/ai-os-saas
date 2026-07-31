import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import type { ChatConversation } from "@/types/chat";

export const metadata: Metadata = {
  title: "Ionexa Chat",
};

export default async function ChatPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: conversations } = await supabase
    .from("chat_conversations")
    .select("id, title, is_pinned, created_at, updated_at")
    .order("updated_at", { ascending: false });

  const userInitial = (user.email?.[0] ?? "?").toUpperCase();

  return (
    <main className="h-[calc(100vh-4rem)] bg-background">
      <ChatWorkspace
        initialConversations={(conversations as ChatConversation[] | null) ?? []}
        userInitial={userInitial}
      />
    </main>
  );
}
