import "server-only";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { getPurchasedPackCreditPriceEur, resolveEffectivePlan } from "@/lib/billing/credits";
import { isFeatureOn } from "@/lib/flags/flags";
import { loadMemories } from "@/lib/memory/store";
import { readBrand } from "@/lib/memory/brand";
import { memoryWindowFor } from "@/lib/memory/memory-window";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { MAX_FLOW_SAID, type FlowKind } from "@/lib/flows/plan";
import { flowPrices, type FlowPrices } from "@/lib/flows/flow-pricing";
import { flowAvailability } from "@/lib/flows/availability";
import { MAX_COLOUR_CHARS } from "@/lib/flows/brief";
import type { FlowRow } from "@/components/flows/flow-shell";

/** The flows the page opens with: the newest, finished or not. */
const FLOWS_SHOWN = 20;

/**
 * WHAT THE PROJECTS PAGE OPENS WITH WHEN FLOWS ARE ON (package 36): the
 * person's flows with their projects' names, each step's price for this
 * account — at the longest sentence a flow takes, so the price shown is
 * never under the price held — which steps they can run, and the
 * business's colour from memory, when Memory knows one.
 */
export async function loadFlowPage(user: User): Promise<{ flows: FlowRow[]; prices: FlowPrices; available: Record<FlowKind, boolean>; brandColour: string | null }> {
  const supabase = await createClient();
  const plan = await resolveEffectivePlan(user);
  const [{ data, error }, packPrice, available] = await Promise.all([
    supabase.from("project_flows").select("id, project_id, said, colour, plan, steps, status, projects(name)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(FLOWS_SHOWN),
    getPurchasedPackCreditPriceEur(user.id),
    flowAvailability(user, plan),
  ]);
  if (error) logApiError("dashboard/projects", error, { stage: "flows" });
  const flows: FlowRow[] = (data ?? []).map((row) => {
    const project = (row as { projects?: { name?: string } | { name?: string }[] | null }).projects;
    const name = Array.isArray(project) ? project[0]?.name : project?.name;
    return { id: String(row.id), project_id: String(row.project_id), said: String(row.said ?? ""), colour: (row.colour as string | null) ?? null, plan: row.plan, steps: row.steps, status: String(row.status ?? "running"), project_name: String(name ?? row.said ?? "") };
  });
  let brandColour: string | null = null;
  if (await isFeatureOn("brand-memory", user)) {
    const brand = readBrand(await loadMemories(supabase, user.id, memoryWindowFor(plan?.capabilities.chatMemoryLimit ?? 0, isAdminEmail(user.email))));
    brandColour = brand.colours.find((c) => c.hex)?.hex ?? null;
  }
  return { flows, prices: flowPrices(plan, packPrice, MAX_FLOW_SAID + MAX_COLOUR_CHARS), available, brandColour };
}
