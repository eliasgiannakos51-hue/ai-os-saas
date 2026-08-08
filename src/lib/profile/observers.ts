import type { ProfileCategory } from "@/lib/profile/maturity";

// What the AI notices, derived from what the person actually did.
//
// NO MODEL CALL. Every observation below is computed from rows the app
// already has, which buys three things that matter more than nuance:
//
//   * It costs nothing, so it can run for every account on a schedule
//     rather than only for accounts somebody decided were worth it.
//   * It is deterministic, so "why does it think that about me?" has an
//     answer, and the answer is checkable against the same data the user
//     can see.
//   * It cannot hallucinate. An LLM asked to characterise somebody from
//     their activity will produce a fluent sentence whether or not the
//     evidence supports it, and a confidently wrong belief about a person
//     is the single worst thing this feature could ship.
//
// Every observer is a pure function from a summary of activity to zero or
// more sentences. They return NOTHING when the evidence is thin — the
// absence of an observation is a valid, common and correct output, and an
// observer that always finds something is an observer that is guessing.

export type ActivitySummary = {
  /** Messages the user wrote, most recent first, capped by the caller. */
  chatMessageLengths: number[];
  /** UTC hour (0-23) of each action, so a rhythm can be seen. */
  actionHoursUtc: number[];
  /** ISO day of week (1 = Monday) of each action. */
  actionWeekdays: number[];
  /** Rows created per module slug: { ideas: 12, leads: 3, ... } */
  recordsByModule: Record<string, number>;
  /** Goals from missions the user set, newest first. */
  missionGoals: string[];
  /** Missions abandoned (failed) vs completed — a preference signal. */
  missionsCompleted: number;
  missionsFailed: number;
  /** Websites regenerated after a first attempt: they rejected the output. */
  websiteRegenerations: number;
  /** Total websites generated, so regeneration can be a ratio not a count. */
  websitesGenerated: number;
};

export type DerivedObservation = {
  category: ProfileCategory;
  observation: string;
};

/** Minimum evidence before an observer will say anything at all. */
const MIN_MESSAGES = 8;
const MIN_ACTIONS_FOR_RHYTHM = 15;
const MIN_RECORDS_FOR_FOCUS = 6;
const MIN_WEBSITES_FOR_TASTE = 3;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** The single most common value, with how dominant it is. */
function mode<T extends string | number>(values: T[]): { value: T; share: number } | null {
  if (values.length === 0) return null;
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T = values[0];
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount || (count === bestCount && String(value) < String(best))) {
      best = value;
      bestCount = count;
    }
  }
  return { value: best, share: bestCount / values.length };
}

const WEEKDAY_NAMES = [
  "Δευτέρα",
  "Τρίτη",
  "Τετάρτη",
  "Πέμπτη",
  "Παρασκευή",
  "Σάββατο",
  "Κυριακή",
];

/**
 * Everything the observers can say about one person.
 *
 * The sentences are Greek because the assistant's system prompt is Greek
 * (lib/chat/system-prompt.ts) and this text is appended to it — and
 * because the Settings list renders the same string, which is then the
 * one place in the app where the user reads model-facing text. That is a
 * known rough edge, recorded rather than hidden: translating these means
 * storing a key plus parameters instead of a sentence, which would make
 * the "correct this wording" feature meaningless.
 */
