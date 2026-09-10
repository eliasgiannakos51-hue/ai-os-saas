import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { pageTitle } from "@/lib/page-title";
import { PageHeader } from "@/components/dashboard/page-header";
import { PROJECTS_ICON } from "@/lib/module-icons";
import { getLinkableModuleByTable } from "@/lib/knowledge-graph";
import {
  IN_PROJECT,
  projectEdgeFilter,
  projectMembers,
  projectContextModules,
  rowsPerModuleInProject,
  type ProjectStatus,
} from "@/lib/projects/project";
import { ProjectDetail, type ProjectMemberView } from "@/components/projects/project-detail";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return pageTitle("sidebar.items.projects");
}

/**
 * ONE PROJECT: its goal, what is in it, and a chat that starts inside it.
 *
 * MEMBERSHIP IS READ ONCE AND NOT EXPANDED. The edges are fetched, run
 * through projectMembers, and the headline of each member is resolved
 * from its own table. There is no second pass that takes a mission and
 * fetches its steps, or a website and fetches its submissions: what is
 * shown is exactly what was put in, which is the promise the whole
 * feature is built on.
 *
 * The sections the design asks for — Goal, Progress, Tasks, Files,
 * Agents, Activity, Results — are all views over that one list, grouped
 * by which table each member came from. They are not seven queries and
 * they cannot disagree with each other.
 */
export default async function ProjectPage({ params }: { params: { id: string } }) {
  const t = await getTranslations("projects");
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // RLS decides this: another account's project simply is not here, and
  // the page answers 404 for "yours does not exist" and "it is not
  // yours" alike, which tells a prober nothing.
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, goal, status, created_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!project) notFound();

  const { data: edgeRows } = await supabase
    .from("entity_links")
    .select("source_table, source_id, target_table, target_id, relationship_type, created_at")
    .eq("relationship_type", IN_PROJECT)
    .or(projectEdgeFilter(params.id))
    .limit(500);

  const members = projectMembers(edgeRows ?? [], params.id);

  // One query per DISTINCT table, not one per member.
  const byTable = new Map<string, string[]>();
  for (const member of members) {
    const ids = byTable.get(member.table) ?? [];
    ids.push(member.id);
    byTable.set(member.table, ids);
  }
  const views: ProjectMemberView[] = [];
  for (const [table, ids] of byTable) {
    const config = getLinkableModuleByTable(table);
    if (!config) continue;
    const { data } = await supabase
      .from(table)
      .select(`id, ${config.headlineKey}, created_at`)
      .in("id", ids)
      .limit(ids.length);
    for (const row of data ?? []) {
      // THROUGH unknown ON PURPOSE. The column list is built from the
      // module registry at runtime, so Supabase's typed select parser
      // cannot know its shape and returns a ParserError type; casting
      // straight to a record is the error TypeScript reports. The runtime
      // value is a row.
      const record = row as unknown as Record<string, unknown>;
      views.push({
        table,
        id: String(record.id),
        slug: config.slug,
        titleKey: config.titleKey,
        headline: String(record[config.headlineKey] ?? "").slice(0, 200),
        createdAt: String(record.created_at ?? ""),
      });
    }
  }
  views.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <PageHeader icon={PROJECTS_ICON} title={String(project.name ?? "")} description={t("description")} helpKey="help.projectDetail" />
      <ProjectDetail
        project={{
          id: String(project.id),
          name: String(project.name ?? ""),
          goal: (project.goal as string | null) ?? null,
          status: String(project.status ?? "active") as ProjectStatus,
          createdAt: String(project.created_at ?? ""),
        }}
        members={views}
        // What a project-scoped chat would read per module, from the
        // project's own shape — shown rather than described, because the
        // whole argument for projects is this number.
        rowsPerModule={rowsPerModuleInProject(projectContextModules(members).length)}
      />
    </div>
  );
}
