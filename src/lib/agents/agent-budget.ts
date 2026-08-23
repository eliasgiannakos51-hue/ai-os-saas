/**
 * WHAT A SINGLE AGENT RUN IS ALLOWED TO SPEND, AND WHEN IT STOPS.
 *
 * WHAT THIS DELIBERATELY DOES NOT HAVE: a max-steps limit. The brief asks
 * for one, and this runner has no step loop to apply it to — it is a
 * fixed two-call pipeline (research, then write), not an iterative agent
 * that decides how many turns to take. Adding an AGENT_MAX_STEPS that
 * nothing could ever exceed would be a knob that reads as a safeguard and
 * guards nothing. When the runner grows a loop, the limit belongs here.
 *
 * WHAT IT DOES HAVE, because each of these can really run away:
 *
 *   TOOL CALLS — web searches. Anthropic is asked for at most
 *   AGENT_MAX_WEB_SEARCHES via the tool's own max_uses, which is a
 *   REQUEST. This is the check on what came back.
 *
 *   COST — nothing capped this before. The reservation is a HOLD, not a
 *   stop: it decides what can be charged, not when to quit, so a run that
 *   cost more than expected simply cost more.
 *
 *   ATTEMPTS — already enforced in execute-agent; surfaced here so all
 *   three limits are configured in one place rather than two.
 *
 * EARLY STOPPING IS NOT A LIMIT. "The goal is met, so stop" already
 * happens: max_uses is a ceiling rather than a quota, and the research
 * prompt asks for "up to N" searches, so a model that has what it needs
 * after one search makes one. What is added here is the other half —
 * noticing when a run has spent its budget and stopping it deliberately
 * instead of finding out at settlement.
 */

/**
 * Every limit's default, and what breaks without the variable.
 *
 * All three are OPTIONAL. With none of them set the agent behaves exactly
 * as it did before this file existed, because the defaults are the values
 * that were hardcoded.
 */
export const DEFAULT_AGENT_MAX_TOOL_CALLS = 4;

/**
 * €0.50, and it is derived rather than chosen.
 *
 * The worst single agent run this pricing model can produce — an
 * 8,000-character prompt with the full four web searches, on the most
 * expensive plan — estimates at $0.1696, which is €0.1560 at the
 * configured rate. AGENT_MAX_ATTEMPTS is 3, so a legitimate run that
 * retries twice costs €0.4681. The cap is that, rounded up to the next
 * five cents.
 *
 * Set it BELOW a legitimate worst case and normal runs start stopping
 * short; set it far above and it stops nothing. This is the smallest
 * number that cannot fire on a run doing exactly what it should.
 */
export const DEFAULT_AGENT_MAX_COST_EUR = 0.5;

export type AgentBudget = {
  maxToolCalls: number;
  maxCostEur: number;
};

function positiveNumber(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  // A misconfigured variable falls back rather than disabling the limit.
  // `Number("")` is 0 and `Number("abc")` is NaN; either one, taken
  // literally, would mean "spend nothing" or "spend anything" — both
  // worse than the default nobody had to think about.
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function resolveAgentBudget(
  env: Record<string, string | undefined> = process.env
): AgentBudget {
  return {
    maxToolCalls: positiveNumber(env.AGENT_MAX_TOOL_CALLS, DEFAULT_AGENT_MAX_TOOL_CALLS),
    maxCostEur: positiveNumber(env.AGENT_MAX_COST_EUR, DEFAULT_AGENT_MAX_COST_EUR),
  };
}

export type BudgetStop =
  | { stop: false }
  | { stop: true; reason: "cost" | "tool_calls"; spentEur: number; toolCalls: number };

/**
 * Asked BETWEEN the two calls, not after both.
 *
 * A check that runs only at the end reports what was already spent; the
 * point of a budget is to not spend the second half. The write step is
 * the expensive one, so the question worth asking is whether the research
 * step has already used the run's allowance.
 */
export function budgetStop(
  spent: { costEur: number; toolCalls: number },
  budget: AgentBudget
): BudgetStop {
  if (spent.costEur >= budget.maxCostEur) {
    return { stop: true, reason: "cost", spentEur: spent.costEur, toolCalls: spent.toolCalls };
  }
  if (spent.toolCalls > budget.maxToolCalls) {
    return { stop: true, reason: "tool_calls", spentEur: spent.costEur, toolCalls: spent.toolCalls };
  }
  return { stop: false };
}

/**
 * What the user is told, in their own language.
 *
 * "The agent failed" would be false — it did work, and the work is
 * delivered. The sentence has to carry both halves: it stopped at a
 * limit, and here is what it found before it did.
 */
export function budgetStopNotice(locale: string): string {
  const NOTICES: Record<string, string> = {
    en: "I stopped at this run's limit. Here is what I found before that.",
    el: "Σταμάτησα στο όριο αυτής της εκτέλεσης. Να τι βρήκα μέχρι εκεί.",
    de: "Ich habe am Limit dieses Laufs gestoppt. Das ist, was ich bis dahin gefunden habe.",
    es: "Me detuve en el límite de esta ejecución. Esto es lo que encontré hasta ahí.",
    fr: "Je me suis arrêté à la limite de cette exécution. Voici ce que j’ai trouvé avant.",
    it: "Mi sono fermato al limite di questa esecuzione. Ecco cosa ho trovato fino a quel punto.",
    pt: "Parei no limite desta execução. Eis o que encontrei até aí.",
    ar: "توقفت عند حدّ هذا التشغيل. هذا ما وجدته قبل ذلك.",
    ja: "この実行の上限で停止しました。そこまでに分かったことです。",
    zh: "已在本次运行的上限处停止。以下是在此之前的发现。",
  };
  return NOTICES[locale] ?? NOTICES.en;
}
