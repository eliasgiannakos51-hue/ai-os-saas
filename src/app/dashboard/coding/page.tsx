import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { pageTitle } from "@/lib/page-title";
import { MODULE_TITLE_KEYS } from "@/lib/search/module-title-keys";
import { CodingWorkspace, type CodeSession } from "@/components/coding/coding-workspace";
import { readExampleParam } from "@/lib/overview/first-screen-examples";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { githubAppConfigured } from "@/lib/github/auth";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  // NOT the literal. `coding` and `data-analysis` left BUILD_MODULES in
  // V4 #19/#20 — they are tools with bespoke pages now, so there is no
  // CONFIG to read a titleKey off, and both pages wrote the key out by
  // hand instead. MODULE_TITLE_KEYS is where their key already lives,
  // for the search filter chips; this makes it the only place it lives.
  return pageTitle(MODULE_TITLE_KEYS.coding);
}

// CODING, AS A CONVERSATION (the owner's critical message, 2026-10-22):
// this page renders no page header component any more — CodingWorkspace
// draws its own name, its own "?" (HelpTip) and its own [◧] history, the
// same way Chat's page renders no header and mounts the tip at
// chat-workspace.tsx instead
// (src/lib/help-tips.ts's "coding" entry points there now, not here —
// scripts/tests/help-tips.test.mjs's NO_HEADER_EXEMPT / `routed` logic
// is what a page with no header has to satisfy).
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

  // RLS scopes this to the caller. The imported notes from the old
  // tracker are in here too, marked `source = 'note'` — see the
  // migration's section 5.
  const { data: rows } = await supabase
    .from("code_sessions")
    .select("id, operation, title, input, language, target_language, output, status, source, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(60);

  const sessions: CodeSession[] = (rows ?? []).map((row) => ({
    id: String(row.id),
    operation: String(row.operation ?? "generate"),
    title: String(row.title ?? ""),
    input: String(row.input ?? ""),
    language: (row.language as string | null) ?? null,
    targetLanguage: (row.target_language as string | null) ?? null,
    output: (row.output as string | null) ?? null,
    status: String(row.status ?? "done"),
    source: String(row.source ?? "run"),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? row.created_at ?? ""),
  }));

  return (
    <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
      <CodingWorkspace
        sessions={sessions}
        initialTask={readExampleParam(searchParams.brief)}
        isAdmin={isAdminEmail(user.email)}
        githubConfigured={githubAppConfigured()}
      />
    </div>
  );
}
