import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const MISSION_MODEL = "claude-sonnet-4-6";
const MIN_STEPS = 4;
const MAX_STEPS = 8;

// Planner Agent — breaks a goal into concrete steps. Deliberately doesn't
// assign a module per step itself: each step's text is later handed to the
// EXISTING /api/create classifier (see mission-card.tsx's "Create with AI"),
// which independently decides which module it belongs to — one classifier,
// not two disagreeing ones.
const PLANNER_SYSTEM_PROMPT = `Είσαι ο Planner Agent. Ανάλυσε τον στόχο του χρήστη και δημιούργησε λίστα ${MIN_STEPS}-${MAX_STEPS} συγκεκριμένων βημάτων που χρειάζονται για να επιτευχθεί. Κάθε βήμα να είναι διατυπωμένο σαν μία συγκεκριμένη, καταγράψιμη ενέργεια που θα μπορούσε να γίνει μία εγγραφή σε ένα από τα ήδη υπάρχοντα modules του χρήστη (Ideas, Research, Finance, Products, Content, Sales, Decisions, κ.λπ.) όπου έχει νόημα. Κάθε βήμα μία σύντομη πρόταση, χωρίς αρίθμηση ή markdown.`;

const PLAN_MISSION_TOOL: Anthropic.Tool = {
  name: "create_plan",
  description: `Break the user's goal down into ${MIN_STEPS}-${MAX_STEPS} concrete, actionable steps.`,
  input_schema: {
    type: "object",
    properties: {
      steps: {
        type: "array",
        items: { type: "string" },
        minItems: MIN_STEPS,
        maxItems: MAX_STEPS,
        description:
          "Concrete steps, each phrased as one specific, loggable action — no numbering, no markdown.",
      },
    },
    required: ["steps"],
  },
};

export async function planMission(apiKey: string, goal: string): Promise<string[]> {
  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: MISSION_MODEL,
    max_tokens: 1024,
    system: PLANNER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: goal }],
    tools: [PLAN_MISSION_TOOL],
    tool_choice: { type: "tool", name: "create_plan" },
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );
  if (!toolUse) {
    throw new Error("The Planner did not return a plan.");
  }

  const input = toolUse.input as { steps?: unknown };
  const steps = Array.isArray(input.steps)
    ? input.steps.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];

  if (steps.length === 0) {
    throw new Error("The Planner returned an empty plan.");
  }

  return steps.slice(0, MAX_STEPS).map((s) => s.trim());
}

// Reviewer Agent — looks at what was actually built for a mission (not
// just the plan) and gives a short, plain-text evaluation. No tool use
// needed here since the output is prose, not structured data.
const REVIEWER_SYSTEM_PROMPT = `Είσαι ο Reviewer Agent. Θα σου δοθεί ο στόχος ενός χρήστη και τα βήματα/εγγραφές που δημιουργήθηκαν γι' αυτόν. Δώσε σύντομη αξιολόγηση (3-5 προτάσεις ή σύντομα bullet points): τι πήγε καλά, τι λείπει, και ποιο είναι το επόμενο λογικό βήμα. Απάντα στην ίδια γλώσσα που είναι γραμμένος ο στόχος. Χρησιμοποίησε markdown formatting (λίστες, bold) όπου βοηθάει.`;

export async function reviewMission(
  apiKey: string,
  goal: string,
  completedSteps: { text: string; moduleTitle?: string }[]
): Promise<string> {
  const anthropic = new Anthropic({ apiKey });
  const stepsSummary = completedSteps
    .map((s) => `- ${s.text}${s.moduleTitle ? ` (καταγράφηκε στο module: ${s.moduleTitle})` : ""}`)
    .join("\n");
  const userContent = `Στόχος: ${goal}\n\nΒήματα που ολοκληρώθηκαν:\n${stepsSummary}`;

  const response = await anthropic.messages.create({
    model: MISSION_MODEL,
    max_tokens: 700,
    system: REVIEWER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  const text = textBlock?.text.trim();
  if (!text) {
    throw new Error("The Reviewer did not return an evaluation.");
  }

  return text;
}
