// WHAT THE CHAT REMEMBERS ABOUT YOU — THE PAGE THE HELP ARTICLE PROMISED.
//
// The article has said, in ten languages, "you can see everything it has
// kept, and delete it" since chat memory shipped. Half of that was true:
// Settings had a count and a "delete everything" button. There was no way
// to see a single remembered line, no way to remove one, and no way to
// correct one — so the only response to a wrong fact was to throw away
// every right one with it.
//
// WHY IT IS A PAGE AND NOT A SETTINGS TAB. This is data, not a
// preference. The on/off switch stays in Settings, where a switch belongs;
// the content of the memory is a list somebody scrolls, deletes from and
// links out of, and it needs an address it can be sent to.
//
// AND WHY NOT /dashboard/memory. That name was taken — by the page that
// searches your own records, whose sidebar hint said "What the AI
// remembers about you" in all ten languages while doing nothing of the
// kind. It is /dashboard/search now and the old URL permanently
// redirects.
import { pageTitle } from "@/lib/page-title";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { MEMORY_ICON } from "@/lib/module-icons";
import { AiMemoryList, type RememberedRow } from "@/components/memory/ai-memory-list";
import { EmptyState } from "@/components/empty-state";
import { getPlan } from "@/lib/billing/plans";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { isChatMemoryEnabled, chatMemoryActive } from "@/lib/chat/memory-policy";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.aiMemory");
}

export default async function AiMemoryPage() {
  const t = await getTranslations("aiMemory");
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  // ONE QUERY FOR THE ROWS, ONE FOR WHAT RETENTION WOULD REMOVE. Both are
  // scoped by RLS rather than by a filter this page writes: select on
  // chat_memory is `auth.uid() = user_id`, and chat_memory_prunable is
  // SECURITY INVOKER for the same reason.
  const [rowsResult, prunableResult] = await Promise.all([
    supabase
      .from("chat_memory")
      .select("id, memory_text, times_seen, created_at, last_seen_at, confirmed_at, source_conversation_id")
      .order("last_seen_at", { ascending: false }),
    supabase.rpc("chat_memory_prunable"),
  ]);

  const rows: RememberedRow[] = (rowsResult.data ?? []).map((r) => ({
    id: String(r.id),
    text: String(r.memory_text ?? ""),
    timesSeen: Number(r.times_seen ?? 1),
    createdAt: String(r.created_at ?? ""),
    lastSeenAt: String(r.last_seen_at ?? r.created_at ?? ""),
    confirmed: Boolean(r.confirmed_at),
    conversationId: r.source_conversation_id ? String(r.source_conversation_id) : null,
  }));

  // The count is what Settings shows, and it must not disagree with the
  // list on this page — so it is the list's own length rather than a
  // second count() that could be taken a moment apart.
  const prunableIds: string[] = ((prunableResult.data ?? []) as { id: string }[]).map((p) => String(p.id));

  const planSlug = await resolveEffectivePlanSlug(user);
  const planLimit = getPlan(planSlug)?.capabilities.chatMemoryLimit ?? 0;
  const active = chatMemoryActive({ userEnabled: isChatMemoryEnabled(user), planLimit });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        icon={MEMORY_ICON}
        helpKey="help.aiMemory"
        helpArticle="chat-memory"
      />
      {rows.length === 0 ? (
        <EmptyState icon={MEMORY_ICON} title={t("emptyTitle")}>
          {active ? t("emptyActive") : t("emptyInactive")}
        </EmptyState>
      ) : (
        <AiMemoryList
          rows={rows}
          prunableIds={prunableIds}
          // The window the prompt actually reads. Shown next to the list
          // because "it remembers 340 things" and "it is told 20 of them"
          // are different sentences and only one of them is what happens.
          windowSize={planLimit}
        />
      )}
    </div>
  );
}
