import "server-only";
import en from "../../../messages/en.json";
import el from "../../../messages/el.json";
import es from "../../../messages/es.json";
import fr from "../../../messages/fr.json";
import de from "../../../messages/de.json";
import it from "../../../messages/it.json";
import pt from "../../../messages/pt.json";
import zh from "../../../messages/zh.json";
import ja from "../../../messages/ja.json";
import ar from "../../../messages/ar.json";
import { CLASSIFIER_MODULES } from "@/lib/classifier-modules";
import { buildModuleVocabulary, type ModuleVocabulary } from "@/lib/ai/module-relevance";
import { synonymsFor } from "@/lib/ai/module-synonyms";

/**
 * The module vocabulary, built once per process.
 *
 * Separate from lib/ai/module-relevance.ts so that file stays pure and
 * loadable by the build-gate harness — the same split
 * lib/chat/memory-policy.ts made from lib/chat/memory.ts, for the same
 * reason: the rule belongs inside the gate, the catalogues do not.
 *
 * ALL TEN CATALOGUES. It was English and Greek for a while, on the
 * argument that those are the two languages this app's own prompts are
 * written in — which is true of the PROMPTS and irrelevant to the
 * QUESTION, since a user writes in whichever language they think in. A
 * Spanish user asking "¿Cuántos gastos tuve?" matched nothing at all.
 */
let cached: ModuleVocabulary[] | null = null;

export function moduleVocabulary(): ModuleVocabulary[] {
  if (!cached) {
    const built = buildModuleVocabulary(
      CLASSIFIER_MODULES as unknown as { slug: string; titleKey: string; fields?: { labelKey: string }[] }[],
      // TEN CATALOGUES, NOT TWO. Measured on five questions per language:
      // with English and Greek alone the deep dive scored el 5/5, en 5/5
      // and es 1/5, fr 1/5, ar 0/5, zh 0/5 — a feature that worked for
      // two of the ten languages the app ships, which is not a feature.
      // Every language's own title and field labels are now terms.
      [en, el, es, fr, de, it, pt, zh, ja, ar] as unknown as Record<string, unknown>[]
    );
    // THE EVERYDAY WORDS, ADDED — see lib/ai/module-synonyms.ts for why
    // titles and field labels alone are not a vocabulary. Appended rather
    // than replacing, so nothing that matched before stops matching.
    cached = built.map((v) => ({ ...v, terms: [...v.terms, ...synonymsFor(v.slug)] }));
  }
  return cached;
}
