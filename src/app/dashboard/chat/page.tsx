import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import type { ChatConversation } from "@/types/chat";
import { resolveEffectivePlan } from "@/lib/billing/credits";
import { loadLegacyEntitlements } from "@/lib/billing/legacy-entitlements";
import { getFreeChatStatus } from "@/lib/billing/free-chat-usage";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { hasActiveBetaBypass } from "@/lib/beta";
import { loadFavoriteIds } from "@/lib/favorites";
import { readExampleParam } from "@/lib/overview/first-screen-examples";
import { readWorkMode } from "@/lib/chat/work-modes";
import { isFeatureOn } from "@/lib/flags/flags";
import { greetingName } from "@/lib/greeting";
import { getTranslations } from "next-intl/server";
import { accountHasCapability } from "@/lib/billing/capability-gate";
import { upgradeWallProps } from "@/lib/billing/feature-catalog";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.chat");
}

export default async function ChatPage(
  props: {
    // `ask` is the Home screen's "understand" example (see
    // lib/overview/first-screen-examples.ts). The name is a runtime string
    // on both sides — nothing here would stop compiling if the link sent
    // `?question=` instead — so first-screen.test.mjs compares the two.
    searchParams: Promise<{ preset?: string; c?: string; ask?: string; project?: string; mode?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // The conversation list, the plan and the bypass check are three
  // independent reads and were three sequential waits. The favourites
  // lookup below genuinely depends on the list — it is keyed by the ids —
  // so it stays behind it; nothing else does.
  const [{ data: conversationRows }, bypassesCredits, plan, opensTools] = await Promise.all([
    supabase
      .from("chat_conversations")
      .select("id, title, is_pinned, created_at, updated_at")
      .order("updated_at", { ascending: false }),
    // Admins and beta testers already pay nothing, so a "free messages
    // left" counter would be meaningless noise for them — the route skips
    // the allowance for those accounts entirely.
    isAdminEmail(user.email) ? Promise.resolve(true) : hasActiveBetaBypass(user),
    resolveEffectivePlan(user),
    // THE SWITCH "chat-opens-tools" (package 7), read beside the others
    // rather than after them: as its own wait it was the page's fifth in
    // sequence, one over what scripts/tests/navigation-cost.test.mjs allows.
    isFeatureOn("chat-opens-tools", user),
  ]);

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

  // THE PROJECTS THIS PERSON OWNS, read only to validate `?project=`.
  // RLS scopes it, and the ids are compared rather than the parameter
  // trusted, for the same reason `?c=` is validated above.
  const { data: projectRows } = await supabase.from("projects").select("id").limit(200);
  const ownProjectIds = new Set((projectRows ?? []).map((row) => String((row as { id?: unknown }).id ?? "")));

  // Same entitlements the route honours, so the counter the user sees and
  // the allowance the server enforces cannot disagree for a grandfathered
  // account.
  const legacy = bypassesCredits ? null : await loadLegacyEntitlements(user.id);
  const freeChat = bypassesCredits
    ? null
    : await getFreeChatStatus(user.id, plan?.slug ?? "free", legacy);

  // THE SITE OPENED FROM CHAT, ON A PLAN WITHOUT THE SITE (package 7): the
  // same gate /dashboard/website-builder and /api/websites/generate ask,
  // so the pane shows the plan's wall instead of a «Φτιάξ' το» the route
  // refuses with an English sentence (found 2026-10-08 by
  // scripts/tests/chat-opens-tools-edges.prodtest.mjs).
  const siteWall =
    opensTools && !accountHasCapability(plan.slug, "websiteBuilder", isAdminEmail(user.email))
      ? upgradeWallProps("websiteBuilder", (await getTranslations("dashboard.websiteBuilder"))("title"))
      : null;

  const initialMentorPreset =
    searchParams.preset === "trading" ? "trading" : searchParams.preset === "product" ? "product" : undefined;

  return (
    // Below md the bottom bar takes 4rem more (mobile-tab-bar.tsx), and
    // the composer must stay above it.
    <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
      <ChatWorkspace
        initialConversations={conversations}
        initialMentorPreset={initialMentorPreset}
        // THE NAME THE EMPTY CHAT GREETS WITH (MASTER 14.2), the same one
        // Home uses: the display name, never the email.
        greeting={greetingName(user.user_metadata)}
        // Deep link from /dashboard/favorites. Validated against the
        // user's own list rather than trusted: an id in the URL must not
        // be able to make the workspace ask for someone else's thread.
        initialConversationId={
          searchParams.c && conversations.some((c) => c.id === searchParams.c)
            ? searchParams.c
            : undefined
        }
        initialFreeChatRemaining={freeChat && freeChat.limit > 0 ? freeChat.remaining : undefined}
        // ASKED ON ARRIVAL, not typed. Clamped rather than trusted: this
        // comes out of a URL anyone can edit, and the send path charges
        // credits.
        initialAsk={readExampleParam(searchParams.ask)}
        // THE WAY OF WORKING a Home quick action opened this in
        // (lib/chat/work-modes.ts). Read through readWorkMode, so a URL
        // anyone can edit names one of four modes or none.
        initialWorkMode={readWorkMode(searchParams.mode) ?? undefined}
        // THE SWITCH "chat-work-area" (MASTER Μέρος 13 Β): the work area
        // beside the conversation, for you and the test account first.
        workArea={await isFeatureOn("chat-work-area", user)}
        // THE SWITCH "chat-opens-tools" (package 7): «φτιάξε μου site»
        // opens the Site beside the conversation.
        opensTools={opensTools}
        siteWall={siteWall}
        attachments={await isFeatureOn("chat-attachments", user)}
        // THE PROJECT A NEW CONVERSATION STARTS IN, and the only moment
        // it can be chosen. It is validated against the person's OWN
        // projects rather than trusted, exactly as `?c=` is above: an id
        // in a URL must not be able to make the workspace ask for
        // somebody else's folder.
        //
        // FIXED FOR THE CONVERSATION'S LIFE. The whole value of a project
        // is that the context prefix is stable enough to be cached, and a
        // mid-conversation switch would rewrite that prefix on the
        // message that flipped it — the same money for a broken cache.
        // So this is read on arrival and there is no control anywhere
        // that moves an existing conversation.
        initialProjectId={
          searchParams.project && ownProjectIds.has(searchParams.project) ? searchParams.project : undefined
        }
      />
    </div>
  );
}
