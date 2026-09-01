import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadDeepDive, NO_DEEP_DIVE, type DeepDive } from "@/lib/ai/deep-dive-load";
import { collateEntrySources, type EntrySource } from "@/lib/research/entry-sources";
import { getUserFullContext } from "@/lib/user-context";

/**
 * WHAT THIS ACCOUNT KNOWS, put in front of a research report.
 *
 * "Research that ignores your data is Perplexity." Deep Research read the
 * web and nothing else, so a report about this user's own market was a
 * report about the market — accurate, and about somebody else.
 *
 * ------------------------------------------------------------------
 * PATTERN (C): CACHED FLAT, TARGETED DEEP
 * ------------------------------------------------------------------
 *
 * The two obvious designs are both wrong:
 *
 *   ALL OF IT, DEEP. Read every row of every module into the prompt.
 *   Correct and unaffordable — an account with two hundred entries is
 *   tens of thousands of tokens on a synthesis that already costs eight.
 *
 *   NONE OF IT. What shipped. Free and useless.
 *
 * So: the FLAT shape of every module — how many entries, how recent, what
 * the missions are — which getUserFullContext already computes and which
 * is a few hundred characters whatever the account size; PLUS ONE module
 * read properly, chosen by scoring the topic against the module
 * vocabulary. That is the same split the chat's deep dive uses, and the
 * same code: lib/ai/deep-dive-load.ts.
 *
 * The flat half is what lets a report say "you have not written anything
 * about pricing since March". The deep half is what lets it say "your own
 * finance entries show a 12% drop in March [E3]" and have [E3] be a link
 * to that row.
 *
 * ------------------------------------------------------------------
 * WHEN IT READS NOTHING, AND WHY THAT IS NOT A FAILURE
 * ------------------------------------------------------------------
 *
 * planDeepDive returns "none" when the topic points at no module or at
 * too many. A research topic is often exactly that — "the European SaaS
 * market in 2026" is about the world, not about a module — and forcing a
 * read would spend tokens attaching this user's ideas to a question that
 * did not ask about them. The flat summary still goes in; the entry list
 * is empty; the model is told about no [E] namespace at all, so it
 * cannot invent markers into a list that does not exist.
 */
export type ResearchContext = {
  /** The flat, whole-account paragraph. "" when it could not be read. */
  accountSummary: string;
  /** The rows the deep read returned, numbered [E1..En] by the caller. */
  entries: EntrySource[];
  /** Which modules were read deeply, for the log and the cost note. */
  readModules: string[];
  /** Characters added to the synthesis prompt by BOTH halves. */
  chars: number;
};

export const NO_RESEARCH_CONTEXT: ResearchContext = {
  accountSummary: "",
  entries: [],
  readModules: [],
  chars: 0,
};

/**
 * The flat half, as prose.
 *
 * ONE LINE PER MODULE THAT HAS ANYTHING, and nothing at all for the ones
 * that do not: an account with three modules in use should not spend
 * nine lines saying the other nine are empty. The empties are summarised
 * in a single closing clause instead, which is the part a report can
 * actually use ("you have written nothing about X").
 */
export function formatAccountSummary(
  moduleSummaries: readonly {
    slug: string;
    title: string;
    rows: readonly { atMs: number | null }[];
  }[],
  emptyModules: readonly { title: string }[],
  activeMissionCount: number,
  /** The per-module row cap the scan ran under. Named in the output, not
   *  hidden: see below. */
  perModuleCap: number
): string {
  const used = moduleSummaries.filter((m) => m.rows.length > 0);
  if (used.length === 0 && emptyModules.length === 0 && activeMissionCount === 0) return "";

  const lines = used
    .slice()
    .sort((a, b) => b.rows.length - a.rows.length)
    .map((m) => {
      const seen = m.rows.length;
      const dates = m.rows.map((r) => r.atMs).filter((n): n is number => typeof n === "number");
      const last = dates.length ? new Date(Math.max(...dates)).toISOString().slice(0, 10) : "undated";
      // "AT LEAST", NOT A TOTAL — and this is the whole reason the cap is
      // a parameter. getUserFullContext reads at most `perModuleCap` rows
      // per module, so `rows.length` at the cap means "the cap", not "the
      // count". Handing a model "Finance: 20 entries" when there are two
      // hundred is how a report comes to state a total nobody computed,
      // in a sentence that looks measured. The type's own comment says
      // so: "a reader of this object cannot mistake rows.length for a
      // total".
      const count = seen >= perModuleCap ? `at least ${seen}` : `${seen}`;
      return `- ${m.title}: ${count} ${seen === 1 ? "entry" : "entries"}, most recent ${last}`;
    });

  return [
    ...lines,
    activeMissionCount > 0 ? `- Active plans: ${activeMissionCount}` : null,
    // THE ABSENCE IS THE FINDING, half the time. A report that can say
    // "you have recorded nothing about competitors" is doing something a
    // web search cannot.
    emptyModules.length > 0
      ? `- Nothing recorded yet in: ${emptyModules.map((m) => m.title).join(", ")}`
      : null,
    used.length > 0
      ? `(Counts are what a capped scan saw, up to ${perModuleCap} rows per module — not totals.)`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function loadResearchContext(
  supabase: SupabaseClient,
  userId: string,
  topic: string,
  language: "en" | "el"
): Promise<ResearchContext> {
  // BEST-EFFORT, BOTH HALVES. A research report that has already cost a
  // web-search budget must not fail because one extra read did; the
  // report is still worth producing without the account context, and
  // saying nothing about the account is honest in a way that a thrown
  // error at the last step is not.
  let accountSummary = "";
  try {
    const context = await getUserFullContext(supabase, userId);
    accountSummary = formatAccountSummary(
      context.moduleSummaries,
      context.emptyModules,
      context.activeMissions.length,
      context.perModuleCap
    );
  } catch {
    accountSummary = "";
  }

  let dive: DeepDive = NO_DEEP_DIVE;
  try {
    dive = await loadDeepDive(supabase, userId, topic, language);
  } catch {
    dive = NO_DEEP_DIVE;
  }

  const entries = collateEntrySources(dive.reads);
  return {
    accountSummary,
    entries,
    readModules: dive.reads.map((r) => r.slug),
    chars: accountSummary.length + dive.chars,
  };
}
