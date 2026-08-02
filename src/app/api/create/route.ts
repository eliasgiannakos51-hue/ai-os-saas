import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import {
  CLASSIFIER_MODULES,
  getClassifierModule,
  moduleHref,
} from "@/lib/classifier-modules";
import type { FieldConfig } from "@/lib/modules";
import { isAgentRole, agentRoleSystemPromptAddition, type AgentRole } from "@/lib/agent-roles";
import { getUserFullContext, buildUserContextPromptAdditionEnglish } from "@/lib/user-context";
import { buildOutputSummary, buildMissionContextSystemPromptAddition } from "@/lib/mission-context";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import {
  CREDIT_COSTS,
  deductCredits,
  insufficientCreditsMessage,
  resolveEffectivePlan,
} from "@/lib/billing/credits";

export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-6";
const MAX_MESSAGE_LENGTH = 10000;

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
        description:
          "A short, friendly 1-2 sentence response to show the user.",
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

export async function POST(request: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    let message: string;
    let agentRole: AgentRole;
    let priorStepsContext: string;
    try {
      const body = await request.json();
      message = typeof body?.message === "string" ? body.message.trim() : "";
      agentRole = isAgentRole(body?.agentRole) ? body.agentRole : "general";
      priorStepsContext = typeof body?.context === "string" ? body.context.trim() : "";
    } catch {
      return NextResponse.json(
        { ok: false, error: "Invalid request body." },
        { status: 400 }
      );
    }

    if (!message) {
      return NextResponse.json(
        { ok: false, error: "Message is required." },
        { status: 400 }
      );
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json(
        {
          ok: false,
          error: `Message is too long (${message.length}/${MAX_MESSAGE_LENGTH} characters) — please shorten it and try again.`,
        },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated." },
        { status: 401 }
      );
    }

    // Credits: 1 credit per Create Anything request, deducted from
    // user_credits (see lib/billing/credits.ts). Admin-listed accounts
    // (see lib/admin.ts) and beta testers (see lib/beta.ts) skip this
    // entirely — treated as unlimited.
    const isAdmin = isAdminEmail(user.email);
    if (!isAdmin && !(await hasActiveBetaBypass(user))) {
      const plan = await resolveEffectivePlan(user);
      const deduction = await deductCredits(
        user.id,
        CREDIT_COSTS.createAnything,
        "create_anything",
        "Create Anything request",
        plan
      );
      if (!deduction.ok) {
        return NextResponse.json({
          ok: true,
          matched: false,
          message: insufficientCreditsMessage(deduction.remaining, CREDIT_COSTS.createAnything),
        });
      }
    }

    // create_requests keeps a per-request log for history/debugging — no
    // longer used for gating (credits above are the actual limit now).
    const { error: usageLogError } = await supabase
      .from("create_requests")
      .insert({ user_id: user.id });
    if (usageLogError) {
      logApiError("/api/create", usageLogError, { stage: "usage_log" });
    }

    // "AI Life Context" — same consolidated user picture used by
    // api/chat/route.ts (see lib/user-context.ts), appended here too so
    // Create Anything's classification/field-extraction isn't limited to
    // just the one message it was given. Best-effort, same as chat's.
    let userContext = "";
    try {
      const fullContext = await getUserFullContext(supabase, user.id);
      userContext = buildUserContextPromptAdditionEnglish(fullContext);
    } catch (err) {
      logApiError("/api/create", err, { stage: "user_full_context" });
    }

    const anthropic = new Anthropic({ apiKey });

    let toolInput: RouteEntryInput;
    try {
      const missionContextAddition = buildMissionContextSystemPromptAddition(priorStepsContext);

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system:
          buildSystemPrompt() + agentRoleSystemPromptAddition(agentRole) + userContext + missionContextAddition,
        messages: [{ role: "user", content: message }],
        tools: [ROUTE_ENTRY_TOOL],
        tool_choice: { type: "tool", name: "route_entry" },
      });

      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
      );

      if (!toolUse) {
        return NextResponse.json(
          { ok: false, error: "The model did not return a classification." },
          { status: 502 }
        );
      }

      toolInput = toolUse.input as RouteEntryInput;
    } catch (err) {
      logApiError("/api/create", err, { stage: "anthropic_call" });
      const errMessage = err instanceof Error ? err.message : "AI classification request failed.";
      return NextResponse.json({ ok: false, error: errMessage }, { status: 502 });
    }

    if (!toolInput.module || toolInput.module === "none") {
      return NextResponse.json({
        ok: true,
        matched: false,
        message: toolInput.message,
      });
    }

    const moduleConfig = getClassifierModule(toolInput.module);
    if (!moduleConfig) {
      return NextResponse.json({
        ok: true,
        matched: false,
        message: toolInput.message,
      });
    }

    const payload: Record<string, string | number | null> = { user_id: user.id };
    for (const field of moduleConfig.fields) {
      payload[field.key] = coerceFieldValue(field, toolInput.fields?.[field.key]);
    }

    const missingRequired = moduleConfig.fields.find(
      (f) => f.required && (payload[f.key] === null || payload[f.key] === undefined)
    );
    if (missingRequired) {
      return NextResponse.json({
        ok: true,
        matched: false,
        message: `I found this looked like a ${moduleConfig.title} entry, but couldn't extract "${missingRequired.label}", which is required. Could you add a bit more detail?`,
      });
    }

    const { data: insertedRecord, error: insertError } = await supabase
      .from(moduleConfig.table)
      .insert(payload)
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { ok: false, error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      matched: true,
      module: moduleConfig.slug,
      moduleTitle: moduleConfig.title,
      href: moduleHref(moduleConfig.slug),
      message: toolInput.message,
      outputSummary: buildOutputSummary(moduleConfig, insertedRecord as Record<string, unknown>, toolInput.message),
    });
  } catch (err) {
    logApiError("/api/create", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
