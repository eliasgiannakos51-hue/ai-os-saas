import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import type { ChatConversation } from "@/types/chat";
import { resolveEffectivePlan } from "@/lib/billing/credits";
import { loadLegacyEntitlements } from "@/lib/billing/legacy-entitlements";
import { getFreeChatStatus } from "@/lib/billing/free-chat-usage";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import { loadFavoriteIds } from "@/lib/favorites";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.chat");
}

export default async function ChatPage({
  searchParams,
}: {
  searchParams: { preset?: string; c?: string };
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: conversationRows } = await supabase
    .from("chat_conversations")
    .select("id, title, is_pinned, created_at, updated_at")
    .order("updated_at", { ascending: false });

  // Starred state comes from user_favorites, not from a column here — one
  // batched read for the whole list rather than a query per row.
  const rows = (conversationRows ?? []) as Omit<ChatConversation, "is_favorited">[];
  const favoritedIds = await loadFavoriteIds(
    supabase,
    user.id,
    "chat_conversations",
    rows.map((c) => c.id)
  );
  const conversations: ChatConversation[] = rows.map((c) => ({
    ...c,
    is_favorited: favoritedIds.has(c.id),
  }));

  // Admins and beta testers already pay nothing, so a "free messages left"
  // counter would be meaningless noise for them — the route skips the
  // allowance for those accounts entirely.
  const bypassesCredits = isAdminEmail(user.email) || (await hasActiveBetaBypass(user));
  const plan = await resolveEffectivePlan(user);
  // Same entitlements the route honours, so the counter the user sees and
  // the allowance the server enforces cannot disagree for a grandfathered
  // account.
  const legacy = bypassesCredits ? null : await loadLegacyEntitlements(user.id);
  const freeChat = bypassesCredits
    ? null
    : await getFreeChatStatus(user.id, plan?.slug ?? "free", legacy);

  const userInitial = (user.email?.[0] ?? "?").toUpperCase();
  const initialMentorPreset =
    searchParams.preset === "trading" ? "trading" : searchParams.preset === "product" ? "product" : undefined;

  return (
    <main className="h-[calc(100vh-4rem)]">
      <ChatWorkspace
        initialConversations={conversations}
        userInitial={userInitial}
        initialMentorPreset={initialMentorPreset}
        // Deep link from /dashboard/favorites. Validated against the
        // user's own list rather than trusted: an id in the URL must not
        // be able to make the workspace ask for someone else's thread.
        initialConversationId={
          searchParams.c && conversations.some((c) => c.id === searchParams.c)
            ? searchParams.c
            : undefined
        }
        initialFreeChatRemaining={freeChat && freeChat.limit > 0 ? freeChat.remaining : undefined}
      />
    </main>
  );
}
