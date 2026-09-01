/**
 * WHAT THE ANSWER WAS ACTUALLY BUILT FROM.
 *
 * V4.6 #9. "The user does not know what data the AI is reading. That
 * creates both anxiety and wrong expectations."
 *
 * The honest answer to "where did that come from" cannot be asked of the
 * model. A model that is told to cite its sources will produce
 * source-shaped text whether or not it read anything, and a fabricated
 * citation is worse than none: it looks checkable. lib/verification/
 * citations.ts already makes that argument for research reports, and
 * lib/jobs/handlers/file-ask.ts acts on it — every page reference is
 * checked against the pages the model was shown, and the invented ones
 * are removed and counted.
 *
 * This is the same idea for the user's own data. The context builder
 * knows exactly which rows it put in the prompt; the count, the span and
 * the links are arithmetic on that list. No model call, nothing to
 * hallucinate, and the line under the answer is true even when the answer
 * above it is wrong.
 *
 * WHAT IT MUST NOT SAY. The scan is capped per module, so the number of
 * rows in hand is NOT the number of rows the account holds. "From 18
 * entries" would be a lie in an account with two hundred. The summary
 * therefore reports what was READ, carries the cap so the wording can say
 * so, and never guesses at the total.
 *
 * React-free and dependency-free so the gate can load it.
 */

export type ProvenanceRow = {
  /** The record's id, or null when the row carries none. Null means the
   *  source is listed but not linkable — stated, not silently dropped. */
  id: string | null;
  headline: string;
  /** created_at in ms. NaN and 0 are treated as unknown rather than as
   *  1970, which would drag every span back fifty years. */
  atMs: number | null;
};

export type ProvenanceModule = {
  slug: string;
  title: string;
  rows: ProvenanceRow[];
};

export type Provenance = {
  /** Rows actually placed in the prompt. Never a total. */
  entryCount: number;
  /** Modules that contributed at least one row. */
  moduleCount: number;
  oldestMs: number | null;
  newestMs: number | null;
  /** The per-module cap the scan ran under, so the wording can say "the
   *  N most recent in each" instead of implying a full read. */
  perModuleCap: number;
  /** Reached the cap in at least one module, so there is more the answer
   *  did not see. This is the difference between "all of it" and "some of
   *  it", and the user is entitled to it. */
  capped: boolean;
  /** Modules scanned that had nothing. The basis for a useful "I don't
   *  know": not "no data", but which places are empty. */
  emptyModules: { slug: string; title: string }[];
  sources: { slug: string; title: string; id: string | null; headline: string; atMs: number | null }[];
};

const usableTime = (ms: number | null | undefined): number | null =>
  typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? ms : null;

/**
 * Summarise the rows a prompt was built from.
 *
 * `modules` is every module the scan LOOKED AT, including the empty ones
 * — an empty module is information ("you have nothing in Finance"), and a
 * caller that filters them out before calling this cannot get that back.
 */
export function summariseProvenance(modules: ProvenanceModule[], perModuleCap: number): Provenance {
  const sources: Provenance["sources"] = [];
  const emptyModules: Provenance["emptyModules"] = [];
  let capped = false;

  // THE SAME ENTRY CAN ARRIVE TWICE. A chat request in Mentor Mode builds
  // its prompt from two scans — lib/user-context.ts over the classifier
  // modules and lib/chat/mentor-context.ts over the linkable ones — and
  // those lists overlap. Summing both without deduping reports "24
  // entries" for twelve, and prints each one twice in the list under the
  // answer, which is the first thing a reader would notice and the last
  // thing that would get fixed.
  //
  // Keyed on the row, not the module: an id when there is one, the
  // headline when there is not. Two different entries with the same
  // headline in the same module collapse to one, which undercounts by
  // one rather than inventing a source — the safe direction.
  const seen = new Set();
  const emptySlugs = new Set();
  for (const m of modules) {
    const rows = m.rows ?? [];
    if (rows.length === 0) {
      // A module can be listed empty by one scan and full by the other.
      // It is only really empty if NO scan found anything in it, so the
      // decision waits until every module has been walked.
      emptySlugs.add(m.slug);
      emptyModules.push({ slug: m.slug, title: m.title });
      continue;
    }
    if (rows.length >= perModuleCap) capped = true;
    for (const r of rows) {
      const key = `${m.slug}\u0000${r.id ?? r.headline}`;
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({
        slug: m.slug,
        title: m.title,
        id: r.id ?? null,
        headline: r.headline,
        atMs: usableTime(r.atMs),
      });
    }
  }

  const times = sources.map((s) => s.atMs).filter((t): t is number => t !== null);
  const contributing = new Set(sources.map((s) => s.slug));
  // "You have nothing in Finance" must not be said about a module the
  // other scan read five rows from.
  const trulyEmpty = emptyModules.filter(
    (m, i) =>
      !contributing.has(m.slug) && emptyModules.findIndex((o) => o.slug === m.slug) === i
  );

  return {
    entryCount: sources.length,
    moduleCount: contributing.size,
    oldestMs: times.length > 0 ? Math.min(...times) : null,
    newestMs: times.length > 0 ? Math.max(...times) : null,
    perModuleCap,
    capped,
    emptyModules: trulyEmpty,
    sources,
  };
}

/**
 * Is there anything worth showing a provenance line for?
 *
 * Zero rows is not "sources: none" — it is a different situation, and the
 * answer above it should be saying so in words. Rendering an empty
 * sources line under it would be a fourth way of saying nothing.
 */
export function hasProvenance(p: Provenance | null | undefined): boolean {
  return p != null && p.entryCount > 0;
}

/**
 * The facts, as a line for the system prompt.
 *
 * Deliberately not an instruction to cite: the model is TOLD what it was
 * given so it can be honest about the boundary — "you have nothing in
 * Finance" — while the citation itself is rendered by the UI from this
 * same object. The model cannot fabricate a source it is not asked to
 * produce.
 */
export function provenanceBriefing(p: Provenance, language: "en" | "el"): string {
  const empties = p.emptyModules.map((m) => m.title);
  if (language === "el") {
    const lines = [
      `Αυτή η απάντηση χτίζεται από ${p.entryCount} καταχωρήσεις σε ${p.moduleCount} ενότητες` +
        (p.capped ? ` (τις ${p.perModuleCap} πιο πρόσφατες ανά ενότητα — υπάρχουν κι άλλες που ΔΕΝ βλέπεις)` : "") +
        ".",
      empties.length > 0
        ? `Δεν υπάρχει ΚΑΜΙΑ καταχώρηση σε: ${empties.join(", ")}. Αν σε ρωτήσουν κάτι γι' αυτές, πες ότι δεν υπάρχουν δεδομένα ΚΑΙ τι να προσθέσει ο χρήστης για να μπορείς να απαντήσεις.`
        : "",
      "ΜΗΝ επινοείς αριθμούς που δεν είναι παραπάνω. Αν δεν φτάνουν τα δεδομένα, πες το και πες τι λείπει.",
    ];
    return lines.filter(Boolean).join("\n");
  }
  const lines = [
    `This answer is being built from ${p.entryCount} entries across ${p.moduleCount} modules` +
      (p.capped ? ` (the ${p.perModuleCap} most recent in each — there are more you are NOT seeing)` : "") +
      ".",
    empties.length > 0
      ? `There are NO entries at all in: ${empties.join(", ")}. If asked about those, say the data is not there AND say what the user could add so you could answer.`
      : "",
    "Do NOT invent numbers that are not above. If the data is not enough, say so and say what is missing.",
  ];
  return lines.filter(Boolean).join("\n");
}
