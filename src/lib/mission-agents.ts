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
//
// Vague-goal handling: a forced tool call with a required steps array used
// to leave the Planner no way to react to a goal like "θέλω να πετύχω" (I
// want to succeed) except inventing 4-8 generic, made-up steps — the tool
// schema gave it no other option. clarificationNeeded/clarificationQuestion
// give it one: for a goal too vague to break into REAL concrete actions,
// it asks a short follow-up question instead of fabricating filler steps.
const PLANNER_SYSTEM_PROMPT = `Είσαι ο Planner Agent. Ανάλυσε τον στόχο του χρήστη.

Αν ο στόχος είναι ΑΡΚΕΤΑ συγκεκριμένος ώστε να αναλυθεί σε πραγματικές, καταγράψιμες ενέργειες (π.χ. "θέλω να ξεκινήσω online κατάστημα με χειροποίητα κοσμήματα"), δημιούργησε λίστα ${MIN_STEPS}-${MAX_STEPS} συγκεκριμένων βημάτων. Κάθε βήμα να είναι διατυπωμένο σαν μία συγκεκριμένη, καταγράψιμη ενέργεια που θα μπορούσε να γίνει μία εγγραφή σε ένα από τα ήδη υπάρχοντα modules του χρήστη (Ideas, Research, Finance, Products, Content, Sales, Decisions, κ.λπ.) όπου έχει νόημα. Κάθε βήμα μία σύντομη πρόταση, χωρίς αρίθμηση ή markdown.

Αν ο στόχος είναι ΤΟΣΟ γενικός/ασαφής (π.χ. "θέλω να πετύχω", "θέλω να γίνω πλούσιος", "καλύτερη ζωή") που δεν μπορείς να τον αναλύσεις σε πραγματικά, συγκεκριμένα βήματα χωρίς να επινοήσεις γενικόλογα/κενά βήματα, ΜΗΝ επινοήσεις βήματα — αντ' αυτού ζήτησε μία σύντομη, φιλική διευκρίνιση για το τι συγκεκριμένα θέλει να πετύχει.

ΜΗΝ επινοείς συγκεκριμένα πραγματικά στοιχεία (ακριβή νούμερα, ημερομηνίες, τιμές, ονόματα) που δεν δόθηκαν από τον χρήστη και δεν προκύπτουν λογικά από τον στόχο — αν ένα βήμα χρειάζεται τέτοιο στοιχείο, διατύπωσέ το ως ενέργεια απόφασης/έρευνας (π.χ. "Καθόρισε τον προϋπολογισμό εκκίνησης" αντί για ένα εφευρημένο ποσό).`;

const PLAN_MISSION_TOOL: Anthropic.Tool = {
  name: "create_plan",
  description: `Break the user's goal down into ${MIN_STEPS}-${MAX_STEPS} concrete, actionable steps — or, if the goal is too vague for that, ask a short clarifying question instead.`,
  input_schema: {
    type: "object",
    properties: {
      clarificationNeeded: {
        type: "boolean",
        description:
          "True if the goal is too vague/broad to break into real, concrete steps without inventing generic filler ones.",
      },
      clarificationQuestion: {
        type: "string",
        description:
          "If clarificationNeeded is true: a short, friendly question asking what specifically the user wants to achieve. Empty string otherwise.",
      },
      steps: {
        type: "array",
        items: { type: "string" },
        maxItems: MAX_STEPS,
        description:
          "If clarificationNeeded is false: concrete steps, each phrased as one specific, loggable action — no numbering, no markdown. Empty array if clarificationNeeded is true.",
      },
    },
    required: ["clarificationNeeded", "clarificationQuestion", "steps"],
  },
};

export type PlanMissionResult =
  | { clarificationNeeded: false; steps: string[] }
  | { clarificationNeeded: true; clarificationQuestion: string };

const DEFAULT_CLARIFICATION_QUESTION =
  "Could you share a bit more detail about what you'd specifically like to achieve?";

// Pure, deterministic interpretation of the Planner's tool_use input —
// pulled out of planMission() below so the vague-goal/clarification
// decision (and the "model claimed no clarification needed but returned
// no usable steps either" fallback) can be unit tested against
// hand-constructed inputs without a live Anthropic call.
export function parsePlanMissionToolInput(input: {
  clarificationNeeded?: unknown;
  clarificationQuestion?: unknown;
  steps?: unknown;
}): PlanMissionResult {
  if (input.clarificationNeeded === true) {
    const question =
      typeof input.clarificationQuestion === "string" && input.clarificationQuestion.trim()
        ? input.clarificationQuestion.trim()
        : DEFAULT_CLARIFICATION_QUESTION;
    return { clarificationNeeded: true, clarificationQuestion: question };
  }

  const steps = Array.isArray(input.steps)
    ? input.steps.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];

  if (steps.length === 0) {
    // The model said it didn't need clarification but returned no usable
    // steps either — treat it the same as an explicit clarification
    // request rather than creating an empty, useless mission.
    return { clarificationNeeded: true, clarificationQuestion: DEFAULT_CLARIFICATION_QUESTION };
  }

  return { clarificationNeeded: false, steps: steps.slice(0, MAX_STEPS).map((s) => s.trim()) };
}

export async function planMission(apiKey: string, goal: string): Promise<PlanMissionResult> {
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

  return parsePlanMissionToolInput(
    toolUse.input as { clarificationNeeded?: unknown; clarificationQuestion?: unknown; steps?: unknown }
  );
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
