import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CLASSIFIER_MODULES, getClassifierModule, moduleHref } from "@/lib/classifier-modules";
import type { FieldConfig } from "@/lib/modules";
import { agentRoleSystemPromptAddition, type AgentRole } from "@/lib/agent-roles";
import { buildOutputSummary, buildMissionContextSystemPromptAddition } from "@/lib/mission-context";

const MODEL = "claude-sonnet-4-6";

// Same classification logic as api/create/route.ts's POST handler
// (system prompt, tool definition, field coercion, module-match/insert),
// duplicated here rather than imported — a Next.js route.ts file can only
// export its HTTP method handlers, and this needs to run from
// api/cron/scheduled-runs/route.ts with an ADMIN client and an explicit
// userId (no cookie-based session exists in a cron invocation), not the
// request-scoped client api/create uses. Same duplication convention this
// codebase already uses for coerceFieldValue (api/create/route.ts and
// api/modules/create/route.ts each have their own copy) — small, pure,
// and needs to never silently drift is exactly when duplication over a
// forced shared abstraction is the right call here.
function buildSystemPrompt(): string {
  const moduleDocs = CLASSIFIER_MODULES.map((m) => {
    const fieldDocs = m.fields
      .map((f) => {
        const parts: string[] = [f.type];
        if (f.required) parts.push("required");
        if (f.options) parts.push(`one of: ${f.options.join(" | ")}`);
        return `    - ${f.key} (${parts.join(", ")})`;
      })
      .join("\n");
    return `- "${m.slug}" (table: ${m.table})\n${fieldDocs}`;
  }).join("\n\n");

  return `You are the routing brain for "Ionexa AI", a personal operating system with 13 modules, each backed by a Postgres table. A user will describe something in free text. Your job: figure out which single module it belongs to (or none), and extract the structured fields for that module's table.

Available modules and their fields:

${moduleDocs}

Rules:
- Pick exactly one module slug from the list above, or "none" if the message doesn't clearly fit any module.
- Only include field keys that belong to the chosen module in the "fields" object. Do not invent keys.
- Number-type fields must be JSON numbers, not strings.
- Leave a field out (or null) if the message doesn't contain that information — don't fabricate data.
- Always fill in the module's required field(s) if the message contains enough information to do so; if you can't, prefer "none" and explain what's missing in "message".
- "message" is a short (1-2 sentence), friendly response shown directly to the user. If module is "none", briefly list the 13 available modules (ideas, competitors, research, finance, learning, trading, decisions, products, content, sales, feedback, analytics, automation) and ask them to rephrase. If matched, briefly confirm what you logged.`;
}

const ROUTE_ENTRY_TOOL: Anthropic.Tool = {
  name: "route_entry",
  description:
    "Classify the user's message into exactly one Ionexa AI module (or none) and extract the structured fields for that module's table.",
  input_schema: {
    type: "object",
    properties: {
      module: {
        type: "string",
        enum: [...CLASSIFIER_MODULES.map((m) => m.slug), "none"],
        description:
          'The single best-matching module slug, or "none" if the message does not clearly fit any module.',
      },
      fields: {
        type: "object",
        description:
          'Extracted field values for the chosen module\'s table. Empty object if module is "none". Only include keys that belong to the chosen module.',
      },
      message: {
        type: "string",
        description: "A short, friendly 1-2 sentence response to show the user.",
      },
    },
    required: ["module", "fields", "message"],
  },
};

type RouteEntryInput = {
  module: string;
  fields: Record<string, unknown>;
  message: string;
};

function coerceFieldValue(field: FieldConfig, raw: unknown): string | number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (field.type === "number") {
    const num = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(num) ? num : null;
  }
  return String(raw);
}

export type MissionStepRunResult =
  | {
      ok: true;
      matched: true;
      module: string;
      moduleTitle: string;
      href: string;
      message: string;
      outputSummary: string;
    }
  | { ok: true; matched: false; message: string }
  | { ok: false; error: string };

// Runs the same "Create with AI" classification a user would trigger
// manually from mission-card.tsx, but server-side with no live user
// session — used by api/cron/scheduled-runs/route.ts to actually execute
// a step someone scheduled a day earlier via "Schedule for tomorrow".
// Never deducts credits itself — the caller (the cron route) checks and
// deducts, same "only after confirmed success" pattern as every other
// AI-calling endpoint in this app.
export async function runMissionStepForUser(
  apiKey: string,
  admin: SupabaseClient,
  userId: string,
  stepText: string,
  agentRole: AgentRole,
  priorStepsContext: string
): Promise<MissionStepRunResult> {
  const anthropic = new Anthropic({ apiKey });
  let toolInput: RouteEntryInput;
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system:
        buildSystemPrompt() +
        agentRoleSystemPromptAddition(agentRole) +
        buildMissionContextSystemPromptAddition(priorStepsContext),
      messages: [{ role: "user", content: stepText }],
      tools: [ROUTE_ENTRY_TOOL],
      tool_choice: { type: "tool", name: "route_entry" },
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );
    if (!toolUse) return { ok: false, error: "The model did not return a classification." };
    toolInput = toolUse.input as RouteEntryInput;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "AI classification request failed." };
  }

  if (!toolInput.module || toolInput.module === "none") {
    return { ok: true, matched: false, message: toolInput.message };
  }

  const moduleConfig = getClassifierModule(toolInput.module);
  if (!moduleConfig) {
    return { ok: true, matched: false, message: toolInput.message };
  }

  const payload: Record<string, string | number | null> = { user_id: userId };
  for (const field of moduleConfig.fields) {
    payload[field.key] = coerceFieldValue(field, toolInput.fields?.[field.key]);
  }

  const missingRequired = moduleConfig.fields.find(
    (f) => f.required && (payload[f.key] === null || payload[f.key] === undefined)
  );
  if (missingRequired) {
    return {
      ok: true,
      matched: false,
      message: `I found this looked like a ${moduleConfig.title} entry, but couldn't extract "${missingRequired.label}", which is required.`,
    };
  }

  const { data: insertedRecord, error: insertError } = await admin
    .from(moduleConfig.table)
    .insert(payload)
    .select()
    .single();

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  return {
    ok: true,
    matched: true,
    module: moduleConfig.slug,
    moduleTitle: moduleConfig.title,
    href: moduleHref(moduleConfig.slug),
    message: toolInput.message,
    outputSummary: buildOutputSummary(moduleConfig, insertedRecord as Record<string, unknown>, toolInput.message),
  };
}
