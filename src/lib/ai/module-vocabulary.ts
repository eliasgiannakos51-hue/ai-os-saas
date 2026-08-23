import "server-only";
import en from "../../../messages/en.json";
import el from "../../../messages/el.json";
import { CLASSIFIER_MODULES } from "@/lib/classifier-modules";
import { buildModuleVocabulary, type ModuleVocabulary } from "@/lib/ai/context-relevance";

/**
 * The module vocabulary, built once per process.
 *
 * Separate from lib/ai/context-relevance.ts so that file stays pure and
 * loadable by the build-gate harness — the same split
 * lib/chat/memory-policy.ts made from lib/chat/memory.ts, for the same
 * reason: the rule belongs inside the gate, the catalogues do not.
 *
 * TWO CATALOGUES, English and Greek, because those are the two languages
 * this app's own prompts and UI are written in and a user writes in
 * whichever they think in. A third would be a one-line addition here;
 * the matcher does not care how many there are.
 */
let cached: ModuleVocabulary[] | null = null;

export function moduleVocabulary(): ModuleVocabulary[] {
  if (!cached) {
    cached = buildModuleVocabulary(
      CLASSIFIER_MODULES as unknown as { slug: string; titleKey: string; fields?: { labelKey: string }[] }[],
      [en as unknown as Record<string, unknown>, el as unknown as Record<string, unknown>]
    );
  }
  return cached;
}
