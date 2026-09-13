// The two sentences the prompt makes out of a remembered fact.
//
// SPLIT OUT OF ./memory.ts for the same reason memory-policy.ts and
// memory-fold.ts are: that module imports "server-only" and pulls in the
// Anthropic SDK the moment it loads, so a build gate cannot execute
// anything inside it. This is a pure function over data and its whole job
// is a distinction — "prefers X" against "did X once" — which a regex over
// the source cannot check and a call can.
/**
 * A remembered fact, with the two things that say how much weight it
 * carries. See buildMemoryPromptAddition.
 */
export type RememberedFact = {
  text: string;
  timesSeen: number;
  lastSeenAt: string;
};

/** Said more than once. The threshold is 2 and it is the whole distinction. */
const REPEATED_AT = 2;
/** Beyond this, "a while ago" is more honest than nothing. */
const STALE_AFTER_DAYS = 180;

/**
 * "PREFERS X" AND "DID X ONCE" ARE DIFFERENT CLAIMS, and until times_seen
 * existed the prompt could not tell them apart — every line arrived as a
 * flat assertion, so one passing remark was stated to the model with the
 * same confidence as something the person had said in every conversation
 * for a year.
 *
 * The model is told which it is holding, and how old it is, rather than
 * being left to weigh unlabelled facts.
 */
export function buildMemoryPromptAddition(memories: RememberedFact[]): string {
  if (memories.length === 0) return "";
  const now = Date.now();
  const bulletList = memories
    .map((m) => {
      const parsed = Date.parse(m.lastSeenAt);
      const days = Number.isFinite(parsed) ? Math.floor((now - parsed) / 86_400_000) : 0;
      const weight =
        m.timesSeen >= REPEATED_AT
          ? `επαναλαμβάνεται, ${m.timesSeen} φορές`
          : "αναφέρθηκε μία φορά";
      const age = days >= STALE_AFTER_DAYS ? ", πριν από πάνω από έξι μήνες" : "";
      return `- ${m.text} (${weight}${age})`;
    })
    .join("\n");
  return (
    "\n\nΠράγματα που ήδη ξέρεις για αυτόν τον χρήστη από προηγούμενες συνομιλίες. " +
    "Ό,τι επαναλαμβάνεται είναι σταθερό· ό,τι αναφέρθηκε μία φορά μπορεί να ήταν περιστασιακό — " +
    "μην το παρουσιάζεις ως μόνιμη προτίμηση:\n" +
    bulletList
  );
}

// The two pure predicates live in ./memory-policy so they can be executed
// by a build-gate test — this module pulls in the Anthropic SDK on load,
// which puts it out of reach of scripts/tests/load-ts.mjs. Re-exported
// here so existing importers keep one obvious place to look.
