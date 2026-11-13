import "server-only";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { getPurchasedPackCreditPriceEur, resolveEffectivePlan } from "@/lib/billing/credits";
import { loadMemories } from "@/lib/memory/store";
import { readBrand } from "@/lib/memory/brand";
import { memoryWindowFor } from "@/lib/memory/memory-window";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { MAX_FLOW_SAID, type FlowKind } from "@/lib/flows/plan";
import { flowPrices, type FlowPrices } from "@/lib/flows/flow-pricing";
import { flowAvailability } from "@/lib/flows/availability";
import { MAX_COLOUR_CHARS } from "@/lib/flows/brief";
import type { FlowRow } from "@/lib/flows/plan";

/** The flows the page opens with: the newest, finished or not. */
const FLOWS_SHOWN = 20;

/**
 * WHAT THE PROJECTS PAGE OPENS WITH WHEN FLOWS ARE ON (package 36): the
 * person's flows with their projects' names, each step's price for this
 * account — at the longest sentence a flow takes, so the price shown is
 * never under the price held — which steps they can run, and the
 * business's colour from memory, when Memory knows one.
 *
 * SCOPED TO ONE PROJECT (Κομμάτι 6, owner's message 2026-10-28): the
 * bottom field on a single project's own page only ever needs THAT
 * project's own flows, newest first — not the account's twenty newest
 * across every project, most of which belong to a project not open here.
 * `prices`/`available` stay account-wide either way: what a step costs
 * and whether this person can run it do not depend on which project it
 * joins.
 */
export async function loadFlowPage(user: User, projectId?: string | null): Promise<{ flows: FlowRow[]; prices: FlowPrices; available: Record<FlowKind, boolean> & { slidesFromResearch: boolean }; brandColour: string | null }> {
  const supabase = await createClient();
  const plan = await resolveEffectivePlan(user);
  const flowsQuery = supabase.from("project_flows").select("id, project_id, said, colour, plan, steps, status, projects(name)").eq("user_id", user.id);
  const [{ data, error }, packPrice, available] = await Promise.all([
    (projectId ? flowsQuery.eq("project_id", projectId) : flowsQuery).order("created_at", { ascending: false }).limit(FLOWS_SHOWN),
    getPurchasedPackCreditPriceEur(user.id),
    flowAvailability(user, plan),
  ]);
  if (error) logApiError("dashboard/projects", error, { stage: "flows" });
  const flows: FlowRow[] = (data ?? []).map((row) => {
    const project = (row as { projects?: { name?: string } | { name?: string }[] | null }).projects;
    const name = Array.isArray(project) ? project[0]?.name : project?.name;
    return { id: String(row.id), project_id: String(row.project_id), said: String(row.said ?? ""), colour: (row.colour as string | null) ?? null, plan: row.plan, steps: row.steps, status: String(row.status ?? "running"), project_name: String(name ?? row.said ?? "") };
  });
  const brand = readBrand(await loadMemories(supabase, user.id, memoryWindowFor(plan?.capabilities.chatMemoryLimit ?? 0, isAdminEmail(user.email))));
  const brandColour: string | null = brand.colours.find((c) => c.hex)?.hex ?? null;
  return { flows, prices: flowPrices(plan, packPrice, MAX_FLOW_SAID + MAX_COLOUR_CHARS), available, brandColour };
}
