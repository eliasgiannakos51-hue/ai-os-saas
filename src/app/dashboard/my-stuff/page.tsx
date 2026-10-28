import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { pageTitle } from "@/lib/page-title";
import { MyStuffWorkspace } from "@/components/my-stuff/my-stuff-workspace";
import { loadMyStuff } from "@/lib/my-stuff/load";
import type { MyStuffSession, MyStuffSessionTurn } from "@/lib/my-stuff/types";
import { readExampleParam } from "@/lib/overview/first-screen-examples";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("dashboard.tools.names.myStuff");
}

/**
 * «1. MY STUFF: ΝΕΑ ΟΘΟΝΗ» (the owner's message, 2026-10-28) — list left,
 * details right, full width. No PageHeader — MyStuffWorkspace draws its
 * own name and its own history button, the same reason
 * app/dashboard/coding/page.tsx renders no header of its own.
 *
 * THE LIST IS LOADED HERE, SERVER-SIDE, the same way
 * app/dashboard/timeline/page.tsx loads the Library's own grid — so the
 * first paint already has rows in it rather than an empty screen that
 * fills in a moment later. The workspace only re-fetches
 * (/api/my-stuff/browse, unchanged) once a search is actually typed.
 *
 * ?ask= IS STILL READ — a quick-job tile (lib/nav/quick-jobs.ts) links
 * here with the owner's own example text ("How much did I spend in
 * September?") under that param, and all-tools.test.mjs holds every
 * target page to actually reading its job's param. Κομμάτι 1 has no AI
 * answer yet (that is Κομμάτι 2's own piece), so for now the text seeds
 * the plain search box instead of going unread — a real, honest filter,
 * not a placeholder with nothing behind it.
 */
export default async function MyStuffPage(props: { searchParams?: Promise<{ ask?: string }> }) {
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  // RLS (select_own_my_stuff_sessions) scopes this to the caller; the
  // explicit order/limit keeps the first paint small the same way
  // app/dashboard/coding/page.tsx bounds code_sessions at 60.
  const { data: rows } = await supabase
    .from("my_stuff_sessions")
    .select("id, title, turns")
    .order("updated_at", { ascending: false })
    .limit(30);

  const sessions: MyStuffSession[] = (rows ?? []).map((row) => ({
    id: String(row.id),
    title: String(row.title ?? ""),
    turns: Array.isArray(row.turns) ? (row.turns as MyStuffSessionTurn[]) : [],
  }));

  const initialQuery = readExampleParam(searchParams?.ask) ?? "";
  const { items, failed } = await loadMyStuff(supabase, user.id, { kind: null, query: initialQuery });

  return (
    <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
      <MyStuffWorkspace initialItems={items} initialFailed={failed} initialSessions={sessions} initialQuery={initialQuery} />
    </div>
  );
}
