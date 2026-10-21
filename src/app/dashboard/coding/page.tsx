import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { pageTitle } from "@/lib/page-title";
import { MODULE_TITLE_KEYS } from "@/lib/search/module-title-keys";
import { CodingWorkspace, type CodeSession } from "@/components/coding/coding-workspace";
import type { CodeConversationRow } from "@/components/coding/coding-history-column";
import { readExampleParam } from "@/lib/overview/first-screen-examples";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  // NOT the literal. `coding` and `data-analysis` left BUILD_MODULES in
  // V4 #19/#20 — they are tools with bespoke pages now, so there is no
  // CONFIG to read a titleKey off, and both pages wrote the key out by
  // hand instead. MODULE_TITLE_KEYS is where their key already lives,
  // for the search filter chips; this makes it the only place it lives.
  return pageTitle(MODULE_TITLE_KEYS.coding);
}

// /dashboard/coding WAS a form: five fixed operations and a permanent
// "what this does NOT do" box above the input. Since 2026-10-18 (owner:
// «Το Coding καταλαβαίνει μόνο του τι ζητάω») it is a conversation, the
// same shell shape as Ionexa Chat — no PageHeader, no max-w wrapper, a
// full-viewport two-pane layout CodingWorkspace itself draws.
// The brief Home routed here, read through the shared clamp — see the
// note in the deep-research page for why the name is checked by a gate.
export default async function CodingPage(
  props: {
    searchParams: Promise<{ brief?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // TWO INDEPENDENT READS, not sequential: the live conversations this
  // screen now drives, and the old form's own runs — read-only, still
  // RLS-scoped to the caller, so "τίποτα δεν χάνεται" without the two
  // lists depending on each other.
  const [{ data: conversationRows }, { data: sessionRows }] = await Promise.all([
    supabase
      .from("code_conversations")
      .select("id, title")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(60),
    supabase
      .from("code_sessions")
      .select("id, operation, title, input, language, target_language, output, folder, status, source, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  const conversations: CodeConversationRow[] = (conversationRows ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ""),
  }));

  const legacySessions: CodeSession[] = (sessionRows ?? []).map((row) => ({
    id: String(row.id),
    operation: String(row.operation ?? "generate"),
    title: String(row.title ?? ""),
    input: String(row.input ?? ""),
    language: (row.language as string | null) ?? null,
    targetLanguage: (row.target_language as string | null) ?? null,
    output: (row.output as string | null) ?? null,
    folder: (row.folder as string | null) ?? null,
    status: String(row.status ?? "done"),
    source: String(row.source ?? "run"),
    createdAt: String(row.created_at ?? ""),
  }));

  return (
    // Below md the bottom bar takes 4rem more (mobile-tab-bar.tsx), and
    // the composer must stay above it — same wrapper Chat's own page
    // uses, for the same reason.
    <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
      <CodingWorkspace
        conversations={conversations}
        legacySessions={legacySessions}
        initialTask={readExampleParam(searchParams.brief)}
      />
    </div>
  );
}
