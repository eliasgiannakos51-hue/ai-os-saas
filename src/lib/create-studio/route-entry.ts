import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { FieldConfig } from "@/lib/modules";
import { CLASSIFIER_MODULES } from "@/lib/classifier-modules";
import { AI_QUALITY_CHECKLIST_EN } from "@/lib/ai-quality-checklist";
import { AI_CONDUCT_EN } from "@/lib/ai-conduct";

/**
 * The classification contract for Create Anything.
 *
 * Lifted out of api/create when the work moved into a background job:
 * the route no longer makes the call, the worker does, and a prompt that
 * lives inside a route handler cannot be shared with one. Moved verbatim
 * — same model, same tool schema, same coercion — so the classification a
 * user gets is byte-for-byte the one they got before.
 */
export const MODEL = "claude-sonnet-4-6";
export const MAX_MESSAGE_LENGTH = 20000;

export function buildSystemPrompt(): string {
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
- "message" is a short (1-2 sentence), friendly response shown directly to the user. If module is "none", briefly list the 13 available modules (ideas, competitors, research, finance, learning, trading, decisions, products, content, sales, feedback, analytics, automation) and ask them to rephrase. If matched, briefly confirm what you logged.
${AI_CONDUCT_EN}${AI_QUALITY_CHECKLIST_EN}`;
}

export const ROUTE_ENTRY_TOOL: Anthropic.Tool = {
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
        description:
          "A short, friendly 1-2 sentence response to show the user.",
      },
    },
    required: ["module", "fields", "message"],
  },
};

export type RouteEntryInput = {
  module: string;
  fields: Record<string, unknown>;
  message: string;
};

export function coerceFieldValue(field: FieldConfig, raw: unknown): string | number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (field.type === "number") {
    const num = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(num) ? num : null;
  }
  return String(raw);
}

