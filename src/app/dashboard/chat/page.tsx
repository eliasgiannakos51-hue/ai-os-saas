import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import type { ChatConversation } from "@/types/chat";
import { resolveEffectivePlan } from "@/lib/billing/credits";
import { getFreeChatStatus } from "@/lib/billing/free-chat-usage";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";

export const metadata: Metadata = {
  title: "Ionexa Chat",
};

export default async function ChatPage({
  searchParams,
}: {
  searchParams: { preset?: string };
}) {
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

  // Admins and beta testers already pay nothing, so a "free messages left"
  // counter would be meaningless noise for them — the route skips the
  // allowance for those accounts entirely.
  const bypassesCredits = isAdminEmail(user.email) || (await hasActiveBetaBypass(user));
  const plan = await resolveEffectivePlan(user);
  const freeChat = bypassesCredits ? null : await getFreeChatStatus(user.id, plan?.slug ?? "free");

  const userInitial = (user.email?.[0] ?? "?").toUpperCase();
  const initialMentorPreset =
    searchParams.preset === "trading" ? "trading" : searchParams.preset === "product" ? "product" : undefined;

  return (
    <main className="h-[calc(100vh-4rem)]">
      <ChatWorkspace
        initialConversations={(conversations as ChatConversation[] | null) ?? []}
        userInitial={userInitial}
        initialMentorPreset={initialMentorPreset}
        initialFreeChatRemaining={freeChat && freeChat.limit > 0 ? freeChat.remaining : undefined}
      />
    </main>
  );
}
