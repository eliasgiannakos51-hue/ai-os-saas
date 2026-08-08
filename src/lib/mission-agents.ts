import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AI_QUALITY_CHECKLIST_EL } from "@/lib/ai-quality-checklist";
import { AI_CONDUCT_EL } from "@/lib/ai-conduct";
import type { CostAccumulator } from "@/lib/billing/cost-accumulator";

const MISSION_MODEL = "claude-sonnet-4-6";
// Exported so the routes' billing estimates price the same model these
// agents actually call.
export const MISSION_AGENT_MODEL = MISSION_MODEL;
const MIN_STEPS = 4;
const MAX_STEPS = 8;
// AI Output Protection Layer thresholds (see parsePlanMissionToolInput
// below) — a step shorter than this can't realistically be a real,
// specific action ("Do it" is 5 chars); a plan with fewer than this many
// valid steps left after filtering is treated as unusable.
const MIN_STEP_LENGTH = 8;
const MIN_VALID_STEPS_AFTER_FILTERING = 2;
const MAX_SUBSTEPS = 4;
// A step the Planner claims takes longer than a working day is almost
// always a mis-estimate rather than a real one, and a negative/zero one
// is meaningless. Out-of-range values are dropped rather than shown.
const MAX_STEP_MINUTES = 8 * 60;
// The effort levels the Planner may assign, feeding BOTH the tool schema
// and the parser below so the enum it is told about and the values it is
// allowed to return cannot drift apart.
//
// Deliberately declared here rather than imported from lib/mission-energy:
// this module is the PRODUCER of the field and mission-energy is a
// consumer of it, so pointing the dependency that way would make the
// planner depend on the suggestion feature it knows nothing about.
// mission-energy.ts declares its own copy, and
// scripts/tests/mission-energy.test.mjs asserts the two agree.
export const STEP_EFFORTS = ["light", "medium", "deep"] as const;
export type StepEffort = (typeof STEP_EFFORTS)[number];

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
const PLANNER_SYSTEM_PROMPT = `Είσαι ο Planner Agent. Ανάλυσε τον στόχο του χρήστη σε ${MIN_STEPS}-${MAX_STEPS} ΕΚΤΕΛΕΣΙΜΑ βήματα.

ΤΙ ΣΗΜΑΙΝΕΙ "ΕΚΤΕΛΕΣΙΜΟ":
Κάθε βήμα πρέπει να λέει ΤΙ ΑΚΡΙΒΩΣ κάνει ο χρήστης — με αριθμό, με όνομα, με συγκεκριμένη ενέργεια — και ΠΟΥ καταλήγει το αποτέλεσμα μέσα στην εφαρμογή.

  ΟΧΙ: "Ανάλυσε την αγορά"
  ΝΑΙ: "Βρες 5 ανταγωνιστές στον κλάδο σου και κατέγραψε τιμές και τοποθέτησή τους στο Competitors module"

  ΟΧΙ: "Σκέψου την τιμολόγηση"
  ΝΑΙ: "Αποφάσισε αρχική τιμή και κατέγραψέ την μαζί με το σκεπτικό στο Products module"

Τα διαθέσιμα modules όπου μπορεί να καταλήξει ένα βήμα: Ideas, Research, Finance, Products, Content, Sales, Decisions, Competitors, Learning, Trading, Feedback, Analytics, Automation. Ανάφερε το module μέσα στο κείμενο του βήματος όπου έχει νόημα.

ΓΙΑ ΚΑΘΕ ΒΗΜΑ ΔΩΣΕ ΕΠΙΣΗΣ:
- "outcome": τι ΘΑ ΕΧΕΙ ο χρήστης όταν το ολοκληρώσει (μία σύντομη φράση, π.χ. "5 ανταγωνιστές καταγεγραμμένοι με τιμές")
- "estimatedMinutes": ρεαλιστική εκτίμηση σε λεπτά για ΑΝΘΡΩΠΟ που το κάνει
- "effort": πόση συγκέντρωση απαιτεί, ΑΝΕΞΑΡΤΗΤΑ από τη διάρκεια. "light" = μηχανικό/διαδικαστικό, γίνεται και κουρασμένος. "medium" = συνηθισμένη εστιασμένη δουλειά. "deep" = παρατεταμένη συγκέντρωση, κρίση ή δημιουργική προσπάθεια. Μια καταχώρηση δεδομένων 90 λεπτών είναι "light"· μια απόφαση τιμολόγησης 20 λεπτών είναι "deep".
- "substeps": ΜΟΝΟ αν το βήμα είναι μεγάλο/σύνθετο, σπάσ' το σε 2-4 μικρότερες, ξεχωριστά τσεκαριζόμενες ενέργειες. Αν το βήμα είναι ήδη μία απλή ενέργεια, άφησε το κενό.

Αν ο στόχος είναι ΤΟΣΟ γενικός/ασαφής (π.χ. "θέλω να πετύχω", "θέλω να γίνω πλούσιος") που δεν μπορείς να τον αναλύσεις σε πραγματικά, συγκεκριμένα βήματα χωρίς να επινοήσεις γενικόλογα/κενά βήματα, ΜΗΝ επινοήσεις βήματα — αντ' αυτού ζήτησε μία σύντομη, φιλική διευκρίνιση.

ΜΗΝ επινοείς συγκεκριμένα πραγματικά στοιχεία (ακριβή νούμερα, ημερομηνίες, τιμές, ονόματα) που δεν δόθηκαν από τον χρήστη και δεν προκύπτουν λογικά από τον στόχο — αν ένα βήμα χρειάζεται τέτοιο στοιχείο, διατύπωσέ το ως ενέργεια απόφασης/έρευνας. Η ΜΟΝΗ εξαίρεση: πραγματικά στοιχεία που σου δίνονται ρητά στην ενότητα ΕΥΡΗΜΑΤΑ ΑΝΑΖΗΤΗΣΗΣ παρακάτω, αν υπάρχει — αυτά είναι αληθινά και μπορείς να τα χρησιμοποιήσεις.
${AI_CONDUCT_EL}${AI_QUALITY_CHECKLIST_EL}`;

