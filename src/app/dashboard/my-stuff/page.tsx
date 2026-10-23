import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { pageTitle } from "@/lib/page-title";
import { MyStuffShell, type MyStuffSession, type MyStuffSessionTurn } from "@/components/my-stuff/my-stuff-shell";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("dashboard.tools.names.myStuff");
}

/**
 * «ΤΑ ΔΙΚΑ ΜΟΥ» (the owner's message 2026-10-22), open to everybody since
 * 2026-10-23 (the switch "my-stuff" is gone). No PageHeader here — MyStuffShell draws its
 * own name and its own [◧] history, the same reason
 * app/dashboard/coding/page.tsx renders no header of its own.
 */
export default async function MyStuffPage() {
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

  return (
    <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
      <MyStuffShell initialSessions={sessions} />
    </div>
  );
}
