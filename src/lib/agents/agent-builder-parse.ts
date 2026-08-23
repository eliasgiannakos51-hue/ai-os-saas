import {
  AGENT_LIMITS,
  isAgentOutputFormat,
  sanitiseAgentText,
  type AgentDraft,
  type AgentOutputFormat,
} from "@/lib/agents/agent-config";
import { validateAgentCron, isValidTimeZone } from "@/lib/agents/cron-expression";
import { parseAgentDepth, type AgentDepth } from "@/lib/agents/agent-depth";

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
  | {
      ok: false;
      /**
       * `not_feasible` is the outcome that did not exist before.
       *
       * The builder always had an `unsupported` field, and it was free
       * text with NO EFFECT: a request that was 100% outside what an
       * agent can do still came back `ok: true` with a complete draft,
       * a schedule and a cost estimate, and the user could press Create.
       * That is how an agent got built for "make an MVP, run the tests,
       * fix the errors" — the model said, in `unsupported`, that it
       * could not do any of it, and nothing read the sentence.
       *
       * Now the model's own verdict decides the return type, so the
       * impossible case cannot be turned into an agent by any caller.
       */
      reason: "malformed" | "invalid_schedule" | "not_feasible";
      detail: string;
    };

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

  const unsupported = str(input.unsupported, AGENT_LIMITS.description);

  // FEASIBILITY IS CHECKED FIRST, before the fields are even validated.
  //
  // A request the model judged impossible must not be able to fail any
  // later check into a different outcome — "malformed" would read to the
  // user as "try rewording it", which is precisely the wrong advice for
  // something no rewording can make possible.
  //
  // An ABSENT feasibility is treated as "full", not as a refusal. The
  // field is `required` in the tool schema so it is always present in
  // practice, but a model that omitted it would otherwise make every
  // agent in the product unbuildable — and failing closed on a
  // never-charged, never-created preview is the wrong direction to fail
  // in. The deterministic gate in api/agents/build runs before this and
  // does not depend on the model at all.
  if (input.feasibility === "none") {
    return {
      ok: false,
      reason: "not_feasible",
      detail: unsupported,
    };
  }

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

  // THE MODEL'S SUGGESTION, and only a suggestion — the user sees all
  // three tiers with their prices and confirms before anything is
  // created. parseAgentDepth turns anything unrecognised into
  // `standard`, which is the tier that can answer most things and the
  // one every agent used to run at: a malformed answer must never
  // silently pick the twelve-times-more-expensive one.
  const depth: AgentDepth = parseAgentDepth(input.depth);

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
          depth,
          outputFormat,
          language: str(input.language, 20) || "en",
          builderSummary: str(input.understood, AGENT_LIMITS.description),
        },
      },
      understood: str(input.understood, AGENT_LIMITS.description),
      unsupported,
    },
  };
}
