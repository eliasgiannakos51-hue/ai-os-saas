import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLASSIFIER_MODULES } from "@/lib/classifier-modules";
import { computeHealthScore, type HealthScoreResult } from "@/lib/health-score";
import { loadLatestEnergyCheckIn, type EnergyCheckIn } from "@/lib/energy-checkins";
import { logApiError } from "@/lib/log-error";
import type { Mission } from "@/types/mission";
import { enModuleTitle } from "@/lib/module-labels";

const PER_MODULE_LIMIT = 5;
const MAX_HEADLINE_LENGTH = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const MISSION_RECENT_DAYS = 14;
const CONSISTENCY_WINDOW_DAYS = 7;

export type UserFullContext = {
  moduleSummaries: { title: string; headlines: string[] }[];
  activeMissions: { goal: string; stepsCompleted: number; stepsTotal: number }[];
  latestEnergyCheckIn: EnergyCheckIn | null;
  healthScore: HealthScoreResult;
  knowledgeGraphLinkCount: number;
  knowledgeGraphLinksThisWeek: number;
};

type ModuleScan = {
  title: string;
  headlines: string[];
  hasRows: boolean;
  lastActivityMs: number | null;
  activeDays: Set<string>;
};

// "AI Life Context" — the single place every AI-calling endpoint (see
// api/chat/route.ts, api/create/route.ts) pulls a consolidated picture of
// the user from: recent entries across every module, active missions, the
// latest energy check-in, the Business Health Score (lib/health-score.ts),
// and Knowledge Graph connection counts. Bounded, best-effort scans
// throughout (same "small, per-module cap" trade-off as
// lib/chat/mentor-context.ts) — this runs on every single AI request per
// the brief, so keeping each query cheap matters more than usual.
export async function getUserFullContext(
  supabase: SupabaseClient,
  userId: string
): Promise<UserFullContext> {
  const now = Date.now();
  const weekAgoIso = new Date(now - CONSISTENCY_WINDOW_DAYS * DAY_MS).toISOString();

  const [perModule, missionsResult, latestEnergyCheckIn, totalLinksResult, recentLinksResult] =
    await Promise.all([
      Promise.all(CLASSIFIER_MODULES.map((config) => scanModule(supabase, config, now))),
      supabase.from("ai_missions").select("*"),
      loadLatestEnergyCheckIn(supabase, userId),
      supabase.from("entity_links").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase
        .from("entity_links")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", weekAgoIso),
    ]);

  if (missionsResult.error) {
    logApiError("user-context:getUserFullContext", missionsResult.error, { stage: "missions" });
  }
  const missions = (missionsResult.data as Mission[] | null) ?? [];

  const activeMissions = missions
    .filter((m) => m.status === "planning" || m.status === "in_progress")
    .map((m) => {
      const steps = m.plan_steps?.steps ?? [];
      return {
        goal: m.goal,
        stepsCompleted: steps.filter((s) => s.status === "completed").length,
        stepsTotal: steps.length,
      };
    });

  // Same "missions touched recently" approximation used by the Business
  // Health Score widget (overview/page.tsx) — ai_missions has no per-step
  // completed_at, but its updated_at trigger fires exactly when a step is
  // completed (see mission-card.tsx's buildStep), so this is the closest
  // real signal available without a schema change.
  const missionStepsCompletedRecent = missions
    .filter((m) => now - new Date(m.updated_at).getTime() < MISSION_RECENT_DAYS * DAY_MS)
    .reduce(
      (sum, m) => sum + (m.plan_steps?.steps ?? []).filter((s) => s.status === "completed").length,
      0
    );

  const lastActivityMs = perModule.reduce<number | null>((latest, m) => {
    if (m.lastActivityMs === null) return latest;
    return latest === null || m.lastActivityMs > latest ? m.lastActivityMs : latest;
  }, null);

  const activeDays = new Set<string>();
  for (const m of perModule) {
    for (const day of m.activeDays) activeDays.add(day);
  }

  const healthScore = computeHealthScore({
    lastActivityMs,
    modulesWithActivity: perModule.filter((m) => m.hasRows).length,
    totalModules: CLASSIFIER_MODULES.length,
    missionStepsCompletedRecent,
    activeDaysThisWeek: activeDays.size,
  });

  const moduleSummaries = perModule
    .filter((m) => m.headlines.length > 0)
    .map((m) => ({ title: m.title, headlines: m.headlines }));

  return {
    moduleSummaries,
    activeMissions,
    latestEnergyCheckIn,
    healthScore,
    knowledgeGraphLinkCount: totalLinksResult.count ?? 0,
    knowledgeGraphLinksThisWeek: recentLinksResult.count ?? 0,
  };
}

