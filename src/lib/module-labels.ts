import en from "../../messages/en.json";
import type { FieldConfig, ModuleConfig } from "@/lib/modules";

/**
 * The ENGLISH text behind a module or field key.
 *
 * Two audiences read these names, and they want opposite things.
 *
 * A PERSON reads the page heading, the form label and the record card and
 * wants them in their own language — that is what titleKey/labelKey and
 * t() are for.
 *
 * A MODEL reads the classifier prompt, the mission planner's module list,
 * the mentor's context block and the record Q&A's field dump, and wants
 * the SAME vocabulary every time. A prompt whose field names change with
 * the user's interface language is ten prompts tested as one; the
 * classifier that routes "logged a trade" to `trading` was tuned against
 * English module names. The same goes for a CSV header, which is a column
 * identifier a spreadsheet formula or a re-import matches on, and for the
 * credit ledger, which is read by whoever reconciles the numbers.
 *
 * So the English name still exists — DERIVED from the message catalogue,
 * not kept in a second table beside it. One source, so renaming a field in
 * messages/en.json cannot leave a stale English copy behind in
 * lib/modules.ts. That drift is precisely what gave four modules two names
 * each ("Sales"/"CRM", "Research"/"Knowledge").
 *
 * SERVER-SIDE ONLY in practice: every caller is an API route, a prompt
 * builder or a CSV writer. Importing en.json into a client component would
 * ship the whole English catalogue a second time, on top of the active
 * locale's messages that next-intl already sends.
 */
function lookup(key: string): string {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, part) => (node == null ? node : (node as Record<string, unknown>)[part]),
      en as unknown
    );
  // A missing key is a programming error, not a runtime condition: the
  // type forbids free text, and i18n-coverage.test.mjs section 6 asserts
  // every key in the two data files resolves. Returning the key keeps a
  // prompt readable if one ever slips through, instead of interpolating
  // "undefined" into it.
  return typeof value === "string" ? value : key;
}

export function enModuleTitle(config: Pick<ModuleConfig, "titleKey">): string {
  return lookup(config.titleKey);
}

export function enFieldLabel(field: Pick<FieldConfig, "labelKey">): string {
  return lookup(field.labelKey);
}
