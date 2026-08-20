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

FIRST DECIDE WHAT THE MESSAGE IS. This comes before choosing a module, and getting it wrong is the failure this instruction exists to prevent: "what do you know about me" was filed as a Document, because the only answers available were a module slug or "none".

- "question" — the user is ASKING something and wants an ANSWER. Signals: it ends in a question mark (? ？ ; ؟); it opens with or contains an interrogative (what / how / how many / who / when / why / where / which — τι, πώς, πόσα, ποιος, πότε, γιατί, πού — was, wie, wer, wann, warum, wo — qué, cómo, cuántos, quién — quoi, comment, combien, qui — cosa, come, quanti, chi — o que, como, quantos, quem — ما, كيف, كم, من, متى — 何, どう, いくつ, 誰, なぜ — 什么, 怎么, 多少, 谁, 为什么); or it asks what you know or remember ("do you know", "ξέρεις", "weißt du", "sabes", "覚えて", "知道吗").
  Examples that are questions: "what do you know about me", "how many credits do I have", "how are sales going", "what did I do last week", "who is my best customer", "how much did I spend in March".
- "record" — the user is TELLING you something to file, or INSTRUCTING you to make something. Signals: an imperative opener (make / build / write / log / add / note / save — φτιάξε, γράψε, κατέγραψε, πρόσθεσε — erstelle, schreibe, notiere — haz, escribe, anota), or a plain statement of fact ("Coffee shop in Athens, 40k revenue, 3 staff").
  An imperative with a question mark is still "record": "make me a website?" is a polite instruction, not a question.
- "ambiguous" — genuinely could be either, and you would be guessing. Say so; the user will be asked. Guessing wrong here creates a document nobody wanted.

When intent is "question": put the ANSWER in "answer", in the user's own language, using only the account context supplied to you. Do NOT choose a module, do NOT extract fields, and never invent a number, a date or a name that is not in that context — if the context does not contain it, say plainly that you do not have it. Set module to "none".
When intent is "ambiguous": set module to "none" and leave "answer" empty.

Rules for the "record" case:
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
    "Decide whether the user is asking a question or giving something to record. If recording, classify it into exactly one Ionexa AI module (or none) and extract the structured fields for that module's table. If asking, answer it.",
  input_schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: ["record", "question", "ambiguous"],
        description:
          'What the message IS. "record" = file it or build it. "question" = the user wants an answer, not a new row. "ambiguous" = genuinely unclear, so ask rather than guess.',
      },
      answer: {
        type: "string",
        description:
          'When intent is "question": the answer, in the user\'s own language, from the supplied account context only. Empty otherwise.',
      },
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
    required: ["intent", "module", "fields", "message"],
  },
};

export type RouteEntryInput = {
  /** What the message IS — decided before any module is chosen. */
  intent?: "record" | "question" | "ambiguous";
  /** Present when intent is "question". */
  answer?: string;
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

