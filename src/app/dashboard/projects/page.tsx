import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { pageTitle } from "@/lib/page-title";
import { PageHeader } from "@/components/dashboard/page-header";
import { PROJECTS_ICON } from "@/lib/module-icons";
import { IN_PROJECT, PROJECTS_TABLE, type ProjectStatus } from "@/lib/projects/project";
import { ProjectsWorkspace, type ProjectRow } from "@/components/projects/projects-workspace";
import { FlowShell } from "@/components/flows/flow-shell";
import { isFeatureOn } from "@/lib/flags/flags";
import { loadFlowPage } from "@/lib/flows/page-data";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.projects");
}

/**
 * THE LIST OF FOLDERS, WITH HOW MANY THINGS ARE IN EACH.
 *
 * The count is of EDGES, which is the same thing as the membership: a
 * project holds exactly the rows somebody put in it, one level deep, and
 * there is no expansion anywhere in this page or in
 * lib/projects/project.ts that would make the number mean something
 * larger than what the person can see when they open it.
 */
export default async function ProjectsPage() {
  const t = await getTranslations("projects");
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

  // ONE SENTENCE, SEVERAL TOOLS, ONE PROJECT (MASTER 16, package 36),
  // behind the switch "flows": the page becomes the place a flow is
  // written, planned, approved and followed, INSTEAD of the list below —
  // which it still shows, as «Τα έργα μου». Everybody the switch is off
  // for keeps this page as it was.
  if ((await isFeatureOn("flows", user)) && projects) {
    const data = await loadFlowPage(user);
    return (
      <div className="h-[calc(100dvh-8rem)] md:h-[calc(100vh-4rem)]">
        <FlowShell initialFlows={data.flows} projects={projects} prices={data.prices} available={data.available} brandColour={data.brandColour} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <PageHeader icon={PROJECTS_ICON} title={t("title")} description={t("description")} helpKey="help.projects" />
      <ProjectsWorkspace projects={projects} />
    </div>
  );
}
