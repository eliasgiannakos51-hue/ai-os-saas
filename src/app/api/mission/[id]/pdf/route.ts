import { NextResponse } from "next/server";
import React from "react";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { text, type PdfBlock } from "@/lib/pdf/blocks";
import { PdfDocument } from "@/lib/pdf/document";
import { pdfResponse } from "@/lib/pdf/render";
import { resolveLanguage } from "@/lib/text/resolve-language";
import type { MissionPlan, MissionStep } from "@/types/mission";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The mark in front of a step, so the plan is readable away from the app. */
const STATUS_MARK: Record<string, string> = {
  completed: "[x]",
  in_progress: "[>]",
  pending: "[ ]",
  skipped: "[-]",
};

/**
 * A mission plan, as a PDF — the one artefact here that is meant to be
 * printed and carried rather than read on screen.
 *
 * EVERY FIELD THE PLANNER FILLED IN COMES WITH IT. A step is `text`, but the
 * Planner is also asked for the OUTCOME ("what you will have once this is
 * done") and a rough estimate, and those are what make a step actionable
 * rather than a title. A PDF that carried only the step text would be a
 * worse copy of the plan than the screen it came from, which is the whole
 * reason nobody would use it.
 *
 * Read under the user's own session, so row level security decides access.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  try {
    const { data: mission, error } = await supabase
      .from("ai_missions")
      .select("goal, status, plan_steps, created_at, updated_at")
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!mission) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const plan = (mission.plan_steps as MissionPlan | null) ?? { steps: [] };
    const steps: MissionStep[] = Array.isArray(plan.steps) ? plan.steps : [];

    const blocks: PdfBlock[] = [];
    const done = steps.filter((s) => s.status === "completed").length;
    blocks.push({
      kind: "paragraph",
      runs: text(`${done} of ${steps.length} steps complete · ${String(mission.status).replace(/_/g, " ")}`),
    });
    blocks.push({ kind: "rule" });

    steps.forEach((step, i) => {
      const mark = STATUS_MARK[step.status] ?? "[ ]";
      blocks.push({
        kind: "listItem",
        marker: `${mark}`,
        runs: text(`${i + 1}. ${String(step.text ?? "").trim()}`, { bold: true }),
      });
      if (typeof step.outcome === "string" && step.outcome.trim()) {
        blocks.push({ kind: "listItem", marker: "", runs: text(`→ ${step.outcome.trim()}`) });
      }
      const facts: string[] = [];
      if (step.effort) facts.push(step.effort);
      if (typeof step.estimatedMinutes === "number" && step.estimatedMinutes > 0) {
        facts.push(`~${step.estimatedMinutes} min`);
      }
      if (facts.length > 0) blocks.push({ kind: "listItem", marker: "", runs: text(facts.join(" · ")) });
      for (const sub of Array.isArray(step.substeps) ? step.substeps : []) {
        const subMark = STATUS_MARK[sub.status] ?? "[ ]";
        blocks.push({ kind: "listItem", marker: "", runs: text(`   ${subMark} ${String(sub.text ?? "").trim()}`) });
      }
    });

    if (typeof plan.review === "string" && plan.review.trim()) {
      blocks.push({ kind: "rule" });
      blocks.push({ kind: "heading", level: 2, runs: text("Review") });
      blocks.push({ kind: "paragraph", runs: text(plan.review.trim()) });
    }

    const goal = String(mission.goal ?? "").trim() || "Mission";
    // The language of the PLAN, not of the interface — the Planner writes in
    // whatever language the goal was set in.
    const locale = resolveLanguage(`${goal} ${steps.map((s) => s.text ?? "").join(" ")}`, "en");

    const element = React.createElement(PdfDocument, {
      title: goal,
      subtitle: new Date(String(mission.updated_at ?? mission.created_at)).toISOString().slice(0, 10),
      blocks,
      locale,
    });
    return await pdfResponse(element, { filename: goal, fallbackName: "mission-plan" });
  } catch (err) {
    logApiError("/api/mission/[id]/pdf", err, { stage: "render" });
    return NextResponse.json({ error: "pdf_failed" }, { status: 500 });
  }
}
