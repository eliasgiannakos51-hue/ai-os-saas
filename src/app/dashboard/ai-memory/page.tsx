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
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { accountHasCapability } from "@/lib/billing/capability-gate";
import { upgradeWallProps } from "@/lib/billing/feature-catalog";
import { UpgradeRequired } from "@/components/billing/upgrade-required";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { MEMORY_ICON } from "@/lib/module-icons";
import { MEMORY_SURFACES, isMemorySurface, isMemoryKind } from "@/lib/memory/surfaces";
import { disabledSurfaces } from "@/lib/memory/memory-policy";
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
      .select("id, memory_text, times_seen, created_at, last_seen_at, confirmed_at, source_conversation_id, surface, kind")
      // EXPLICIT, THOUGH RLS ALREADY DOES IT. This page runs under the
      // user's own session, so select_own_chat_memory is in force and the
      // filter is redundant here — and that is exactly the reasoning that
      // makes a rule stop being checkable. The same table is now read
      // from five more places, one of which (lib/agents/execute-agent.ts)
      // uses the service-role client on a cron where RLS does NOT apply.
      // "Every read filters by user_id" is a rule a gate can hold;
      // "every read is safe, some because of a policy and some because of
      // a filter" is a sentence somebody has to re-derive each time.
      .eq("user_id", user.id)
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
    // WHERE IT WAS LEARNED, and what kind of claim it is — V6 #2. Shown
    // per row rather than grouped into six lists: a person looking for one
    // wrong line scans a single list once, and grouping would make them
    // guess which feature had heard it.
    surface: isMemorySurface(r.surface) ? r.surface : "chat",
    kind: isMemoryKind(r.kind) ? r.kind : "fact",
  }));

  // The count is what Settings shows, and it must not disagree with the
  // list on this page — so it is the list's own length rather than a
  // second count() that could be taken a moment apart.
  const prunableIds: string[] = ((prunableResult.data ?? []) as { id: string }[]).map((p) => String(p.id));

  const planSlug = await resolveEffectivePlanSlug(user);

  // THE PLAN GATE, ON THE FIELD ITSELF.
  //
  // `capabilities.aiMemory` is false on Free and the pricing page draws a
  // ✕ for it. The page this one replaced refused with
  // `planMeetsMinimum(planSlug, "starter")` — a correct refusal that
  // never mentions the capability, so the ✓/✕ column and the lock agreed
  // by coincidence and moving AI Memory to Growth would have moved one
  // and not the other. scripts/tests/plan-enforcement.test.mjs requires
  // the field to be read where something is refused, which is here.
  const isAdmin = isAdminEmail(user.email);
  if (!accountHasCapability(planSlug, "aiMemory", isAdmin)) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <PageHeader title={t("title")} description={t("description")} helpKey="help.aiMemory" />
        <UpgradeRequired {...upgradeWallProps("aiMemory", t("title"))!} />
      </div>
    );
  }

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
          surfaces={MEMORY_SURFACES.map((s) => s.id)}
          disabledSurfaces={disabledSurfaces(user)}
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
