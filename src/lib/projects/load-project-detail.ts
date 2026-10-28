/**
 * ONE PROJECT'S HEADER AND MEMBERS, RESOLVED TO HEADLINES.
 *
 * Pulled out of app/dashboard/projects/[id]/page.tsx (the per-project
 * route, kept alive only as a redirect into the unified screen since
 * «2. PROJECTS: ΝΕΑ ΟΘΟΝΗ» Κομμάτι 1, 2026-10-28) so the SAME fetch runs
 * whether a project is opened through that old link or through
 * /dashboard/projects?id=… — one function, not two copies that could
 * drift. RLS scopes every query to the caller; a project that is not
 * theirs or does not exist comes back null either way, on purpose
 * (projects/[id]/page.tsx's own comment: "another account's project
 * simply is not here").
 */
import { createClient } from "@/lib/supabase/server";
import { getLinkableModuleByTable } from "@/lib/knowledge-graph";
import {
  IN_PROJECT,
  projectEdgeFilter,
  projectMembers,
  projectContextModules,
  rowsPerModuleInProject,
  type ProjectStatus,
} from "@/lib/projects/project";
import type { ProjectHeader, ProjectMemberView } from "@/components/projects/project-detail";

export type ProjectDetailData = {
  header: ProjectHeader;
  members: ProjectMemberView[];
  rowsPerModule: number;
};

export async function loadProjectDetail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string
): Promise<ProjectDetailData | null> {
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, goal, notes, status, primary_colour, secondary_colour, created_at")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return null;

  const { data: edgeRows } = await supabase
    .from("entity_links")
    .select("source_table, source_id, target_table, target_id, relationship_type, created_at")
    .eq("relationship_type", IN_PROJECT)
    .or(projectEdgeFilter(projectId))
    .limit(500);

  const members = projectMembers(edgeRows ?? [], projectId);

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
      // THROUGH unknown ON PURPOSE — see projects/[id]/page.tsx's own
      // comment this was copied from: the column list is built from the
      // module registry at runtime, so Supabase's typed select parser
      // cannot know its shape.
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

  return {
    header: {
      id: String(project.id),
      name: String(project.name ?? ""),
      goal: (project.goal as string | null) ?? null,
      notes: (project.notes as string | null) ?? null,
      status: String(project.status ?? "active") as ProjectStatus,
      primaryColour: (project.primary_colour as string | null) ?? null,
      secondaryColour: (project.secondary_colour as string | null) ?? null,
      createdAt: String(project.created_at ?? ""),
    },
    members: views,
    rowsPerModule: rowsPerModuleInProject(projectContextModules(members).length),
  };
}
