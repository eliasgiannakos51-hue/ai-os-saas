import { CREATE_STUDIO_TYPES } from "@/lib/create-studio/plan";

/**
 * "What can I even ask it?" — answered on the screen where it is asked.
 *
 * THE REPORTED PROBLEM WAS NOT DIFFICULTY. A tester came away believing
 * this was "several LLMs in one, cheaper". Others asked where to paste
 * their API key. Another said they did not understand how Files worked.
 * None of that is a usability problem with a button; it is that an empty
 * box with a placeholder tells you the SHAPE of an input and nothing about
 * what this particular box is for.
 *
 * A pressable example is faster to understand than any amount of
 * instruction, and it costs one click to try. Files already proved that
 * (its three example questions predate this file); this is the same idea
 * everywhere else, from one definition, so a new AI surface cannot ship
 * without them by simply not remembering.
 *
 * Client-safe and free of JSX so the registry can be enumerated by tests:
 * "every surface has examples in every locale" is a property worth
 * checking mechanically rather than by opening ten JSON files.
 */

/** Every place in the app that takes a free-text request for an AI. */
export const AI_SURFACES = [
  "createStudio",
  "agents",
  "mission",
  "websiteBuilder",
  "files",
  "research",
  "chat",
] as const;

export type AiSurface = (typeof AI_SURFACES)[number];

/**
 * How many examples each surface offers.
 *
 * Three or four, never one and never eight. One reads as the only thing
 * the box accepts; more than four is a menu to be read rather than a
 * prompt to be tried, and the point is to get somebody to a first result
 * rather than to enumerate the product.
 *
 * Create Studio gets ONE PER KIND it routes to, because its examples are
 * doing double duty as the only place the RANGE is visible before anyone
 * has tried it. A kind with no example is a kind nobody discovers: agents
 * were reachable from this box for exactly as long as nobody could tell,
 * and requests for one were quietly filed as "automation" instead.
 */
export const EXAMPLE_COUNTS: Record<AiSurface, number> = {
  createStudio: 6,
  agents: 3,
  mission: 3,
  websiteBuilder: 3,
  files: 3,
  research: 3,
  chat: 3,
};

export const MIN_EXAMPLES = 3;

/**
 * The ceiling for one surface.
 *
 * Four everywhere except Create Studio, whose list is bounded by what it
 * can actually produce rather than by a flat number. A flat 4 was a bound
 * on the wrong thing: it would have blocked showing the sixth kind — the
 * one whose absence was the bug — while never once checking that any of
 * the four corresponded to a real capability.
 */
export function MAX_EXAMPLES_FOR(surface: AiSurface): number {
  return surface === "createStudio" ? CREATE_STUDIO_TYPES.length : 4;
}

/** The message keys for one surface, under `aiExamples.<surface>`. */
export function exampleKeys(surface: AiSurface): string[] {
  return Array.from({ length: EXAMPLE_COUNTS[surface] }, (_, i) => `e${i + 1}`);
}

/** Every message key this feature needs, for the completeness test. */
export function allExampleKeys(): string[] {
  return AI_SURFACES.flatMap((surface) => [
    ...exampleKeys(surface).map((k) => `aiExamples.${surface}.${k}`),
    `aiExamples.${surface}.limits`,
  ]);
}
