import { assessAmbiguity } from "@/lib/ai/ambiguity";
import { matchProducer, type ProducerKey } from "@/lib/create-studio/producer-routes";

/**
 * WHAT A SENTENCE ON THE HOME FIELD MEANS, decided for free.
 *
 * One decision for typed and spoken text, so the two cannot drift: the
 * Home field's Send (components/create/create-chat.tsx) and its microphone
 * both call preflight(), and it runs only the two readers that cost
 * nothing — lib/ai/ambiguity.ts and lib/create-studio/producer-routes.ts.
 *
 *   question  too thin to act on, or two producers named at once
 *   open      one producer named: the card offers to open it, with the
 *             text carried. Opening spends nothing; the destination's own
 *             button does, and shows its own estimate first.
 *   classify  nothing named: the paid classifier (/api/create) decides,
 *             and it can FILE AN ENTRY as well as answer.
 */
export type Preflight =
  | { kind: "question"; choices: ProducerKey[]; brief: string }
  | { kind: "open"; producer: ProducerKey; brief: string }
  | { kind: "classify"; brief: string };

export function preflight(text: string): Preflight {
  const brief = String(text ?? "").trim();
  if (assessAmbiguity(brief, { hasContext: false }).verdict === "vague") {
    return { kind: "question", choices: [], brief };
  }
  const match = matchProducer(brief);
  if (match.kind === "ambiguous") return { kind: "question", choices: match.producers, brief };
  if (match.kind === "one") return { kind: "open", producer: match.producer, brief };
  return { kind: "classify", brief };
}

/**
 * FROM THE MICROPHONE, NOTHING HAPPENS UNTIL THE PERSON SAYS YES.
 *
 * Typed text reaches /api/create when the person presses Send; that press
 * is their decision. A transcript has no such press: Whisper hands back
 * words the person has not read yet, and a mishearing of "πόσα ξόδεψα" as
 * an instruction to file an expense would write a record they never asked
 * for and spend credits doing it. So a transcript only ever becomes a
 * card that says what was heard and what would happen, and the card's
 * "Yes" is the only way forward. The rule is the owner's: never an
 * irreversible action from voice without a confirmation.
 *
 * This is a state machine rather than a flag so the rule can be run, not
 * read: scripts/tests/voice-command.test.mjs drives every event from every
 * state and requires that "confirmed" is reachable from "heard" by
 * CONFIRM and by nothing else.
 */
export type VoiceState =
  | { kind: "idle" }
  | { kind: "heard"; transcript: string; plan: Preflight }
  | { kind: "confirmed"; plan: Preflight };

export type VoiceEvent =
  | {
      type: "TRANSCRIBED";
      transcript: string;
      /** A photo is attached. Typed Send skips the free readers then and
       *  goes to the classifier with the picture; the microphone must do the
       *  same, or "open the Website Builder" would silently drop the photo. */
      withImages?: boolean;
    }
  | { type: "CONFIRM" }
  | { type: "EDIT" }
  | { type: "CANCEL" }
  | { type: "DONE" };

export const VOICE_IDLE: VoiceState = { kind: "idle" };

export function voiceStep(state: VoiceState, event: VoiceEvent): VoiceState {
  switch (event.type) {
    case "TRANSCRIBED": {
      const transcript = String(event.transcript ?? "").trim();
      if (!transcript) return state;
      // A second sentence replaces the first; it never confirms it.
      const plan: Preflight = event.withImages ? { kind: "classify", brief: transcript } : preflight(transcript);
      return { kind: "heard", transcript, plan };
    }
    case "CONFIRM":
      return state.kind === "heard" ? { kind: "confirmed", plan: state.plan } : state;
    case "EDIT":
    case "CANCEL":
    case "DONE":
      return VOICE_IDLE;
  }
}
