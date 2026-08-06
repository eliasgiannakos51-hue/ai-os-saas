import {
  AGENT_LIMITS,
  isAgentOutputFormat,
  sanitiseAgentText,
  type AgentDraft,
  type AgentOutputFormat,
} from "@/lib/agents/agent-config";
import { validateAgentCron, isValidTimeZone } from "@/lib/agents/cron-expression";

// The pure half of the Agent Builder — everything that turns the model's
// tool input into a configuration, with no Anthropic client anywhere near
// it.
//
// Split out for the same reason lib/clarification-client.ts is split from
// lib/clarification.ts: this is the part where a mistake is expensive (a
// wrong schedule spends money forever, a trusted-from-the-model recipient
// is an outbound mail vector), and it has to be exercisable against
// hand-written inputs in a unit test without a live API call or the
// `server-only` guard. lib/agents/agent-builder.ts re-exports it so server
// code still has one place to import from.

export type BuiltAgent = {
  draft: AgentDraft;
  /** The one-sentence restatement shown on the preview screen. */
  understood: string;
  /** Present when part of the request is outside what an agent can do. */
  unsupported: string;
};

export type BuildAgentResult =
  | { ok: true; built: BuiltAgent }
  | { ok: false; reason: "malformed" | "invalid_schedule"; detail: string };

/**
 * Deterministic interpretation of the tool input, split out so it is unit
 * testable without a live API call — the same split as
 * parsePlanMissionToolInput and parseWebsiteClassification.
 *
 * `timezone` and `deliveryTarget` come from the CALLER (real account
 * data), never from the model.
 */
export function parseBuiltAgent(
  input: Record<string, unknown>,
  context: { timezone: string; deliveryTarget: string }
): BuildAgentResult {
  const str = (v: unknown, max: number): string =>
    typeof v === "string" ? v.trim().slice(0, max) : "";

  const name = str(input.name, AGENT_LIMITS.name);
  const taskPrompt = str(input.taskPrompt, AGENT_LIMITS.prompt);
  const scheduleCron = str(input.scheduleCron, 100);

  if (!name || !taskPrompt || !scheduleCron) {
    return { ok: false, reason: "malformed", detail: "The builder returned an incomplete agent." };
  }

  const cronCheck = validateAgentCron(scheduleCron);
  if (!cronCheck.ok) {
    // Not silently corrected to a default. A schedule the user did not
    // choose, applied to a thing that spends money on its own, is exactly
    // the class of "helpful" guess this feature must never make.
    return { ok: false, reason: "invalid_schedule", detail: cronCheck.error };
  }

  const outputFormat: AgentOutputFormat = isAgentOutputFormat(input.outputFormat)
    ? input.outputFormat
    : "summary";

  const timezone = isValidTimeZone(context.timezone) ? context.timezone : "UTC";

  // The task prompt is sanitised here as well as in validateAgentDraft:
  // this text came back from a model that was itself fed untrusted user
  // input, so it is treated as untrusted on the way out too.
  const { text: safePrompt } = sanitiseAgentText(taskPrompt);

  return {
    ok: true,
    built: {
      draft: {
        name,
        description: str(input.description, AGENT_LIMITS.description),
        prompt: safePrompt,
        scheduleCron,
        timezone,
        deliveryMethod: "email",
        deliveryTarget: context.deliveryTarget,
        config: {
          needsWebSearch: input.needsWebSearch === true,
          outputFormat,
          language: str(input.language, 20) || "en",
          builderSummary: str(input.understood, AGENT_LIMITS.description),
        },
      },
      understood: str(input.understood, AGENT_LIMITS.description),
      unsupported: str(input.unsupported, AGENT_LIMITS.description),
    },
  };
}
