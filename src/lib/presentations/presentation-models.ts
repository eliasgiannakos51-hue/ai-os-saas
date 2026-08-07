import { modelForTier } from "@/lib/ai/models";
// Client-safe model identifiers for the Presentation Builder — same
// reason as lib/files/file-models.ts and lib/agents/agent-models.ts: the
// credit estimate shown before the user commits is computed in the
// browser and has to price the SAME model the server will call.

// PREMIUM tier: a deck is a deliverable (V3 model tiers, lib/ai/models.ts).

export const PRESENTATION_MODEL = modelForTier("premium");

/**
 * Web searches the fact-finding pass may run, per deck.
 *
 * Four, not the unbounded default. A deck is not a research report: it
 * needs enough real material to stop the model inventing market sizes
 * and growth rates, not a literature review. This number is also what
 * the estimate prices, so raising it without raising the estimate would
 * under-size every reservation.
 */
export const PRESENTATION_SEARCHES = 4;
