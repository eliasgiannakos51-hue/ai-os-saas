import { moduleHref } from "@/lib/classifier-modules";
import type { DeepDiveModuleRead } from "@/lib/ai/deep-dive-load";

/**
 * THE SECOND KIND OF SOURCE: the user's own entries.
 *
 * "Research that ignores your data is Perplexity." Deep Research read the
 * web and nothing else — a report about this account's own market said
 * nothing about this account. The findings, the source list and every
 * citation in the prose came from search results.
 *
 * So there are two namespaces now and they are kept separate on purpose:
 *
 *   [3]   the third WEB source — a page the model actually read, from
 *         Anthropic's own citation blocks
 *   [E3]  the third ENTRY — a row this user wrote, addressable at
 *         /dashboard/<module>?record=<id>
 *
 * WHY NOT ONE NUMBERING. A merged list would make "[7]" mean a web page
 * in one report and a private note in another, and the reader could not
 * tell which without following it. It would also make the dangling-marker
 * check unable to say WHICH list a bad marker overran. The prefix is the
 * cheapest possible signal and it survives being read aloud.
 *
 * THE LINK IS ONLY POSSIBLE BECAUSE OF THE DEEP-LINK WORK. `?record=<id>`
 * has a reader in components/modules/generic-list.tsx and
 * scripts/tests/deep-links.test.mjs holds it there. Before that, an [E]
 * marker could only have pointed at a module list — which is the same
 * "the id is dropped" failure this citation scheme exists to avoid.
 */
export type EntrySource = {
  /** Module slug, e.g. "finance". */
  slug: string;
  /** The module's English title, for the prompt and the bibliography. */
  title: string;
  /** The row's id. Never null here — rows without one are dropped. */
  recordId: string;
  headline: string;
  /** ISO date (yyyy-mm-dd) or "" when the row carried no timestamp. */
  date: string;
  /** Where a reader lands when they follow the marker. */
  href: string;
};

/**
 * Flatten the deep-dive reads into one numbered list.
 *
 * ROWS WITHOUT AN ID ARE DROPPED, not numbered-and-unlinked. A citation
 * a reader cannot follow is the exact thing checkCitations was written to
 * catch; emitting one deliberately would be worse than emitting none.
 */
export function collateEntrySources(reads: readonly DeepDiveModuleRead[]): EntrySource[] {
  const out: EntrySource[] = [];
  for (const read of reads) {
    for (const row of read.rows) {
      if (!row.id) continue;
      out.push({
        slug: read.slug,
        title: read.title,
        recordId: row.id,
        headline: row.headline,
        date: row.atMs ? new Date(row.atMs).toISOString().slice(0, 10) : "",
        href: `${moduleHref(read.slug)}?record=${encodeURIComponent(row.id)}`,
      });
    }
  }
  return out;
}

/**
 * The entry list as prompt text.
 *
 * Same shape as the web source list so the model has one thing to learn,
 * and dated because "what did I say about this in March" is most of why
 * anybody wants their own entries in a report.
 */
export function buildEntrySourceBlock(entries: readonly EntrySource[]): string {
  if (entries.length === 0) return "";
  return entries
    .map((e, i) => `[E${i + 1}] ${e.title}${e.date ? ` (${e.date})` : ""} — ${e.headline}`)
    .join("\n");
}

/**
 * What the model is told about the second namespace.
 *
 * SPELLED OUT RATHER THAN IMPLIED, because a model handed two lists and
 * no rule will merge them — it will write [14] for the second entry when
 * there are twelve web sources, and that marker points at a web page that
 * says something else entirely. The instruction is a sentence; the
 * consequence of leaving it out is a report that cites the wrong source
 * and looks correct.
 */
export function entryCitationRules(entryCount: number): string[] {
  if (entryCount === 0) return [];
  return [
    `- The user's OWN ENTRIES are supplied as a second, separately numbered list: [E1] to [E${entryCount}].`,
    "- Cite an entry as [E1], [E2] and so on. NEVER renumber them into the web list, and never write [E0].",
    "- An entry is evidence about this user's own situation, not about the world. Say which it is: \"your own finance entries show X [E3]\" rather than \"the market shows X\".",
    "- Where your entries and the web disagree, say so and cite both.",
  ];
}