export function deriveObservations(activity: ActivitySummary): DerivedObservation[] {
  const out: DerivedObservation[] = [];

  // --- communication: how long their messages are ------------------------
  if (activity.chatMessageLengths.length >= MIN_MESSAGES) {
    const typical = median(activity.chatMessageLengths);
    if (typical <= 80) {
      out.push({
        category: "communication",
        observation: "Γράφει σύντομα μηνύματα — προτιμά σύντομες, άμεσες απαντήσεις.",
      });
    } else if (typical >= 400) {
      out.push({
        category: "communication",
        observation: "Γράφει αναλυτικά μηνύματα με πολύ context — αντέχει και θέλει αναλυτικές απαντήσεις.",
      });
    }
    // Between 80 and 400 characters is simply ordinary, and "writes
    // averagely long messages" is not a thing worth telling an assistant.
  }

  // --- work: where they spend their time ---------------------------------
  const moduleEntries = Object.entries(activity.recordsByModule).filter(([, n]) => n > 0);
  const totalRecords = moduleEntries.reduce((t, [, n]) => t + n, 0);
  if (totalRecords >= MIN_RECORDS_FOR_FOCUS && moduleEntries.length > 0) {
    const [topModule, topCount] = moduleEntries.sort((a, b) => b[1] - a[1])[0];
    // Only when it is genuinely a focus. A 20% share across five modules
    // is a person using the product, not a person with a speciality.
    if (topCount / totalRecords >= 0.4) {
      out.push({
        category: "work",
        observation: `Δουλεύει κυρίως στο «${topModule}» — εκεί είναι τα περισσότερα δεδομένα του.`,
      });
    }
  }

  // --- work: when they work ----------------------------------------------
  if (activity.actionHoursUtc.length >= MIN_ACTIONS_FOR_RHYTHM) {
    const morning = activity.actionHoursUtc.filter((h) => h >= 5 && h < 12).length;
    const evening = activity.actionHoursUtc.filter((h) => h >= 18 || h < 2).length;
    const total = activity.actionHoursUtc.length;
    if (morning / total >= 0.5) {
      out.push({ category: "work", observation: "Δουλεύει κυρίως πρωί." });
    } else if (evening / total >= 0.5) {
      out.push({ category: "work", observation: "Δουλεύει κυρίως βράδυ." });
    }
  }

  // --- patterns: which day ------------------------------------------------
  if (activity.actionWeekdays.length >= MIN_ACTIONS_FOR_RHYTHM) {
    const dominant = mode(activity.actionWeekdays);
    if (dominant && dominant.share >= 0.35) {
      const name = WEEKDAY_NAMES[Math.min(6, Math.max(0, dominant.value - 1))];
      out.push({
        category: "patterns",
        observation: `Η πιο παραγωγική του μέρα είναι η ${name}.`,
      });
    }
    const weekendShare =
      activity.actionWeekdays.filter((d) => d >= 6).length / activity.actionWeekdays.length;
    if (weekendShare >= 0.35) {
      out.push({ category: "patterns", observation: "Δουλεύει και τα σαββατοκύριακα." });
    }
  }

  // --- goals: what they said they were trying to do -----------------------
  // Verbatim, and capped at two. The user wrote these themselves, so this
  // is the one category where the observation is not an inference — which
  // is also why it is trimmed rather than paraphrased.
  for (const goal of activity.missionGoals.slice(0, 2)) {
    const trimmed = goal.trim();
    if (trimmed.length >= 3) {
      out.push({
        category: "goals",
        observation: `Δουλεύει προς: ${trimmed.slice(0, 200)}`,
      });
    }
  }

  // --- preferences: what they reject --------------------------------------
  if (activity.websitesGenerated >= MIN_WEBSITES_FOR_TASTE) {
    const ratio = activity.websiteRegenerations / activity.websitesGenerated;
    if (ratio >= 0.5) {
      out.push({
        category: "preferences",
        observation:
          "Συχνά ζητά να ξαναγίνει κάτι που παρήγαγε το AI — έχει συγκεκριμένο γούστο, ρώτα τι θέλει πριν παράξεις.",
      });
    }
  }

  const missionTotal = activity.missionsCompleted + activity.missionsFailed;
  if (missionTotal >= 4) {
    if (activity.missionsCompleted / missionTotal >= 0.7) {
      out.push({
        category: "preferences",
        observation: "Ολοκληρώνει ό,τι ξεκινά — τα σχέδια που του δίνεις τα δουλεύει μέχρι το τέλος.",
      });
    } else if (activity.missionsFailed / missionTotal >= 0.6) {
      out.push({
        category: "preferences",
        observation:
          "Αφήνει τα περισσότερα σχέδια στη μέση — δώσ' του λιγότερα και μικρότερα βήματα.",
      });
    }
  }

  return out;
}