const PLAN_MISSION_TOOL: Anthropic.Tool = {
  name: "create_plan",
  description: `Break the user's goal down into ${MIN_STEPS}-${MAX_STEPS} concrete, executable steps — or, if the goal is too vague for that, ask a short clarifying question instead.`,
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
        maxItems: MAX_STEPS,
        description:
          "If clarificationNeeded is false: the executable steps. Empty array if clarificationNeeded is true.",
        items: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description:
                "One specific, executable action naming what to do and where it lands. No numbering, no markdown.",
            },
            outcome: {
              type: "string",
              description: "What the user will HAVE once this step is done. One short phrase.",
            },
            estimatedMinutes: {
              type: "number",
              description: "Realistic minutes for a person to actually do this.",
            },
            effort: {
              type: "string",
              enum: [...STEP_EFFORTS],
              description:
                "How much focus this demands, independent of how long it takes. 'light' = mechanical or administrative, doable while tired. 'medium' = ordinary focused work. 'deep' = sustained concentration, judgement, or creative effort. A 90-minute data entry task is 'light'; a 20-minute pricing decision is 'deep'.",
            },
            substeps: {
              type: "array",
              maxItems: MAX_SUBSTEPS,
              items: { type: "string" },
              description:
                "Only for a large/complex step: 2-4 smaller, separately tickable actions. Omit or leave empty for a step that is already one simple action.",
            },
          },
          required: ["text"],
        },
      },
    },
    required: ["clarificationNeeded", "clarificationQuestion", "steps"],
  },
};

/** What the Planner produces for one step, before it becomes a MissionStep. */
export type PlannedStep = {
  text: string;
  outcome?: string;
  estimatedMinutes?: number;
  substeps?: string[];
  /** How much focus the step demands — see lib/mission-energy.ts. */
  effort?: StepEffort;
};

