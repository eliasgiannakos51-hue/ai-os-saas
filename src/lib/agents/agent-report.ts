/**
 * AGENT RUN REPORT — what the agent did, in plain language.
 *
 * After each run, the report is:
 * 1. Stored in the agent_runs row (report column)
 * 2. Shown on the agent's dashboard
 * 3. Sent as a push notification (summary only)
 * 4. Available in the chat thread
 *
 * THE REPORT IS NOT THE OUTPUT. The output is the text/HTML/data the
 * agent produced. The report is what it DID to produce it — how many
 * searches, how much it cost, what went wrong, how long it took.
 */

export type AgentRunReport = {
  /** Human-readable summary, one sentence. */
  summary: string;
  /** What the agent did, step by step. */
  steps: AgentRunStep[];
  /** Total credits charged. */
  creditsCharged: number;
  /** Duration in seconds. */
  durationSeconds: number;
  /** Whether the run completed successfully. */
  success: boolean;
  /** Why it stopped, if not success. */
  stopReason?: string;
  /** The output preview (first 200 chars). */
  outputPreview?: string;
};

export type AgentRunStep = {
  /** What happened: "searched", "wrote", "delivered", "failed", "stopped". */
  action: string;
  /** Human-readable detail. */
  detail: string;
  /** Credits this step cost. */
  credits?: number;
};

/**
 * Build a report from the run's accumulated data.
 */
export function buildRunReport(params: {
  agentName: string;
  steps: AgentRunStep[];
  creditsCharged: number;
  durationMs: number;
  success: boolean;
  stopReason?: string;
  output?: string;
  deliveredTo?: string[];
}): AgentRunReport {
  const durationSeconds = Math.round(params.durationMs / 1000);
  const outputPreview = params.output?.slice(0, 200) || undefined;

  let summary: string;
  if (params.success) {
    const deliveryNote = params.deliveredTo?.length
      ? ` and delivered to ${params.deliveredTo.join(", ")}`
      : "";
    summary = `${params.agentName} completed in ${formatDuration(durationSeconds)}, used ${params.creditsCharged} credits${deliveryNote}.`;
  } else {
    summary = `${params.agentName} stopped: ${params.stopReason || "unknown error"}. Used ${params.creditsCharged} credits in ${formatDuration(durationSeconds)}.`;
  }

  return {
    summary,
    steps: params.steps,
    creditsCharged: params.creditsCharged,
    durationSeconds,
    success: params.success,
    stopReason: params.stopReason,
    outputPreview,
  };
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/**
 * One-line summary for push notifications.
 */
export function reportPushSummary(report: AgentRunReport): string {
  return report.summary;
}
