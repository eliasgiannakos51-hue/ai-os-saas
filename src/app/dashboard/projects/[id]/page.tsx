import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * KEPT ONLY SO AN OLD LINK STILL OPENS THE RIGHT PROJECT.
 *
 * «2. PROJECTS: ΝΕΑ ΟΘΟΝΗ» Κομμάτι 1 (owner's message, 2026-10-28) moved
 * the detail view onto /dashboard/projects itself (list left, project
 * right, one screen) — see app/dashboard/projects/page.tsx. This route
 * used to render that detail on its own; it now only forwards, so
 * meetings-workspace.tsx's `/dashboard/projects/${goalMade.projectId}`
 * link (a plain <a href>, a full navigation either way) still lands on
 * the right project instead of 404ing.
 */
export default async function ProjectRedirectPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  redirect(`/dashboard/projects?id=${encodeURIComponent(params.id)}`);
}
