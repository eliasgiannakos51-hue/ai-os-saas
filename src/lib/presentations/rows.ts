import type { Deck } from "@/lib/presentations/deck";

/** One generated deck as the Slides page lists it (ai_presentations). */
export type DeckRow = {
  id: string;
  title: string;
  /** Null for a run that failed — `error` says why. */
  deck: Deck | null;
  error: string | null;
  creditsCharged: number;
  createdAt: string;
};

/** A hand-typed note from the old form (ai_presentations, source = 'note'). */
export type NoteRow = {
  id: string;
  title: string;
  description: string | null;
  slideCount: number | null;
  createdAt: string;
};
