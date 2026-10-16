import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MessagesSquare } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ChatsWorkspace } from "@/components/chats/chats-workspace";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { isFeatureOn } from "@/lib/flags/flags";
import { loadFavoriteIds } from "@/lib/favorites";
import { pageTitle } from "@/lib/page-title";
import { CHATS_LIST_CAP } from "@/lib/chat/conversation-search";
import type { SidebarConversation, SidebarProject } from "@/lib/nav/recent-tools";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("pageTitle.chats");
}

/**
 * «ΠΑΤΑΩ "CHATS" ΚΑΙ ΒΛΕΠΩ ΟΛΕΣ ΤΙΣ ΣΥΝΟΜΙΛΙΕΣ, ΜΕ ΑΝΑΖΗΤΗΣΗ»
 * (owner, 2026-10-15).
 *
 * WHAT THIS PAGE REPLACES. Until today the only place that held EVERY
 * conversation — rather than the newest few — was a drawer inside Chat
 * (components/chat/conversation-sidebar.tsx), i.e. a second sidebar on
 * one screen, which ΣΥΣΤΗΜΑ DESIGN §3 says there is not. Everything
 * that drawer could do is here or in the sidebar's own rows, and the
 * two lists are the SAME COMPONENT so they cannot drift
 * (components/dashboard/conversation-rows.tsx).
 *
 * NOT FOUND WHEN THE SWITCH IS OFF, rather than an explanatory page.
 * All tools draws an explanation when its squares are hidden because
 * the page still exists and is linked from the rail; this address is
 * not linked from anywhere while the switch is off, so the honest
 * answer for somebody who types it in is that there is no such page
 * yet.
 *
 * THE LIST IS BOUNDED AND THE BOUND IS SAID OUT LOUD. "Every
 * conversation" is a promise that gets slower every month a person
 * uses the product, and a page that quietly renders its newest 500 is
 * indistinguishable from one that is broken. CHATS_LIST_CAP is read by
 * the screen too, which tells the reader when it has been reached.
 */
export default async function ChatsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await isFeatureOn("chats-page", user))) notFound();

  const t = await getTranslations("dashboard.chats");
  const supabase = await createClient();

  const [conversationRows, projectRows] = await Promise.all([
    supabase
      .from("chat_conversations")
      .select("id, title, is_pinned, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(CHATS_LIST_CAP),
    supabase
      .from("projects")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const rows = (conversationRows.data ?? []).map((c) => ({
    id: String(c.id),
    title: String(c.title ?? ""),
    is_pinned: Boolean(c.is_pinned),
    updated_at: String(c.updated_at ?? ""),
  }));
  // The star is in user_favorites, not on the conversation — one
  // batched read for the whole list, exactly as the chat page does it,
  // rather than a query per row.
  const favoritedIds = await loadFavoriteIds(supabase, user.id, "chat_conversations", rows.map((c) => c.id));
  const conversations: SidebarConversation[] = rows.map((c) => ({ ...c, is_favorited: favoritedIds.has(c.id) }));
  const projects: SidebarProject[] = (projectRows.data ?? []).map((p) => ({
    id: String(p.id),
    name: String(p.name ?? ""),
  }));

  return (
    <div className="min-h-full">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
        <PageHeader helpKey="help.chats" icon={MessagesSquare} title={t("title")} />
        <ChatsWorkspace
          conversations={conversations}
          projects={projects}
          atCap={conversations.length >= CHATS_LIST_CAP}
        />
      </div>
    </div>
  );
}
