import "server-only";
import { createResendClient } from "@/lib/resend";
import { emailIsDeliverable, senderAddress } from "@/lib/email/resend-config";
import {
  agentRunResultEmailHtml,
  agentDisabledEmailHtml,
  agentPausedNoCreditsEmailHtml,
} from "@/lib/email/templates";
import { getSiteUrl } from "@/lib/site-url";
import { logApiError } from "@/lib/log-error";
import { checkEmailAllowed, recordEmailSend } from "@/lib/email/email-gate";
import { aiGeneratedNotice } from "@/lib/agents/ai-disclosure";

// The From address, from ONE definition — see lib/email/resend-config.ts.
// This was one of fourteen copies of the same line — the constant AND
// its fallback, repeated per file. The fallback is the half that decides
// whether mail reaches anybody, so it now has one definition.

// Delivery for Autonomous Agents. All three senders are best-effort and
// never throw — the same contract every other transactional sender in this
// app has, and it matters more here: these are called from a cron that has
// already spent real money by the time it reaches them.
//
// `to` is always the account's own address, resolved by the caller from
// auth.users. It is never taken from the agent row alone and never from
// model output — see the delivery-target reasoning in
// lib/agents/agent-config.ts.

/**
 * Why an agent result did not reach an inbox. A machine code rather than
 * a sentence: the sentence a reader sees depends on their language, and
 * this module has no locale.
 */
export type AgentEmailFailure =
  /** The account has no address on file. */
  | "no_address"
  /** No RESEND_API_KEY, or no verified RESEND_FROM_EMAIL — nothing this
   *  account can do about either. */
  | "not_configured"
  /** The user's own preference, or the daily cap. */
  | "blocked"
  /** Resend accepted the request and refused it, or the call threw. */
  | "provider_error";

export async function sendAgentRunResultEmail(params: {
  userId: string;
  email: string;
  agentName: string;
  output: string;
  language: string;
}): Promise<{ sent: boolean; reason?: AgentEmailFailure }> {
  const { userId, email, agentName, output, language } = params;
  if (!email) return { sent: false, reason: "no_address" };
  // NOT CONFIGURED IS ITS OWN ANSWER, and it is checked BEFORE the send
  // rather than inferred from whatever Resend says afterwards.
  //
  // Without a verified RESEND_FROM_EMAIL every send leaves from Resend's
  // shared test sender, which delivers to the Resend account owner and
  // refuses every other recipient. The caller used to receive a bare
  // `false` for that and told the reader to "check your email settings"
  // — settings that contain nothing capable of fixing it. The cause is a
  // deployment variable, and saying so is the difference between a
  // person who waits and a person who tells the operator.
  if (!emailIsDeliverable()) return { sent: false, reason: "not_configured" };
  try {
    const gate = await checkEmailAllowed(userId, "agent_run_result");
    if (!gate.allowed) return { sent: false, reason: "blocked" };

    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: senderAddress(),
      to: email,
      subject: `${agentName} — Ionexa AI`,
      html: agentRunResultEmailHtml({
        agentName,
        output,
        agentsUrl: `${getSiteUrl()}/dashboard/agents`,
        aiGeneratedNotice: aiGeneratedNotice(language),
      }),
    });

    if (error) {
      logApiError("email:send-agent-run-result", error, { stage: "resend_error" });
      return { sent: false, reason: "provider_error" };
    }
    await recordEmailSend(userId, "agent_run_result");
    return { sent: true };
  } catch (err) {
    logApiError("email:send-agent-run-result", err, { stage: "unhandled" });
    return { sent: false };
  }
}

export async function sendAgentDisabledEmail(params: {
  userId: string;
  email: string;
  agentName: string;
  reason: string;
  consecutiveFailures: number;
}): Promise<void> {
  const { userId, email, agentName, reason, consecutiveFailures } = params;
  if (!email) return;
  try {
    const gate = await checkEmailAllowed(userId, "agent_disabled");
    if (!gate.allowed) return;

    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: senderAddress(),
      to: email,
      subject: `"${agentName}" has been switched off — Ionexa AI`,
      html: agentDisabledEmailHtml({
        agentName,
        reason,
        consecutiveFailures,
        agentsUrl: `${getSiteUrl()}/dashboard/agents`,
      }),
    });

    if (error) {
      logApiError("email:send-agent-disabled", error, { stage: "resend_error" });
    } else {
      await recordEmailSend(userId, "agent_disabled");
    }
  } catch (err) {
    logApiError("email:send-agent-disabled", err, { stage: "unhandled" });
  }
}

export async function sendAgentPausedNoCreditsEmail(params: {
  userId: string;
  email: string;
  agentName: string;
}): Promise<void> {
  const { userId, email, agentName } = params;
  if (!email) return;
  try {
    // Sent under the agent_run_result type on purpose: it is the message
    // that arrives INSTEAD of this run's result, so a user who turned run
    // results off has already said they do not want mail about individual
    // runs. The agent's paused state is still visible on the dashboard.
    const gate = await checkEmailAllowed(userId, "agent_run_result");
    if (!gate.allowed) return;

    const resend = createResendClient();
    const { error } = await resend.emails.send({
      from: senderAddress(),
      to: email,
      subject: `"${agentName}" is paused — Ionexa AI`,
      html: agentPausedNoCreditsEmailHtml({
        agentName,
        agentsUrl: `${getSiteUrl()}/dashboard/agents`,
        billingUrl: `${getSiteUrl()}/dashboard/settings`,
      }),
    });

    if (error) {
      logApiError("email:send-agent-paused-no-credits", error, { stage: "resend_error" });
    } else {
      await recordEmailSend(userId, "agent_run_result");
    }
  } catch (err) {
    logApiError("email:send-agent-paused-no-credits", err, { stage: "unhandled" });
  }
}
