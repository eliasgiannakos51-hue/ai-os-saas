/**
 * ONE PROJECT'S HEADER AND MEMBERS, RESOLVED TO HEADLINES.
 *
 * Pulled out of app/dashboard/projects/[id]/page.tsx (the per-project
 * route, kept alive only as a redirect into the unified screen since
 * «2. PROJECTS: ΝΕΑ ΟΘΟΝΗ» Κομμάτι 1, 2026-10-28) so the SAME fetch runs
 * whether a project is opened through that old link or through
 * /dashboard/projects?id=… — one function, not two copies that could
 * drift. RLS scopes every query to the caller, and every read after the
 * project's own is filtered to the project's owner as well (for the share
 * page, which has no caller); a project that is not
 * theirs or does not exist comes back null either way, on purpose
 * (projects/[id]/page.tsx's own comment: "another account's project
 * simply is not here").
 */
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";
import { getLinkableModuleByTable } from "@/lib/knowledge-graph";
import {
  IN_PROJECT,
  projectEdgeFilter,
  projectMembers,
  projectContextModules,
  rowsPerModuleInProject,
  type ProjectHeader,
  type ProjectMemberView,
  type ProjectStatus,
} from "@/lib/projects/project";

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
    .select("id, user_id, name, goal, notes, status, primary_colour, secondary_colour, created_at, share_token")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return null;

  // EVERY READ BELOW IS THE PROJECT OWNER'S (2026-11-05 review, A3). Under
  // the owner's own session RLS already says so; the public share page
  // (app/shared/[token]/page.tsx) hands this function the service-role
  // client, where nothing does — and a link row, or the row it points at,
  // belonging to another account must not reach a stranger's screen. The
  // database refuses such links from now on
  // (20261115000002_entity_links_same_owner.sql); this filter is what
  // keeps any older one out.
  const ownerId = String(project.user_id);

  const { data: edgeRows } = await supabase
    .from("entity_links")
    .select("source_table, source_id, target_table, target_id, relationship_type, created_at")
    .eq("user_id", ownerId)
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
      .eq("user_id", ownerId)
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
      shareUrl: project.share_token ? `${getSiteUrl()}/shared/${project.share_token as string}` : null,
    },
    members: views,
    rowsPerModule: rowsPerModuleInProject(projectContextModules(members).length),
  };
}
