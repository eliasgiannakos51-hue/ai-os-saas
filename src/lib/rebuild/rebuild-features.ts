import { UNTRUSTED_OPEN, UNTRUSTED_CLOSE } from "@/lib/agents/agent-config";
import { languageNameFor } from "@/lib/text/language-name";

/**
 * REBUILD'S FEATURE STEP (Κομμάτι 2, 2026-10-29): between "describe it"
 * and the four-box plan (rebuild-plan.ts), the person sees the CAPABILITIES
 * apps like the one they described typically have — short labels, in the
 * model's own words, never a name, menu item or sentence copied from any
 * real product (the same "labels, never content" discipline structure.ts
 * already keeps for a page's own text). The person selects which to keep;
 * a label's wording is changed by typing the new wording directly — no
 * second model call for a few words. The selected labels are folded into
 * the SAME plan call as additional, fenced context (rebuild-plan.ts's
 * planMessage).
 *
 * Client-safe on purpose, same reason as rebuild-plan.ts: the screen
 * prices the next press from this message.
 */
export const MAX_FEATURES = 8;
export const MAX_FEATURE_CHARS = 80;
/** The call: a handful of short labels. */
export const FEATURES_MAX_TOKENS = 700;

const clipFeature = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

export const FEATURES_TOOL = {
  name: "list_features",
  description: "Short capability labels such apps commonly have — never a name, menu item or sentence copied from any real product.",
  inputSchema: {
    type: "object" as const,
    properties: {
      features: { type: "array", items: { type: "string" } },
    },
    required: ["features"],
  },
};

const fenceFeature = (s: string) => `${UNTRUSTED_OPEN}\n${s}\n${UNTRUSTED_CLOSE}`;

const featureReferenceBlock = (reference: string | null | undefined) =>
  reference ? ["", "A PAGE OF AN APP THE PERSON LIKES, read for its structure only (recognise the KIND of product it is, never its wording):", fenceFeature(reference)] : [];

export function featuresMessage(description: string, locale: string, reference?: string | null): string {
  return [
    `List up to ${MAX_FEATURES} short CAPABILITY labels, in ${languageNameFor(locale)}, that apps like the one described below typically offer — in YOUR OWN WORDS, a few words each, never a sentence, menu item, button label or any text copied verbatim from a reference. Never the name of any real product.`,
    `Each label at most ${MAX_FEATURE_CHARS} characters.`,
    "",
    fenceFeature(description),
    ...featureReferenceBlock(reference),
  ].join("\n");
}

/** The model's answer, read back as a short, bounded, de-duplicated list — never empty. */
export function parseFeatures(input: unknown): { ok: true; features: string[] } | { ok: false; reason: string } {
  const raw = (input as { features?: unknown })?.features;
  if (!Array.isArray(raw)) return { ok: false, reason: "no features" };
  const seen = new Set<string>();
  const features: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const text = clipFeature(item, MAX_FEATURE_CHARS);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    features.push(text);
    if (features.length >= MAX_FEATURES) break;
  }
  return features.length > 0 ? { ok: true, features } : { ok: false, reason: "empty" };
}

/** The features the person chose to keep, folded into the plan call as their own, fenced context. */
export function featuresContextBlock(features: readonly string[]): string[] {
  if (features.length === 0) return [];
  return ["", "FEATURES THE PERSON CHOSE TO INCLUDE (their own words):", fenceFeature(features.map((f) => `- ${clipFeature(f, MAX_FEATURE_CHARS)}`).join("\n"))];
}
