import "server-only";
import { createResendClient } from "@/lib/resend";
import { senderAddress } from "@/lib/email/resend-config";
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

export async function sendAgentRunResultEmail(params: {
  userId: string;
  email: string;
  agentName: string;
  output: string;
  language: string;
}): Promise<{ sent: boolean }> {
  const { userId, email, agentName, output, language } = params;
  if (!email) return { sent: false };
  try {
    const gate = await checkEmailAllowed(userId, "agent_run_result");
    if (!gate.allowed) return { sent: false };

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
      return { sent: false };
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
