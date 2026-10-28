import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { pageTitle } from "@/lib/page-title";
import { IN_PROJECT, PROJECTS_TABLE, type ProjectStatus } from "@/lib/projects/project";
import { loadProjectDetail } from "@/lib/projects/load-project-detail";
import { ProjectsShell, type ProjectRow } from "@/components/projects/projects-shell";
import { readExampleParam } from "@/lib/overview/first-screen-examples";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.projects");
}

/**
 * «2. PROJECTS: ΝΕΑ ΟΘΟΝΗ» (owner's message, 2026-10-28) — Κομμάτι 1: THE
 * SCREEN ITSELF. List on the left, the selected project's detail on the
 * right, one screen at this one route — ?id= names the selection so an
 * old /dashboard/projects/[id] link (meetings-workspace.tsx) still opens
 * the right project, through that route's own redirect.
 *
 * REPLACES flow-shell.tsx AS WHAT THIS ROUTE MOUNTS (owner's own answer,
 * asked directly because the two conflict: "Αντικαθιστά το FlowShell στο
 * /dashboard/projects"). flow-shell.tsx and lib/flows/* are left in the
 * tree, unmounted rather than deleted — Κομμάτι 6 ("bottom field creates
 * inside project with Brand Kit") is the plan-a-flow-from-one-sentence
 * idea's likely next home, scoped to the project already open instead of
 * asked for again at the top of this page; nothing is decided about that
 * code until that κομμάτι actually lands.
 *
 * The member count per project is of EDGES, which is the same thing as
 * the membership: a project holds exactly the rows somebody put in it,
 * one level deep, and there is no expansion anywhere in this page or in
 * lib/projects/project.ts that would make the number mean something
 * larger than what the person can see when they open it.
 *
 * ?ask= IS STILL READ — three quick-job tiles (lib/nav/quick-jobs.ts:
 * goalInSteps, myWeek, notes) link here with example text under that
 * param, and all-tools.test.mjs holds every target page to actually
 * reading its job's param. There is no AI step here yet (Κομμάτι 6's own
 * piece), so for now the text seeds the new-project goal field instead of
 * going unread — the same stand-in app/dashboard/my-stuff/page.tsx uses
 * for its own ?ask=.
 */
export default async function ProjectsPage(props: { searchParams?: Promise<{ id?: string; ask?: string }> }) {
  const searchParams = props.searchParams ? await props.searchParams : undefined;
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // RLS scopes both of these to the caller.
  const { data: rows } = await supabase
    .from("projects")
    .select("id, name, goal, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: edges } = await supabase
    .from("entity_links")
    .select("target_id")
    .eq("relationship_type", IN_PROJECT)
    .eq("target_table", PROJECTS_TABLE)
    .limit(5_000);

  const counts = new Map<string, number>();
  for (const edge of edges ?? []) {
    const id = String((edge as { target_id?: unknown }).target_id ?? "");
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const projects: ProjectRow[] = (rows ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
    goal: (row.goal as string | null) ?? null,
    status: String(row.status ?? "active") as ProjectStatus,
    createdAt: String(row.created_at ?? ""),
    memberCount: counts.get(String(row.id)) ?? 0,
  }));

  // Nothing is auto-selected — mirrors my-stuff-workspace.tsx's own
  // Κομμάτι 1 (nothing picked until a row is pressed), and for the same
  // mobile reason: ProjectsShell shows ONLY the list on a phone until
  // selectedId is set, so picking a "most recent" default here would
  // skip straight past the list on a first phone visit. loadProjectDetail
  // itself answers null for an id that is not this account's, so a
  // guessed/stale id degrades to the "pick one" empty state rather than
  // 404ing this whole screen.
  const requestedId = searchParams?.id;
  const selectedId = requestedId && projects.some((p) => p.id === requestedId) ? requestedId : null;
  const detail = selectedId ? await loadProjectDetail(supabase, selectedId) : null;
  const initialGoal = readExampleParam(searchParams?.ask) ?? "";

  return (
    <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
      <ProjectsShell projects={projects} selectedId={detail ? selectedId : null} detail={detail} initialGoal={initialGoal} />
    </div>
  );
}