export type PlanMissionResult =
  | { clarificationNeeded: false; steps: PlannedStep[] }
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

  // AI Output Protection Layer (same general pattern as Website Builder's
  // HTML security scan — a cheap, deterministic sanity check on the
  // model's own output before it's ever shown to the user or saved):
  // drop steps that are empty, too short to be a real action (under 8
  // characters — "Do it", "Start" aren't usable plan steps), or exact
  // case-insensitive duplicates of an earlier step in the same plan.
  //
  // Accepts BOTH shapes on purpose. The tool now asks for objects, but a
  // model can still return a bare string array, and treating that as a
  // parse failure would turn a perfectly usable plan into a spurious
  // clarification prompt.
  const seen = new Set<string>();
  const steps: PlannedStep[] = [];
  for (const raw of Array.isArray(input.steps) ? input.steps : []) {
    const source =
      typeof raw === "string"
        ? { text: raw }
        : raw && typeof raw === "object"
          ? (raw as Record<string, unknown>)
          : null;
    if (!source) continue;

    const text = typeof source.text === "string" ? source.text.trim() : "";
    if (text.length < MIN_STEP_LENGTH) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const outcome =
      typeof source.outcome === "string" && source.outcome.trim() ? source.outcome.trim() : undefined;

    // Dropped rather than clamped when out of range: a bogus estimate is
    // worse than none, because the user cannot tell it is bogus.
    const rawMinutes = typeof source.estimatedMinutes === "number" ? source.estimatedMinutes : NaN;
    const estimatedMinutes =
      Number.isFinite(rawMinutes) && rawMinutes > 0 && rawMinutes <= MAX_STEP_MINUTES
        ? Math.round(rawMinutes)
        : undefined;

    // A single sub-step is not a breakdown — it is the step restated, so
    // it is discarded rather than rendered as a one-item nested list.
    const substepTexts = Array.isArray(source.substeps)
      ? source.substeps
          .filter((x): x is string => typeof x === "string" && x.trim().length >= MIN_STEP_LENGTH)
          .map((x) => x.trim())
          .slice(0, MAX_SUBSTEPS)
      : [];
    const substeps = substepTexts.length >= 2 ? substepTexts : undefined;

    // Left undefined rather than defaulted here when the model omits it
    // or sends something outside the enum. mission-energy.ts treats an
    // absent effort as "medium", and doing that in ONE place keeps a
    // missing value from looking like a deliberate classification.
    const effort =
      typeof source.effort === "string" && (STEP_EFFORTS as readonly string[]).includes(source.effort)
        ? (source.effort as StepEffort)
        : undefined;

    steps.push({ text, outcome, estimatedMinutes, substeps, effort });
  }

  if (steps.length < MIN_VALID_STEPS_AFTER_FILTERING) {
    // Either the model returned no usable steps, or what it returned was
    // mostly empty/duplicate/too-vague filler — treat this the same as
    // an explicit clarification request rather than shipping a degraded,
    // low-quality plan the user would have to notice and fix themselves.
    return { clarificationNeeded: true, clarificationQuestion: DEFAULT_CLARIFICATION_QUESTION };
  }

  return { clarificationNeeded: false, steps: steps.slice(0, MAX_STEPS) };
}

// Anthropic's native server-side web search, same tool the chat route
// offers (see api/chat/route.ts's WEB_SEARCH_TOOL). Offering it costs
// nothing; Anthropic bills only for searches actually performed, and
// max_uses caps one planning pass at 3.
const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20250305 = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 3,
};

const RESEARCH_SYSTEM_PROMPT = `Είσαι ο Research Agent. Θα σου δοθεί ο στόχος ενός χρήστη. Η δουλειά σου είναι ΜΟΝΟ να μαζέψεις πραγματικά, τρέχοντα στοιχεία που θα κάνουν το σχέδιο ΡΕΑΛΙΣΤΙΚΟ αντί για γενικό.

ΨΑΞΕ στο διαδίκτυο όταν ο στόχος αφορά: τρέχουσες τιμές ή κόστη, συγκεκριμένες πλατφόρμες/εργαλεία/υπηρεσίες, νομικές ή διαδικαστικές απαιτήσεις, μεγέθη αγοράς, ή βέλτιστες πρακτικές κλάδου που αλλάζουν με τον χρόνο. Κάνε 2-4 ΣΤΟΧΕΥΜΕΝΕΣ αναζητήσεις (π.χ. μία για τιμές, μία για πλατφόρμες, μία για απαιτήσεις) αντί για μία γενική.

ΜΗΝ ψάξεις αν ο στόχος είναι καθαρά προσωπικός/εσωτερικός και δεν εξαρτάται από εξωτερικά στοιχεία.

Απάντησε με σύντομα bullet points ΜΟΝΟ με ό,τι πραγματικά βρήκες, και ανάφερε την πηγή σε παρένθεση. ΠΑΡΑΦΡΑΣΕ — ΜΗΝ αντιγράφεις κείμενο αυτούσιο από τις πηγές. Αν δεν χρειάστηκε καμία αναζήτηση, απάντησε ακριβώς: NONE`;

