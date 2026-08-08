// How well the AI knows someone, and how that changes.
//
// MEASURED IN ACTIONS, NEVER IN DAYS. The distinction is the whole design.
// An account that signed up eleven months ago and has done nine things
// knows nothing; an account three weeks old that has done four hundred
// things knows a great deal. Time-based maturity would flatter the first
// and insult the second, and it would let the assistant claim familiarity
// it has no evidence for — which is worse than being new, because being
// wrong about someone is more off-putting than not knowing them.
//
// The thresholds below are the brief's, and they produce the intended
// shape: a heavy user (roughly 5-10 meaningful actions a day) crosses into
// Level 2 inside a month, and a light one (a few a week) takes half a year
// or more. Nobody is levelled up by waiting.
//
// Pure. No database, no clock beyond what is passed in.

export type MaturityLevel = 0 | 1 | 2 | 3;

/** Lower bound of each level, in meaningful actions. */
export const LEVEL_THRESHOLDS: Record<MaturityLevel, number> = {
  0: 0,
  1: 20,
  2: 100,
  3: 500,
};

/**
 * What counts as a meaningful action.
 *
 * Deliberately NOT page views, logins or scrolls. An action is something
 * the person DID that says something about them: a message they wrote, a
 * thing they created, an AI action they chose to spend on. A definition
 * that counted attention rather than intent would level up somebody who
 * left a tab open.
 */
export type ActivityCounts = {
  /** Messages the user themselves wrote in chat. */
  chatMessages: number;
  /** AI actions they chose to spend credits on. */
  aiActions: number;
  /** Rows they created: entries, missions, documents, websites, files. */
  createdRecords: number;
};

export function totalMeaningfulActions(counts: ActivityCounts): number {
  return (
    Math.max(0, counts.chatMessages) +
    Math.max(0, counts.aiActions) +
    Math.max(0, counts.createdRecords)
  );
}

export function levelForActions(actions: number): MaturityLevel {
  if (actions >= LEVEL_THRESHOLDS[3]) return 3;
  if (actions >= LEVEL_THRESHOLDS[2]) return 2;
  if (actions >= LEVEL_THRESHOLDS[1]) return 1;
  return 0;
}

/**
 * "The AI knows you: X%".
 *
 * Progress WITHIN the current level, not towards level 3 — a bar that
 * moves from 4% to 5% over a month of work is a bar that says "you are
 * getting nowhere". Level 3 is the end of the scale and reads 100%.
 */
export function knowledgePercent(actions: number): number {
  const level = levelForActions(actions);
  if (level === 3) return 100;
  const floor = LEVEL_THRESHOLDS[level];
  const ceiling = LEVEL_THRESHOLDS[(level + 1) as MaturityLevel];
  const within = (actions - floor) / (ceiling - floor);
  // Each level is a quarter of the bar, so the number always moves and
  // never jumps backwards when a level is crossed.
  return Math.min(100, Math.max(0, Math.round((level + within) * 25)));
}

/** Actions still needed to reach the next level, or null at the top. */
export function actionsToNextLevel(actions: number): number | null {
  const level = levelForActions(actions);
  if (level === 3) return null;
  return LEVEL_THRESHOLDS[(level + 1) as MaturityLevel] - actions;
}

// ---------------------------------------------------------------------------
// Confidence and decay
// ---------------------------------------------------------------------------

export const MIN_CONFIDENCE = 0.1;
export const MAX_CONFIDENCE = 0.95;
/** A brand-new observation, seen exactly once. */
export const INITIAL_CONFIDENCE = 0.3;
/**
 * Below this, an observation is not used and not shown. It is kept rather
 * than deleted so a habit somebody returns to recovers instead of being
 * rediscovered from scratch — and so the Settings list can honestly say
 * what the AI has stopped believing.
 */
export const ACTIVE_CONFIDENCE = 0.35;

/**
 * Confidence after seeing the same thing again.
 *
 * Asymptotic towards MAX_CONFIDENCE rather than linear: the tenth
 * confirmation of "writes short messages" should move the needle far less
 * than the second, and nothing should ever reach certainty. 0.95 is the
 * ceiling because an assistant that is 100% sure about a person has
 * stopped being able to notice they changed.
 */
export function confirmedConfidence(current: number): number {
  const next = current + (MAX_CONFIDENCE - current) * 0.35;
  return Math.min(MAX_CONFIDENCE, Number(next.toFixed(4)));
}