async function scanModule(
  supabase: SupabaseClient,
  config: (typeof CLASSIFIER_MODULES)[number],
  now: number
): Promise<ModuleScan> {
  const empty: ModuleScan = {
    title: enModuleTitle(config),
    headlines: [],
    hasRows: false,
    lastActivityMs: null,
    activeDays: new Set(),
  };

  try {
    const { data, error } = await supabase
      .from(config.table)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(PER_MODULE_LIMIT);

    if (error || !data) {
      if (error) logApiError("user-context:scanModule", error, { table: config.table });
      return empty;
    }

    const rows = data as Record<string, unknown>[];
    const headlines = rows
      .map((row) => String(row[config.headlineKey] ?? "").trim())
      .filter(Boolean)
      .map((h) => (h.length > MAX_HEADLINE_LENGTH ? `${h.slice(0, MAX_HEADLINE_LENGTH).trimEnd()}…` : h));

    const lastActivityMs = rows[0] ? new Date(String(rows[0].created_at)).getTime() : null;

    const activeDays = new Set<string>();
    for (const row of rows) {
      const ms = new Date(String(row.created_at)).getTime();
      if (now - ms < CONSISTENCY_WINDOW_DAYS * DAY_MS) {
        activeDays.add(new Date(ms).toISOString().slice(0, 10));
      }
    }

    return { title: enModuleTitle(config), headlines, hasRows: rows.length > 0, lastActivityMs, activeDays };
  } catch (err) {
    logApiError("user-context:scanModule", err, { table: config.table });
    return empty;
  }
}

function formatModuleLines(summaries: UserFullContext["moduleSummaries"]): string {
  return summaries.map((m) => `- ${m.title}: ${m.headlines.join(", ")}`).join("\n");
}

// Greek variant — appended in api/chat/route.ts, matching that file's own
// system-prompt language.
export function buildUserContextPromptAdditionGreek(context: UserFullContext): string {
  const parts: string[] = [`Business Health Score: ${context.healthScore.score}/100.`];

  if (context.moduleSummaries.length > 0) {
    parts.push(`Πρόσφατες εγγραφές ανά ενότητα:\n${formatModuleLines(context.moduleSummaries)}`);
  }
  if (context.activeMissions.length > 0) {
    const missionLines = context.activeMissions
      .map((m) => `- "${m.goal}" (${m.stepsCompleted}/${m.stepsTotal} βήματα ολοκληρωμένα)`)
      .join("\n");
    parts.push(`Ενεργές αποστολές:\n${missionLines}`);
  }
  if (context.latestEnergyCheckIn) {
    const noteText = context.latestEnergyCheckIn.note ? ` ("${context.latestEnergyCheckIn.note}")` : "";
    parts.push(`Πιο πρόσφατο energy check-in: επίπεδο ${context.latestEnergyCheckIn.energyLevel}/5${noteText}.`);
  }
  parts.push(
    `Knowledge Graph: ${context.knowledgeGraphLinkCount} συνδέσεις συνολικά (${context.knowledgeGraphLinksThisWeek} αυτή την εβδομάδα).`
  );

  return `\n\nΠλήρες πλαίσιο χρήστη (χρησιμοποίησέ το ΜΟΝΟ όταν είναι σχετικό με το ερώτημα, μην το απαριθμείς άσχετα):\n${parts.join("\n\n")}`;
}

// English variant — appended in api/create/route.ts, matching that file's
// own (English) system-prompt language.
export function buildUserContextPromptAdditionEnglish(context: UserFullContext): string {
  const parts: string[] = [`Business Health Score: ${context.healthScore.score}/100.`];

  if (context.moduleSummaries.length > 0) {
    parts.push(`Recent entries per module:\n${formatModuleLines(context.moduleSummaries)}`);
  }
  if (context.activeMissions.length > 0) {
    const missionLines = context.activeMissions
      .map((m) => `- "${m.goal}" (${m.stepsCompleted}/${m.stepsTotal} steps completed)`)
      .join("\n");
    parts.push(`Active missions:\n${missionLines}`);
  }
  if (context.latestEnergyCheckIn) {
    const noteText = context.latestEnergyCheckIn.note ? ` ("${context.latestEnergyCheckIn.note}")` : "";
    parts.push(`Most recent energy check-in: level ${context.latestEnergyCheckIn.energyLevel}/5${noteText}.`);
  }
  parts.push(
    `Knowledge Graph: ${context.knowledgeGraphLinkCount} total connections (${context.knowledgeGraphLinksThisWeek} this week).`
  );

  return `\n\nFull user context (use it ONLY when relevant to the request, don't recite it unprompted):\n${parts.join("\n\n")}`;
}
