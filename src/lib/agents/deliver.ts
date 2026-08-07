import "server-only";
import { sendAgentRunResultEmail } from "@/lib/email/send-agent-emails";
import { postToSlack } from "@/lib/integrations/read";
import { aiGeneratedNotice } from "@/lib/agents/ai-disclosure";
import { logApiError } from "@/lib/log-error";
import type { AgentDeliveryMethod } from "@/lib/agents/agent-config";

// One place that decides where an agent's result goes.
//
// Split out of execute-agent.ts when Slack became a second destination, so
// the two transports cannot drift apart on the things that must be
// identical for both:
//
//   - the EU AI Act Article 50 notice. It is not an email-template
//     decoration; it is a legal property of AI-generated content, and a
//     Slack message with the notice missing would be exactly as
//     non-compliant as an email without it. The email template takes it as
//     a parameter and the Slack path appends it here.
//   - the never-throws contract. Delivery runs after the run has already
//     been paid for; a transport failure must be reported, not thrown.
//   - the truthful return. `delivered: false` means the user did NOT
//     receive it — which is why the run row records the outcome rather
//     than assuming success.

export type DeliveryOutcome = {
  delivered: boolean;
  via: AgentDeliveryMethod;
  /** Present when delivery failed, for the run row. Short and user-facing. */
  reason?: string;
};

export async function deliverAgentResult(params: {
  userId: string;
  email: string;
  method: AgentDeliveryMethod;
  target: string;
  agentName: string;
  output: string;
  language: string;
}): Promise<DeliveryOutcome> {
  const { userId, email, method, target, agentName, output, language } = params;

  if (method === "slack") {
    try {
      // Slack has no template, so the message is assembled here — and the
      // notice is part of the assembly rather than something a caller
      // remembers to add.
      const text = `${agentName}\n\n${output}\n\n— ${aiGeneratedNotice(language)}`;
      const result = await postToSlack({ userId, channel: target, text });
      if (!result.ok) {
        return { delivered: false, via: "slack", reason: slackReason(result.reason) };
      }
      return { delivered: true, via: "slack" };
    } catch (err) {
      logApiError("agents:deliver", err, { userId, method: "slack" });
      return { delivered: false, via: "slack", reason: "Could not post to Slack." };
    }
  }

  const sent = await sendAgentRunResultEmail({
    userId,
    email,
    agentName,
    output,
    language,
  });
  return {
    delivered: sent.sent,
    via: "email",
    // A blocked send is almost always the user's own preference or the
    // daily cap, not a fault — so it is reported as a fact rather than an
    // error, and the run is still a success.
    ...(sent.sent ? {} : { reason: "The result was not emailed (check your email settings)." }),
  };
}

/** Slack's machine codes, turned into something a person can act on. */
function slackReason(code: string): string {
  switch (code) {
    case "not_connected":
    case "revoked":
      return "Slack is no longer connected — reconnect it in Integrations.";
    case "expired":
      return "The Slack connection expired — reconnect it in Integrations.";
    case "channel_not_found":
      return "That Slack channel no longer exists.";
    case "not_in_channel":
      return "The Ionexa app is not in that channel — invite it, then try again.";
    case "is_archived":
      return "That Slack channel is archived.";
    default:
      return "Could not post to Slack.";
  }
}