/**
 * Confidence after a refresh that did NOT see this again.
 *
 * DECAY IS PER MISSED REFRESH, NOT PER DAY, for the same reason maturity
 * counts actions: somebody who did not use the product for a fortnight has
 * not changed their mind about anything, and punishing their observations
 * for their holiday would mean the assistant forgets them for being away.
 * A refresh only runs against a period with activity in it.
 *
 * Multiplicative, so a long-established observation (high confidence, many
 * confirmations) survives a few misses and a shaky one fades quickly.
 */
export function decayedConfidence(current: number, missedRefreshes = 1): number {
  const next = current * Math.pow(0.8, Math.max(0, missedRefreshes));
  return Math.max(MIN_CONFIDENCE, Number(next.toFixed(4)));
}

export function isActive(confidence: number): boolean {
  return confidence >= ACTIVE_CONFIDENCE;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const PROFILE_CATEGORIES = [
  "communication",
  "work",
  "preferences",
  "goals",
  "patterns",
] as const;

export type ProfileCategory = (typeof PROFILE_CATEGORIES)[number];

export function isProfileCategory(value: unknown): value is ProfileCategory {
  return typeof value === "string" && (PROFILE_CATEGORIES as readonly string[]).includes(value);
}

/**
 * How many observations of each category the assistant is given.
 *
 * Capped per category rather than overall so one chatty category cannot
 * crowd out the others — twelve observations about message length and none
 * about what the person is trying to achieve is a worse profile than four
 * of each, even though it is more data.
 */
export const MAX_OBSERVATIONS_PER_CATEGORY = 4;

export type Observation = {
  category: ProfileCategory;
  observation: string;
  confidence: number;
};

/**
 * Picks what goes into the system prompt: active observations only,
 * highest confidence first, capped per category.
 */
export function selectForPrompt(observations: Observation[]): Observation[] {
  const byCategory = new Map<ProfileCategory, Observation[]>();
  for (const o of observations) {
    if (!isActive(o.confidence)) continue;
    const list = byCategory.get(o.category) ?? [];
    list.push(o);
    byCategory.set(o.category, list);
  }
  const out: Observation[] = [];
  for (const category of PROFILE_CATEGORIES) {
    const list = (byCategory.get(category) ?? [])
      .sort((a, b) => b.confidence - a.confidence || a.observation.localeCompare(b.observation))
      .slice(0, MAX_OBSERVATIONS_PER_CATEGORY);
    out.push(...list);
  }
  return out;
}

/**
 * The block appended to the assistant's system prompt.
 *
 * THE INSTRUCTION MATTERS AS MUCH AS THE DATA. An assistant handed a list
 * of facts about someone will recite them — "as someone who works mostly
 * in the evenings and prefers short answers, you might…" — and being
 * recited back at is unsettling in a way that being forgotten is not. So
 * the instruction is explicit: use it, do not perform it.
 *
 * Returns "" below Level 1. At Level 0 the observations are a handful of
 * weak guesses, and acting on them would mean being confidently wrong
 * about a stranger.
 */
export function buildProfilePromptAddition(params: {
  level: MaturityLevel;
  observations: Observation[];
}): string {
  if (params.level < 1) return "";
  const selected = selectForPrompt(params.observations);
  if (selected.length === 0) return "";

  const lines = selected.map((o) => `- (${o.category}) ${o.observation}`).join("\n");
  return `

ΜΙΛΑΣ ΣΕ ΚΑΠΟΙΟΝ ΠΟΥ ΞΕΡΕΙΣ. Να τι έχεις παρατηρήσει γι' αυτόν από τη χρήση του:
${lines}

Χρησιμοποίησέ τα ΦΥΣΙΚΑ — προσάρμοσε το ύφος, το μήκος και τα παραδείγματά σου σε αυτά που ξέρεις. ΜΗΝ τα επιδεικνύεις: μην λες «όπως κάποιος που δουλεύει βράδια…», μην απαριθμείς τι ξέρεις γι' αυτόν, μην αναφέρεις καν ότι έχεις τέτοιες παρατηρήσεις. Αν κάτι από αυτά έρχεται σε σύγκρουση με ό,τι λέει τώρα ο χρήστης, ΤΟ ΤΩΡΑ ΝΙΚΑΕΙ — οι παρατηρήσεις είναι παλιά στοιχεία, όχι κανόνες.`;
}