// Cap on how much research text is fed into the planning prompt.
const MAX_RESEARCH_CHARS = 2500;

/**
 * Optional research pass that runs BEFORE planning.
 *
 * Split into its own call rather than handing the web_search tool to the
 * Planner directly, because the Planner uses a FORCED tool_choice — it
 * must return a create_plan call — and a forced tool choice leaves the
 * model no turn in which to search first. This call is free to search or
 * to decline, and its findings are appended to the Planner's system
 * prompt as facts it is explicitly allowed to use.
 *
 * Best-effort throughout: any failure returns "" and planning proceeds
 * exactly as it did before this existed.
 */
export async function researchGoal(
  apiKey: string,
  goal: string,
  costs?: CostAccumulator
): Promise<{ findings: string; searchCount: number }> {
  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: MISSION_MODEL,
      max_tokens: 900,
      system: RESEARCH_SYSTEM_PROMPT,
      messages: [{ role: "user", content: goal }],
      tools: [WEB_SEARCH_TOOL],
    });

    costs?.record("web_search", response.usage, response.model || MISSION_MODEL);
    const searchCount = response.usage.server_tool_use?.web_search_requests ?? 0;

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    // "NONE" is the documented way for the agent to say it had nothing
    // worth searching for — treated as no findings, not as a finding.
    if (!text || text.toUpperCase().startsWith("NONE")) return { findings: "", searchCount };

    return { findings: text.slice(0, MAX_RESEARCH_CHARS), searchCount };
  } catch {
    // A research hiccup must never block a plan. The Planner simply runs
    // on the goal alone, exactly as it did before this call existed.
    return { findings: "", searchCount: 0 };
  }
}

// `userContext` — "AI Life Context" (see lib/user-context.ts), appended
// to the Planner's system prompt when the caller has it available (see
// api/mission/plan/route.ts) so planning is grounded in the user's real
// existing modules/missions/products instead of a goal considered in
// isolation. Optional and additive: omitting it just means a plan built
// from the goal text alone, same as before this was added.
export async function planMission(
  apiKey: string,
  goal: string,
  userContext = "",
  costs?: CostAccumulator,
  /** Findings from researchGoal(), if it ran and found anything. */
  researchFindings = ""
): Promise<PlanMissionResult> {
  const anthropic = new Anthropic({ apiKey });
  const researchBlock = researchFindings
    ? `\n\nΕΥΡΗΜΑΤΑ ΑΝΑΖΗΤΗΣΗΣ (πραγματικά, πρόσφατα στοιχεία — χρησιμοποίησέ τα για να κάνεις τα βήματα συγκεκριμένα):\n${researchFindings}`
    : "";
  const response = await anthropic.messages.create({
    model: MISSION_MODEL,
    max_tokens: 2048,
    system: PLANNER_SYSTEM_PROMPT + userContext + researchBlock,
    messages: [{ role: "user", content: goal }],
    tools: [PLAN_MISSION_TOOL],
    tool_choice: { type: "tool", name: "create_plan" },
  });

  costs?.record("generation", response.usage, response.model || MISSION_MODEL);

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
const REVIEWER_SYSTEM_PROMPT = `Είσαι ο Reviewer Agent. Θα σου δοθεί ο στόχος ενός χρήστη και τα βήματα/εγγραφές που δημιουργήθηκαν γι' αυτόν. Δώσε σύντομη αξιολόγηση (3-5 προτάσεις ή σύντομα bullet points): τι πήγε καλά, τι λείπει, και ποιο είναι το επόμενο λογικό βήμα. Απάντα στην ίδια γλώσσα που είναι γραμμένος ο στόχος. Χρησιμοποίησε markdown formatting (λίστες, bold) όπου βοηθάει.
${AI_CONDUCT_EL}${AI_QUALITY_CHECKLIST_EL}`;

export async function reviewMission(
  apiKey: string,
  goal: string,
  completedSteps: { text: string; moduleTitle?: string }[],
  costs?: CostAccumulator
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

  costs?.record("generation", response.usage, response.model || MISSION_MODEL);

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text"
  );
  const text = textBlock?.text.trim();
  if (!text) {
    throw new Error("The Reviewer did not return an evaluation.");
  }

  return text;
}
